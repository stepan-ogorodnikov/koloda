//! The envelope log of one space: versions at lane seqs, one head per `(kind, id, group)`, fences, and per-sender
//! receipts (`PROTOCOL.md` §Topology and server state, §Deletes).
//!
//! Writers run inside the push transaction under the space writer lock; readers take any connection.

use std::collections::BTreeMap;

use koloda_sync_proto::envelope::{Digest, Header};
use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use koloda_sync_proto::registry::{allow, Class, Group, Kind};
use koloda_sync_proto::transport::{DependencyAction, KnownState, Outcome, Receipt};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::attachments;
use crate::http::ApiError;

// WHY: a tombstone names no group; it is stored as the entity's head under this empty group name.
pub(crate) const TOMBSTONE: &str = "";

// INVARIANT: compaction and deletes keep every version a bootstrap lease pins; `end_lease` removes it later.
const UNPINNED: &str = "NOT EXISTS (SELECT 1 FROM lease_items i WHERE i.lane = versions.lane AND i.seq = versions.seq)";

/// One pushed envelope with what the server read from it. `group` is `None` for a delete.
pub(crate) struct Entry<'a> {
    pub(crate) header: &'a Header,
    pub(crate) group: Option<Group>,
    pub(crate) sender: Uuid,
    pub(crate) sender_seq: u64,
    pub(crate) digest: Digest,
    pub(crate) bytes: &'a [u8],
    pub(crate) now_ms: u64,
}

struct Head {
    lane: String,
    seq: u64,
    stamp: Stamp,
}

impl Entry<'_> {
    fn grp(&self) -> &'static str {
        self.group.map_or(TOMBSTONE, Group::as_wire)
    }
}

pub(crate) fn class(header: &Header, group: Group) -> Result<Class, ApiError> {
    allow(header.kind, Some(group), header.op)
        .map_err(|error| ApiError::bad_request(error.to_string()))?
        .map(|spec| spec.class)
        .ok_or_else(|| ApiError::internal("a write without a group spec"))
}

