//! Bootstrap: snapshot leases over the live heads, streamed in pages (`PROTOCOL.md` §Bootstrap).
//!
//! A lease fixes its stream order when it opens. `hot` streams referents first, each kind in `seq` order; `cold`
//! streams newest first. The lease pins the versions it lists, so compaction and deletes cannot remove them.

use std::collections::BTreeMap;
use std::sync::Arc;

use axum::extract::rejection::QueryRejection;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use koloda_sync_proto::registry::Lane;
use koloda_sync_proto::transport::{
    Empty, ErrorCode, Lease, LogEntry, Snapshot, SnapshotPage, MAX_PAGE_BYTES, MAX_PAGE_ENTRIES,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::{self, DeviceAuth};
use crate::http::{query, respond, ApiError};
use crate::log::{self, TOMBSTONE};
use crate::quota::Room;
use crate::server::{lock, Server};

pub(crate) const LEASE_TTL_MS: u64 = 5 * 60 * 1000;
pub(crate) const LEASE_LIFETIME_MS: u64 = 24 * 60 * 60 * 1000;
pub(crate) const MAX_LEASES: u64 = 4;

// INVARIANT: referents stream before what names them, so a page applies without buffering: a deck create finds
// every live algorithm and template already local (`PROTOCOL.md` §Bootstrap).
pub(crate) const HOT_ORDER: &str = "CASE v.kind
    WHEN 'algorithms' THEN 0 WHEN 'algorithm_revisions' THEN 1 WHEN 'templates' THEN 2
    WHEN 'decks' THEN 3 WHEN 'cards' THEN 4 ELSE 5 END, v.seq";
pub(crate) const COLD_ORDER: &str = "v.hlc DESC, v.stamp_device DESC, v.seq DESC";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PageQuery {
    lane: String,
    #[serde(default)]
    after: u64,
    limit: Option<u64>,
}

struct LeaseRow {
    expires_at: u64,
    absolute_expiry: u64,
}

enum LeaseState {
    Live(Uuid, LeaseRow),
    Expired(Uuid),
    Missing,
}

pub(crate) async fn open(State(server): State<Arc<Server>>, Path(space): Path<String>, headers: HeaderMap) -> Response {
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        open_lease(server, &caller)
    })
    .await
}

pub(crate) async fn page(
    State(server): State<Arc<Server>>,
    Path((space, snapshot)): Path<(String, String)>,
    params: Result<Query<PageQuery>, QueryRejection>,
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
        let lapsed = {
            let mut conn = lock(&space.reader)?;
            // INVARIANT: the lease check and the page read share one snapshot. A lease that ended in between
            // would otherwise read as an empty, finished stream, and the device would apply a partial snapshot.
            let tx = conn.transaction()?;
            match lease_state(&tx, &caller, &snapshot, server.now_ms())? {
                LeaseState::Live(lease, _) => {
                    let page = read_page(&tx, lease, lane, params.after, limit)?;
                    tx.commit()?;
                    return Ok(page);
                }
                LeaseState::Expired(lease) => Some(lease),
                LeaseState::Missing => None,
            }
        };
        if let Some(lease) = lapsed {
            let mut conn = lock(&space.writer)?;
            let tx = conn.transaction()?;
            log::end_lease(&tx, lease)?;
            tx.commit()?;
        }
        Err(expired())
    })
    .await
}

pub(crate) async fn heartbeat(
    State(server): State<Arc<Server>>,
    Path((space, snapshot)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        let space = server.space(caller.space)?.ok_or_else(ApiError::unknown_space)?;
        let now = server.now_ms();
        let mut conn = lock(&space.writer)?;
        let tx = conn.transaction()?;
        match lease_state(&tx, &caller, &snapshot, now)? {
            LeaseState::Live(lease, row) => {
                let expires_at = (now + LEASE_TTL_MS).min(row.absolute_expiry);
                tx.execute(
                    "UPDATE leases SET expires_at = ?1 WHERE id = ?2",
                    params![expires_at, lease],
                )?;
                tx.commit()?;
                Ok(Lease {
                    expires_at,
                    absolute_expiry: row.absolute_expiry,
                })
            }
            LeaseState::Expired(lease) => {
                log::end_lease(&tx, lease)?;
                tx.commit()?;
                Err(expired())
            }
            LeaseState::Missing => Err(expired()),
        }
    })
    .await
}

