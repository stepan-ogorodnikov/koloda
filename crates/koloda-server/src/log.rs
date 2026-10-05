//! The envelope log of one space: versions at lane seqs, one head per `(kind, id, group)`, and per-sender receipts
//! (`PROTOCOL.md` §Topology and server state).
//!
//! Writers run inside the push transaction under the space writer lock; readers take any connection.

use std::collections::BTreeMap;

use koloda_sync_proto::envelope::{Digest, Header};
use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use koloda_sync_proto::registry::{allow, Class, Group, Kind};
use koloda_sync_proto::transport::{Outcome, Receipt};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::http::ApiError;

/// One pushed envelope with what the server read from it.
pub(crate) struct Entry<'a> {
    pub(crate) header: &'a Header,
    pub(crate) group: Group,
    pub(crate) sender: Uuid,
    pub(crate) sender_seq: u64,
    pub(crate) digest: Digest,
    pub(crate) bytes: &'a [u8],
}

struct Head {
    lane: String,
    seq: u64,
    stamp: Stamp,
}

pub(crate) fn class(header: &Header, group: Group) -> Result<Class, ApiError> {
    allow(header.kind, Some(group), header.op)
        .map_err(|error| ApiError::bad_request(error.to_string()))?
        .map(|spec| spec.class)
        .ok_or_else(|| ApiError::internal("a write without a group spec"))
}

/// Decides a new item and installs it when it wins: existence first (`PROTOCOL.md` §Cascades by ancestry and
/// header refs), then the group's class against the current head.
pub(crate) fn accept(tx: &Connection, entry: &Entry<'_>, class: Class) -> Result<Outcome, ApiError> {
    let header = entry.header;
    if !exists(tx, header, class)? {
        return Ok(Outcome::Existence);
    }
    let current = head(tx, entry)?;
    let wins = match (class, &current) {
        (_, None) => true,
        (Class::Update, Some(current)) => header.stamp > current.stamp,
        // INVARIANT: creates and immutable rows are never superseded; a second one is a duplicate.
        (Class::Create | Class::Immutable, Some(_)) => false,
    };
    if !wins {
        return Ok(Outcome::Stale);
    }
    install(tx, entry, current)?;
    Ok(Outcome::Applied)
}

/// Whether this sender had a create held for an entity the envelope names as its id, parent, or hard ref.
///
/// A create does not name its own id here: the regenerated create of a held entity is what releases it.
pub(crate) fn names_held(tx: &Connection, sender: Uuid, header: &Header, class: Class) -> Result<bool, ApiError> {
    let skip = usize::from(class == Class::Create);
    for (kind, id) in named(header).into_iter().skip(skip) {
        let held = tx
            .query_row(
                "SELECT 1 FROM sender_holds WHERE sender = ?1 AND kind = ?2 AND id = ?3",
                params![sender, kind.as_wire(), id],
                |_| Ok(()),
            )
            .optional()?;
        if held.is_some() {
            return Ok(true);
        }
    }
    Ok(false)
}

pub(crate) fn hold(tx: &Connection, sender: Uuid, header: &Header) -> Result<(), ApiError> {
    tx.execute(
        "INSERT OR IGNORE INTO sender_holds (sender, kind, id) VALUES (?1, ?2, ?3)",
        params![sender, header.kind.as_wire(), header.id],
    )?;
    Ok(())
}

pub(crate) fn release(tx: &Connection, sender: Uuid, header: &Header) -> Result<(), ApiError> {
    tx.execute(
        "DELETE FROM sender_holds WHERE sender = ?1 AND kind = ?2 AND id = ?3",
        params![sender, header.kind.as_wire(), header.id],
    )?;
    Ok(())
}

