//! Joining an existing space (`crates/koloda-sync-proto/PROTOCOL.md` §Joining).

use std::collections::HashMap;
use std::num::NonZeroU32;

use koloda::app::db::Database;
use koloda::domain::algorithms::{DeleteAlgorithmData, UpdateAlgorithmData, UpdateAlgorithmValues};
use koloda::domain::attachments::AddAttachmentData;
use koloda::domain::decks::{DeleteDeckData, UpdateDeckData, UpdateDeckValues};
use koloda::domain::seed_ids::{SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID};
use koloda::domain::settings::SettingsName;
use koloda::domain::templates::{DeleteTemplateData, UpdateTemplateData, UpdateTemplateValues};
use koloda::repo::algorithms::{delete_algorithm, get_algorithm, update_algorithm};
use koloda::repo::attachments::add_attachment;
use koloda::repo::decks::{delete_deck, get_deck, update_deck};
use koloda::repo::settings::{get_settings, set_settings};
use koloda::repo::sync::backfill::{backfill_batch, Backfill};
use koloda::repo::sync::join::{add_to_space, begin_import, join_mode, probe_ids, JoinMode, Known};
use koloda::repo::sync::{enroll_device, SpaceRole};
use koloda::repo::templates::{delete_template, get_template, update_template};
use koloda_sync_proto::registry::Kind;
use rusqlite::types::Value;
use serde_json::json;
use uuid::Uuid;

use crate::common::fixtures::{add_algorithm, add_card, add_conversation, add_deck, add_template, insert_review_row};
use crate::common::sync::{apply, copy_of, count, device, enroll_as, hot_page, outbox, FakeSpace, OutboxEntry, SPACE};
use crate::common::{seed_data, test_db};

const SYNCED_TABLES: [&str; 6] = [
    "algorithms",
    "algorithm_revisions",
    "templates",
    "decks",
    "cards",
    "reviews",
];

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
    delete_deck(&db, DeleteDeckData { id: deck }).expect("deck deletes");
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

fn dump(db: &Database, table: &str) -> Vec<Vec<Value>> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(&format!("SELECT * FROM {table} ORDER BY id"))?;
        let width = stmt.column_count();
        let rows = stmt
            .query_map([], |row| (0..width).map(|index| row.get(index)).collect())?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
    .expect("table reads")
}

fn column(db: &Database, sql: &str) -> Vec<String> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(sql)?;
        let ids = stmt.query_map([], |row| row.get(0))?.collect::<Result<Vec<_>, _>>()?;
        Ok(ids)
    })
    .expect("column reads")
}

fn ids(db: &Database, table: &str) -> Vec<String> {
    column(db, &format!("SELECT id FROM {table} ORDER BY id"))
}

fn id_titled(db: &Database, table: &str, title: &str) -> String {
    let mut ids = column(db, &format!("SELECT id FROM {table} WHERE title = '{title}'"));
    assert_eq!(ids.len(), 1, "{table} holds one row titled {title}");
    ids.remove(0)
}

fn row(db: &Database, table: &str, id: &str) -> Vec<Value> {
    dump(db, table)
        .into_iter()
        .find(|row| row.first() == Some(&Value::Text(id.to_string())))
        .expect("row exists")
}

fn set_learning_defaults(db: &Database, algorithm: &str, template: &str) {
    let mut learning = learning(db);
    *learning
        .pointer_mut("/defaults/algorithm")
        .expect("learning settings hold the key") = json!(algorithm);
    *learning
        .pointer_mut("/defaults/template")
        .expect("learning settings hold the key") = json!(template);
    set_settings(db, SettingsName::Learning, learning).expect("learning settings save");
}

fn learning(db: &Database) -> serde_json::Value {
    get_settings(db, SettingsName::Learning)
        .expect("learning settings read")
        .expect("learning settings exist")
        .content
}

