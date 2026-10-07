//! Re-stamping `local` cohorts: every pending member of a cohort takes one new stamp, cohorts in their old order
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Cohorts, §Hybrid logical clock).

use koloda_sync_proto::envelope::{digest, Envelope};
use koloda_sync_proto::hlc::{DeviceId, Hlc, HlcClock, Stamp};
use koloda_sync_proto::registry::{allow, Class, Kind};
use rusqlite::{params, Connection};

use super::{protocol_error, CREATE_GROUP, ROW_GROUP};
use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};

/// Re-stamps every `local` cohort from `now_ms`, under the file's current device id, and ends a clock pause.
pub fn restamp_local_cohorts(db: &Database, now_ms: u64) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_transaction(|tx| {
            restamp(tx, now_ms)?;
            tx.execute("UPDATE sync_state SET is_clock_paused = 0 WHERE id = 1", [])?;
            Ok(())
        })
    })
}

/// Records that a cycle stopped for clock skew; the first cycle on a corrected clock re-stamps before anything else.
pub fn pause_clock(db: &Database) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_conn(|conn| {
            conn.execute("UPDATE sync_state SET is_clock_paused = 1 WHERE id = 1", [])?;
            Ok(())
        })
    })
}

// INVARIANT: one transaction for the whole walk. A capture between two cohorts would take a stamp below one still
// waiting, and their order would flip.
pub(super) fn restamp(conn: &Connection, now_ms: u64) -> Result<(), AppError> {
    // WHY: the floor is not `last_hlc`. A clock that was set ahead moved `last_hlc` with the stamps it gave local
    // cohorts; issuing above it would keep them ahead. The floor is every stamp that is no longer only local: the
    // stable high-water (applied and consumed stamps), the cohorts that went out and may yet be consumed, and the
    // reserved backfill stamps, so a re-stamped write never sorts before a backfill phase.
    let (device, floor): (Vec<u8>, i64) = conn.query_row(
        r#"
        SELECT device_id, MAX(
            stable_hlc, backfill_create_hlc, backfill_review_hlc, backfill_scheduling_hlc,
            COALESCE((SELECT MAX(hlc) FROM sync_cohorts WHERE state <> 'local'), 0)
        )
        FROM sync_state WHERE id = 1
        "#,
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let device = DeviceId(<[u8; 16]>::try_from(device.as_slice()).map_err(protocol_error)?);

    // WHY: a backfill batch keeps the stamp enrollment reserved for its phase. Later batches of the phase write at
    // that stamp, and moving one batch would break the order between phases.
    let cohorts: Vec<(Vec<u8>, i64, Vec<u8>)> = conn
        .prepare(
            r#"
            SELECT c.commit_id, c.hlc, c.stamp_device FROM sync_cohorts c, sync_state s
            WHERE s.id = 1 AND c.state = 'local'
              AND c.hlc NOT IN (s.backfill_create_hlc, s.backfill_review_hlc, s.backfill_scheduling_hlc)
            ORDER BY c.hlc, c.stamp_device
            "#,
        )?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<_, _>>()?;
    if cohorts.is_empty() {
        return Ok(());
    }

    let mut clock = HlcClock {
        last: Hlc::from_raw(u64::try_from(floor).map_err(protocol_error)?),
    };
    for (commit_id, hlc, stamp_device) in cohorts {
        let stamp = Stamp {
            hlc: clock.tick(now_ms).map_err(protocol_error)?,
            device,
        };
        restamp_cohort(conn, &commit_id, (hlc, &stamp_device), stamp)?;
    }

    conn.execute(
        "UPDATE sync_state SET last_hlc = ?1 WHERE id = 1",
        params![i64::try_from(clock.last.raw()).map_err(protocol_error)?],
    )?;
    Ok(())
}

fn restamp_cohort(conn: &Connection, commit_id: &[u8], old: (i64, &[u8]), stamp: Stamp) -> Result<(), AppError> {
    let hlc = i64::try_from(stamp.hlc.raw()).map_err(protocol_error)?;
    let members: Vec<(i64, Vec<u8>)> = conn
        .prepare("SELECT sender_seq, envelope FROM sync_outbox WHERE commit_id = ?1")?
        .query_map(params![commit_id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;

    for (sender_seq, bytes) in members {
        let mut envelope = Envelope::decode(&bytes).map_err(protocol_error)?;
        envelope.header.stamp = stamp;
        let encoded = envelope.encode().map_err(protocol_error)?;
        conn.execute(
            "UPDATE sync_outbox SET envelope = ?2, digest = ?3 WHERE sender_seq = ?1",
            params![sender_seq, encoded, digest(&encoded).0.as_slice()],
        )?;

        let header = &envelope.header;
        let class = allow(header.kind, header.group, header.op)
            .map_err(protocol_error)?
            .map(|spec| spec.class);
        let moved = Moved {
            conn,
            kind: header.kind,
            id: &header.id,
            old,
            hlc,
            device: stamp.device,
        };
        // INVARIANT: only a row that still holds the cohort's old stamp moves. A later local write that replaced
        // this member's register is its own cohort, and a remote winner already dropped the member.
        match class {
            Some(Class::Create) => {
                moved.table("sync_origins", Some(CREATE_GROUP))?;
                moved.synthetic_registers()?;
            }
            Some(Class::Update) => {
                let group = header.group.map(|group| group.as_wire());
                moved.table("sync_stamps", group)?;
            }
            Some(Class::Immutable) => moved.table("sync_origins", Some(ROW_GROUP))?,
            None => moved.table("sync_tombstones", None)?,
        }
    }

    conn.execute(
        "UPDATE sync_cohorts SET hlc = ?2, stamp_device = ?3 WHERE commit_id = ?1",
        params![commit_id, hlc, stamp.device.0.as_slice()],
    )?;
    Ok(())
}

/// Moves the register, origin, or tombstone one member wrote from the cohort's old stamp to its new one.
struct Moved<'a> {
    conn: &'a Connection,
    kind: Kind,
    id: &'a str,
    old: (i64, &'a [u8]),
    hlc: i64,
    device: DeviceId,
}

impl Moved<'_> {
    fn table(&self, table: &str, group: Option<&str>) -> Result<(), AppError> {
        let group_filter = if group.is_some() { "AND group_name = ?6" } else { "" };
        let sql = format!(
            r#"
            UPDATE {table} SET hlc = ?3, stamp_device = ?4
            WHERE kind = ?1 AND id = ?2 AND hlc = ?5 AND stamp_device = ?7 {group_filter}
            "#
        );
        self.conn.execute(
            &sql,
            params![
                self.kind.as_wire(),
                self.id,
                self.hlc,
                self.device.0.as_slice(),
                self.old.0,
                group.unwrap_or_default(),
                self.old.1
            ],
        )?;
        Ok(())
    }

    // WHY: a create stamps every update group of its entity as a synthetic floor at its own stamp. A floor that a
    // later write replaced is no longer synthetic and keeps that write's stamp.
    fn synthetic_registers(&self) -> Result<(), AppError> {
        self.conn.execute(
            r#"
            UPDATE sync_stamps SET hlc = ?3, stamp_device = ?4
            WHERE kind = ?1 AND id = ?2 AND synthetic = 1 AND hlc = ?5 AND stamp_device = ?6
            "#,
            params![
                self.kind.as_wire(),
                self.id,
                self.hlc,
                self.device.0.as_slice(),
                self.old.0,
                self.old.1
            ],
        )?;
        Ok(())
    }
}
