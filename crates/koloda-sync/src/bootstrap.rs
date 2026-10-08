//! Bootstrap from a snapshot lease: a joiner's union bootstrap, and a re-bootstrap that ends by removing what the
//! server no longer holds (`crates/koloda-sync-proto/PROTOCOL.md` §Bootstrap, §Re-bootstrap).
//!
//! INVARIANT: nothing is pushed until the bootstrap ends. Repairs it captures wait in the outbox, because a referent
//! may still be on its way until `hot` has caught up to a head read after the lease.

use std::sync::Arc;

use koloda::repo::sync::apply::{apply_snapshot_page, finish_bootstrap, PageEntry};
use koloda::repo::sync::rebase::{begin_rebase, finish_rebase};
use koloda::repo::sync::repair::repair_dangling_defaults;
use koloda_sync_proto::registry::{Kind, Lane};
use koloda_sync_proto::transport::{Empty, ErrorCode, Lease, Snapshot, SnapshotPage};
use uuid::Uuid;

use crate::client::local_error;
use crate::engine::{merge, Session, Shared};
use crate::error::SyncError;
use crate::transport::Method;

// WHY: a lapsed lease restarts the bootstrap, and union apply makes the repeat safe; a call gives up after this many
// leases so that a server whose leases keep lapsing cannot hold it forever.
const MAX_LEASES: usize = 3;

/// A joiner's union bootstrap, or a re-bootstrap whose barrier `begin_rebase` opened.
#[derive(Clone, Copy)]
pub(crate) enum Bootstrap {
    Join,
    Rebase,
}

/// A lease this device holds, and the server time of the last reply, which decides when to heartbeat.
pub(crate) struct OpenLease {
    id: Uuid,
    ttl_ms: u64,
    expires_at: u64,
    pub(crate) server_ms: u64,
}

impl Shared {
    /// Opens a re-bootstrap's barrier, or resumes the open one, and runs it.
    pub(crate) async fn rebootstrap(
        self: &Arc<Self>,
        session: &Session,
        changed: &mut Vec<Kind>,
    ) -> Result<(u64, u64), SyncError> {
        self.blocking(|shared| begin_rebase(&shared.db)).await?;
        self.bootstrap(session, Bootstrap::Rebase, changed).await
    }

    /// Bootstraps the file and returns the cursors the incremental cycle starts from.
    pub(crate) async fn bootstrap(
        self: &Arc<Self>,
        session: &Session,
        kind: Bootstrap,
        changed: &mut Vec<Kind>,
    ) -> Result<(u64, u64), SyncError> {
        let mut leases = 1;
        loop {
            match self.bootstrap_once(session, kind, changed).await {
                Err(SyncError::Server {
                    code: ErrorCode::LeaseExpired,
                    ..
                }) if leases < MAX_LEASES => leases += 1,
                result => return result,
            }
        }
    }

    async fn bootstrap_once(
        self: &Arc<Self>,
        session: &Session,
        kind: Bootstrap,
        changed: &mut Vec<Kind>,
    ) -> Result<(u64, u64), SyncError> {
        let opened = self
            .cycle_client(session)
            .call::<(), Snapshot>(
                Method::Post,
                &format!("/v1/spaces/{}/bootstrap", session.space),
                Some(&session.token),
                None,
            )
            .await?;
        self.check_skew()?;
        let snapshot = opened.ok;
        let mut lease = OpenLease {
            id: Uuid::from_bytes(snapshot.snapshot_id),
            ttl_ms: snapshot.ttl_ms,
            expires_at: snapshot.expires_at,
            server_ms: opened.meta.server_time_ms,
        };

        let cursor_hot = match self.fill(session, &mut lease, snapshot.head_hot, changed).await {
            // INVARIANT: a held bootstrap starts over from a new lease on the next trigger, so it gives this one back
            // rather than pin versions until expiry. The status already shows the hold if the release fails.
            Err(SyncError::Held(hold)) => {
                self.release(session, &lease).await?;
                return Err(SyncError::Held(hold));
            }
            filled => filled?,
        };

        // WHY: the flag clears before the release, so a failed release costs a lingering lease, not a second bootstrap.
        // A re-bootstrap's server flag clears only on release, so a failed release there costs a second one.
        let cursor_cold = snapshot.head_cold;
        match kind {
            Bootstrap::Join => {
                self.blocking(move |shared| finish_bootstrap(&shared.db, cursor_cold))
                    .await?;
            }
            Bootstrap::Rebase => {
                let removed = self
                    .blocking(move |shared| finish_rebase(&shared.db, cursor_cold, &shared.starter))
                    .await?;
                merge(changed, removed);
            }
        }
        self.release(session, &lease).await?;
        let repaired = self
            .blocking(|shared| repair_dangling_defaults(&shared.db, &shared.starter))
            .await?;
        merge(changed, repaired);
        Ok((cursor_hot, cursor_cold))
    }