pub(crate) async fn release(
    State(server): State<Arc<Server>>,
    Path((space, snapshot)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        let space = server.space(caller.space)?.ok_or_else(ApiError::unknown_space)?;
        {
            let mut conn = lock(&space.writer)?;
            let tx = conn.transaction()?;
            if let Some(lease) = owned_lease(&tx, &caller, &snapshot)? {
                log::end_lease(&tx, lease)?;
            }
            tx.commit()?;
        }
        // WHY: a device releases only once its snapshot and catch-up are applied, so a re-bootstrap has ended. A lease
        // that lapsed after its last page counts too: the device restarts on a lapse mid-stream instead of releasing.
        server.server_db()?.execute(
            "UPDATE devices SET rebase_required = 0 WHERE id = ?1",
            params![caller.id],
        )?;
        Ok(Empty {})
    })
    .await
}

/// Ends the lease a device holds, if any; revoking the device calls this.
pub(crate) fn release_device(tx: &Connection, device: Uuid) -> Result<(), ApiError> {
    let lease: Option<Uuid> = tx
        .query_row("SELECT id FROM leases WHERE device = ?1", params![device], |row| {
            row.get(0)
        })
        .optional()?;
    if let Some(lease) = lease {
        log::end_lease(tx, lease)?;
    }
    Ok(())
}

fn open_lease(server: &Server, caller: &DeviceAuth) -> Result<Snapshot, ApiError> {
    let space = server.space(caller.space)?.ok_or_else(ApiError::unknown_space)?;
    let now = server.now_ms();
    let quota = server.quota(caller.space)?;
    let mut conn = lock(&space.writer)?;
    let tx = conn.transaction()?;
    end_expired(&tx, now)?;
    release_device(&tx, caller.id)?;
    // WHY: a lease pins versions that compaction would free, so a space with no room opens none (PROTOCOL.md,
    // Quotas). Releasing the caller's earlier lease above still counts.
    if server.room(&tx, quota)? != Room::Free {
        tx.commit()?;
        return Err(ApiError::new(
            StatusCode::INSUFFICIENT_STORAGE,
            ErrorCode::InsufficientStorage,
            "this space is over its quota or the server is low on disk; a bootstrap waits",
        ));
    }
    let open: u64 = tx.query_row("SELECT count(*) FROM leases", [], |row| row.get(0))?;
    if open >= MAX_LEASES {
        return Err(ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            ErrorCode::RateLimited,
            format!("this space already serves {MAX_LEASES} bootstraps; try again later"),
        ));
    }

    let lease = Uuid::new_v4();
    let expires_at = now + LEASE_TTL_MS;
    let absolute_expiry = now + LEASE_LIFETIME_MS;
    let (head_hot, head_cold) = log::lane_heads(&tx)?;
    tx.execute(
        "INSERT INTO leases (id, device, expires_at, absolute_expiry, head_hot) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![lease, caller.id, expires_at, absolute_expiry, head_hot],
    )?;
    for (lane, order) in [(Lane::Hot, HOT_ORDER), (Lane::Cold, COLD_ORDER)] {
        tx.execute(&lease_items(order), params![lease, lane.as_wire(), TOMBSTONE])?;
    }
    let mut statement = tx.prepare(
        "SELECT v.kind, count(*), sum(length(v.bytes)) FROM lease_items i
         JOIN versions v ON v.lane = i.lane AND v.seq = i.seq
         WHERE i.lease = ?1 GROUP BY v.kind",
    )?;
    let mut counts = BTreeMap::new();
    let mut bytes = 0;
    let rows = statement
        .query_map(params![lease], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, u64>(1)?, row.get::<_, u64>(2)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (kind, count, kind_bytes) in rows {
        counts.insert(kind, count);
        bytes += kind_bytes;
    }
    drop(statement);
    tx.commit()?;
    Ok(Snapshot {
        snapshot_id: lease.into_bytes(),
        counts,
        bytes,
        head_hot,
        head_cold,
        ttl_ms: LEASE_TTL_MS,
        expires_at,
        absolute_expiry,
    })
}

