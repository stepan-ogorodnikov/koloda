//! Sync bookkeeping SQL: device enrollment here, joining an existing space in `join`, capture of product writes
//! in `capture`, rows that predate enrollment in `backfill`, push batches and their outcomes in `outbox`,
//! remote envelopes in `apply`, image transfers in `attachments`, new stamps for pending cohorts in `restamp`, the
//! re-bootstrap barrier in `rebase`, moving a file to a new device id in `switch`, re-pushing what a restored server
//! lacks in `heal`, and discarding local data for an authoritative restore in `authoritative`
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Field groups and merge, §Clocks and order, §Devices, §Client state,
//! §Joining, §Attachments, §Recovery).
//!
//! Only the desktop store writes the `sync_*` tables; the web host does not sync.

pub mod apply;
pub mod attachments;
pub mod authoritative;
pub mod backfill;
pub mod capture;
pub mod heal;
pub mod join;
pub mod outbox;
pub mod rebase;
pub mod repair;
pub mod restamp;
pub mod switch;

use koloda_sync_proto::hlc::{DeviceId, Stamp};
use koloda_sync_proto::payload::Payload;
use koloda_sync_proto::registry::{Class, Kind};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};

const CREATE_GROUP: &str = "create";
const ROW_GROUP: &str = "row";

/// The device's part in its space. Only the creator backfills seed rows and the `learning` document; a joiner
/// takes both from the space (PROTOCOL.md, Existing rows at enable time).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpaceRole {
    Creator,
    Joiner,
}

impl SpaceRole {
    fn as_sql(self) -> &'static str {
        match self {
            SpaceRole::Creator => "creator",
            SpaceRole::Joiner => "joiner",
        }
    }

    fn from_sql(value: &str) -> Result<SpaceRole, AppError> {
        match value {
            "creator" => Ok(SpaceRole::Creator),
            "joiner" => Ok(SpaceRole::Joiner),
            other => Err(protocol_error(format!("unknown space role {other}"))),
        }
    }
}

pub fn enroll_device(
    db: &Database,
    device_id: Uuid,
    space_id: Uuid,
    role: SpaceRole,
    epoch: Uuid,
    server_url: &str,
) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        db.with_transaction(|tx| {
            tx.execute(
                r#"
                INSERT INTO sync_state
                    (id, device_id, space_id, last_hlc, next_sender_seq, role, epoch, server_url, is_bootstrapping)
                VALUES (1, ?1, ?2, 0, 1, ?3, ?4, ?5, ?6)
                "#,
                params![
                    device_id.as_bytes().as_slice(),
                    space_id.as_bytes().as_slice(),
                    role.as_sql(),
                    epoch.as_bytes().as_slice(),
                    server_url,
                    role == SpaceRole::Joiner
                ],
            )?;

            // INVARIANT: the backfill stamps are reserved in the enrollment transaction, so every write captured
            // after enrollment is stamped above them.
            backfill::reserve(tx)
        })
    })
}

/// What the engine reads before a cycle: where the space is, where each lane resumes, and what the file waits for.
pub struct SyncState {
    pub device_id: Uuid,
    pub space_id: Uuid,
    pub server_url: Option<String>,
    /// The space's epoch the file last saw; a re-attach refuses a space restored since.
    pub epoch: Option<Uuid>,
    pub cursor_hot: u64,
    pub cursor_cold: u64,
    pub is_bootstrapping: bool,
    /// A re-bootstrap's barrier is open; the next cycle resumes it before anything else.
    pub is_rebasing: bool,
    /// A cycle stopped for clock skew; the writes captured since take new stamps once the clock is corrected.
    pub is_clock_paused: bool,
    /// A claim waits for the user to pick Add or Replace; nothing syncs meanwhile.
    pub is_import_pending: bool,
    /// The device was revoked or detached itself; the file sends nothing until it re-attaches.
    pub is_detached: bool,
    /// An authoritative restore waits for the host to accept it; the file sends nothing meanwhile.
    pub is_restore_held: bool,
}

