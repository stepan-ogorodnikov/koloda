//! The sync cycle: the own device record, push, `hot` to head, then `cold` up to a head recorded before `hot` was
//! pulled (`crates/koloda-sync-proto/PROTOCOL.md` §Cycle, §Lanes, §Skew guards, §Devices, §Re-bootstrap).

use std::sync::Arc;

use koloda::repo::sync::apply::{apply_page, Page, PageEntry};
use koloda::repo::sync::outbox::{has_foreign_receipt, pending_count, standing, Standing};
use koloda::repo::sync::repair::repair_dangling_defaults;
use koloda_sync_proto::hlc::SKEW_TOLERANCE_MS;
use koloda_sync_proto::registry::{Kind, Lane};
use koloda_sync_proto::transport::{DeviceInfo, DeviceMeta, ErrorCode, PullPage, MAX_RECEIPT_RANGE};
use uuid::Uuid;

use crate::bootstrap::{Bootstrap, OpenLease};
use crate::client::local_error;
use crate::engine::{merge, Session, Shared};
use crate::error::SyncError;
use crate::transport::Method;

// WHY: one call does bounded work; whatever is left goes out with the next trigger.
const MAX_ROUNDS: usize = 8;

impl Shared {
    /// Bootstraps a joining file, or resumes a re-bootstrap, first. Then runs rounds until the outbox is empty and both
    /// cursors are at head, and repairs dangling learning defaults.
    pub(crate) async fn cycle(
        self: &Arc<Self>,
        session: &mut Session,
        changed: &mut Vec<Kind>,
    ) -> Result<(), SyncError> {
        let state = self
            .blocking(|shared| koloda::repo::sync::sync_state(&shared.db))
            .await?
            .ok_or(SyncError::NotEnrolled)?;
        // INVARIANT: a used file waiting for Add or Replace pushes, pulls, and captures nothing (PROTOCOL.md, Joining).
        if state.is_import_pending {
            return Ok(());
        }
        let mut cursors = (state.cursor_hot, state.cursor_cold);
        if state.is_bootstrapping {
            cursors = self.bootstrap(session, Bootstrap::Join, changed).await?;
        } else if state.is_rebasing {
            cursors = self.rebootstrap(session, changed).await?;
        }

        for _ in 0..MAX_ROUNDS {
            let (record, heads) = self.device_record(session).await?;
            self.check_skew()?;
            // INVARIANT: a file behind its own record pushes and pulls nothing until it has forked. Pull excludes the
            // device id both copies share, so it would never see the other copy's writes (PROTOCOL.md, Devices).
            // The record only moves on, so a fork that stopped before the switch is found and finished the same way.
            if self.is_behind(session, record.last_sender_seq).await? {
                self.fork(session, record.last_sender_seq, changed).await?;
                cursors = self.rebootstrap(session, changed).await?;
                continue;
            }
            // INVARIANT: a file the server left behind re-bootstraps before it pushes. A collected tombstone it never
            // pulled would otherwise leave its entity alive here forever (PROTOCOL.md, Cycle).
            if record.rebase_required || cursors.0 < heads.gc_horizon_hot {
                cursors = self.rebootstrap(session, changed).await?;
                continue;
            }

            let pushed = self.push(session, changed).await;
            if is_left_behind(&pushed) {
                cursors = self.rebootstrap(session, changed).await?;
                continue;
            }
            // WHY: a reused seq means another copy of the file pushed under this id; the reply cut the batch there.
            if matches!(pushed, Err(SyncError::Behind)) {
                let (record, _) = self.device_record(session).await?;
                self.fork(session, record.last_sender_seq, changed).await?;
                cursors = self.rebootstrap(session, changed).await?;
                continue;
            }
            pushed?;
            // INVARIANT: `cold` stops at a head recorded before `hot` is pulled to head, so a review never arrives
            // before its card (PROTOCOL.md, Lanes).
            let pulled = self.pull(session, Lane::Hot, None, &mut cursors.0, None, changed).await;
            if is_left_behind(&pulled) {
                cursors = self.rebootstrap(session, changed).await?;
                continue;
            }
            let mut latest = pulled?;
            if cursors.1 < heads.head_cold {
                latest = self
                    .pull(
                        session,
                        Lane::Cold,
                        Some(heads.head_cold),
                        &mut cursors.1,
                        None,
                        changed,
                    )
                    .await?;
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
                .receipts(session, session.device, from, through)
                .await?
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
            .cycle_client(&session.base)
            .call::<(), DeviceInfo>(
                Method::Get,
                &format!("/v1/spaces/{}/devices/{}", session.space, session.device),
                Some(&session.token),
                None,
            )
            .await?;
        let heads = Heads::from_meta(answer.meta.device.as_ref())?;
        self.note_heads(heads.head_hot, heads.head_cold)?;
        Ok((answer.ok, heads))
    }

    /// Pulls one lane page by page from `cursor`, one transaction per page, and returns the last reply's heads.
    /// During a bootstrap, `lease` is kept alive between pages.
    pub(crate) async fn pull(
        self: &Arc<Self>,
        session: &Session,
        lane: Lane,
        max_seq: Option<u64>,
        cursor: &mut u64,
        mut lease: Option<&mut OpenLease>,
        changed: &mut Vec<Kind>,
    ) -> Result<Heads, SyncError> {
        let bound = max_seq.map(|max_seq| format!("&max_seq={max_seq}")).unwrap_or_default();
        loop {
            if let Some(lease) = lease.as_deref_mut() {
                self.keep_alive(session, lease).await?;
            }
            let answer = self
                .cycle_client(&session.base)
                .call::<(), PullPage>(
                    Method::Get,
                    &format!(
                        "/v1/spaces/{}/pull?lane={}&after={cursor}{bound}",
                        session.space,
                        lane.as_wire()
                    ),
                    Some(&session.token),
                    None,
                )
                .await?;
            if let Some(lease) = lease.as_deref_mut() {
                lease.server_ms = answer.meta.server_time_ms;
            }
            self.spend_bytes(answer.bytes)?;
            self.check_skew()?;
            self.check_time()?;
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
                let heads = Heads::from_meta(answer.meta.device.as_ref())?;
                self.note_heads(heads.head_hot, heads.head_cold)?;
                return Ok(heads);
            }
        }
    }

    // INVARIANT: push and apply pause while the clocks disagree by more than the tolerance; stamps from a wrong clock
    // would win or lose every register (PROTOCOL.md, Skew guards).
    pub(crate) fn check_skew(&self) -> Result<(), SyncError> {
        let skew_ms = self.skew.get();
        if skew_ms.unsigned_abs() > SKEW_TOLERANCE_MS {
            return Err(SyncError::ClockSkew { skew_ms });
        }
        Ok(())
    }
}

/// Whether the server answered that this device must re-bootstrap: it was marked stale after the round read its
/// record, or a GC pass collected a tombstone above its cursor.
fn is_left_behind<T>(result: &Result<T, SyncError>) -> bool {
    matches!(
        result,
        Err(SyncError::Server {
            code: ErrorCode::CursorTooOld,
            ..
        } | SyncError::PushRefused {
            code: ErrorCode::CursorTooOld,
            ..
        })
    )
}

#[derive(Clone, Copy)]
pub(crate) struct Heads {
    head_hot: u64,
    head_cold: u64,
    gc_horizon_hot: u64,
}

impl Heads {
    fn from_meta(meta: Option<&DeviceMeta>) -> Result<Heads, SyncError> {
        let meta =
            meta.ok_or_else(|| SyncError::Transport("a device call's reply carries no device meta".to_string()))?;
        Ok(Heads {
            head_hot: meta.head_hot,
            head_cold: meta.head_cold,
            gc_horizon_hot: meta.gc_horizon_hot,
        })
    }
}
