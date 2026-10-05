//! Pushing the outbox in batches that never split a cohort (`crates/koloda-sync-proto/PROTOCOL.md` §Cycle, §Push
//! outcomes).

use std::sync::Arc;

use koloda::repo::sync::outbox::{push_batch, push_lost, push_refused, settle_push};
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::{Push, PushItem, PushReply};

use crate::engine::{merge, Session, Shared};
use crate::error::SyncError;
use crate::transport::Method;

// WHY: "a few thousand envelopes or a few MB" per push; a cohort past either cap still goes alone, well inside the
// server's 5000 items and 16 MiB body.
const PUSH_ITEMS: usize = 2_000;
const PUSH_BYTES: usize = 4 * 1024 * 1024;

impl Shared {
    /// Sends batches until the outbox is empty, a reply stops the push, or no reply consumes one.
    pub(crate) async fn push(self: &Arc<Self>, session: &Session, changed: &mut Vec<Kind>) -> Result<(), SyncError> {
        loop {
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
                .client(&session.base)
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
                    return Err(error);
                }
            };

            let settled = self
                .blocking(move |shared| settle_push(&shared.db, &batch, &reply.outcomes, &shared.starter))
                .await?;
            merge(changed, settled.changed);
            if settled.is_behind {
                return Err(SyncError::Behind);
            }
        }
    }
}
