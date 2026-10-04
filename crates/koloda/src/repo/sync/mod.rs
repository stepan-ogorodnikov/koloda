//! Sync bookkeeping SQL: device enrollment here, capture of product writes in `capture`, and remote envelopes
//! in `apply` (`crates/koloda-sync-proto/PROTOCOL.md` §Field groups and merge, §Clocks and order, §Client state).
//!
//! Only the desktop store writes the `sync_*` tables; the web host does not sync.

pub mod apply;
pub mod capture;

use koloda_sync_proto::hlc::{DeviceId, Stamp};
use koloda_sync_proto::payload::Payload;
use koloda_sync_proto::registry::{Class, Kind};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};

const CREATE_GROUP: &str = "create";
const ROW_GROUP: &str = "row";

pub fn enroll_device(db: &Database, device_id: Uuid) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        db.with_conn(|conn| {
            conn.execute(
                r#"
                INSERT INTO sync_state (id, device_id, last_hlc, next_sender_seq)
                VALUES (1, ?1, 0, 1)
                "#,
                params![device_id.as_bytes().as_slice()],
            )?;

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
        conn.execute(
            r#"
            INSERT OR REPLACE INTO sync_stamps
                (kind, id, group_name, hlc, stamp_device, sender, sender_seq, product_ts, synthetic)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
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
        successor: Option<&str>,
    ) -> Result<(), AppError> {
        conn.execute(
            r#"
            INSERT OR REPLACE INTO sync_tombstones (kind, id, hlc, stamp_device, sender, sender_seq, successor)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                kind.as_wire(),
                id,
                self.hlc,
                self.stamp_device.as_slice(),
                self.sender.as_slice(),
                self.sender_seq,
                successor
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