pub fn sync_state(db: &Database) -> Result<Option<SyncState>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let row = conn
                .query_row(
                    r#"
                    SELECT device_id, space_id, server_url, cursor_hot, cursor_cold, is_bootstrapping,
                           join_phase = 'import_pending', detached_at IS NOT NULL, is_rebasing,
                           is_clock_paused, epoch, authoritative_epoch IS NOT NULL
                    FROM sync_state WHERE id = 1
                    "#,
                    [],
                    |row| {
                        let ids: (Vec<u8>, Vec<u8>, Option<Vec<u8>>) = (row.get(0)?, row.get(1)?, row.get(10)?);
                        let state = SyncState {
                            device_id: Uuid::nil(),
                            space_id: Uuid::nil(),
                            server_url: row.get(2)?,
                            epoch: None,
                            cursor_hot: row.get(3)?,
                            cursor_cold: row.get(4)?,
                            is_bootstrapping: row.get(5)?,
                            is_import_pending: row.get(6)?,
                            is_detached: row.get(7)?,
                            is_rebasing: row.get(8)?,
                            is_clock_paused: row.get(9)?,
                            is_restore_held: row.get(11)?,
                        };
                        Ok((ids, state))
                    },
                )
                .optional()?;
            row.map(|((device_id, space_id, epoch), state)| {
                Ok(SyncState {
                    device_id: Uuid::from_slice(&device_id).map_err(protocol_error)?,
                    space_id: Uuid::from_slice(&space_id).map_err(protocol_error)?,
                    epoch: epoch
                        .map(|epoch| Uuid::from_slice(&epoch).map_err(protocol_error))
                        .transpose()?,
                    ..state
                })
            })
            .transpose()
        })
    })
}

/// Records that the file left its space at `now`; its rows and sync tables stay.
pub fn detach(db: &Database, now: i64) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_conn(|conn| {
            conn.execute("UPDATE sync_state SET detached_at = ?1 WHERE id = 1", params![now])?;
            Ok(())
        })
    })
}

pub fn enrolled_device(db: &Database) -> Result<Option<Uuid>, AppError> {
    throw_known_error(error_codes::DB_GET, || db.with_conn(select_enrolled_device))
}

fn select_enrolled_device(conn: &Connection) -> Result<Option<Uuid>, AppError> {
    let device: Option<Vec<u8>> = conn
        .query_row("SELECT device_id FROM sync_state WHERE id = 1", [], |row| row.get(0))
        .optional()?;

    device
        .map(|bytes| Uuid::from_slice(&bytes).map_err(protocol_error))
        .transpose()
}

/// The kinds whose product rows an apply changed, in first-changed order, for the host's UI events.
#[derive(Default)]
struct Changed(Vec<Kind>);

impl Changed {
    fn mark(&mut self, kind: Kind) {
        if !self.0.contains(&kind) {
            self.0.push(kind);
        }
    }
}

/// The stamp and sender metadata one envelope writes into registers, origins, and tombstones.
/// `sender` is who pushed it: this device for a local write, the pull entry's sender for a remote one.
struct StampValues {
    hlc: i64,
    stamp_device: [u8; 16],
    sender: [u8; 16],
    sender_seq: i64,
}

impl StampValues {
    fn new(stamp: Stamp, sender: DeviceId, sender_seq: i64) -> Result<StampValues, AppError> {
        Ok(StampValues {
            hlc: i64::try_from(stamp.hlc.raw()).map_err(protocol_error)?,
            stamp_device: stamp.device.0,
            sender: sender.0,
            sender_seq,
        })
    }

    fn write_create(&self, conn: &Connection, kind: Kind, id: &str, payload: &Payload) -> Result<(), AppError> {
        self.write_origin(conn, kind, id, CREATE_GROUP, payload.legacy_product_ts_floor())?;
        // WHY: a create stamps every update group of its entity at its own stamp, marked synthetic, so a
        // same-commit update (deck pointers) still wins and later remote envelopes always meet a register.
        let initial = payload.initial_product_ts();
        for spec in kind.spec().groups.iter().filter(|spec| spec.class == Class::Update) {
            let name = spec.group.as_wire();
            let product_ts = initial.and_then(|initial| initial.get(name).copied());
            self.write_register(conn, kind, id, name, product_ts, true)?;
        }
        Ok(())
    }

