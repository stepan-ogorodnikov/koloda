//! Pairing and joining an existing space (`crates/koloda-sync-proto/PROTOCOL.md` §Pairing, §Joining).
//!
//! INVARIANT: codes and tokens are never logged; they travel only in request bodies and the secret store.

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use koloda::app::init::{seed_joiner, SeedSettings};
use koloda::app::utility::get_current_timestamp;
use koloda::repo::sync::join::{add_to_space, begin_import, join_mode, probe_ids, replace_with_space, JoinMode, Known};
use koloda::repo::sync::outbox::lowest_pending_seq;
use koloda::repo::sync::switch::switch_device;
use koloda::repo::sync::{clear_enrolling, enroll, sync_state, Enrolling, SpaceRole};
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::{
    code_hash, ClaimPairing, DeviceInfo, EntityId, ErrorCode, IssuePairing, KnownIds, KnownState, Pairing,
    PairingClaim, PairingPreview, PreviewPairing, Receipt, Receipts, MAX_KNOWN_IDS, MAX_RECEIPT_RANGE,
};
use serde::de::DeserializeOwned;
use uuid::Uuid;

use crate::client::{local_error, server_url};
use crate::engine::{pending_token_key, token_key, Credentials, Session, Shared};
use crate::error::SyncError;
use crate::transport::Method;

/// A code another device claims to join this file's space; the host shows it with the server URL and space id.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IssuedPairing {
    pub code: String,
    pub expires_at: u64,
    pub server_url: String,
    pub space_id: Uuid,
}

/// What a code would join, before anything is claimed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Preview {
    pub space_id: Uuid,
    pub name: String,
    pub counts: BTreeMap<String, u64>,
    pub bytes: u64,
}

/// How the file joined, the inviting device's setup hint, and how many of the file's ids the space already holds.
///
/// A used file waits for `import`: any known id means a likely copy, for which Replace is the safer choice.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Joined {
    pub mode: JoinMode,
    pub hint: Option<Vec<u8>>,
    pub known_ids: usize,
}

/// Where a claim of one code goes. `pending` holds the credentials of a claim of it the file has not recorded.
struct ClaimTarget {
    base: String,
    space: Uuid,
    code_hash: [u8; 32],
    pending: Option<Credentials>,
}

/// How a used file finishes its join (`PROTOCOL.md` §Joining).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImportMode {
    /// Keep the file's rows, reminting the ids the space already holds.
    Add,
    /// Delete the file's product rows and take the space's.
    Replace,
}

impl Shared {
    pub(crate) async fn issue_pairing(self: Arc<Self>, hint: Option<Vec<u8>>) -> Result<IssuedPairing, SyncError> {
        let session = self.session().await?;
        let pairing: Pairing = self
            .device_client(&session)
            .call(
                Method::Post,
                &format!("/v1/spaces/{}/pairings", session.space),
                Some(&session.token),
                Some(&IssuePairing { hint }),
            )
            .await?
            .ok;
        Ok(IssuedPairing {
            code: pairing.code,
            expires_at: pairing.expires_at,
            server_url: session.base,
            space_id: session.space,
        })
    }

    pub(crate) async fn preview(self: Arc<Self>, server_url_text: &str, code: &str) -> Result<Preview, SyncError> {
        let base = server_url(server_url_text)?;
        let preview = self.preview_at(&base, code).await?;
        Ok(Preview {
            space_id: Uuid::from_bytes(preview.space_id),
            name: preview.name,
            counts: preview.counts,
            bytes: preview.bytes,
        })
    }