/// Decides a new write and installs it when it wins: dead and missing entities first (`PROTOCOL.md` §Cascades by
/// ancestry and header refs), then the group's class against the current head.
pub(crate) fn accept(tx: &Connection, entry: &Entry<'_>, class: Class) -> Result<Outcome, ApiError> {
    let header = entry.header;
    if let Some(refused) = refusal(tx, header, class)? {
        return Ok(refused);
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

/// Tombstones an entity: fences it, removes it and its descendants, and appends the tombstone to the log.
///
/// INVARIANT: a delete of an id the server does not hold is applied as a fence, so a create of it pushed later by
/// another device cannot resurrect it (`PROTOCOL.md` §Deletes).
pub(crate) fn delete(tx: &Connection, entry: &Entry<'_>) -> Result<Outcome, ApiError> {
    let header = entry.header;
    if is_fenced(tx, header.kind, &header.id)? {
        return Ok(Outcome::Stale);
    }
    let cards = match header.kind {
        Kind::Decks => live_children(tx, "parent", &header.id)?,
        Kind::Templates => live_children(tx, "template_ref", &header.id)?,
        Kind::Cards => vec![header.id.clone()],
        Kind::Algorithms | Kind::Reviews | Kind::AlgorithmRevisions | Kind::SettingsLearning => Vec::new(),
    };
    for card in &cards {
        let mut statement = tx.prepare(
            "SELECT v.id FROM versions v JOIN heads h ON h.lane = v.lane AND h.seq = v.seq
             WHERE v.kind = 'reviews' AND v.grp = 'row' AND v.parent = ?1",
        )?;
        let reviews = statement
            .query_map(params![card], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        for review in reviews {
            remove(tx, Kind::Reviews, &review, entry.now_ms)?;
        }
        remove(tx, Kind::Cards, card, entry.now_ms)?;
        // WHY: cards get fences because their own updates and deletes name them; reviews need none, since a review
        // of a fenced card is already refused by its parent.
        fence(tx, Kind::Cards, card)?;
    }
    remove(tx, header.kind, &header.id, entry.now_ms)?;
    fence(tx, header.kind, &header.id)?;
    install(tx, entry, None)?;
    Ok(Outcome::Applied)
}

/// Whether this sender had a create held for an entity the envelope names as its id, parent, or hard ref.
///
/// A create does not name its own id here: the regenerated create of a held entity is what releases it.
pub(crate) fn names_held(
    tx: &Connection,
    sender: Uuid,
    header: &Header,
    class: Option<Class>,
) -> Result<bool, ApiError> {
    let skip = usize::from(class == Some(Class::Create));
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

/// The highest seq a collection pass removed from each lane; a cursor below it may have missed a delete.
pub(crate) fn gc_horizons(conn: &Connection) -> Result<(u64, u64), ApiError> {
    let horizon = |lane: &str| -> Result<u64, ApiError> {
        Ok(
            conn.query_row("SELECT gc_horizon FROM lanes WHERE lane = ?1", params![lane], |row| {
                row.get(0)
            })?,
        )
    };
    Ok((horizon("hot")?, horizon("cold")?))
}

/// Removes the tombstones at or below `device_floor`, the lowest `hot` cursor of the active devices, and below the
/// `hot` head of every live lease. `deleted_ids` keeps their fences.
///
/// INVARIANT: only `hot` holds tombstones (reviews have none), so `cold`'s horizon stays 0.
pub(crate) fn collect_tombstones(tx: &Connection, device_floor: Option<u64>) -> Result<(), ApiError> {
    let lease_floor: Option<u64> = tx.query_row("SELECT min(head_hot) FROM leases", [], |row| row.get(0))?;
    let (head_hot, _) = lane_heads(tx)?;
    let bound = device_floor.into_iter().chain(lease_floor).min().unwrap_or(head_hot);
    let removed: Option<u64> = tx.query_row(
        "SELECT max(seq) FROM heads WHERE lane = 'hot' AND grp = ?1 AND seq <= ?2",
        params![TOMBSTONE, bound],
        |row| row.get(0),
    )?;
    let Some(removed) = removed else {
        return Ok(());
    };
    tx.execute(
        &format!(
            "DELETE FROM versions WHERE lane = 'hot'
             AND seq IN (SELECT seq FROM heads WHERE lane = 'hot' AND grp = ?1 AND seq <= ?2) AND {UNPINNED}"
        ),
        params![TOMBSTONE, bound],
    )?;
    tx.execute(
        "DELETE FROM heads WHERE lane = 'hot' AND grp = ?1 AND seq <= ?2",
        params![TOMBSTONE, bound],
    )?;
    tx.execute(
        "UPDATE lanes SET gc_horizon = max(gc_horizon, ?1) WHERE lane = 'hot'",
        params![removed],
    )?;
    Ok(())
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
    let mut statement = conn.prepare("SELECT kind, count(DISTINCT id) FROM heads WHERE grp <> ?1 GROUP BY kind")?;
    let counts = statement
        .query_map(params![TOMBSTONE], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, u64>(1)?))
        })?
        .collect::<Result<BTreeMap<_, _>, _>>()?;
    let bytes = conn.query_row("SELECT coalesce(sum(length(bytes)), 0) FROM versions", [], |row| {
        row.get(0)
    })?;
    Ok((counts, bytes))
}

/// Whether the space holds an entity live or fenced, for the join probe (`PROTOCOL.md` §Joining).
pub(crate) fn known(conn: &Connection, kind: Kind, id: &str) -> Result<Option<KnownState>, ApiError> {
    if is_fenced(conn, kind, id)? {
        return Ok(Some(KnownState::Fenced));
    }
    let live = conn
        .query_row(
            "SELECT 1 FROM heads WHERE kind = ?1 AND id = ?2 AND grp <> ?3 LIMIT 1",
            params![kind.as_wire(), id, TOMBSTONE],
            |_| Ok(()),
        )
        .optional()?;
    Ok(live.map(|()| KnownState::Live))
}

/// Why a write may not apply, checked in the order `PROTOCOL.md` §Cascades by ancestry and header refs lists.
fn refusal(tx: &Connection, header: &Header, class: Class) -> Result<Option<Outcome>, ApiError> {
    if is_fenced(tx, header.kind, &header.id)? {
        return Ok(Some(Outcome::Fenced));
    }
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
        return Ok(Some(Outcome::Existence));
    }
    if class != Class::Update {
        if let (Some(parent_kind), Some(parent)) = (spec.parent, &header.parent) {
            if is_fenced(tx, parent_kind, parent)? {
                return Ok(Some(Outcome::DependencyFenced {
                    action: DependencyAction::DropEntity,
                }));
            }
            if first_version(tx, parent_kind, parent, Group::Create)?.is_none() {
                return Ok(Some(Outcome::Existence));
            }
        }
    }
    if first.is_some_and(|first_parent| first_parent != header.parent) {
        return Ok(Some(Outcome::Existence));
    }
    for (kind, id) in hard_refs(header) {
        if is_fenced(tx, kind, id)? {
            // WHY: a card is born on its template and cannot move off it; a pointer group can be repaired.
            let action = if class == Class::Create {
                DependencyAction::DropEntity
            } else {
                DependencyAction::RepairPointer
            };
            return Ok(Some(Outcome::DependencyFenced { action }));
        }
        if first_version(tx, kind, id, Group::Create)?.is_none() {
            return Ok(Some(Outcome::Existence));
        }
    }
    Ok(None)
}