    fn write_register(
        &self,
        conn: &Connection,
        kind: Kind,
        id: &str,
        group_name: &str,
        product_ts: Option<i64>,
        is_synthetic: bool,
    ) -> Result<(), AppError> {
        // WHY: a synthetic floor never replaces a register. A backfilled create can follow a real write to a group
        // of the same entity, and that newer head must stay.
        let verb = if is_synthetic {
            "INSERT OR IGNORE"
        } else {
            "INSERT OR REPLACE"
        };
        conn.execute(
            &format!(
                r#"
                {verb} INTO sync_stamps
                    (kind, id, group_name, hlc, stamp_device, sender, sender_seq, product_ts, synthetic)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                "#
            ),
            params![
                kind.as_wire(),
                id,
                group_name,
                self.hlc,
                self.stamp_device.as_slice(),
                self.sender.as_slice(),
                self.sender_seq,
                product_ts,
                is_synthetic
            ],
        )?;
        Ok(())
    }

    // INVARIANT: the tombstone row is this device's fence: no later envelope for the entity applies, whatever its
    // stamp (PROTOCOL.md, Tombstones).
    fn write_tombstone(
        &self,
        conn: &Connection,
        kind: Kind,
        id: &str,
        parent: Option<&str>,
        successor: Option<&str>,
    ) -> Result<(), AppError> {
        conn.execute(
            r#"
            INSERT OR REPLACE INTO sync_tombstones
                (kind, id, hlc, stamp_device, sender, sender_seq, successor, parent)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                kind.as_wire(),
                id,
                self.hlc,
                self.stamp_device.as_slice(),
                self.sender.as_slice(),
                self.sender_seq,
                successor,
                parent
            ],
        )?;
        Ok(())
    }

    fn write_origin(
        &self,
        conn: &Connection,
        kind: Kind,
        id: &str,
        group_name: &str,
        legacy_product_ts_floor: Option<i64>,
    ) -> Result<(), AppError> {
        conn.execute(
            r#"
            INSERT OR REPLACE INTO sync_origins
                (kind, id, group_name, hlc, stamp_device, sender, sender_seq, legacy_product_ts_floor)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                kind.as_wire(),
                id,
                group_name,
                self.hlc,
                self.stamp_device.as_slice(),
                self.sender.as_slice(),
                self.sender_seq,
                legacy_product_ts_floor
            ],
        )?;
        Ok(())
    }
}

// WHY: the tombstone fences the entity and its descendants, so their registers and origins describe rows
// that are about to be deleted; descendant ids are read from product rows that still exist.
fn forget_entity(conn: &Connection, kind: Kind, id: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM sync_stamps WHERE kind = ?1 AND id = ?2",
        params![kind.as_wire(), id],
    )?;
    conn.execute(
        "DELETE FROM sync_origins WHERE kind = ?1 AND id = ?2",
        params![kind.as_wire(), id],
    )?;

    match kind {
        Kind::Decks => {
            conn.execute(
                r#"
                DELETE FROM sync_origins
                WHERE kind = 'reviews'
                  AND id IN (SELECT r.id FROM reviews r JOIN cards c ON c.id = r.card_id WHERE c.deck_id = ?1)
                "#,
                params![id],
            )?;
            for table in ["sync_stamps", "sync_origins"] {
                conn.execute(
                    &format!(
                        "DELETE FROM {table} WHERE kind = 'cards' AND id IN (SELECT id FROM cards WHERE deck_id = ?1)"
                    ),
                    params![id],
                )?;
            }
        }
        Kind::Cards => forget_card_reviews(conn, id)?,
        _ => {}
    }
    Ok(())
}

fn forget_card_reviews(conn: &Connection, card_id: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM sync_origins WHERE kind = 'reviews' AND id IN (SELECT id FROM reviews WHERE card_id = ?1)",
        params![card_id],
    )?;
    Ok(())
}

fn delete_empty_cohort(conn: &Connection, commit_id: &[u8]) -> Result<(), AppError> {
    conn.execute(
        r#"
        DELETE FROM sync_cohorts
        WHERE commit_id = ?1 AND NOT EXISTS (SELECT 1 FROM sync_outbox WHERE commit_id = ?1)
        "#,
        params![commit_id],
    )?;
    Ok(())
}

fn protocol_error(error: impl std::fmt::Display) -> AppError {
    AppError::new(error_codes::UNKNOWN, Some(error.to_string()))
}
