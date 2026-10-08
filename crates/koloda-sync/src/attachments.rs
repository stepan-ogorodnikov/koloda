//! Image transfers after the cycle's rounds: uploads the server asked for and fetches of images remote cards link
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Attachments, §Cycle).

use std::num::NonZeroU32;
use std::sync::Arc;

use koloda::app::utility::get_current_timestamp;
use koloda::domain::attachments::AddAttachmentData;
use koloda::repo::sync::attachments::{
    defer_transfer, due_transfers, finish_attachment_check, finish_transfer, queue_missing_uploads, store_fetched,
    upload_source, Direction, Transfer,
};
use koloda::repo::sync::sync_state;
use koloda_sync_proto::transport::{AttachmentBody, Empty, ErrorCode, MissingAttachments, MAX_MISSING_IDS};

use crate::engine::{Session, Shared};
use crate::error::SyncError;
use crate::runner::Event;
use crate::transport::Method;

const DUE_BATCH: usize = 16;
// WHY: transfers share the cycle with row sync; past this a cycle ends and the runner starts the next one at once.
const CYCLE_BYTES: usize = 64 * 1024 * 1024;

impl Shared {
    /// After a restore, asks the server once which linked images it lacks and queues an upload of each one this file
    /// holds: a backup can hold a card whose image went up after it was taken, and no push reports those bytes
    /// (`PROTOCOL.md` §Server restore). A check that stops part way runs again from the start.
    pub(crate) async fn check_missing_attachments(self: &Arc<Self>, session: &Session) -> Result<(), SyncError> {
        let is_due = self
            .blocking(|shared| sync_state(&shared.db))
            .await?
            .is_some_and(|state| state.is_checking_attachments);
        if !is_due {
            return Ok(());
        }
        let mut after = String::new();
        loop {
            let from = if after.is_empty() {
                String::new()
            } else {
                format!("&after={after}")
            };
            let page: MissingAttachments = self
                .cycle_client(session)
                .call::<(), _>(
                    Method::Get,
                    &format!(
                        "/v1/spaces/{}/attachments/missing?limit={MAX_MISSING_IDS}{from}",
                        session.space
                    ),
                    Some(&session.token),
                    None,
                )
                .await?
                .ok;
            let is_last = page.ids.len() < MAX_MISSING_IDS;
            after = page.ids.last().cloned().unwrap_or_default();
            self.blocking(move |shared| queue_missing_uploads(&shared.db, &page.ids))
                .await?;
            if is_last {
                return self.blocking(|shared| finish_attachment_check(&shared.db)).await;
            }
        }
    }

    /// Runs due transfers one at a time and returns whether any are still due. It stops early once a trigger arrives,
    /// so the rows a local change wrote go out before more images move.
    pub(crate) async fn transfer(self: &Arc<Self>, session: &Session) -> Result<bool, SyncError> {
        let generation = self.triggers.generation();
        let mut fetched = Vec::new();
        let result = self.transfer_due(session, generation, &mut fetched).await;
        if !fetched.is_empty() {
            self.emit(Event::AttachmentsFetched { ids: fetched });
        }
        result
    }

    async fn transfer_due(
        self: &Arc<Self>,
        session: &Session,
        generation: u64,
        fetched: &mut Vec<String>,
    ) -> Result<bool, SyncError> {
        let mut moved = 0;
        loop {
            let now = get_current_timestamp()?;
            let due = self
                .blocking(move |shared| due_transfers(&shared.db, now, DUE_BATCH))
                .await?;
            if due.is_empty() {
                return Ok(false);
            }
            for transfer in due {
                if moved >= CYCLE_BYTES || self.triggers.generation() != generation {
                    return Ok(true);
                }
                self.check_time()?;
                moved += match transfer.direction {
                    Direction::Upload => self.upload(session, transfer).await?,
                    Direction::Fetch => self.fetch(session, transfer, fetched).await?,
                };
            }
        }
    }

