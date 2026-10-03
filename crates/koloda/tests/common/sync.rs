//! Sync capture readers: enroll a test database and decode what capture wrote.

use koloda::app::db::Database;
use koloda::repo::sync;
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::hlc::Hlc;
use koloda_sync_proto::payload::Payload;
use uuid::Uuid;

pub struct OutboxEntry {
    pub sender_seq: i64,
    pub in_flight: bool,
    pub envelope: Envelope,
    pub payload: Payload,
}

pub struct Register {
    pub hlc: Hlc,
    pub sender_seq: i64,
    pub product_ts: Option<i64>,
    pub is_synthetic: bool,
}

pub fn enroll(db: &Database) -> Uuid {
    let device = Uuid::now_v7();
    sync::enroll_device(db, device).expect("test database enrolls");
    device
}

pub fn outbox(db: &Database) -> Vec<OutboxEntry> {
    let rows: Vec<(i64, bool, Vec<u8>)> = db
        .with_conn(|conn| {
            let mut stmt =
                conn.prepare("SELECT sender_seq, in_flight, envelope FROM sync_outbox ORDER BY sender_seq")?;
            let rows = stmt
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
        .expect("outbox reads");

    rows.into_iter()
        .map(|(sender_seq, in_flight, bytes)| {
            let envelope = Envelope::decode(&bytes).expect("outbox envelope decodes");
            let payload = Payload::decode(&envelope.header, &envelope.payload).expect("outbox payload decodes");
            OutboxEntry {
                sender_seq,
                in_flight,
                envelope,
                payload,
            }
        })
        .collect()
}

pub fn register(db: &Database, kind: &str, id: &str, group: &str) -> Option<Register> {
    db.with_conn(|conn| {
        let register = conn.query_row(
            r#"
            SELECT hlc, sender_seq, product_ts, synthetic FROM sync_stamps
            WHERE kind = ?1 AND id = ?2 AND group_name = ?3
            "#,
            rusqlite::params![kind, id, group],
            |row| {
                Ok(Register {
                    hlc: Hlc::from_raw(u64::try_from(row.get::<_, i64>(0)?).expect("stored HLC is non-negative")),
                    sender_seq: row.get(1)?,
                    product_ts: row.get(2)?,
                    is_synthetic: row.get(3)?,
                })
            },
        );
        match register {
            Ok(register) => Ok(Some(register)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(error.into()),
        }
    })
    .expect("register reads")
}

pub fn count(db: &Database, sql: &str) -> i64 {
    db.with_conn(|conn| Ok(conn.query_row(sql, [], |row| row.get(0))?))
        .expect("count query runs")
}