pub(crate) fn lease_items(order: &str) -> String {
    format!(
        "INSERT INTO lease_items (lease, lane, position, seq)
         SELECT ?1, v.lane, row_number() OVER (ORDER BY {order}), v.seq
         FROM heads h JOIN versions v ON v.lane = h.lane AND v.seq = h.seq
         WHERE h.lane = ?2 AND h.grp <> ?3"
    )
}

/// The caller's lease as of `now`: a lease is live through its `expires_at` millisecond.
fn lease_state(conn: &Connection, caller: &DeviceAuth, snapshot: &str, now: u64) -> Result<LeaseState, ApiError> {
    let Some(lease) = owned_lease(conn, caller, snapshot)? else {
        return Ok(LeaseState::Missing);
    };
    Ok(match lease_row(conn, lease)? {
        Some(row) if now <= row.expires_at => LeaseState::Live(lease, row),
        Some(_) => LeaseState::Expired(lease),
        None => LeaseState::Missing,
    })
}

fn owned_lease(conn: &Connection, caller: &DeviceAuth, snapshot: &str) -> Result<Option<Uuid>, ApiError> {
    let Ok(lease) = Uuid::parse_str(snapshot) else {
        return Ok(None);
    };
    Ok(conn
        .query_row(
            "SELECT id FROM leases WHERE id = ?1 AND device = ?2",
            params![lease, caller.id],
            |row| row.get(0),
        )
        .optional()?)
}

fn lease_row(conn: &Connection, lease: Uuid) -> Result<Option<LeaseRow>, ApiError> {
    Ok(conn
        .query_row(
            "SELECT expires_at, absolute_expiry FROM leases WHERE id = ?1",
            params![lease],
            |row| {
                Ok(LeaseRow {
                    expires_at: row.get(0)?,
                    absolute_expiry: row.get(1)?,
                })
            },
        )
        .optional()?)
}

pub(crate) fn end_expired(tx: &Connection, now: u64) -> Result<(), ApiError> {
    let mut statement = tx.prepare("SELECT id FROM leases WHERE expires_at < ?1")?;
    let expired = statement
        .query_map(params![now], |row| row.get::<_, Uuid>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(statement);
    for lease in expired {
        log::end_lease(tx, lease)?;
    }
    Ok(())
}

fn read_page(conn: &Connection, lease: Uuid, lane: Lane, after: u64, limit: u64) -> Result<SnapshotPage, ApiError> {
    let mut statement = conn.prepare(
        "SELECT i.position, v.seq, v.sender, v.sender_seq, v.bytes FROM lease_items i
         JOIN versions v ON v.lane = i.lane AND v.seq = i.seq
         WHERE i.lease = ?1 AND i.lane = ?2 AND i.position > ?3 ORDER BY i.position",
    )?;
    let mut rows = statement.query(params![lease, lane.as_wire(), after])?;
    let mut entries = Vec::new();
    let mut bytes = 0;
    let mut next = after;
    let mut done = true;
    while let Some(row) = rows.next()? {
        let envelope: Vec<u8> = row.get(4)?;
        let is_full = u64::try_from(entries.len()).unwrap_or(u64::MAX) >= limit;
        // WHY: a page always takes its first entry, so one envelope larger than the byte cap still makes progress.
        if !entries.is_empty() && (is_full || bytes + envelope.len() > MAX_PAGE_BYTES) {
            done = false;
            break;
        }
        bytes += envelope.len();
        next = row.get(0)?;
        entries.push(LogEntry {
            seq: row.get(1)?,
            sender: row.get::<_, Uuid>(2)?.into_bytes(),
            sender_seq: row.get(3)?,
            envelope,
        });
    }
    Ok(SnapshotPage { entries, next, done })
}

fn expired() -> ApiError {
    ApiError::new(
        StatusCode::GONE,
        ErrorCode::LeaseExpired,
        "the bootstrap lease expired or was released; open a new one",
    )
}