pub(crate) fn high_water(tx: &Connection, sender: Uuid) -> Result<u64, ApiError> {
    Ok(tx
        .query_row(
            "SELECT last_seq FROM senders WHERE sender = ?1",
            params![sender],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(0))
}

pub(crate) fn receipt(tx: &Connection, sender: Uuid, sender_seq: u64) -> Result<Option<(Digest, Outcome)>, ApiError> {
    let row = tx
        .query_row(
            "SELECT digest, outcome FROM receipts WHERE sender = ?1 AND sender_seq = ?2",
            params![sender, sender_seq],
            |row| Ok((row.get::<_, Vec<u8>>(0)?, row.get::<_, Vec<u8>>(1)?)),
        )
        .optional()?;
    row.map(|(digest, outcome)| Ok((Digest(digest_bytes(&digest)?), decode_outcome(&outcome)?)))
        .transpose()
}

/// Commits a newly consumed seq: its receipt and the sender's high-water, in the item's transaction.
pub(crate) fn record(tx: &Connection, entry: &Entry<'_>, outcome: Outcome) -> Result<(), ApiError> {
    let mut encoded = Vec::new();
    ciborium::into_writer(&outcome, &mut encoded).map_err(|error| ApiError::internal(error.to_string()))?;
    tx.execute(
        "INSERT INTO receipts (sender, sender_seq, digest, outcome) VALUES (?1, ?2, ?3, ?4)",
        params![entry.sender, entry.sender_seq, entry.digest.0.to_vec(), encoded],
    )?;
    tx.execute(
        "INSERT INTO senders (sender, last_seq, last_digest) VALUES (?1, ?2, ?3)
         ON CONFLICT (sender) DO UPDATE SET last_seq = excluded.last_seq, last_digest = excluded.last_digest",
        params![entry.sender, entry.sender_seq, entry.digest.0.to_vec()],
    )?;
    Ok(())
}

pub(crate) fn lane_heads(conn: &Connection) -> Result<(u64, u64), ApiError> {
    let head = |lane: &str| -> Result<u64, ApiError> {
        Ok(
            conn.query_row("SELECT head FROM lanes WHERE lane = ?1", params![lane], |row| {
                row.get(0)
            })?,
        )
    };
    Ok((head("hot")?, head("cold")?))
}

pub(crate) fn sender_progress(conn: &Connection, sender: Uuid) -> Result<Option<(u64, [u8; 32])>, ApiError> {
    let row = conn
        .query_row(
            "SELECT last_seq, last_digest FROM senders WHERE sender = ?1",
            params![sender],
            |row| Ok((row.get::<_, u64>(0)?, row.get::<_, Vec<u8>>(1)?)),
        )
        .optional()?;
    row.map(|(seq, digest)| Ok((seq, digest_bytes(&digest)?))).transpose()
}

pub(crate) fn receipts(conn: &Connection, sender: Uuid, after: u64, through: u64) -> Result<Vec<Receipt>, ApiError> {
    let mut statement = conn.prepare(
        "SELECT sender_seq, digest, outcome FROM receipts
         WHERE sender = ?1 AND sender_seq > ?2 AND sender_seq <= ?3 ORDER BY sender_seq",
    )?;
    let rows = statement
        .query_map(params![sender, after, through], |row| {
            Ok((
                row.get::<_, u64>(0)?,
                row.get::<_, Vec<u8>>(1)?,
                row.get::<_, Vec<u8>>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    rows.into_iter()
        .map(|(sender_seq, digest, outcome)| {
            Ok(Receipt {
                sender_seq,
                digest: digest_bytes(&digest)?,
                outcome: decode_outcome(&outcome)?,
            })
        })
        .collect()
}

/// Live entities per kind and the bytes of every stored version, for the pairing preview.
pub(crate) fn size(conn: &Connection) -> Result<(BTreeMap<String, u64>, u64), ApiError> {
    let mut statement = conn.prepare("SELECT kind, count(DISTINCT id) FROM heads GROUP BY kind")?;
    let counts = statement
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, u64>(1)?)))?
        .collect::<Result<BTreeMap<_, _>, _>>()?;
    let bytes = conn.query_row("SELECT coalesce(sum(length(bytes)), 0) FROM versions", [], |row| {
        row.get(0)
    })?;
    Ok((counts, bytes))
}

fn exists(tx: &Connection, header: &Header, class: Class) -> Result<bool, ApiError> {
    let spec = header.kind.spec();
    // WHY: the first version of an entity records its parent: the create of a kind that has one, else the
    // immutable row itself. `settings.learning` has neither; sync never inserts it.
    let first_group = if spec.groups.iter().any(|group| group.class == Class::Create) {
        Some(Group::Create)
    } else if class == Class::Immutable {
        Some(Group::Row)
    } else {
        None
    };
    let first = match first_group {
        Some(group) => first_version(tx, header.kind, &header.id, group)?,
        None => None,
    };
    if class == Class::Update && first_group.is_some() && first.is_none() {
        return Ok(false);
    }
    if class != Class::Update {
        if let (Some(parent_kind), Some(parent)) = (spec.parent, &header.parent) {
            if first_version(tx, parent_kind, parent, Group::Create)?.is_none() {
                return Ok(false);
            }
        }
    }
    if first.is_some_and(|first_parent| first_parent != header.parent) {
        return Ok(false);
    }
    for (kind, id) in hard_refs(header) {
        if first_version(tx, kind, id, Group::Create)?.is_none() {
            return Ok(false);
        }
    }
    Ok(true)
}

/// The parent recorded by the head of `(kind, id, group)`, or `None` when there is no such head.
fn first_version(tx: &Connection, kind: Kind, id: &str, group: Group) -> Result<Option<Option<String>>, ApiError> {
    Ok(tx
        .query_row(
            "SELECT v.parent FROM heads h JOIN versions v ON v.lane = h.lane AND v.seq = h.seq
             WHERE h.kind = ?1 AND h.id = ?2 AND h.grp = ?3",
            params![kind.as_wire(), id, group.as_wire()],
            |row| row.get(0),
        )
        .optional()?)
}

fn hard_refs(header: &Header) -> Vec<(Kind, &str)> {
    let refs = &header.refs;
    [
        (Kind::Algorithms, refs.algorithm_id.as_deref()),
        (Kind::Templates, refs.template_id.as_deref()),
    ]
    .into_iter()
    .filter_map(|(kind, id)| id.map(|id| (kind, id)))
    .collect()
}

// INVARIANT: the entity itself comes first; `names_held` skips it for creates.
fn named(header: &Header) -> Vec<(Kind, &str)> {
    let mut named = vec![(header.kind, header.id.as_str())];
    if let (Some(parent_kind), Some(parent)) = (header.kind.spec().parent, &header.parent) {
        named.push((parent_kind, parent.as_str()));
    }
    named.extend(hard_refs(header));
    named
}

fn head(tx: &Connection, entry: &Entry<'_>) -> Result<Option<Head>, ApiError> {
    let header = entry.header;
    let row = tx
        .query_row(
            "SELECT h.lane, h.seq, v.hlc, v.stamp_device FROM heads h
             JOIN versions v ON v.lane = h.lane AND v.seq = h.seq
             WHERE h.kind = ?1 AND h.id = ?2 AND h.grp = ?3",
            params![header.kind.as_wire(), header.id, entry.group.as_wire()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, u64>(1)?,
                    row.get::<_, u64>(2)?,
                    row.get::<_, Vec<u8>>(3)?,
                ))
            },
        )
        .optional()?;
    row.map(|(lane, seq, hlc, device)| {
        let device = <[u8; 16]>::try_from(device.as_slice())
            .map_err(|error| ApiError::internal(format!("stored stamp device: {error}")))?;
        Ok(Head {
            lane,
            seq,
            stamp: Stamp {
                hlc: Hlc::from_raw(hlc),
                device: DeviceId(device),
            },
        })
    })
    .transpose()
}