    // WHY: the server answers the preview of a claimed code `pairing_failed`, so a claim that may have landed skips
    // it. Its space and server URL come from the preview before its first attempt.
    async fn claim_target(self: &Arc<Self>, server_url_text: &str, code: &str) -> Result<ClaimTarget, SyncError> {
        let code_hash = code_hash(code);
        if let Some((
            Enrolling::Claim {
                nonce,
                code_hash: stored,
                space_id,
                server_url,
            },
            token,
        )) = self.pending_enrollment().await?
        {
            if stored == code_hash {
                return Ok(ClaimTarget {
                    base: server_url,
                    space: space_id,
                    code_hash,
                    pending: Some(Credentials { nonce, token }),
                });
            }
        }
        let base = server_url(server_url_text)?;
        let preview = self.preview_at(&base, code).await?;
        Ok(ClaimTarget {
            base,
            space: Uuid::from_bytes(preview.space_id),
            code_hash,
            pending: None,
        })
    }

    // INVARIANT: every attempt, retries inside `call` and later host calls alike, sends the nonce and token stored
    // before the first, so a claim that lands without a reply still enrolls one device.
    async fn claim(
        self: &Arc<Self>,
        target: &ClaimTarget,
        code: &str,
        device_name: &str,
    ) -> Result<(PairingClaim, Credentials), SyncError> {
        let credentials = match &target.pending {
            Some(credentials) => credentials.clone(),
            None => {
                let (code_hash, space_id, server_url) = (target.code_hash, target.space, target.base.clone());
                self.begin_enrolling(move |nonce| Enrolling::Claim {
                    nonce,
                    code_hash,
                    space_id,
                    server_url,
                })
                .await?
            }
        };
        let reply = self
            .client(&target.base)
            .call(
                Method::Post,
                "/v1/pairings/claim",
                None,
                Some(&ClaimPairing {
                    code: code.to_string(),
                    name: device_name.to_string(),
                    platform: self.platform,
                    nonce: credentials.nonce,
                    token: credentials.token.clone(),
                }),
            )
            .await;
        match reply {
            Ok(answer) => Ok((answer.ok, credentials)),
            // WHY: the code is used, expired, or wrong for this nonce, so no later attempt can land. Any other refusal
            // keeps the credentials: an earlier attempt may have landed, and only they can return its device.
            Err(
                error @ SyncError::Server {
                    code: ErrorCode::PairingFailed,
                    ..
                },
            ) => {
                let nonce = credentials.nonce;
                self.blocking(move |shared| {
                    clear_enrolling(&shared.db)?;
                    shared.secrets.remove(&pending_token_key(&nonce))
                })
                .await?;
                Err(error)
            }
            Err(error) => Err(error),
        }
    }

    /// Re-attaches a detached file to the space it was in: a new device id that keeps the file's rows, stamps,
    /// cursors, and pending writes (`PROTOCOL.md` §Re-attach).
    async fn reattach(
        self: Arc<Self>,
        target: ClaimTarget,
        code: &str,
        device_name: &str,
    ) -> Result<Joined, SyncError> {
        let state = self
            .blocking(|shared| sync_state(&shared.db))
            .await?
            .ok_or(SyncError::NotEnrolled)?;
        // INVARIANT: the refusal comes before the claim, so the code stays usable by another device. An attached file
        // has nothing to re-attach to.
        if !state.is_detached {
            return Err(SyncError::CannotJoin(JoinMode::Reattach));
        }
        let stored = state.epoch.ok_or(SyncError::NotEnrolled)?;

        let (claim, credentials) = self.claim(&target, code, device_name).await?;
        let device = Uuid::from_bytes(claim.enrollment.device_id);
        let saved = credentials.token.clone();
        self.blocking(move |shared| shared.secrets.set(&token_key(device), &saved))
            .await?;
        let mut session = Session {
            base: target.base,
            space: state.space_id,
            device,
            token: credentials.token,
            epoch: stored,
        };
        let old = state.device_id;
        // WHY: a restore that predates the old device has no record of it, so none of its seqs were consumed there.
        // INVARIANT: every call after the claim names the stored epoch until a restore moves it, and a `Restored`
        // answer is applied and the call repeated, so a restore that lands on the lookup or the receipts is not lost.
        // A call that fails otherwise leaves the claim pending, and the next join with its code resumes here.
        let path = format!("/v1/spaces/{}/devices/{old}", session.space);
        let last_sender_seq = match self
            .call_across_restore::<DeviceInfo>(&mut session, Method::Get, &path)
            .await
        {
            Ok(info) => info.last_sender_seq,
            Err(SyncError::Server {
                code: ErrorCode::NotFound,
                ..
            }) => 0,
            Err(error) => return Err(error),
        };
        let receipts = self.receipts_across_restore(&mut session, old, last_sender_seq).await?;
        let now_ms = u64::try_from(get_current_timestamp()?).map_err(local_error)?;
        let url = session.base.clone();
        self.blocking(move |shared| {
            switch_device(
                &shared.db,
                device,
                &receipts,
                &shared.starter,
                now_ms,
                false,
                Some(&url),
            )
        })
        .await?;
        self.finish_enrolling(credentials.nonce).await;
        // WHY: a detach whose token delete failed left the old device's token behind.
        self.forget_secrets(vec![token_key(old)]).await;
        Ok(Joined {
            mode: JoinMode::Reattach,
            hint: claim.hint,
            known_ids: 0,
        })
    }

