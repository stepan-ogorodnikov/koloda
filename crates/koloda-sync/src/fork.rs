//! A file behind its own device record forks to a new device id (`crates/koloda-sync-proto/PROTOCOL.md` §Behind its
//! own record). The cycle then re-bootstraps it under the new id.

use std::sync::Arc;

use koloda::app::utility::get_current_timestamp;
use koloda::repo::sync::outbox::lowest_pending_seq;
use koloda::repo::sync::switch::{fork_nonce, switch_device};
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::{Enrollment, ForkDevice, Receipt, Receipts, MAX_RECEIPT_RANGE};
use uuid::Uuid;

use crate::client::local_error;
use crate::engine::{merge, token_key, Session, Shared};
use crate::error::SyncError;
use crate::transport::Method;

impl Shared {
    /// Forks the file to a new device id and moves `session` to it. The re-bootstrap barrier is open on return.
    pub(crate) async fn fork(
        self: &Arc<Self>,
        session: &mut Session,
        last_sender_seq: u64,
        changed: &mut Vec<Kind>,
    ) -> Result<(), SyncError> {
        // INVARIANT: the nonce is stored before the call, so a file that stops before the switch forks to the same
        // record when it retries, and no orphan record pins GC.
        let nonce = self.blocking(|shared| fork_nonce(&shared.db)).await?;
        let enrollment: Enrollment = self
            .cycle_client(&session.base)
            .call(
                Method::Post,
                &format!("/v1/spaces/{}/devices/fork", session.space),
                Some(&session.token),
                Some(&ForkDevice { nonce }),
            )
            .await?
            .ok;
        let device = Uuid::from_bytes(enrollment.device_id);
        let token = enrollment.token;
        let stored = token.clone();
        self.blocking(move |shared| shared.secrets.set(&token_key(device), &stored))
            .await?;

        let receipts = self.pending_receipts(session, session.device, last_sender_seq).await?;
        let now_ms = u64::try_from(get_current_timestamp()?).map_err(local_error)?;
        let settled = self
            .blocking(move |shared| switch_device(&shared.db, device, &receipts, &shared.starter, now_ms, true))
            .await?;
        merge(changed, settled);

        let old = session.device;
        self.blocking(move |shared| shared.secrets.remove(&token_key(old)))
            .await?;
        session.device = device;
        session.token = token;
        Ok(())
    }

    /// `sender`'s receipts for this file's pending seqs at or below `last_sender_seq`.
    pub(crate) async fn pending_receipts(
        self: &Arc<Self>,
        session: &Session,
        sender: Uuid,
        last_sender_seq: u64,
    ) -> Result<Vec<Receipt>, SyncError> {
        let Some(lowest) = self
            .blocking(|shared| lowest_pending_seq(&shared.db))
            .await?
            .filter(|lowest| *lowest <= last_sender_seq)
        else {
            return Ok(Vec::new());
        };
        let mut receipts = Vec::new();
        let mut from = lowest - 1;
        while from < last_sender_seq {
            let through = last_sender_seq.min(from + MAX_RECEIPT_RANGE);
            receipts.extend(self.receipts(session, sender, from, through).await?);
            from = through;
        }
        Ok(receipts)
    }

    /// `sender`'s receipts for `after < seq <= through`, at most `MAX_RECEIPT_RANGE` of them.
    pub(crate) async fn receipts(
        &self,
        session: &Session,
        sender: Uuid,
        after: u64,
        through: u64,
    ) -> Result<Vec<Receipt>, SyncError> {
        Ok(self
            .cycle_client(&session.base)
            .call::<(), Receipts>(
                Method::Get,
                &format!(
                    "/v1/spaces/{}/receipts?sender={sender}&after={after}&through={through}",
                    session.space
                ),
                Some(&session.token),
                None,
            )
            .await?
            .ok
            .receipts)
    }
}
