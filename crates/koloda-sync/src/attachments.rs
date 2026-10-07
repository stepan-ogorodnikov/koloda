//! Image transfers after the cycle's rounds: uploads the server asked for and fetches of images remote cards link
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Attachments, §Cycle).

use std::num::NonZeroU32;
use std::sync::Arc;

use koloda::app::utility::get_current_timestamp;
use koloda::domain::attachments::AddAttachmentData;
use koloda::repo::sync::attachments::{
    defer_fetch, due_transfers, finish_transfer, store_fetched, upload_source, Direction, Transfer,
};
use koloda_sync_proto::transport::{AttachmentBody, Empty, ErrorCode};

use crate::engine::{Session, Shared};
use crate::error::SyncError;
use crate::runner::Event;
use crate::transport::Method;

const DUE_BATCH: usize = 16;
// WHY: transfers share the cycle with row sync; past this a cycle ends and the runner starts the next one at once.
const CYCLE_BYTES: usize = 64 * 1024 * 1024;

impl Shared {
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
                let now = get_current_timestamp()?;
                self.blocking(move |shared| defer_fetch(&shared.db, &transfer.id, now))
                    .await?;
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
