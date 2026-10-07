//! Pairing and joining an existing space (`crates/koloda-sync-proto/PROTOCOL.md` §Pairing, §Joining).
//!
//! INVARIANT: codes and tokens are never logged; they travel only in request bodies and the secret store.

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use koloda::app::init::{seed_joiner_db, SeedSettings};
use koloda::app::utility::get_current_timestamp;
use koloda::repo::sync::join::{add_to_space, begin_import, join_mode, probe_ids, replace_with_space, JoinMode, Known};
use koloda::repo::sync::switch::switch_device;
use koloda::repo::sync::{enroll_device, sync_state, SpaceRole};
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::{
    ClaimPairing, DeviceInfo, EntityId, IssuePairing, KnownIds, KnownState, Pairing, PairingClaim, PairingPreview,
    PreviewPairing, MAX_KNOWN_IDS,
};
use uuid::Uuid;

use crate::client::{local_error, server_url};
use crate::engine::{token_key, Session, Shared};
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

    // INVARIANT: retries inside `call` resend the same nonce, so a lost reply still claims one device.
    async fn claim(&self, base: &str, code: &str, device_name: &str) -> Result<PairingClaim, SyncError> {
        Ok(self
            .client(base)
            .call(
                Method::Post,
                "/v1/pairings/claim",
                None,
                Some(&ClaimPairing {
                    code: code.to_string(),
                    name: device_name.to_string(),
                    platform: self.platform,
                    nonce: Uuid::new_v4().into_bytes(),
                }),
            )
            .await?
            .ok)
    }

    /// Re-attaches a detached file to the space it was in: a new device id that keeps the file's rows, stamps,
    /// cursors, and pending writes (`PROTOCOL.md` §Re-attach).
    async fn reattach(
        self: Arc<Self>,
        base: String,
        code: &str,
        device_name: &str,
        preview: PairingPreview,
    ) -> Result<Joined, SyncError> {
        let state = self
            .blocking(|shared| sync_state(&shared.db))
            .await?
            .ok_or(SyncError::NotEnrolled)?;
        // INVARIANT: both refusals come before the claim, so the code stays usable by another device. An attached
        // file has nothing to re-attach to; a space restored since needs the restore's path first.
        if !state.is_detached {
            return Err(SyncError::CannotJoin(JoinMode::Reattach));
        }
        if state.epoch != Some(Uuid::from_bytes(preview.epoch)) {
            return Err(SyncError::EpochChanged);
        }

        let claim = self.claim(&base, code, device_name).await?;
        let device = Uuid::from_bytes(claim.enrollment.device_id);
        let token = claim.enrollment.token;
        let stored = token.clone();
        self.blocking(move |shared| shared.secrets.set(&token_key(device), &stored))
            .await?;
        let session = Session {
            base,
            space: state.space_id,
            device,
            token,
            epoch: Uuid::from_bytes(preview.epoch),
        };
        let old = state.device_id;
        let record: DeviceInfo = self
            .device_client(&session)
            .call::<(), _>(
                Method::Get,
                &format!("/v1/spaces/{}/devices/{old}", session.space),
                Some(&session.token),
                None,
            )
            .await?
            .ok;
        let receipts = self.pending_receipts(&session, old, record.last_sender_seq).await?;
        let now_ms = u64::try_from(get_current_timestamp()?).map_err(local_error)?;
        self.blocking(move |shared| switch_device(&shared.db, device, &receipts, &shared.starter, now_ms, false))
            .await?;
        Ok(Joined {
            mode: JoinMode::Reattach,
            hint: claim.hint,
            known_ids: 0,
        })
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
        let base = server_url(server_url_text)?;
        // INVARIANT: the mode is read for the previewed space before the code is claimed, so a file that cannot
        // re-attach is refused while its code can still be used by another device.
        let preview = self.preview_at(&base, code).await?;
        let space = Uuid::from_bytes(preview.space_id);
        let mode = self.blocking(move |shared| join_mode(&shared.db, space)).await?;
        if mode == JoinMode::Reattach {
            return self.reattach(base, code, device_name, preview).await;
        }

        let claim = self.claim(&base, code, device_name).await?;
        let enrollment = claim.enrollment;
        let session = Session {
            base,
            space: Uuid::from_bytes(enrollment.space_id),
            device: Uuid::from_bytes(enrollment.device_id),
            token: enrollment.token,
            epoch: Uuid::from_bytes(enrollment.epoch),
        };
        let epoch = Uuid::from_bytes(enrollment.epoch);
        let (device, token) = (session.device, session.token.clone());
        self.blocking(move |shared| shared.secrets.set(&token_key(device), &token))
            .await?;

        let (space, base) = (session.space, session.base.clone());
        if mode == JoinMode::Blank {
            self.blocking(move |shared| {
                seed_joiner_db(&shared.db, settings)?;
                enroll_device(&shared.db, device, space, SpaceRole::Joiner, epoch, &base)
            })
            .await?;
            return Ok(Joined {
                mode,
                hint: claim.hint,
                known_ids: 0,
            });
        }

        self.blocking(move |shared| begin_import(&shared.db, device, space, epoch, &base))
            .await?;
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
    async fn probe(self: &Arc<Self>, session: &Session) -> Result<HashMap<String, Known>, SyncError> {
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
