//! A file behind its own device record forks to a new device id (`crates/koloda-sync-proto/PROTOCOL.md` §Behind its
//! own record). The cycle then re-bootstraps it under the new id.

use std::sync::Arc;

use koloda::app::utility::get_current_timestamp;
use koloda::repo::sync::outbox::lowest_pending_seq;
use koloda::repo::sync::switch::{store_fork_nonce, stored_fork_nonce, switch_device};
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::{Enrollment, ForkDevice, Receipt, Receipts, MAX_RECEIPT_RANGE};
use uuid::Uuid;

use crate::client::{local_error, mint_token};
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
        // INVARIANT: the token is in the secret store before the nonce is stored, and both are stored before the
        // call, so a file that stops before the switch forks to the same record when it retries.
        let (nonce, token) = self.fork_credentials().await?;
        let enrollment: Enrollment = self
            .cycle_client(session)
            .call(
                Method::Post,
                &format!("/v1/spaces/{}/devices/fork", session.space),
                Some(&session.token),
                Some(&ForkDevice {
                    nonce,
                    token: token.clone(),
                }),
            )
            .await?
            .ok;
        let device = Uuid::from_bytes(enrollment.device_id);
        let stored = token.clone();
        self.blocking(move |shared| shared.secrets.set(&token_key(device), &stored))
            .await?;

        let receipts = self.pending_receipts(session, session.device, last_sender_seq).await?;
        let now_ms = u64::try_from(get_current_timestamp()?).map_err(local_error)?;
        let settled = self
            .blocking(move |shared| switch_device(&shared.db, device, &receipts, &shared.starter, now_ms, true, None))
            .await?;
        merge(changed, settled);

        let old = session.device;
        let pending = pending_token_key(&nonce);
        self.blocking(move |shared| {
            shared.secrets.remove(&token_key(old))?;
            shared.secrets.remove(&pending)?;
            Ok(())
        })
        .await?;
        session.device = device;
        session.token = token;
        Ok(())
    }

    /// The nonce and token of the fork in progress. A stored nonce whose pending token is gone is replaced.
    async fn fork_credentials(self: &Arc<Self>) -> Result<([u8; 16], String), SyncError> {
        let reused = self
            .blocking(|shared| {
                let Some(nonce) = stored_fork_nonce(&shared.db)? else {
                    return Ok(None);
                };
                let token = shared.secrets.get(&pending_token_key(&nonce))?;
                Ok(token.map(|token| (nonce, token)))
            })
            .await?;
        if let Some(reused) = reused {
            return Ok(reused);
        }

        let nonce = Uuid::new_v4().into_bytes();
        let token = mint_token()?;
        let pending = pending_token_key(&nonce);
        let stored = token.clone();
        self.blocking(move |shared| {
            // INVARIANT: the secret is written before the nonce, so a crash cannot leave a nonce with no token.
            shared.secrets.set(&pending, &stored)?;
            store_fork_nonce(&shared.db, nonce)?;
            Ok(())
        })
        .await?;
        Ok((nonce, token))
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
            .cycle_client(session)
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

fn pending_token_key(nonce: &[u8; 16]) -> String {
    format!("sync.pending_token.{}", Uuid::from_bytes(*nonce))
}