fn install(tx: &Connection, entry: &Entry<'_>, replaced: Option<Head>) -> Result<(), ApiError> {
    let header = entry.header;
    let lane = header.kind.spec().lane.as_wire();
    let seq: u64 = tx.query_row(
        "UPDATE lanes SET head = head + 1 WHERE lane = ?1 RETURNING head",
        params![lane],
        |row| row.get(0),
    )?;
    tx.execute(
        "INSERT INTO versions (lane, seq, kind, id, grp, parent, hlc, stamp_device, sender, sender_seq, digest, bytes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            lane,
            seq,
            header.kind.as_wire(),
            header.id,
            entry.group.as_wire(),
            header.parent,
            header.stamp.hlc.raw(),
            header.stamp.device.0.to_vec(),
            entry.sender,
            entry.sender_seq,
            entry.digest.0.to_vec(),
            entry.bytes
        ],
    )?;
    tx.execute(
        "INSERT INTO heads (kind, id, grp, lane, seq) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (kind, id, grp) DO UPDATE SET lane = excluded.lane, seq = excluded.seq",
        params![header.kind.as_wire(), header.id, entry.group.as_wire(), lane, seq],
    )?;
    if let Some(replaced) = replaced {
        tx.execute(
            "DELETE FROM versions WHERE lane = ?1 AND seq = ?2",
            params![replaced.lane, replaced.seq],
        )?;
    }
    Ok(())
}

fn digest_bytes(bytes: &[u8]) -> Result<[u8; 32], ApiError> {
    <[u8; 32]>::try_from(bytes).map_err(|error| ApiError::internal(format!("stored digest: {error}")))
}

fn decode_outcome(bytes: &[u8]) -> Result<Outcome, ApiError> {
    ciborium::from_reader(bytes).map_err(|error| ApiError::internal(format!("stored outcome: {error}")))
}
