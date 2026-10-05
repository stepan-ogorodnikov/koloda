//! Sync test support: enroll a test database, decode what capture wrote, and exchange outboxes between replicas
//! through a fake space.

use koloda::app::db::Database;
use koloda::app::error::AppError;
use koloda::repo::sync::apply::{apply_page, Page, PageEntry};
use koloda::repo::sync::backfill::{backfill_batch, Backfill};
use koloda::repo::sync::join::{add_to_space, begin_import, probe_ids, Known};
use koloda::repo::sync::repair::{repair_dangling_defaults, Starter};
use koloda::repo::sync::{self, SpaceRole};
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use koloda_sync_proto::payload::{seal, Payload, Seal};
use koloda_sync_proto::registry::{allow, Class, Kind, Lane, Op};
use rusqlite::backup::Backup;
use rusqlite::Connection;
use std::collections::{HashMap, HashSet};
use std::time::Duration;
use uuid::Uuid;

/// The space every test replica enrolls in.
pub const SPACE: Uuid = Uuid::from_u128(0x0192_0000_0000_7000_8000_0000_0000_05ac);
pub const EPOCH: Uuid = Uuid::from_u128(0x0192_0000_0000_7000_8000_0000_0000_e90c);
pub const SERVER_URL: &str = "https://sync.test";

pub struct OutboxEntry {
    pub sender_seq: i64,
    pub in_flight: bool,
    pub envelope: Envelope,
    pub payload: Payload,
}

pub struct Register {
    pub hlc: Hlc,
    pub sender: Uuid,
    pub sender_seq: i64,
    pub product_ts: Option<i64>,
    pub is_synthetic: bool,
}

pub struct Origin {
    pub hlc: Hlc,
    pub sender: Uuid,
    pub sender_seq: i64,
}

/// Enrolls as a joiner whose earlier rows the space already holds: backfill runs to the end and its envelopes are
/// dropped, so the outbox holds only what a test writes afterwards. A seeded replica's starter rows and `learning`
/// document stay at stamp zero.
pub fn enroll(db: &Database) -> Uuid {
    let device = enroll_as(db, SpaceRole::Joiner);
    FakeSpace::default().drain_backfill(db, 100);
    device
}

pub fn enroll_as(db: &Database, role: SpaceRole) -> Uuid {
    let device = Uuid::now_v7();
    sync::enroll_device(db, device, SPACE, role, EPOCH, SERVER_URL).expect("test database enrolls");
    device
}

/// A blank enrolled database, so every row a test writes on it is captured.
pub fn replica() -> Database {
    let db = super::test_db();
    enroll(&db);
    db
}

/// A database seeded before enrollment, so its starter rows and `learning` document are at stamp zero.
pub fn seeded_replica() -> Database {
    let db = super::test_db();
    koloda::app::init::seed_db(&db, super::seed_data("Simple", "Basic")).expect("test database seeds");
    enroll(&db);
    db
}

pub fn stamp(device: Uuid, wall_ms: u64) -> Stamp {
    Stamp {
        hlc: Hlc::new(wall_ms, 0).expect("wall time fits"),
        device: DeviceId(*device.as_bytes()),
    }
}

pub fn sealed(id: &str, parent: Option<&str>, stamp: Stamp, payload: &Payload) -> Vec<u8> {
    seal(
        Seal {
            id: id.to_string(),
            parent: parent.map(str::to_string),
            stamp,
            commit_id: [7; 16],
        },
        payload,
    )
    .expect("payload seals")
    .bytes
}

/// A page of hand-sealed envelopes from one remote sender, numbered from sender seq 1.
pub fn hot_page(sender: Uuid, envelopes: Vec<Vec<u8>>, scanned_through: i64) -> Page {
    page(Lane::Hot, sender, envelopes, scanned_through)
}

pub fn page(lane: Lane, sender: Uuid, envelopes: Vec<Vec<u8>>, scanned_through: i64) -> Page {
    Page {
        lane,
        entries: envelopes
            .into_iter()
            .enumerate()
            .map(|(index, envelope)| PageEntry {
                sender,
                sender_seq: i64::try_from(index).expect("index fits") + 1,
                envelope,
            })
            .collect(),
        scanned_through,
    }
}

/// Marks every pending outbox row as sent, as a push in progress would.
pub fn mark_in_flight(db: &Database) {
    db.with_conn(|conn| {
        conn.execute("UPDATE sync_outbox SET in_flight = 1", [])?;
        Ok(())
    })
    .expect("outbox rows go in flight");
}

/// Stands in for the server's log: it orders pushed envelopes per lane and serves them to other senders.
/// It makes none of the server's checks (stale heads, existence, compaction); `assert_referents_first` checks the
/// order the existence check relies on.
#[derive(Default)]
pub struct FakeSpace {
    hot: Vec<LogEntry>,
    cold: Vec<LogEntry>,
    pushed: usize,
}

struct LogEntry {
    order: usize,
    seq: i64,
    sender: Uuid,
    sender_seq: i64,
    envelope: Vec<u8>,
}