    /// Streams the `hot` snapshot, catches `hot` up, and streams the `cold` snapshot; returns the `hot` cursor.
    async fn fill(
        self: &Arc<Self>,
        session: &Session,
        lease: &mut OpenLease,
        head_hot: u64,
        changed: &mut Vec<Kind>,
    ) -> Result<u64, SyncError> {
        self.stream(session, lease, Lane::Hot, changed).await?;
        // INVARIANT: `hot` catches up to a head read after the lease opened, so a tombstone committed meanwhile
        // removes what the snapshot still pinned.
        let mut cursor_hot = head_hot;
        let pulled = self
            .pull(session, Lane::Hot, None, &mut cursor_hot, Some(lease), changed)
            .await?;
        if let Some(hold) = pulled.hold {
            return Err(SyncError::Held(hold));
        }
        self.stream(session, lease, Lane::Cold, changed).await?;
        Ok(cursor_hot)
    }

    async fn release(&self, session: &Session, lease: &OpenLease) -> Result<(), SyncError> {
        let released = self
            .cycle_client(session)
            .call::<(), Empty>(
                Method::Delete,
                &format!("/v1/spaces/{}/bootstrap/{}", session.space, lease.id),
                Some(&session.token),
                None,
            )
            .await;
        match released {
            // WHY: a lease that lapsed after the last page is already gone; restarting would bootstrap a finished
            // file again.
            Ok(_)
            | Err(SyncError::Server {
                code: ErrorCode::LeaseExpired,
                ..
            }) => Ok(()),
            Err(error) => Err(error),
        }
    }

    /// Streams one lane of the snapshot, one transaction per page.
    async fn stream(
        self: &Arc<Self>,
        session: &Session,
        lease: &mut OpenLease,
        lane: Lane,
        changed: &mut Vec<Kind>,
    ) -> Result<(), SyncError> {
        let mut after = 0;
        loop {
            self.keep_alive(session, lease).await?;
            let answer = self
                .cycle_client(session)
                .call::<(), SnapshotPage>(
                    Method::Get,
                    &format!(
                        "/v1/spaces/{}/bootstrap/{}?lane={}&after={after}",
                        session.space,
                        lease.id,
                        lane.as_wire()
                    ),
                    Some(&session.token),
                    None,
                )
                .await?;
            lease.server_ms = answer.meta.server_time_ms;
            self.spend_bytes(answer.bytes)?;
            self.check_skew()?;
            self.check_time()?;
            let entries = answer
                .ok
                .entries
                .into_iter()
                .map(|entry| {
                    Ok(PageEntry {
                        seq: i64::try_from(entry.seq).map_err(local_error)?,
                        sender: Uuid::from_bytes(entry.sender),
                        sender_seq: i64::try_from(entry.sender_seq).map_err(local_error)?,
                        envelope: entry.envelope,
                    })
                })
                .collect::<Result<Vec<_>, SyncError>>()?;
            let applied = self
                .blocking(move |shared| apply_snapshot_page(&shared.db, lane, &entries, &shared.starter))
                .await?;
            merge(changed, applied.changed);
            if let Some(hold) = applied.hold {
                self.note_hold(lane, Some(hold))?;
                return Err(SyncError::Held(hold));
            }
            after = answer.ok.next;
            if answer.ok.done {
                return Ok(());
            }
        }
    }

    /// Extends the lease once the last reply's server time is within half a TTL of its expiry.
    pub(crate) async fn keep_alive(&self, session: &Session, lease: &mut OpenLease) -> Result<(), SyncError> {
        if lease.server_ms.saturating_add(lease.ttl_ms / 2) < lease.expires_at {
            return Ok(());
        }
        let answer = self
            .cycle_client(session)
            .call::<(), Lease>(
                Method::Post,
                &format!("/v1/spaces/{}/bootstrap/{}/heartbeat", session.space, lease.id),
                Some(&session.token),
                None,
            )
            .await?;
        lease.expires_at = answer.ok.expires_at;
        lease.server_ms = answer.meta.server_time_ms;
        Ok(())
    }
}
