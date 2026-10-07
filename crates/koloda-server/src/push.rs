//! Push and receipts (`PROTOCOL.md` §Push outcomes, §Sender sequence).
//!
//! A push is atomic: one transaction under the space writer lock consumes every new item or none.

use std::collections::HashMap;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::rejection::QueryRejection;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use koloda_sync_proto::envelope::{digest, Envelope};
use koloda_sync_proto::hlc::check_not_ahead_of_server;
use koloda_sync_proto::registry::{Class, Kind};
use koloda_sync_proto::transport::{
    ErrorCode, HeldReason, Outcome, Push, PushOutcome, PushReply, Receipts, MAX_PUSH_ITEMS, MAX_RECEIPT_RANGE,
};
use rusqlite::Connection;
use serde::Deserialize;
use uuid::Uuid;

use crate::attachments;
use crate::auth::{self, DeviceAuth};
use crate::bootstrap;
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
        // INVARIANT: a device the server left behind re-bootstraps before anything it pushes is consumed; the refusal
        // consumes nothing, replays included (PROTOCOL.md, Devices).
        if caller.is_rebase_required {
            return Err(ApiError::cursor_too_old(
                "this device must re-bootstrap before it pushes",
            ));
        }
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
    // WHY: an abandoned lease must stop pinning versions once its TTL ends, not when the next bootstrap opens.
    bootstrap::end_expired(&tx, now)?;
    let mut high_water = log::high_water(&tx, caller.id)?;
    let write_schema = write_schema(&tx)?;
    let accepted_schema = |kind: Kind| {
        write_schema
            .get(kind.as_wire())
            .copied()
            .ok_or_else(|| ApiError::internal(format!("no write schema for `{}`", kind.as_wire())))
    };

    // INVARIANT: these checks fail the push before anything is consumed, so every cohort in it can return to
    // `local`. Replays were accepted under them once and are not checked again.
    for item in items.iter().filter(|item| item.sender_seq > high_water) {
        let header = &item.envelope.header;
        check_not_ahead_of_server(header.stamp.hlc, now)
            .map_err(|error| ApiError::new(StatusCode::CONFLICT, ErrorCode::StampAhead, error.to_string()))?;
        let accepted = accepted_schema(header.kind)?;
        if header.schema > accepted {
            return Err(ApiError::new(
                StatusCode::CONFLICT,
                ErrorCode::SchemaReadOnly,
                format!(
                    "`{}` accepts writes at schema {accepted}, not {}",
                    header.kind.as_wire(),
                    header.schema
                ),
            ));
        }
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
                    missing_attachments: attachments::missing(&tx, header)?,
                }),
                // WHY: seqs strictly increase, so a seq at or below high-water that is not this exact envelope means
                // the file is behind its own record. Only replays can precede it in the batch: nothing new is lost.
                _ => {
                    outcomes.push(PushOutcome {
                        sender_seq: item.sender_seq,
                        outcome: Outcome::SeqReused,
                        replayed: false,
                        missing_attachments: Vec::new(),
                    });
                    break;
                }
            }
            continue;
        }
        let entry = Entry {
            header,
            group: header.group,
            sender: caller.id,
            sender_seq: item.sender_seq,
            digest,
            bytes: &item.bytes,
            now_ms: now,
        };
        let class = header.group.map(|group| log::class(header, group)).transpose()?;
        let outcome = if header.schema < accepted_schema(header.kind)? {
            Outcome::Held {
                reason: HeldReason::Schema,
            }
        } else if log::names_held(&tx, caller.id, header, class)? {
            Outcome::Held {
                reason: HeldReason::Dependency,
            }
        } else {
            match class {
                Some(class) => log::accept(&tx, &entry, class)?,
                None => log::delete(&tx, &entry)?,
            }
        };
        if class == Some(Class::Create) {
            if matches!(outcome, Outcome::Held { .. }) {
                log::hold(&tx, caller.id, header)?;
            } else {
                // WHY: any consumed outcome of the sender's own create settles the entity, so its dependents
                // stop waiting and meet the ordinary rules (`stale` means another device created it).
                log::release(&tx, caller.id, header)?;
            }
        }
        log::record(&tx, &entry, outcome)?;
        high_water = item.sender_seq;
        outcomes.push(PushOutcome {
            sender_seq: item.sender_seq,
            outcome,
            replayed: false,
            missing_attachments: attachments::missing(&tx, header)?,
        });
    }
    tx.commit()?;
    Ok(PushReply { outcomes })
}

fn write_schema(tx: &Connection) -> Result<HashMap<String, u32>, ApiError> {
    let mut statement = tx.prepare("SELECT kind, schema FROM write_schema")?;
    let schemas = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<HashMap<_, _>, _>>()?;
    Ok(schemas)
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
        items.push(Item {
            sender_seq: item.sender_seq,
            envelope,
            bytes: item.envelope,
        });
    }
    Ok(items)
}
