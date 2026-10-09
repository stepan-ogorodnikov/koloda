//! Pushing the outbox in batches that never split a cohort (`crates/koloda-sync-proto/PROTOCOL.md` §Cycle, §Push
//! outcomes).

use std::sync::Arc;

use koloda::repo::sync::backfill::{backfill_batch, Backfill};
use koloda::repo::sync::heal::{heal_batch, Heal};
use koloda::repo::sync::outbox::{pending_bytes, pending_count, push_batch, push_lost, push_refused, settle_push};
use koloda::repo::sync::sync_state;
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::{ErrorCode, Push, PushItem, PushReply};

use crate::engine::{merge, Session, Shared};
use crate::error::SyncError;
use crate::transport::Method;

// WHY: "a few thousand envelopes or a few MB" per push; a cohort past either cap still goes alone, well inside the
// server's 5000 items and 16 MiB body.
const PUSH_ITEMS: usize = 2_000;
const PUSH_BYTES: usize = 4 * 1024 * 1024;

// WHY: a backfill or heal batch stays well under both push caps, so its cohort always fits one push.
const BACKFILL_ENVELOPES: usize = 500;
const BACKFILL_BYTES: usize = 1024 * 1024;

impl Shared {
    // INVARIANT: heal and backfill add a batch only while the outbox holds less than one push batch, so the outbox
    // never holds the whole database (PROTOCOL.md, Backfill, Server restore). On a metered network they are bulk:
    // each batch counts against the allowance, and none is added once it is spent (PROTOCOL.md, Metered networks).
    // A scan left with rows then shows the pause, whichever work spent the allowance: a batch here, or an earlier
    // cold page or image.
    async fn top_up(self: &Arc<Self>) -> Result<(), SyncError> {
        while self.blocking(|shared| pending_count(&shared.db)).await? < PUSH_ITEMS && self.has_bulk_room()? {
            let is_counting = self.is_counting_bulk()?;
            let before = if is_counting {
                self.blocking(|shared| pending_bytes(&shared.db)).await?
            } else {
                0
            };
            let heal = self
                .blocking(|shared| heal_batch(&shared.db, BACKFILL_ENVELOPES, BACKFILL_BYTES))
                .await?;
            let is_more = heal == Heal::Pending
                || self
                    .blocking(|shared| backfill_batch(&shared.db, BACKFILL_ENVELOPES, BACKFILL_BYTES))
                    .await?
                    == Backfill::Pending;
            if is_counting {
                let after = self.blocking(|shared| pending_bytes(&shared.db)).await?;
                self.spend_bulk(after.saturating_sub(before))?;
            }
            if !is_more {
                return Ok(());
            }
        }
        if !self.has_bulk_room()? {
            let is_scanning = self
                .blocking(|shared| sync_state(&shared.db))
                .await?
                .is_some_and(|state| state.is_scanning);
            if is_scanning {
                self.hold_bulk()?;
            }
        }
        Ok(())
    }

    /// Sends batches until the outbox is empty and backfill is done, a reply stops the push or moves skew past the
    /// tolerance, or no reply consumes one.
    pub(crate) async fn push(self: &Arc<Self>, session: &Session, changed: &mut Vec<Kind>) -> Result<(), SyncError> {
        loop {
            self.top_up().await?;
            let batch = Arc::new(
                self.blocking(|shared| push_batch(&shared.db, PUSH_ITEMS, PUSH_BYTES))
                    .await?,
            );
            if batch.items.is_empty() {
                return Ok(());
            }
            let request = Push {
                items: batch
                    .items
                    .iter()
                    .map(|item| PushItem {
                        sender_seq: item.sender_seq,
                        envelope: item.envelope.clone(),
                    })
                    .collect(),
            };

            let reply = self
                .cycle_client(session)
                .call::<_, PushReply>(
                    Method::Post,
                    &format!("/v1/spaces/{}/push", session.space),
                    Some(&session.token),
                    Some(&request),
                )
                .await;
            let reply = match reply {
                Ok(answer) => answer.ok,
                Err(error) => {
                    let sent = Arc::clone(&batch);
                    // INVARIANT: only a missing reply can hide a consumed push. A refusal and a local failure to
                    // send both consumed nothing.
                    let is_lost = matches!(error, SyncError::Transport(_));
                    self.blocking(move |shared| {
                        if is_lost {
                            push_lost(&shared.db, &sent)
                        } else {
                            push_refused(&shared.db, &sent)
                        }
                    })
                    .await?;
                    return Err(match error {
                        // WHY: revocation and an unknown device keep their own codes; the engine handles them for
                        // every call, not only a push.
                        SyncError::Server { status, code, message }
                            if !matches!(code, ErrorCode::Revoked | ErrorCode::UnknownDevice) =>
                        {
                            SyncError::PushRefused { status, code, message }
                        }
                        other => other,
                    });
                }
            };

            let settled = self
                .blocking(move |shared| settle_push(&shared.db, &batch, &reply.outcomes, &shared.starter))
                .await?;
            merge(changed, settled.changed);
            if settled.is_behind {
                return Err(SyncError::Behind);
            }
            // INVARIANT: a reply that moved skew past the tolerance is settled first, since its outcomes do not depend
            // on this clock; the cohorts not yet in a batch stay `local` and take new stamps once the clock is right
            // (PROTOCOL.md, Skew guards).
            self.check_skew()?;
        }
    }
}