    /// One call during a re-attach. A `Restored` answer is applied, the session moves to that epoch, and the call
    /// is repeated. An authoritative restore is held and the call still repeats, so the switch can finish.
    async fn call_across_restore<T: DeserializeOwned>(
        self: &Arc<Self>,
        session: &mut Session,
        method: Method,
        path: &str,
    ) -> Result<T, SyncError> {
        loop {
            match self
                .device_client(session)
                .call::<(), T>(method, path, Some(&session.token), None)
                .await
            {
                Ok(reply) => return Ok(reply.ok),
                Err(SyncError::Restored {
                    restore,
                    last_sender_seq,
                }) => {
                    let epoch = Uuid::from_bytes(restore.epoch);
                    match self.apply_restore(restore, last_sender_seq).await {
                        Ok(_) | Err(SyncError::RestoreHeld) => session.epoch = epoch,
                        Err(error) => return Err(error),
                    }
                }
                Err(error) => return Err(error),
            }
        }
    }

    /// The old sender's receipts for pending seqs at or below `last_sender_seq`, across a restore on any page.
    async fn receipts_across_restore(
        self: &Arc<Self>,
        session: &mut Session,
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
            let page = self
                .call_across_restore::<Receipts>(
                    session,
                    Method::Get,
                    &format!(
                        "/v1/spaces/{}/receipts?sender={sender}&after={from}&through={through}",
                        session.space
                    ),
                )
                .await?;
            receipts.extend(page.receipts);
            from = through;
        }
        Ok(receipts)
    }

    async fn preview_at(&self, base: &str, code: &str) -> Result<PairingPreview, SyncError> {
        Ok(self
            .client(base)
            .call(
                Method::Post,
                "/v1/pairings/preview",
                None,
                Some(&PreviewPairing { code: code.to_string() }),
            )
            .await?
            .ok)
    }

    pub(crate) async fn join(
        self: Arc<Self>,
        server_url_text: &str,
        code: &str,
        device_name: &str,
        settings: SeedSettings,
    ) -> Result<Joined, SyncError> {
        let target = self.claim_target(server_url_text, code).await?;
        // INVARIANT: the mode is read for the previewed space before the code is claimed, so a file that cannot
        // re-attach is refused while its code can still be used by another device.
        let space = target.space;
        let mode = self.blocking(move |shared| join_mode(&shared.db, space)).await?;
        match mode {
            JoinMode::Reattach => return self.reattach(target, code, device_name).await,
            JoinMode::AttachedElsewhere => return Err(SyncError::CannotJoin(mode)),
            JoinMode::Blank | JoinMode::UntouchedSeed | JoinMode::Used => {}
        }

        let (claim, credentials) = self.claim(&target, code, device_name).await?;
        let enrollment = claim.enrollment;
        let session = Session {
            base: target.base,
            space: Uuid::from_bytes(enrollment.space_id),
            device: Uuid::from_bytes(enrollment.device_id),
            token: credentials.token,
            epoch: Uuid::from_bytes(enrollment.epoch),
        };
        let epoch = Uuid::from_bytes(enrollment.epoch);
        let (device, token) = (session.device, session.token.clone());
        self.blocking(move |shared| shared.secrets.set(&token_key(device), &token))
            .await?;

        let (space, base) = (session.space, session.base.clone());
        // INVARIANT: no cycle runs between the claim's record and an untouched seed's Add, so a cycle only finishes
        // an Add that a failed probe left.
        let _cycle = self.cycle.lock().await;
        if mode == JoinMode::Blank {
            // INVARIANT: the settings and the enrollment commit together. A stop before the commit leaves the file
            // blank with its claim pending, so the next join with the code joins it as blank on the same device.
            self.blocking(move |shared| {
                shared.db.with_transaction(|tx| {
                    seed_joiner(tx, settings)?;
                    enroll(tx, device, space, SpaceRole::Joiner, epoch, &base)
                })
            })
            .await?;
            self.finish_enrolling(credentials.nonce).await;
            return Ok(Joined {
                mode,
                hint: claim.hint,
                known_ids: 0,
            });
        }

        self.blocking(move |shared| begin_import(&shared.db, device, space, epoch, &base))
            .await?;
        self.finish_enrolling(credentials.nonce).await;
        let known = self.probe(&session).await?;
        let known_ids = known.len();
        // WHY: only the untouched seed joins without asking; Add's seed rules are the only change it needs.
        if mode == JoinMode::UntouchedSeed {
            self.blocking(move |shared| add_to_space(&shared.db, &known)).await?;
        }
        Ok(Joined {
            mode,
            hint: claim.hint,
            known_ids,
        })
    }

    /// Finishes a used file's join; the next cycle bootstraps it.
    pub(crate) async fn import(self: Arc<Self>, mode: ImportMode) -> Result<(), SyncError> {
        match mode {
            ImportMode::Add => {
                // INVARIANT: no probe answer is stored; Add asks the space again, since it may have changed.
                let session = self.session().await?;
                let known = self.probe(&session).await?;
                self.blocking(move |shared| add_to_space(&shared.db, &known)).await
            }
            ImportMode::Replace => self.blocking(|shared| replace_with_space(&shared.db)).await,
        }
    }

    /// Asks the space which of the file's ids it holds, a chunk at a time (`PROTOCOL.md` §Joining).
    pub(crate) async fn probe(self: &Arc<Self>, session: &Session) -> Result<HashMap<String, Known>, SyncError> {
        let mut known = HashMap::new();
        let mut after: Option<(Kind, String)> = None;
        loop {
            let from = after.clone();
            let ids = self
                .blocking(move |shared| probe_ids(&shared.db, from.as_ref(), MAX_KNOWN_IDS))
                .await?;
            let Some(last) = ids.last().cloned() else {
                return Ok(known);
            };
            let request = KnownIds {
                ids: ids
                    .iter()
                    .map(|(kind, id)| EntityId {
                        kind: kind.as_wire().to_string(),
                        id: id.clone(),
                    })
                    .collect(),
            };
            let answer: koloda_sync_proto::transport::Known = self
                .device_client(session)
                .call(
                    Method::Post,
                    &format!("/v1/spaces/{}/ids/known", session.space),
                    Some(&session.token),
                    Some(&request),
                )
                .await?
                .ok;
            known.extend(answer.ids.into_iter().map(|held| {
                let state = match held.state {
                    KnownState::Live => Known::Live,
                    KnownState::Fenced => Known::Fenced,
                };
                (held.id, state)
            }));
            if ids.len() < MAX_KNOWN_IDS {
                return Ok(known);
            }
            after = Some(last);
        }
    }
}