impl FakeSpace {
    /// Accepts every not-in-flight outbox row, as an `applied` push outcome would, and clears it.
    pub fn push(&mut self, replica: &Database) {
        let sender = device(replica);
        let rows: Vec<(i64, Vec<u8>)> = replica
            .with_conn(|conn| {
                let mut stmt = conn
                    .prepare("SELECT sender_seq, envelope FROM sync_outbox WHERE in_flight = 0 ORDER BY sender_seq")?;
                let rows = stmt
                    .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .expect("outbox reads");

        for (sender_seq, envelope) in rows {
            let kind = Envelope::decode(&envelope)
                .expect("outbox envelope decodes")
                .header
                .kind;
            let log = match kind.spec().lane {
                Lane::Hot => &mut self.hot,
                Lane::Cold => &mut self.cold,
            };
            let seq = i64::try_from(log.len()).expect("log length fits") + 1;
            self.pushed += 1;
            log.push(LogEntry {
                order: self.pushed,
                seq,
                sender,
                sender_seq,
                envelope,
            });
        }

        replica
            .with_conn(|conn| {
                conn.execute("DELETE FROM sync_outbox WHERE in_flight = 0", [])?;
                conn.execute(
                    "DELETE FROM sync_cohorts WHERE commit_id NOT IN (SELECT commit_id FROM sync_outbox)",
                    [],
                )?;
                Ok(())
            })
            .expect("outbox clears");
    }

    /// Runs backfill in batches of `max_envelopes`, pushing after each, until it finishes.
    pub fn drain_backfill(&mut self, replica: &Database, max_envelopes: usize) {
        while backfill_batch(replica, max_envelopes).expect("backfill batch runs") == Backfill::Pending {
            self.push(replica);
        }
        self.push(replica);
    }

    /// Fails unless every logged envelope's algorithm or template ref, the parent of every write, and the entity an
    /// update names was created or deleted earlier in the log, across both lanes. A delete needs no parent: the server
    /// accepts a tombstone for an id it does not hold as a fence. The `learning` document is never created.
    pub fn assert_referents_first(&self) {
        let mut entries: Vec<&LogEntry> = self.hot.iter().chain(&self.cold).collect();
        entries.sort_by_key(|entry| entry.order);

        let mut known: HashSet<(Kind, String)> = HashSet::new();
        for entry in entries {
            let header = Envelope::decode(&entry.envelope)
                .expect("logged envelope decodes")
                .header;
            let class = allow(header.kind, header.group, header.op)
                .expect("logged header is allowed")
                .map(|spec| spec.class);

            let mut needed = Vec::new();
            let parent = header.parent.as_ref().filter(|_| header.op != Op::Delete);
            if let (Some(parent), Some(parent_kind)) = (parent, header.kind.spec().parent) {
                needed.push((parent_kind, parent.clone()));
            }
            if let Some(algorithm_id) = &header.refs.algorithm_id {
                needed.push((Kind::Algorithms, algorithm_id.clone()));
            }
            if let Some(template_id) = &header.refs.template_id {
                needed.push((Kind::Templates, template_id.clone()));
            }
            if class == Some(Class::Update) && header.kind != Kind::SettingsLearning {
                needed.push((header.kind, header.id.clone()));
            }
            for (kind, id) in needed {
                assert!(
                    known.contains(&(kind, id.clone())),
                    "{:?} {} {:?} names {kind:?} {id} before the log holds it",
                    header.kind,
                    header.id,
                    header.group,
                );
            }

            if class != Some(Class::Update) || header.op == Op::Delete {
                known.insert((header.kind, header.id));
            }
        }
    }

    /// Answers the replica's probe ids as `ids/known` would. An id with a create or immutable envelope in the log is
    /// live; a tombstoned id, or a card under a tombstoned deck, is fenced.
    pub fn probe(&self, replica: &Database) -> HashMap<String, Known> {
        let mut live = HashSet::new();
        let mut fenced = HashSet::new();
        let mut card_decks = HashMap::new();
        for entry in self.hot.iter().chain(&self.cold) {
            let header = Envelope::decode(&entry.envelope)
                .expect("logged envelope decodes")
                .header;
            let class = allow(header.kind, header.group, header.op)
                .expect("logged header is allowed")
                .map(|spec| spec.class);
            if header.op == Op::Delete {
                fenced.insert(header.id);
            } else if class != Some(Class::Update) {
                if let (Kind::Cards, Some(deck)) = (header.kind, &header.parent) {
                    card_decks.insert(header.id.clone(), deck.clone());
                }
                live.insert(header.id);
            }
        }

        let mut known = HashMap::new();
        let mut after = None;
        loop {
            let page = probe_ids(replica, after.as_ref(), 50).expect("probe page reads");
            for (_, id) in &page {
                let is_fenced = fenced.contains(id) || card_decks.get(id).is_some_and(|deck| fenced.contains(deck));
                if is_fenced {
                    known.insert(id.clone(), Known::Fenced);
                } else if live.contains(id) {
                    known.insert(id.clone(), Known::Live);
                }
            }
            match page.last() {
                Some(last) => after = Some(last.clone()),
                None => return known,
            }
        }
    }

    /// Claims a code, probes the space, and adds the file through Add, as the join wizard will.
    pub fn join_by_add(&self, replica: &Database) {
        begin_import(replica, Uuid::now_v7(), SPACE).expect("claim records");
        let known = self.probe(replica);
        add_to_space(replica, &known).expect("file joins through Add");
    }

    /// Applies everything other senders pushed past the replica's cursors, `hot` first, then `cold`, and then
    /// repairs dangling learning defaults as the engine does after catch-up.
    pub fn pull(&self, replica: &Database) -> Vec<Kind> {
        let own = device(replica);
        let mut changed = Vec::new();
        for (lane, log) in [(Lane::Hot, &self.hot), (Lane::Cold, &self.cold)] {
            let after = cursor(replica, lane);
            let page = Page {
                lane,
                entries: log
                    .iter()
                    .filter(|entry| entry.seq > after && entry.sender != own)
                    .map(|entry| PageEntry {
                        sender: entry.sender,
                        sender_seq: entry.sender_seq,
                        envelope: entry.envelope.clone(),
                    })
                    .collect(),
                scanned_through: log.last().map_or(after, |entry| entry.seq),
            };
            changed.extend(apply(replica, &page).expect("page applies"));
        }
        changed.extend(repair_dangling_defaults(replica, &starter()).expect("defaults repair"));
        changed
    }
}

/// A byte-for-byte copy of a database, as a user copying the file would make.
pub fn copy_of(db: &Database) -> Database {
    let mut copy = Connection::open_in_memory().expect("copy opens");
    db.with_conn(|conn| {
        Backup::new(conn, &mut copy)?.run_to_completion(64, Duration::ZERO, None)?;
        Ok(())
    })
    .expect("database copies");
    copy.pragma_update(None, "foreign_keys", "ON")
        .expect("copy enforces foreign keys");
    Database::new(copy)
}

/// The first-run content a repair creates when a kind has no live row left.
pub fn starter() -> Starter {
    let seed = super::seed_data("Starter algorithm", "Starter template");
    Starter {
        algorithm: seed.algorithm,
        template: seed.template,
    }
}

pub fn apply(db: &Database, page: &Page) -> Result<Vec<Kind>, AppError> {
    apply_page(db, page, &starter())
}

pub fn device(db: &Database) -> Uuid {
    sync::enrolled_device(db)
        .expect("device reads")
        .expect("database is enrolled")
}

pub fn cursor(db: &Database, lane: Lane) -> i64 {
    let column = match lane {
        Lane::Hot => "cursor_hot",
        Lane::Cold => "cursor_cold",
    };
    count(db, &format!("SELECT {column} FROM sync_state WHERE id = 1"))
}

pub fn last_hlc(db: &Database) -> Hlc {
    let raw = count(db, "SELECT last_hlc FROM sync_state WHERE id = 1");
    Hlc::from_raw(u64::try_from(raw).expect("stored HLC is non-negative"))
}

pub fn origin(db: &Database, kind: &str, id: &str, group: &str) -> Option<Origin> {
    db.with_conn(|conn| {
        let origin = conn.query_row(
            "SELECT hlc, sender, sender_seq FROM sync_origins WHERE kind = ?1 AND id = ?2 AND group_name = ?3",
            rusqlite::params![kind, id, group],
            |row| {
                Ok(Origin {
                    hlc: Hlc::from_raw(u64::try_from(row.get::<_, i64>(0)?).expect("stored HLC is non-negative")),
                    sender: Uuid::from_slice(&row.get::<_, Vec<u8>>(1)?).expect("sender is a UUID"),
                    sender_seq: row.get(2)?,
                })
            },
        );
        match origin {
            Ok(origin) => Ok(Some(origin)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(error.into()),
        }
    })
    .expect("origin reads")
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
            SELECT hlc, sender, sender_seq, product_ts, synthetic FROM sync_stamps
            WHERE kind = ?1 AND id = ?2 AND group_name = ?3
            "#,
            rusqlite::params![kind, id, group],
            |row| {
                Ok(Register {
                    hlc: Hlc::from_raw(u64::try_from(row.get::<_, i64>(0)?).expect("stored HLC is non-negative")),
                    sender: Uuid::from_slice(&row.get::<_, Vec<u8>>(1)?).expect("sender is a UUID"),
                    sender_seq: row.get(2)?,
                    product_ts: row.get(3)?,
                    is_synthetic: row.get(4)?,
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

pub struct DeckFixture {
    pub algorithm: String,
    pub template: String,
    pub deck: String,
}

/// Creates an algorithm, a template, and a deck before enrolling, so the outbox holds only what a test writes.
pub fn enrolled_deck(db: &Database) -> DeckFixture {
    let algorithm = super::fixtures::add_algorithm(db, "FSRS");
    let template = super::fixtures::add_template(db, "Basic");
    let deck = super::fixtures::add_deck(db, &algorithm, &template, "Spanish");
    enroll(db);
    DeckFixture {
        algorithm,
        template,
        deck,
    }
}
