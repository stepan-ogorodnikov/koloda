use koloda_sync_proto::envelope::digest;
use koloda_sync_proto::hlc::{DeviceId, Hlc, HlcClock, Stamp};
use koloda_sync_proto::payload::{seal, Delete, Payload, Seal};
use koloda_sync_proto::registry::{allow, Class, Kind};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use super::backfill;
use super::{
    delete_empty_cohort, forget_card_reviews, forget_entity, protocol_error, SpaceRole, StampValues, ROW_GROUP,
};
use crate::app::error::AppError;
use crate::app::utility::get_current_timestamp;

/// One commit's sync capture, opened inside the repo transaction that writes the product rows.
/// It does nothing when the database is not enrolled, and nothing until its first write.
pub struct Capture<'c> {
    conn: &'c Connection,
    device: Option<DeviceState>,
}

struct DeviceState {
    device: DeviceId,
    clock: HlcClock,
    next_sender_seq: i64,
    commit: Option<Commit>,
    reserved: Option<Hlc>,
    role: SpaceRole,
    is_backfilling: bool,
}

#[derive(Clone, Copy)]
struct Commit {
    stamp: Stamp,
    commit_id: [u8; 16],
}

impl<'c> Capture<'c> {
    pub fn begin(conn: &'c Connection) -> Result<Capture<'c>, AppError> {
        // INVARIANT: a pending import captures nothing. Add backfills every row written meanwhile, and Replace
        // deletes it (PROTOCOL.md, Joining).
        let row: Option<(Vec<u8>, i64, i64, String, bool)> = conn
            .query_row(
                r#"
                SELECT device_id, last_hlc, next_sender_seq, role, backfill_step IS NOT NULL
                FROM sync_state WHERE id = 1 AND join_phase = 'active'
                "#,
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .optional()?;

        let device = match row {
            Some((device, last_hlc, next_sender_seq, role, is_backfilling)) => Some(DeviceState {
                device: DeviceId(<[u8; 16]>::try_from(device.as_slice()).map_err(protocol_error)?),
                clock: HlcClock {
                    last: Hlc::from_raw(u64::try_from(last_hlc).map_err(protocol_error)?),
                },
                next_sender_seq,
                commit: None,
                reserved: None,
                role: SpaceRole::from_sql(&role)?,
                is_backfilling,
            }),
            None => None,
        };

        Ok(Capture { conn, device })
    }

    // INVARIANT: a backfill phase writes at the stamp enrollment reserved, below `last_hlc`. It never ticks the
    // clock, so writes captured later stay above every backfill phase.
    pub(super) fn begin_reserved(conn: &'c Connection, hlc: Hlc) -> Result<Capture<'c>, AppError> {
        let mut capture = Capture::begin(conn)?;
        let state = capture
            .device
            .as_mut()
            .ok_or_else(|| protocol_error("only an enrolled database backfills"))?;
        state.reserved = Some(hlc);
        Ok(capture)
    }

    pub fn write(&mut self, id: &str, parent: Option<&str>, payload: &Payload) -> Result<(), AppError> {
        if let Some(role) = self
            .device
            .as_ref()
            .filter(|state| state.is_backfilling)
            .map(|state| state.role)
        {
            backfill::touch(self.conn, self, role, id, parent, payload)?;
        }
        self.write_envelope(id, parent, payload).map(|_bytes| ())
    }

    // INVARIANT: skips the referent check of `write`; only backfill calls it, after it has stamped every referent.
    /// Returns the encoded envelope's size in bytes, or 0 when the database is not enrolled.
    pub(super) fn write_envelope(
        &mut self,
        id: &str,
        parent: Option<&str>,
        payload: &Payload,
    ) -> Result<usize, AppError> {
        let conn = self.conn;
        let Some(state) = self.device.as_mut() else {
            return Ok(0);
        };

        let commit = state.commit(conn)?;
        let (kind, group, op) = payload.target();
        let class = allow(kind, group, op)
            .map_err(protocol_error)?
            .map(|spec| spec.class)
            .ok_or_else(|| protocol_error("a write must name a group"))?;
        let group_name = group.map(|group| group.as_wire()).unwrap_or_default();

        let sealed = seal_payload(commit, id, parent, payload)?;
        let sender_seq = state.next_seq(conn)?;
        let stamp_values = StampValues::new(commit.stamp, state.device, sender_seq)?;

        match class {
            Class::Create => stamp_values.write_create(conn, kind, id, payload)?,
            Class::Update => stamp_values.write_register(conn, kind, id, group_name, payload.product_ts(), false)?,
            Class::Immutable => stamp_values.write_origin(conn, kind, id, ROW_GROUP, None)?,
        }

        // INVARIANT: at most one not-in-flight outbox row per group. A newer write replaces it at the tail;
        // an in-flight row is never touched.
        let replaced: Option<(i64, Vec<u8>)> = conn
            .query_row(
                r#"
                SELECT sender_seq, commit_id FROM sync_outbox
                WHERE kind = ?1 AND id = ?2 AND group_name = ?3 AND in_flight = 0
                "#,
                params![kind.as_wire(), id, group_name],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        if let Some((replaced_seq, replaced_commit)) = replaced {
            conn.execute("DELETE FROM sync_outbox WHERE sender_seq = ?1", params![replaced_seq])?;
            delete_empty_cohort(conn, &replaced_commit)?;
        }

        insert_outbox(conn, sender_seq, kind, id, Some(group_name), commit, &sealed)?;
        Ok(sealed.bytes.len())
    }

    // INVARIANT: call before a product reset deletes the card's reviews; their origins go with them.
    pub fn forget_card_reviews(&mut self, card_id: &str) -> Result<(), AppError> {
        if self.device.is_none() {
            return Ok(());
        }
        forget_card_reviews(self.conn, card_id)
    }

    // INVARIANT: call before the product rows of the entity and its descendants are deleted; the register
    // and origin cleanup reads them to find descendant ids.
    pub fn delete(
        &mut self,
        kind: Kind,
        id: &str,
        parent: Option<&str>,
        successor: Option<&str>,
    ) -> Result<(), AppError> {
        let conn = self.conn;
        let Some(state) = self.device.as_mut() else {
            return Ok(());
        };

        let commit = state.commit(conn)?;
        let payload = Payload::Delete {
            kind,
            delete: Delete {
                successor: successor.map(str::to_string),
            },
        };
        let sealed = seal_payload(commit, id, parent, &payload)?;
        let sender_seq = state.next_seq(conn)?;
        let stamp_values = StampValues::new(commit.stamp, state.device, sender_seq)?;

        stamp_values.write_tombstone(conn, kind, id, parent, successor)?;
        forget_entity(conn, kind, id)?;

        // WHY: a delete never replaces pending rows of its entity. Earlier creates still push first, so a pending
        // child envelope never names a parent the server has not seen; the tombstone then removes both.
        insert_outbox(conn, sender_seq, kind, id, None, commit, &sealed)
    }
}

impl DeviceState {
    fn commit(&mut self, conn: &Connection) -> Result<Commit, AppError> {
        if let Some(commit) = self.commit {
            return Ok(commit);
        }

        let hlc = match self.reserved {
            Some(hlc) => hlc,
            None => self.tick(conn)?,
        };
        let commit = Commit {
            stamp: Stamp {
                hlc,
                device: self.device,
            },
            commit_id: *Uuid::new_v4().as_bytes(),
        };
        let raw_hlc = i64::try_from(hlc.raw()).map_err(protocol_error)?;

        conn.execute(
            r#"
            INSERT INTO sync_cohorts (commit_id, state, hlc, stamp_device)
            VALUES (?1, 'local', ?2, ?3)
            "#,
            params![commit.commit_id.as_slice(), raw_hlc, self.device.0.as_slice()],
        )?;

        self.commit = Some(commit);
        Ok(commit)
    }

    fn tick(&mut self, conn: &Connection) -> Result<Hlc, AppError> {
        let now = u64::try_from(get_current_timestamp()?).map_err(protocol_error)?;
        let hlc = self.clock.tick(now).map_err(protocol_error)?;
        let raw_hlc = i64::try_from(hlc.raw()).map_err(protocol_error)?;
        conn.execute("UPDATE sync_state SET last_hlc = ?1 WHERE id = 1", params![raw_hlc])?;
        Ok(hlc)
    }

    fn next_seq(&mut self, conn: &Connection) -> Result<i64, AppError> {
        let sender_seq = self.next_sender_seq;
        self.next_sender_seq += 1;
        conn.execute(
            "UPDATE sync_state SET next_sender_seq = ?1 WHERE id = 1",
            params![self.next_sender_seq],
        )?;
        Ok(sender_seq)
    }
}

fn seal_payload(
    commit: Commit,
    id: &str,
    parent: Option<&str>,
    payload: &Payload,
) -> Result<koloda_sync_proto::payload::Sealed, AppError> {
    seal(
        Seal {
            id: id.to_string(),
            parent: parent.map(str::to_string),
            stamp: commit.stamp,
            commit_id: commit.commit_id,
        },
        payload,
    )
    .map_err(protocol_error)
}

fn insert_outbox(
    conn: &Connection,
    sender_seq: i64,
    kind: Kind,
    id: &str,
    group_name: Option<&str>,
    commit: Commit,
    sealed: &koloda_sync_proto::payload::Sealed,
) -> Result<(), AppError> {
    conn.execute(
        r#"
        INSERT INTO sync_outbox (sender_seq, kind, id, group_name, commit_id, envelope, digest, in_flight)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)
        "#,
        params![
            sender_seq,
            kind.as_wire(),
            id,
            group_name,
            commit.commit_id.as_slice(),
            sealed.bytes,
            digest(&sealed.bytes).0.as_slice()
        ],
    )?;
    Ok(())
}
