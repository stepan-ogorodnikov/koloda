//! Pull: other devices' entries of one lane after a cursor (`PROTOCOL.md` §Pull cursor).
//!
//! A page reads live heads only, so superseded versions and removed descendants never reach a device.

use std::sync::Arc;

use axum::extract::rejection::QueryRejection;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::response::Response;
use koloda_sync_proto::registry::Lane;
use koloda_sync_proto::transport::{LogEntry, PullPage, MAX_PAGE_BYTES, MAX_PAGE_ENTRIES};
use rusqlite::{params, Connection};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth;
use crate::http::{query, respond, ApiError};
use crate::log;
use crate::server::{lock, Server};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PullQuery {
    lane: String,
    #[serde(default)]
    after: u64,
    max_seq: Option<u64>,
    limit: Option<u64>,
}

pub(crate) async fn pull(
    State(server): State<Arc<Server>>,
    Path(space): Path<String>,
    params: Result<Query<PullQuery>, QueryRejection>,
    headers: HeaderMap,
) -> Response {
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        let params = query(params)?;
        let lane = Lane::from_wire(&params.lane).map_err(|error| ApiError::bad_request(error.to_string()))?;
        let limit = params.limit.unwrap_or(MAX_PAGE_ENTRIES);
        if limit == 0 || limit > MAX_PAGE_ENTRIES {
            return Err(ApiError::bad_request(format!("limit must be 1 to {MAX_PAGE_ENTRIES}")));
        }
        let space = server.space(caller.space)?.ok_or_else(ApiError::unknown_space)?;
        let page = {
            let mut conn = lock(&space.reader)?;
            // WHY: one read transaction, so the lane head and the page come from the same snapshot.
            let tx = conn.transaction()?;
            let page = read_page(&tx, lane, caller.id, params.after, params.max_seq, limit)?;
            tx.commit()?;
            page
        };
        record_cursor(server, caller.id, lane, params.after)?;
        Ok(page)
    })
    .await
}

fn read_page(
    conn: &Connection,
    lane: Lane,
    caller: Uuid,
    after: u64,
    max_seq: Option<u64>,
    limit: u64,
) -> Result<PullPage, ApiError> {
    let (head_hot, head_cold) = log::lane_heads(conn)?;
    let (horizon_hot, horizon_cold) = log::gc_horizons(conn)?;
    let (head, horizon) = match lane {
        Lane::Hot => (head_hot, horizon_hot),
        Lane::Cold => (head_cold, horizon_cold),
    };
    // INVARIANT: a collected tombstone is gone from the log, so a cursor below the horizon may have missed it; the
    // device re-bootstraps instead of resurrecting what the tombstone deleted (PROTOCOL.md, Pull cursor).
    if after < horizon {
        return Err(ApiError::cursor_too_old(format!(
            "the {} lane collected tombstones up to {horizon}; re-bootstrap",
            lane.as_wire()
        )));
    }
    let bound = max_seq.map_or(head, |max_seq| max_seq.min(head));
    let mut statement = conn.prepare(
        "SELECT v.seq, v.sender, v.sender_seq, v.bytes FROM versions v
         JOIN heads h ON h.lane = v.lane AND h.seq = v.seq
         WHERE v.lane = ?1 AND v.seq > ?2 AND v.seq <= ?3 ORDER BY v.seq",
    )?;
    let mut rows = statement.query(params![lane.as_wire(), after, bound])?;
    let mut entries = Vec::new();
    let mut bytes = 0;
    let mut scanned = after;
    let mut is_cut = false;
    while let Some(row) = rows.next()? {
        let seq: u64 = row.get(0)?;
        let sender: Uuid = row.get(1)?;
        if sender == caller {
            scanned = seq;
            continue;
        }
        let envelope: Vec<u8> = row.get(3)?;
        let is_full = u64::try_from(entries.len()).unwrap_or(u64::MAX) >= limit;
        // WHY: a page always takes its first entry, so one envelope larger than the byte cap still makes progress.
        if !entries.is_empty() && (is_full || bytes + envelope.len() > MAX_PAGE_BYTES) {
            is_cut = true;
            break;
        }
        bytes += envelope.len();
        scanned = seq;
        entries.push(LogEntry {
            seq,
            sender: sender.into_bytes(),
            sender_seq: row.get(2)?,
            envelope,
        });
    }
    // INVARIANT: a page that ran out of rows has examined everything up to its bound, holes and own entries
    // included, so the device may advance its cursor that far even when the page is empty.
    let scanned_through = if is_cut { scanned } else { bound.max(after) };
    Ok(PullPage {
        entries,
        scanned_through,
        has_more: scanned_through < bound,
    })
}

fn record_cursor(server: &Server, device: Uuid, lane: Lane, after: u64) -> Result<(), ApiError> {
    let column = match lane {
        Lane::Hot => "cursor_hot",
        Lane::Cold => "cursor_cold",
    };
    server.server_db()?.execute(
        &format!("UPDATE devices SET {column} = max({column}, ?1) WHERE id = ?2"),
        params![after, device],
    )?;
    Ok(())
}
