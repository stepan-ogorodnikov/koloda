//! Dropping one damaged envelope from a space's log, for `koloda-server drop-envelope` (`PROTOCOL.md` §Corrupt
//! envelopes). It runs beside `serve`, through SQLite's own locking.

use koloda_sync_proto::envelope::{digest, Envelope};
use koloda_sync_proto::hlc::{DeviceId, Hlc, HlcClock, Stamp};
use koloda_sync_proto::payload::{seal, Delete, Payload, Seal};
use koloda_sync_proto::registry::{Group, Kind, Lane};
use koloda_sync_proto::transport::{Outcome, SERVER_SENDER};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use uuid::Uuid;

use crate::attachments;
use crate::auth;
use crate::http::ApiError;
use crate::log::{self, Entry, TOMBSTONE};
use crate::server::{lock, Server};

/// A stored version an operator asked to drop, as `describe_drop` read it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Dropping {
    pub lane: Lane,
    pub seq: u64,
    pub kind: String,
    pub id: String,
    /// Empty for a tombstone.
    pub group: String,
    /// The cards, and their reviews, that a dropped create's tombstone removes with it.
    pub cards: u64,
    pub reviews: u64,
    digest: Vec<u8>,
}

struct Version {
    kind: String,
    id: String,
    group: String,
    parent: Option<String>,
    hlc: u64,
    digest: Vec<u8>,
}

impl Server {
    /// What dropping the version at `lane` and `seq` would remove.
    pub fn describe_drop(&self, space: Uuid, lane: Lane, seq: u64) -> Result<Dropping, ApiError> {
        let space = self.space(space)?.ok_or_else(ApiError::unknown_space)?;
        let conn = lock(&space.reader)?;
        let version = read(&conn, lane, seq)?;
        let (cards, reviews) = if version.group == Group::Create.as_wire() {
            log::cascade_counts(&conn, kind(&version)?, &version.id)?
        } else {
            (0, 0)
        };
        Ok(Dropping {
            lane,
            seq,
            kind: version.kind,
            id: version.id,
            group: version.group,
            cards,
            reviews,
            digest: version.digest,
        })
    }

    /// Drops the version `describe_drop` read, and refuses one that changed since.
    ///
    /// INVARIANT: the version goes even when a lease pins it, so no device reads it again. A create or tombstone is
    /// replaced by a tombstone the server authors, so every replica ends with the entity deleted; an update or a
    /// review leaves devices with what they had.
    pub fn drop_envelope(&self, space: Uuid, dropping: &Dropping) -> Result<(), ApiError> {
        let now = self.now_ms();
        let space = self.space(space)?.ok_or_else(ApiError::unknown_space)?;
        let mut conn = lock(&space.writer)?;
        // WHY: `serve` may write the same file from another process; an immediate transaction waits for its lock
        // instead of failing when a deferred read would have to upgrade.
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let version = read(&tx, dropping.lane, dropping.seq)?;
        if version.digest != dropping.digest {
            return Err(ApiError::bad_request(format!(
                "{} seq {} changed since it was described",
                dropping.lane.as_wire(),
                dropping.seq
            )));
        }
        let lane = dropping.lane.as_wire();
        tx.execute(
            "DELETE FROM lease_items WHERE lane = ?1 AND seq = ?2",
            params![lane, dropping.seq],
        )?;
        tx.execute(
            "DELETE FROM versions WHERE lane = ?1 AND seq = ?2",
            params![lane, dropping.seq],
        )?;
        if version.group == Group::Create.as_wire() || version.group == TOMBSTONE {
            tombstone(&tx, &version, now)?;
        } else {
            tx.execute(
                "DELETE FROM heads WHERE lane = ?1 AND seq = ?2",
                params![lane, dropping.seq],
            )?;
            if version.kind == Kind::Cards.as_wire() && version.group == Group::Content.as_wire() {
                relink_to_create(&tx, &version.id, now)?;
            }
        }
        tx.commit()?;
        Ok(())
    }
}

fn read(conn: &Connection, lane: Lane, seq: u64) -> Result<Version, ApiError> {
    conn.query_row(
        "SELECT kind, id, grp, parent, hlc, digest FROM versions WHERE lane = ?1 AND seq = ?2",
        params![lane.as_wire(), seq],
        |row| {
            Ok(Version {
                kind: row.get(0)?,
                id: row.get(1)?,
                group: row.get(2)?,
                parent: row.get(3)?,
                hlc: row.get(4)?,
                digest: row.get(5)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| ApiError::not_found(format!("no version at {} seq {seq}", lane.as_wire())))
}

fn kind(version: &Version) -> Result<Kind, ApiError> {
    Kind::from_wire(&version.kind).map_err(|error| ApiError::internal(error.to_string()))
}

/// Appends the server's own tombstone of the dropped version's entity, above both its stamp and server now.
fn tombstone(tx: &Connection, version: &Version, now_ms: u64) -> Result<(), ApiError> {
    let kind = kind(version)?;
    let hlc = HlcClock {
        last: Hlc::from_raw(version.hlc),
    }
    .tick(now_ms)
    .map_err(|error| ApiError::internal(error.to_string()))?;
    let sealed = seal(
        Seal {
            id: version.id.clone(),
            parent: version.parent.clone(),
            stamp: Stamp {
                hlc,
                device: DeviceId(SERVER_SENDER),
            },
            commit_id: auth::random_bytes().map_err(|error| ApiError::internal(error.to_string()))?,
        },
        &Payload::Delete {
            kind,
            delete: Delete { successor: None },
        },
    )
    .map_err(|error| ApiError::internal(error.to_string()))?;
    let sender = Uuid::from_bytes(SERVER_SENDER);
    let entry = Entry {
        header: &sealed.envelope.header,
        group: None,
        sender,
        sender_seq: log::high_water(tx, sender)? + 1,
        digest: digest(&sealed.bytes),
        bytes: &sealed.bytes,
        now_ms,
    };
    if version.group == TOMBSTONE {
        log::append_tombstone(tx, &entry)?;
    } else if log::delete(tx, &entry)? != Outcome::Applied {
        // WHY: a create kept only by a lease belongs to an entity already deleted; its tombstone is in the log.
        return Ok(());
    }
    // INVARIANT: the server's writes take seqs of their own sender like a device's, so a restore's cutoffs cover the
    // server tombstones its backup holds, and heal re-pushes only those it lacks (`PROTOCOL.md` §Server restore).
    log::record(tx, &entry, Outcome::Applied)
}

/// Links a card's attachments through its create again, once its content head is gone (`PROTOCOL.md` §Attachments).
fn relink_to_create(tx: &Connection, card: &str, now_ms: u64) -> Result<(), ApiError> {
    let create: Option<Vec<u8>> = tx
        .query_row(
            "SELECT v.bytes FROM heads h JOIN versions v ON v.lane = h.lane AND v.seq = h.seq
             WHERE h.kind = 'cards' AND h.id = ?1 AND h.grp = 'create'",
            params![card],
            |row| row.get(0),
        )
        .optional()?;
    // WHY: a create that does not decode links nothing; the server never guesses a ref.
    let ids = create
        .and_then(|bytes| Envelope::decode(&bytes).ok())
        .map(|envelope| envelope.header.refs.attachment_ids)
        .unwrap_or_default();
    attachments::link(tx, card, &ids, now_ms)
}