    /// Sends one queued image and returns the bytes it moved.
    async fn upload(self: &Arc<Self>, session: &Session, transfer: Transfer) -> Result<usize, SyncError> {
        let id = transfer.id.clone();
        let Some((attachment, bytes)) = self.blocking(move |shared| upload_source(&shared.db, &id)).await? else {
            return Ok(0);
        };
        let body = AttachmentBody {
            mime: attachment.mime,
            width: attachment.width.and_then(NonZeroU32::new),
            height: attachment.height.and_then(NonZeroU32::new),
            bytes,
        };
        let size = body.bytes.len();
        let sent = self
            .cycle_client(session)
            .call::<_, Empty>(
                Method::Put,
                &path(session, &transfer.id),
                Some(&session.token),
                Some(&body),
            )
            .await;
        self.spend_bytes(size)?;
        match sent {
            Ok(_) => self.finish(transfer).await?,
            // WHY: a space with no room takes no bytes until it has room again; the upload waits, as a fetch the
            // server cannot serve yet does, and the status shows the space is over its quota.
            Err(SyncError::Server {
                code: ErrorCode::InsufficientStorage,
                ..
            }) => self.defer(transfer).await?,
            Err(error) if is_refused_for_good(&error) => self.drop_refused(transfer, &error).await?,
            Err(error) => return Err(error),
        }
        Ok(size)
    }

    /// Fetches one image and returns the bytes it moved. Until a device uploads it, the fetch waits and tries again.
    async fn fetch(
        self: &Arc<Self>,
        session: &Session,
        transfer: Transfer,
        fetched: &mut Vec<String>,
    ) -> Result<usize, SyncError> {
        let answer = self
            .cycle_client(session)
            .call::<(), AttachmentBody>(Method::Get, &path(session, &transfer.id), Some(&session.token), None)
            .await;
        let answer = match answer {
            Ok(answer) => answer,
            Err(SyncError::Server {
                code: ErrorCode::NotFound,
                ..
            }) => {
                self.defer(transfer).await?;
                return Ok(0);
            }
            Err(error) if is_refused_for_good(&error) => {
                self.drop_refused(transfer, &error).await?;
                return Ok(0);
            }
            Err(error) => return Err(error),
        };
        self.spend_bytes(answer.bytes)?;
        let data = AddAttachmentData {
            bytes: answer.ok.bytes,
            width: answer.ok.width,
            height: answer.ok.height,
        };
        let id = transfer.id.clone();
        if self
            .blocking(move |shared| store_fetched(&shared.db, &id, &data))
            .await?
        {
            fetched.push(transfer.id);
        } else {
            self.emit(Event::Error(format!(
                "attachment {} arrived with bytes that do not match it, so it was not stored",
                transfer.id
            )));
        }
        Ok(answer.bytes)
    }

    async fn drop_refused(self: &Arc<Self>, transfer: Transfer, error: &SyncError) -> Result<(), SyncError> {
        self.emit(Event::Error(format!("attachment {} was dropped: {error}", transfer.id)));
        self.finish(transfer).await
    }

    async fn defer(self: &Arc<Self>, transfer: Transfer) -> Result<(), SyncError> {
        let now = get_current_timestamp()?;
        self.blocking(move |shared| defer_transfer(&shared.db, &transfer, now))
            .await
    }

    async fn finish(self: &Arc<Self>, transfer: Transfer) -> Result<(), SyncError> {
        self.blocking(move |shared| finish_transfer(&shared.db, &transfer))
            .await
    }
}

// WHY: the server refuses these the same way on every retry; any other error, such as no reply or a server fault,
// leaves the transfer queued for the next cycle.
fn is_refused_for_good(error: &SyncError) -> bool {
    matches!(
        error,
        SyncError::Server {
            code: ErrorCode::BadRequest | ErrorCode::TooLarge,
            ..
        }
    )
}

fn path(session: &Session, id: &str) -> String {
    format!("/v1/spaces/{}/attachments/{id}", session.space)
}