fn is_fenced(conn: &Connection, kind: Kind, id: &str) -> Result<bool, ApiError> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM deleted_ids WHERE kind = ?1 AND id = ?2",
            params![kind.as_wire(), id],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

fn fence(tx: &Connection, kind: Kind, id: &str) -> Result<(), ApiError> {
    tx.execute(
        "INSERT OR IGNORE INTO deleted_ids (kind, id) VALUES (?1, ?2)",
        params![kind.as_wire(), id],
    )?;
    Ok(())
}

/// Live cards whose create names `id` in `column` (`parent` for their deck, `template_ref` for their template).
fn live_children(tx: &Connection, column: &str, id: &str) -> Result<Vec<String>, ApiError> {
    let mut statement = tx.prepare(&format!(
        "SELECT v.id FROM versions v JOIN heads h ON h.lane = v.lane AND h.seq = v.seq
         WHERE v.kind = 'cards' AND v.grp = 'create' AND v.{column} = ?1"
    ))?;
    let cards = statement
        .query_map(params![id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(cards)
}

/// Removes every head of the entity and the versions they reference, except versions a lease pins, and a card's
/// attachment refs.
fn remove(tx: &Connection, kind: Kind, id: &str, now_ms: u64) -> Result<(), ApiError> {
    if kind == Kind::Cards {
        attachments::link(tx, id, &[], now_ms)?;
    }
    tx.execute(
        &format!(
            "DELETE FROM versions WHERE (lane, seq) IN (SELECT lane, seq FROM heads WHERE kind = ?1 AND id = ?2)
             AND {UNPINNED}"
        ),
        params![kind.as_wire(), id],
    )?;
    tx.execute(
        "DELETE FROM heads WHERE kind = ?1 AND id = ?2",
        params![kind.as_wire(), id],
    )?;
    Ok(())
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
            params![header.kind.as_wire(), header.id, entry.grp()],
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
        "INSERT INTO versions (
             lane, seq, kind, id, grp, parent, template_ref, hlc, stamp_device, sender, sender_seq, digest, bytes
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            lane,
            seq,
            header.kind.as_wire(),
            header.id,
            entry.grp(),
            header.parent,
            header.refs.template_id,
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
        params![header.kind.as_wire(), header.id, entry.grp(), lane, seq],
    )?;
    // INVARIANT: a card's create installs before any content head, so the create's refs count only until the first
    // content head replaces them (`PROTOCOL.md` §Attachments).
    if header.kind == Kind::Cards && matches!(entry.group, Some(Group::Create | Group::Content)) {
        attachments::link(tx, &header.id, &header.refs.attachment_ids, entry.now_ms)?;
    }
    if let Some(replaced) = replaced {
        tx.execute(
            &format!("DELETE FROM versions WHERE lane = ?1 AND seq = ?2 AND {UNPINNED}"),
            params![replaced.lane, replaced.seq],
        )?;
    }
    Ok(())
}

/// Ends a lease and removes the versions only it kept: no head references them and no other lease pins them.
pub(crate) fn end_lease(tx: &Connection, lease: Uuid) -> Result<(), ApiError> {
    tx.execute(
        "DELETE FROM versions
         WHERE EXISTS (
             SELECT 1 FROM lease_items i WHERE i.lease = ?1 AND i.lane = versions.lane AND i.seq = versions.seq
         )
         AND NOT EXISTS (SELECT 1 FROM heads h WHERE h.lane = versions.lane AND h.seq = versions.seq)
         AND NOT EXISTS (
             SELECT 1 FROM lease_items o WHERE o.lease <> ?1 AND o.lane = versions.lane AND o.seq = versions.seq
         )",
        params![lease],
    )?;
    tx.execute("DELETE FROM lease_items WHERE lease = ?1", params![lease])?;
    tx.execute("DELETE FROM leases WHERE id = ?1", params![lease])?;
    Ok(())
}

fn digest_bytes(bytes: &[u8]) -> Result<[u8; 32], ApiError> {
    <[u8; 32]>::try_from(bytes).map_err(|error| ApiError::internal(format!("stored digest: {error}")))
}

fn decode_outcome(bytes: &[u8]) -> Result<Outcome, ApiError> {
    ciborium::from_reader(bytes).map_err(|error| ApiError::internal(format!("stored outcome: {error}")))
}
