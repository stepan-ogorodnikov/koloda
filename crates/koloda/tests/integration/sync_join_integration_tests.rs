//! Joining an existing space (`crates/koloda-sync-proto/PROTOCOL.md` §Joining).

use koloda::app::db::Database;
use koloda::domain::algorithms::{DeleteAlgorithmData, UpdateAlgorithmData, UpdateAlgorithmValues};
use koloda::domain::seed_ids::{SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID};
use koloda::domain::settings::SettingsName;
use koloda::domain::templates::{UpdateTemplateData, UpdateTemplateValues};
use koloda::repo::algorithms::{delete_algorithm, get_algorithm, update_algorithm};
use koloda::repo::decks::delete_deck;
use koloda::repo::settings::{get_settings, set_settings};
use koloda::repo::sync::backfill::backfill_batch;
use koloda::repo::sync::join::{begin_import, join_mode, probe_ids, JoinMode};
use koloda::repo::sync::{enroll_device, SpaceRole};
use koloda::repo::templates::{get_template, update_template};
use koloda_sync_proto::registry::Kind;
use serde_json::json;
use uuid::Uuid;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template, insert_review_row};
use crate::common::sync::{apply, count, device, enroll_as, hot_page, outbox, SPACE};
use crate::common::{seed_data, test_db};

const OTHER_SPACE: Uuid = Uuid::from_u128(0x0192_0000_0000_7000_8000_0000_0000_05ad);

const RECORDED_TABLES: [&str; 5] = [
    "sync_stamps",
    "sync_origins",
    "sync_outbox",
    "sync_cohorts",
    "sync_tombstones",
];

fn seeded_db() -> Database {
    let db = test_db();
    koloda::app::init::seed_db(&db, seed_data("Simple", "Basic")).expect("test database seeds");
    db
}

fn rename_seed_algorithm(db: &Database) {
    let seed = get_algorithm(db, SEED_ALGORITHM_SIMPLE_ID)
        .expect("algorithm reads")
        .expect("seed algorithm exists");
    update_algorithm(
        db,
        UpdateAlgorithmData {
            id: seed.id,
            values: UpdateAlgorithmValues {
                title: "Simple tuned".to_string(),
                content: seed.content,
                notes: seed.notes,
            },
        },
    )
    .expect("seed algorithm updates");
}

fn rename_seed_template(db: &Database) {
    let seed = get_template(db, SEED_TEMPLATE_TYPE_ID)
        .expect("template reads")
        .expect("seed template exists");
    update_template(
        db,
        UpdateTemplateData {
            id: seed.id,
            values: UpdateTemplateValues {
                title: "Basic renamed".to_string(),
                content: seed.content,
                notes: seed.notes,
            },
        },
    )
    .expect("seed template updates");
}

struct SyncState {
    space: Option<Vec<u8>>,
    phase: String,
    cursors: (i64, i64),
    last_hlc: i64,
    next_sender_seq: i64,
    backfill_step: Option<String>,
    scheduling_hlc: i64,
}

fn sync_state(db: &Database) -> SyncState {
    db.with_conn(|conn| {
        Ok(conn.query_row(
            r#"
            SELECT space_id, join_phase, cursor_hot, cursor_cold, last_hlc, next_sender_seq, backfill_step,
                   backfill_scheduling_hlc
            FROM sync_state WHERE id = 1
            "#,
            [],
            |row| {
                Ok(SyncState {
                    space: row.get(0)?,
                    phase: row.get(1)?,
                    cursors: (row.get(2)?, row.get(3)?),
                    last_hlc: row.get(4)?,
                    next_sender_seq: row.get(5)?,
                    backfill_step: row.get(6)?,
                    scheduling_hlc: row.get(7)?,
                })
            },
        )?)
    })
    .expect("sync state reads")
}

#[test]
fn join_mode_follows_the_files_rows_and_space() {
    type Setup = fn() -> Database;
    let cases: [(&str, Setup, JoinMode); 11] = [
        ("fresh database", test_db, JoinMode::Blank),
        ("first-run seed", seeded_db, JoinMode::UntouchedSeed),
        (
            "changed learning settings",
            || {
                let db = seeded_db();
                let mut learning = get_settings(&db, SettingsName::Learning)
                    .expect("learning settings read")
                    .expect("learning settings exist")
                    .content;
                *learning
                    .pointer_mut("/dayStartsAt")
                    .expect("learning settings hold the key") = json!("06:00");
                set_settings(&db, SettingsName::Learning, learning).expect("learning settings save");
                db
            },
            JoinMode::UntouchedSeed,
        ),
        (
            "edited seed algorithm",
            || {
                let db = seeded_db();
                rename_seed_algorithm(&db);
                db
            },
            JoinMode::Used,
        ),
        (
            "edited seed template",
            || {
                let db = seeded_db();
                rename_seed_template(&db);
                db
            },
            JoinMode::Used,
        ),
        (
            "extra deck",
            || {
                let db = seeded_db();
                add_deck(&db, SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID, "Spanish");
                db
            },
            JoinMode::Used,
        ),
        (
            "custom algorithm",
            || {
                let db = seeded_db();
                add_algorithm(&db, "FSRS");
                db
            },
            JoinMode::Used,
        ),
        (
            "revisions of a deleted algorithm",
            || {
                let db = seeded_db();
                let algorithm = add_algorithm(&db, "FSRS");
                delete_algorithm(
                    &db,
                    DeleteAlgorithmData {
                        id: algorithm,
                        successor_id: None,
                    },
                )
                .expect("algorithm deletes");
                db
            },
            JoinMode::Used,
        ),
        (
            "active in this space",
            || {
                let db = seeded_db();
                enroll_as(&db, SpaceRole::Joiner);
                db
            },
            JoinMode::Reattach,
        ),
        (
            "active in another space",
            || {
                let db = seeded_db();
                enroll_device(&db, Uuid::now_v7(), OTHER_SPACE, SpaceRole::Joiner).expect("database enrolls");
                db
            },
            JoinMode::UntouchedSeed,
        ),
        (
            "pending in this space",
            || {
                let db = seeded_db();
                begin_import(&db, Uuid::now_v7(), SPACE).expect("claim records");
                db
            },
            JoinMode::UntouchedSeed,
        ),
    ];

    for (name, setup, expected) in cases {
        assert_eq!(join_mode(&setup(), SPACE).expect("join mode reads"), expected, "{name}");
    }
}