/// A creator's file, a copy of it taken before the creator made the space, and what the copy wrote afterwards.
struct Copied {
    creator: Database,
    copy: Database,
    space: FakeSpace,
    creator_ids: HashMap<&'static str, Vec<String>>,
    deck: String,
    deleted_deck: String,
    later_algorithm: String,
    later_deck: String,
    later_card: String,
    dependents: [(&'static str, String); 2],
}

fn copied() -> Copied {
    let creator = seeded_db();
    let algorithm = add_algorithm(&creator, "FSRS");
    let template = add_template(&creator, "Vocabulary");
    let deck = add_deck(&creator, &algorithm, &template, "Spanish");
    let card = add_card(&creator, &deck, &template, "hola");
    insert_review_row(&creator, &card, 2, 0, 1_727_000_000_000);
    let deleted_deck = add_deck(&creator, &algorithm, &template, "Old");
    add_card(&creator, &deleted_deck, &template, "viejo");
    set_learning_defaults(&creator, &algorithm, &template);
    let copy = copy_of(&creator);
    let creator_ids = SYNCED_TABLES
        .into_iter()
        .map(|table| (table, ids(&creator, table)))
        .collect();

    let mut space = FakeSpace::default();
    enroll_as(&creator, SpaceRole::Creator);
    space.drain_backfill(&creator, 100);
    delete_deck(
        &creator,
        DeleteDeckData {
            id: deleted_deck.clone(),
        },
    )
    .expect("deck deletes");
    space.push(&creator);

    let later_algorithm = add_algorithm(&copy, "FSRS later");
    let stored = get_deck(&copy, &deck).expect("deck reads").expect("deck exists");
    update_deck(
        &copy,
        UpdateDeckData {
            id: deck.clone(),
            values: UpdateDeckValues {
                title: stored.title,
                algorithm_id: later_algorithm.clone(),
                template_id: stored.template_id,
                notes: stored.notes,
            },
        },
    )
    .expect("deck updates");
    let added_to_known = add_card(&copy, &deck, &template, "nuevo");
    insert_review_row(&copy, &added_to_known, 2, 0, 1_727_000_000_500);
    let added_review = column(
        &copy,
        &format!("SELECT id FROM reviews WHERE card_id = '{added_to_known}'"),
    )
    .remove(0);
    let later_deck = add_deck(&copy, &algorithm, &template, "Spanish later");
    let later_card = add_card(&copy, &later_deck, &template, "luego");

    space.join_by_add(&copy);
    Copied {
        creator,
        copy,
        space,
        creator_ids,
        deck,
        deleted_deck,
        later_algorithm,
        later_deck,
        later_card,
        dependents: [("cards", added_to_known), ("reviews", added_review)],
    }
}

#[test]
fn add_remints_exactly_the_known_rows_and_their_dependents() {
    let copied = copied();

    for table in SYNCED_TABLES {
        let shared: Vec<String> = ids(&copied.copy, table)
            .into_iter()
            .filter(|id| copied.creator_ids[table].contains(id))
            .collect();
        let expected = match table {
            "algorithms" => vec![SEED_ALGORITHM_SIMPLE_ID.to_string()],
            "templates" => vec![SEED_TEMPLATE_TYPE_ID.to_string()],
            _ => vec![],
        };
        assert_eq!(shared, expected, "{table} the copy shares with the space after Add");
    }
    for (table, id) in &copied.dependents {
        assert!(
            !ids(&copied.copy, table).contains(id),
            "{table} the copy added under a known deck moves with it"
        );
    }
    assert_eq!(
        count(&copied.copy, "SELECT COUNT(*) FROM reviews"),
        2,
        "reviews are reminted, not dropped"
    );
    for (table, id) in [
        ("algorithms", &copied.later_algorithm),
        ("decks", &copied.later_deck),
        ("cards", &copied.later_card),
    ] {
        assert!(
            ids(&copied.copy, table).contains(id),
            "{table} written only on the copy keeps its id"
        );
    }
    assert_eq!(
        count(&copied.copy, "SELECT COUNT(*) FROM decks WHERE title = 'Old'"),
        1,
        "a row the space deleted is reminted, not dropped"
    );
}

#[test]
fn reminted_rows_keep_their_values_and_pointers_follow_them() {
    let copied = copied();
    let (creator, copy) = (&copied.creator, &copied.copy);
    let algorithm = id_titled(copy, "algorithms", "FSRS");
    let template = id_titled(copy, "templates", "Vocabulary");
    let deck = id_titled(copy, "decks", "Spanish");

    assert_eq!(
        row(copy, "templates", &template)[1..],
        row(creator, "templates", &id_titled(creator, "templates", "Vocabulary"))[1..],
        "a reminted template keeps its content, field ids included"
    );

    let deck_pointers = |id: &str| {
        column(
            copy,
            &format!("SELECT algorithm_id || ' ' || template_id FROM decks WHERE id = '{id}'"),
        )
    };
    assert_eq!(
        deck_pointers(&deck),
        [format!("{} {template}", copied.later_algorithm)],
        "a reminted deck keeps an algorithm the space did not know"
    );
    assert_eq!(
        deck_pointers(&copied.later_deck),
        [format!("{algorithm} {template}")],
        "a deck written only on the copy follows reminted referents"
    );
    assert_eq!(
        column(
            copy,
            &format!("SELECT template_id FROM cards WHERE id = '{}'", copied.later_card)
        ),
        [template.as_str()]
    );

    let card = column(copy, "SELECT id FROM cards WHERE content LIKE '%hola%'").remove(0);
    let creator_card = column(creator, "SELECT id FROM cards WHERE content LIKE '%hola%'").remove(0);
    let (copy_row, creator_row) = (row(copy, "cards", &card), row(creator, "cards", &creator_card));
    assert_eq!(
        copy_row[1..3],
        [Value::Text(deck), Value::Text(template.clone())],
        "the card moves with its deck"
    );
    assert_eq!(copy_row[3..], creator_row[3..], "the card keeps every other column");
    assert_eq!(
        column(copy, "SELECT card_id FROM reviews WHERE created_at = 1727000000000"),
        [card],
        "the review follows its card"
    );

    assert_eq!(
        learning(copy)["defaults"],
        json!({ "algorithm": algorithm, "template": template }),
        "the learning defaults follow the reminted algorithm and template"
    );
}

#[test]
fn add_of_a_copy_converges_with_both_versions_of_every_known_row() {
    let mut copied = copied();
    copied.space.drain_backfill(&copied.copy, 4);
    copied.space.pull(&copied.creator);
    copied.space.pull(&copied.copy);

    copied.space.assert_referents_first();
    for table in SYNCED_TABLES {
        assert_eq!(dump(&copied.copy, table), dump(&copied.creator, table), "{table}");
    }
    assert_eq!(
        count(&copied.creator, "SELECT COUNT(*) FROM decks WHERE title = 'Spanish'"),
        2,
        "the creator holds its deck and the copy's"
    );
    let decks = ids(&copied.creator, "decks");
    assert!(decks.contains(&copied.deck));
    assert!(!decks.contains(&copied.deleted_deck), "the deleted deck stays deleted");
}

#[test]
fn add_of_an_unrelated_database_remints_nothing() {
    let creator = seeded_db();
    let algorithm = add_algorithm(&creator, "FSRS");
    add_deck(&creator, &algorithm, SEED_TEMPLATE_TYPE_ID, "Spanish");
    enroll_as(&creator, SpaceRole::Creator);
    let mut space = FakeSpace::default();
    space.drain_backfill(&creator, 100);

    let joiner = seeded_db();
    let template = add_template(&joiner, "Vocabulary");
    let deck = add_deck(&joiner, SEED_ALGORITHM_SIMPLE_ID, &template, "German");
    let card = add_card(&joiner, &deck, &template, "hallo");
    insert_review_row(&joiner, &card, 2, 0, 1_727_000_000_000);
    // WHY: the seed algorithm's local revisions give way to the space's history, so they are left out.
    let joiner_ids = || -> Vec<Vec<String>> {
        SYNCED_TABLES
            .into_iter()
            .map(|table| match table {
                "algorithm_revisions" => column(
                    &joiner,
                    &format!("SELECT id FROM {table} WHERE algorithm_id != '{SEED_ALGORITHM_SIMPLE_ID}' ORDER BY id"),
                ),
                _ => ids(&joiner, table),
            })
            .collect()
    };
    let before = joiner_ids();

    space.join_by_add(&joiner);
    assert_eq!(joiner_ids(), before, "no local id is known to the space");

    space.drain_backfill(&joiner, 100);
    space.pull(&creator);
    space.pull(&joiner);
    space.assert_referents_first();
    for table in SYNCED_TABLES {
        assert_eq!(dump(&joiner, table), dump(&creator, table), "{table}");
    }
    assert_eq!(
        count(&creator, "SELECT COUNT(*) FROM decks"),
        2,
        "both decks reach the creator"
    );
}

#[test]
fn add_leaves_device_local_data_alone() {
    let db = seeded_db();
    let deck = add_deck(&db, SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID, "Spanish");
    let card = add_card(&db, &deck, SEED_TEMPLATE_TYPE_ID, "hola");
    add_conversation(&db, "conversation-1", json!({ "cardIds": [card] }));
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    bytes.resize(16, 0);
    add_attachment(
        &db,
        AddAttachmentData {
            bytes,
            width: NonZeroU32::new(640),
            height: NonZeroU32::new(480),
        },
    )
    .expect("attachment adds");
    let local = |db: &Database| -> Vec<Vec<Vec<Value>>> {
        ["conversations", "attachments", "attachment_bytes"]
            .into_iter()
            .map(|table| dump(db, table))
            .collect()
    };
    let before = local(&db);

    begin_import(&db, Uuid::now_v7(), SPACE).expect("claim records");
    add_to_space(&db, &HashMap::from([(card.clone(), Known::Live)])).expect("file joins through Add");

    assert!(!ids(&db, "cards").contains(&card), "the known card is reminted");
    assert_eq!(local(&db), before, "conversations and attachments are never rewritten");
}

/// A creator that holds both seed rows, with its backfill pushed to the space.
fn seeded_space() -> (Database, FakeSpace) {
    let creator = seeded_db();
    enroll_as(&creator, SpaceRole::Creator);
    let mut space = FakeSpace::default();
    space.drain_backfill(&creator, 100);
    (creator, space)
}

fn drain(db: &Database) -> Vec<OutboxEntry> {
    while backfill_batch(db, 100).expect("backfill batch runs") == Backfill::Pending {}
    outbox(db)
}

fn sole_id(db: &Database, table: &str) -> String {
    let mut ids = ids(db, table);
    assert_eq!(ids.len(), 1, "{table} holds one row");
    ids.remove(0)
}

#[test]
fn an_untouched_seed_file_keeps_seed_rows_at_stamp_zero_and_pushes_nothing() {
    // Covers PROTOCOL.md conformance: Start-fresh-then-Join overlays seeds, and does not push a second initial
    // seed revision.
    let creator = seeded_db();
    rename_seed_algorithm(&creator);
    rename_seed_template(&creator);
    enroll_as(&creator, SpaceRole::Creator);
    let mut space = FakeSpace::default();
    space.drain_backfill(&creator, 100);

    let joiner = seeded_db();
    assert_eq!(join_mode(&joiner, SPACE).unwrap(), JoinMode::UntouchedSeed);
    space.join_by_add(&joiner);

    assert_eq!(ids(&joiner, "algorithms"), [SEED_ALGORITHM_SIMPLE_ID]);
    assert_eq!(ids(&joiner, "templates"), [SEED_TEMPLATE_TYPE_ID]);
    assert!(
        ids(&joiner, "algorithm_revisions").is_empty(),
        "the seed algorithm's local revisions give way to the space's history"
    );
    assert!(drain(&joiner).is_empty(), "a joiner never pushes the seed rows");

    space.pull(&joiner);
    for table in SYNCED_TABLES {
        assert_eq!(dump(&joiner, table), dump(&creator, table), "{table}");
    }
    assert_eq!(
        get_algorithm(&joiner, SEED_ALGORITHM_SIMPLE_ID).unwrap().unwrap().title,
        "Simple tuned",
        "the space's seed create overlays the local row"
    );
}

#[test]
fn an_untouched_seed_file_deletes_a_seed_template_the_space_deleted() {
    // Covers PROTOCOL.md conformance: Start-fresh-then-Join into a space that deleted the seed template.
    let (creator, mut space) = seeded_space();
    let template = add_template(&creator, "Vocabulary");
    set_learning_defaults(&creator, SEED_ALGORITHM_SIMPLE_ID, &template);
    delete_template(
        &creator,
        DeleteTemplateData {
            id: SEED_TEMPLATE_TYPE_ID.to_string(),
        },
    )
    .expect("seed template deletes");
    space.push(&creator);

    let joiner = seeded_db();
    space.join_by_add(&joiner);

    assert!(
        ids(&joiner, "templates").is_empty(),
        "the local seed template is deleted"
    );
    assert!(drain(&joiner).is_empty(), "the seed template is never pushed");
    space.pull(&joiner);
    assert_eq!(ids(&joiner, "templates"), [template]);
}

#[test]
fn add_keeps_an_unmodified_seed_algorithm_and_remints_a_used_seed_template() {
    // Covers PROTOCOL.md conformance: Add keeps an unmodified seed algorithm and remints a used seed template.
    let (creator, mut space) = seeded_space();
    let joiner = seeded_db();
    let deck = add_deck(&joiner, SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID, "German");
    let card = add_card(&joiner, &deck, SEED_TEMPLATE_TYPE_ID, "hallo");

    space.join_by_add(&joiner);

    let template = sole_id(&joiner, "templates");
    assert_ne!(
        template, SEED_TEMPLATE_TYPE_ID,
        "a seed template with local cards is reminted"
    );
    assert_eq!(ids(&joiner, "algorithms"), [SEED_ALGORITHM_SIMPLE_ID]);
    assert_eq!(
        column(
            &joiner,
            &format!("SELECT algorithm_id || ' ' || template_id FROM decks WHERE id = '{deck}'")
        ),
        [format!("{SEED_ALGORITHM_SIMPLE_ID} {template}")]
    );
    assert_eq!(
        column(&joiner, &format!("SELECT template_id FROM cards WHERE id = '{card}'")),
        [template.as_str()]
    );

    space.drain_backfill(&joiner, 100);
    space.pull(&creator);
    space.pull(&joiner);
    space.assert_referents_first();
    for table in SYNCED_TABLES {
        assert_eq!(dump(&joiner, table), dump(&creator, table), "{table}");
    }
    assert_eq!(
        count(&creator, "SELECT COUNT(*) FROM templates WHERE title = 'Basic'"),
        2,
        "the space holds two starter templates"
    );
}

#[test]
fn add_remints_an_unmodified_seed_algorithm_the_space_deleted_only_while_decks_use_it() {
    // Covers PROTOCOL.md conformance: Add with decks on an unmodified seed algorithm the space deleted.
    let (creator, mut space) = seeded_space();
    let algorithm = add_algorithm(&creator, "FSRS");
    set_learning_defaults(&creator, &algorithm, SEED_TEMPLATE_TYPE_ID);
    delete_algorithm(
        &creator,
        DeleteAlgorithmData {
            id: SEED_ALGORITHM_SIMPLE_ID.to_string(),
            successor_id: None,
        },
    )
    .expect("seed algorithm deletes");
    space.push(&creator);

    let used = seeded_db();
    let deck = add_deck(&used, SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID, "German");
    space.join_by_add(&used);
    let reminted = sole_id(&used, "algorithms");
    assert_ne!(reminted, SEED_ALGORITHM_SIMPLE_ID);
    assert_eq!(
        column(&used, &format!("SELECT algorithm_id FROM decks WHERE id = '{deck}'")),
        [reminted.as_str()],
        "the deck follows the reminted seed"
    );
    assert_eq!(
        column(&used, "SELECT algorithm_id FROM algorithm_revisions"),
        [reminted.as_str()],
        "the seed's revision moves with it"
    );

    let unused = seeded_db();
    space.join_by_add(&unused);
    assert!(
        ids(&unused, "algorithms").is_empty(),
        "an unused seed the space deleted is deleted"
    );
    assert!(ids(&unused, "algorithm_revisions").is_empty());

    space.drain_backfill(&used, 100);
    space.pull(&creator);
    space.assert_referents_first();
    assert_eq!(
        column(&creator, &format!("SELECT algorithm_id FROM decks WHERE id = '{deck}'")),
        [reminted.as_str()]
    );
}

#[test]
fn an_edited_seed_algorithm_the_space_holds_is_reminted_with_its_revisions() {
    let (_creator, space) = seeded_space();
    let joiner = seeded_db();
    rename_seed_algorithm(&joiner);
    let revisions = ids(&joiner, "algorithm_revisions");

    space.join_by_add(&joiner);

    let reminted = id_titled(&joiner, "algorithms", "Simple tuned");
    assert_ne!(reminted, SEED_ALGORITHM_SIMPLE_ID);
    let moved = column(
        &joiner,
        &format!("SELECT id FROM algorithm_revisions WHERE algorithm_id = '{reminted}'"),
    );
    assert_eq!(moved.len(), revisions.len(), "every revision moves with the algorithm");
    assert!(
        moved.iter().all(|id| !revisions.contains(id)),
        "the revisions are reminted too"
    );
    assert_eq!(learning(&joiner)["defaults"]["algorithm"], json!(reminted));
}
