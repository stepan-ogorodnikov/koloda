//! The sync cycle: the own device record, push, `hot` to head, then `cold` up to a head recorded before `hot` was
//! pulled (`crates/koloda-sync-proto/PROTOCOL.md` §Cycle, §Lanes, §Skew guards, §Devices).

use std::sync::Arc;

use koloda::repo::sync::apply::{apply_page, Page, PageEntry};
use koloda::repo::sync::outbox::{has_foreign_receipt, pending_count, standing, Standing};
use koloda::repo::sync::repair::repair_dangling_defaults;
use koloda_sync_proto::hlc::SKEW_TOLERANCE_MS;
use koloda_sync_proto::registry::{Kind, Lane};
use koloda_sync_proto::transport::{DeviceInfo, DeviceMeta, PullPage, Receipts, MAX_RECEIPT_RANGE};
use uuid::Uuid;

use crate::client::local_error;
use crate::engine::{merge, Session, Shared};
use crate::error::SyncError;
use crate::transport::Method;

// WHY: one call does bounded work; whatever is left goes out with the next trigger.
const MAX_ROUNDS: usize = 8;

impl Shared {
    /// Runs rounds until the outbox is empty and both cursors are at head, then repairs dangling learning defaults.
    pub(crate) async fn cycle(self: &Arc<Self>, session: &Session, changed: &mut Vec<Kind>) -> Result<(), SyncError> {
        let mut cursors = self
            .blocking(|shared| koloda::repo::sync::sync_state(&shared.db))
            .await?
            .map(|state| (state.cursor_hot, state.cursor_cold))
            .ok_or(SyncError::NotEnrolled)?;

        for _ in 0..MAX_ROUNDS {
            let (record, heads) = self.device_record(session).await?;
            self.check_skew()?;
            // INVARIANT: a file behind its own record pushes and pulls nothing. Pull excludes the device id both
            // copies share, so it would never see the other copy's writes (PROTOCOL.md, Devices).
            if self.is_behind(session, record.last_sender_seq).await? {
                return Err(SyncError::Behind);
            }

            self.push(session, changed).await?;
            // INVARIANT: `cold` stops at a head recorded before `hot` is pulled to head, so a review never arrives
            // before its card (PROTOCOL.md, Lanes).
            let mut latest = heads;
            if let Some(meta) = self.pull(session, Lane::Hot, None, &mut cursors.0, changed).await? {
                latest = meta;
            }
            if cursors.1 < heads.head_cold {
                if let Some(meta) = self
                    .pull(session, Lane::Cold, Some(heads.head_cold), &mut cursors.1, changed)
                    .await?
                {
                    latest = meta;
                }
            }

            let is_caught_up = cursors.0 >= latest.head_hot && cursors.1 >= latest.head_cold;
            if !is_caught_up || self.blocking(|shared| pending_count(&shared.db)).await? > 0 {
                continue;
            }
            // WHY: before catch-up, a referent a default names may still be on its way; after it, a missing one
            // is dead or never existed (PROTOCOL.md, Referents are not parents).
            let repaired = self
                .blocking(|shared| repair_dangling_defaults(&shared.db, &shared.starter))
                .await?;
            merge(changed, repaired);
            if self.blocking(|shared| pending_count(&shared.db)).await? == 0 {
                return Ok(());
            }
        }
        Ok(())
    }

    async fn is_behind(self: &Arc<Self>, session: &Session, last_sender_seq: u64) -> Result<bool, SyncError> {
        let after = match self
            .blocking(move |shared| standing(&shared.db, last_sender_seq))
            .await?
        {
            Standing::Current => return Ok(false),
            Standing::Behind => return Ok(true),
            Standing::Unaccounted { after } => after,
        };
        let mut from = after;
        while from < last_sender_seq {
            let through = last_sender_seq.min(from + MAX_RECEIPT_RANGE);
            let receipts: Vec<(u64, [u8; 32])> = self
                .client(&session.base)
                .call::<(), Receipts>(
                    Method::Get,
                    &format!(
                        "/v1/spaces/{}/receipts?sender={}&after={from}&through={through}",
                        session.space, session.device
                    ),
                    Some(&session.token),
                    None,
                )
                .await?
                .ok
                .receipts
                .into_iter()
                .map(|receipt| (receipt.sender_seq, receipt.digest))
                .collect();
            if self
                .blocking(move |shared| has_foreign_receipt(&shared.db, &receipts))
                .await?
            {
                return Ok(true);
            }
            from = through;
        }
        Ok(false)
    }

    async fn device_record(&self, session: &Session) -> Result<(DeviceInfo, Heads), SyncError> {
        let answer = self
            .client(&session.base)
            .call::<(), DeviceInfo>(
                Method::Get,
                &format!("/v1/spaces/{}/devices/{}", session.space, session.device),
                Some(&session.token),
                None,
            )
            .await?;
        let heads = Heads::from_meta(answer.meta.device.as_ref())?;
        Ok((answer.ok, heads))
    }

    /// Pulls one lane page by page from `cursor`, one transaction per page, and returns the last reply's heads.
    async fn pull(
        self: &Arc<Self>,
        session: &Session,
        lane: Lane,
        max_seq: Option<u64>,
        cursor: &mut u64,
        changed: &mut Vec<Kind>,
    ) -> Result<Option<Heads>, SyncError> {
        let lane_name = match lane {
            Lane::Hot => "hot",
            Lane::Cold => "cold",
        };
        let bound = max_seq.map(|max_seq| format!("&max_seq={max_seq}")).unwrap_or_default();
        loop {
            let answer = self
                .client(&session.base)
                .call::<(), PullPage>(
                    Method::Get,
                    &format!(
                        "/v1/spaces/{}/pull?lane={lane_name}&after={cursor}{bound}",
                        session.space
                    ),
                    Some(&session.token),
                    None,
                )
                .await?;
            self.check_skew()?;
            let page = Page {
                lane,
                entries: answer
                    .ok
                    .entries
                    .into_iter()
                    .map(|entry| {
                        Ok(PageEntry {
                            sender: Uuid::from_bytes(entry.sender),
                            sender_seq: i64::try_from(entry.sender_seq).map_err(local_error)?,
                            envelope: entry.envelope,
                        })
                    })
                    .collect::<Result<_, SyncError>>()?,
                scanned_through: i64::try_from(answer.ok.scanned_through).map_err(local_error)?,
            };
            let applied = self
                .blocking(move |shared| apply_page(&shared.db, &page, &shared.starter))
                .await?;
            merge(changed, applied);
            *cursor = answer.ok.scanned_through;
            if !answer.ok.has_more {
                return Heads::from_meta(answer.meta.device.as_ref()).map(Some);
            }
        }
    }

    // INVARIANT: push and apply pause while the clocks disagree by more than the tolerance; stamps from a wrong clock
    // would win or lose every register (PROTOCOL.md, Skew guards).
    fn check_skew(&self) -> Result<(), SyncError> {
        let skew_ms = self.skew.get();
        if skew_ms.unsigned_abs() > SKEW_TOLERANCE_MS {
            return Err(SyncError::ClockSkew { skew_ms });
        }
        Ok(())
    }
}

#[derive(Clone, Copy)]
struct Heads {
    head_hot: u64,
    head_cold: u64,
}

impl Heads {
    fn from_meta(meta: Option<&DeviceMeta>) -> Result<Heads, SyncError> {
        let meta =
            meta.ok_or_else(|| SyncError::Transport("a device call's reply carries no device meta".to_string()))?;
        Ok(Heads {
            head_hot: meta.head_hot,
            head_cold: meta.head_cold,
        })
    }
}