#[test]
fn a_claim_clears_what_the_file_recorded_for_another_space() {
    let db = seeded_db();
    enroll_device(&db, Uuid::now_v7(), OTHER_SPACE, SpaceRole::Creator).expect("database enrolls");
    let deck = add_deck(&db, SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID, "Spanish");
    delete_deck(&db, koloda::domain::decks::DeleteDeckData { id: deck }).expect("deck deletes");
    apply(&db, &hot_page(Uuid::now_v7(), vec![], 7)).expect("empty page applies");
    for table in RECORDED_TABLES {
        assert!(
            count(&db, &format!("SELECT COUNT(*) FROM {table}")) > 0,
            "the old space left {table} rows"
        );
    }

    let claimed = Uuid::now_v7();
    begin_import(&db, claimed, SPACE).expect("claim records");

    for table in RECORDED_TABLES {
        assert_eq!(count(&db, &format!("SELECT COUNT(*) FROM {table}")), 0, "{table}");
    }
    assert_eq!(device(&db), claimed);
    let state = sync_state(&db);
    assert_eq!(state.space.as_deref(), Some(SPACE.as_bytes().as_slice()));
    assert_eq!(state.phase, "import_pending");
    assert_eq!(state.cursors, (0, 0), "cursors restart for the new space");
    assert_eq!(
        (state.last_hlc, state.next_sender_seq),
        (0, 1),
        "the new device starts its own clock and sequence"
    );
    assert_eq!(
        (state.backfill_step, state.scheduling_hlc),
        (None, 0),
        "backfill stamps wait for Add or Replace"
    );
}

#[test]
fn a_pending_import_captures_backfills_and_applies_nothing() {
    let db = seeded_db();
    begin_import(&db, Uuid::now_v7(), SPACE).expect("claim records");

    add_deck(&db, SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID, "Spanish");
    assert!(outbox(&db).is_empty(), "a write while pending enqueues nothing");
    for table in RECORDED_TABLES {
        assert_eq!(count(&db, &format!("SELECT COUNT(*) FROM {table}")), 0, "{table}");
    }

    assert_eq!(backfill_batch(&db, 10).unwrap_err().code, "db.add");
    assert_eq!(
        apply(&db, &hot_page(Uuid::now_v7(), vec![], 3)).unwrap_err().code,
        "db.update"
    );
    assert_eq!(
        sync_state(&db).cursors,
        (0, 0),
        "a refused page does not move the cursor"
    );
}

#[test]
fn probe_pages_list_every_hot_lane_id_once() {
    let db = seeded_db();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Vocabulary");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    let card = add_card(&db, &deck, &template, "hola");
    insert_review_row(&db, &card, 2, 0, 1_727_000_000_000);

    let mut probed = Vec::new();
    let mut after = None;
    loop {
        let page = probe_ids(&db, after.as_ref(), 3).expect("probe page reads");
        let Some(last) = page.last().cloned() else {
            break;
        };
        assert!(page.len() <= 3, "a page holds at most the limit");
        probed.extend(page);
        after = Some(last);
    }

    let sorted = |mut ids: Vec<String>| {
        ids.sort();
        ids
    };
    let revisions = db
        .with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT id FROM algorithm_revisions ORDER BY id")?;
            let ids = stmt
                .query_map([], |row| row.get(0))?
                .collect::<Result<Vec<String>, _>>()?;
            Ok(ids)
        })
        .expect("revisions read");
    assert_eq!(
        revisions.len(),
        2,
        "the seed and the custom algorithm each have one revision"
    );
    let expected: Vec<(Kind, String)> = [
        (
            Kind::Algorithms,
            sorted(vec![SEED_ALGORITHM_SIMPLE_ID.to_string(), algorithm]),
        ),
        (Kind::AlgorithmRevisions, revisions),
        (
            Kind::Templates,
            sorted(vec![SEED_TEMPLATE_TYPE_ID.to_string(), template]),
        ),
        (Kind::Decks, vec![deck]),
        (Kind::Cards, vec![card]),
    ]
    .into_iter()
    .flat_map(|(kind, ids)| ids.into_iter().map(move |id| (kind, id)))
    .collect();
    assert_eq!(probed, expected, "reviews and learning are never probed");
}
