//! Push and receipts (`PROTOCOL.md` §Push outcomes, §Sender sequence).
//!
//! A push is atomic: one transaction under the space writer lock consumes every new item or none.

use std::sync::Arc;

use axum::body::Body;
use axum::extract::rejection::QueryRejection;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use koloda_sync_proto::envelope::{digest, Envelope};
use koloda_sync_proto::hlc::check_not_ahead_of_server;
use koloda_sync_proto::registry::Op;
use koloda_sync_proto::transport::{
    ErrorCode, Outcome, Push, PushOutcome, PushReply, Receipts, MAX_PUSH_ITEMS, MAX_RECEIPT_RANGE,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::{self, DeviceAuth};
use crate::http::{query, read_body, respond, ApiError};
use crate::log::{self, Entry};
use crate::server::{lock, Server};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReceiptsQuery {
    sender: Uuid,
    after: u64,
    through: u64,
}

struct Item {
    sender_seq: u64,
    envelope: Envelope,
    bytes: Vec<u8>,
}

pub(crate) async fn push(
    State(server): State<Arc<Server>>,
    Path(space): Path<String>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let request = read_body::<Push>(&headers, body).await;
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        push_batch(server, &caller, request?)
    })
    .await
}

pub(crate) async fn receipts(
    State(server): State<Arc<Server>>,
    Path(space): Path<String>,
    params: Result<Query<ReceiptsQuery>, QueryRejection>,
    headers: HeaderMap,
) -> Response {
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        let params = query(params)?;
        if params.through.saturating_sub(params.after) > MAX_RECEIPT_RANGE {
            return Err(ApiError::bad_request(format!(
                "a receipt range spans at most {MAX_RECEIPT_RANGE} seqs"
            )));
        }
        let space = server.space(caller.space)?.ok_or_else(ApiError::unknown_space)?;
        let receipts = log::receipts(&*lock(&space.reader)?, params.sender, params.after, params.through)?;
        Ok(Receipts { receipts })
    })
    .await
}

fn push_batch(server: &Server, caller: &DeviceAuth, request: Push) -> Result<PushReply, ApiError> {
    let items = decode_items(request)?;
    let space = server.space(caller.space)?.ok_or_else(ApiError::unknown_space)?;
    let now = server.now_ms();
    let mut conn = lock(&space.writer)?;
    let tx = conn.transaction()?;
    let mut high_water = log::high_water(&tx, caller.id)?;

    // INVARIANT: the guard fails the push before anything is consumed, so every cohort in it can return to `local`
    // and be re-stamped. Replays were accepted under the guard once and are not checked again.
    for item in items.iter().filter(|item| item.sender_seq > high_water) {
        check_not_ahead_of_server(item.envelope.header.stamp.hlc, now)
            .map_err(|error| ApiError::new(StatusCode::CONFLICT, ErrorCode::StampAhead, error.to_string()))?;
    }

    let mut outcomes = Vec::with_capacity(items.len());
    for item in &items {
        let header = &item.envelope.header;
        let digest = digest(&item.bytes);
        if item.sender_seq <= high_water {
            match log::receipt(&tx, caller.id, item.sender_seq)? {
                Some((stored, outcome)) if stored == digest => outcomes.push(PushOutcome {
                    sender_seq: item.sender_seq,
                    outcome,
                    replayed: true,
                }),
                // WHY: seqs strictly increase, so a seq at or below high-water that is not this exact envelope means
                // the file is behind its own record. Only replays can precede it in the batch: nothing new is lost.
                _ => {
                    outcomes.push(PushOutcome {
                        sender_seq: item.sender_seq,
                        outcome: Outcome::SeqReused,
                        replayed: false,
                    });
                    break;
                }
            }
            continue;
        }
        let group = header
            .group
            .ok_or_else(|| ApiError::internal("a write without a group passed decoding"))?;
        let entry = Entry {
            header,
            group,
            sender: caller.id,
            sender_seq: item.sender_seq,
            digest,
            bytes: &item.bytes,
        };
        let outcome = log::accept(&tx, &entry)?;
        log::record(&tx, &entry, outcome)?;
        high_water = item.sender_seq;
        outcomes.push(PushOutcome {
            sender_seq: item.sender_seq,
            outcome,
            replayed: false,
        });
    }
    tx.commit()?;
    Ok(PushReply { outcomes })
}

fn decode_items(request: Push) -> Result<Vec<Item>, ApiError> {
    if request.items.len() > MAX_PUSH_ITEMS {
        return Err(ApiError::too_large(format!(
            "a push carries at most {MAX_PUSH_ITEMS} envelopes"
        )));
    }
    let mut items = Vec::with_capacity(request.items.len());
    let mut previous = 0;
    for (index, item) in request.items.into_iter().enumerate() {
        if item.sender_seq <= previous {
            return Err(ApiError::bad_request(format!(
                "item {index}: sender_seq {} does not follow {previous}",
                item.sender_seq
            )));
        }
        previous = item.sender_seq;
        let envelope = Envelope::decode(&item.envelope)
            .map_err(|error| ApiError::bad_request(format!("item {index}: {error}")))?;
        if envelope.header.op == Op::Delete {
            return Err(ApiError::bad_request(format!(
                "item {index}: this server does not accept deletes yet"
            )));
        }
        items.push(Item {
            sender_seq: item.sender_seq,
            envelope,
            bytes: item.envelope,
        });
    }
    Ok(items)
}
