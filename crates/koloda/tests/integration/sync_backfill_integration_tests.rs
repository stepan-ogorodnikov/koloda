//! Backfill of rows written before enrollment (`crates/koloda-sync-proto/PROTOCOL.md` §Existing rows at enable
//! time, §Backfill).

use std::collections::HashMap;

use koloda::app::db::Database;
use koloda::domain::algorithms::{DeleteAlgorithmData, UpdateAlgorithmData, UpdateAlgorithmValues};
use koloda::domain::cards::{UpdateCardData, UpdateCardProgress, UpdateCardValues};
use koloda::domain::decks::{DeleteDeckData, UpdateDeckData, UpdateDeckValues};
use koloda::domain::lessons::LessonResultData;
use koloda::domain::reviews::InsertReviewData;
use koloda::domain::seed_ids::{SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID};
use koloda::domain::settings::SettingsName;
use koloda::repo::algorithms::{delete_algorithm, get_algorithm, update_algorithm};
use koloda::repo::cards::{get_card, update_card};
use koloda::repo::decks::{delete_deck, get_deck, update_deck};
use koloda::repo::lessons::submit_lesson_result;
use koloda::repo::settings::{get_settings, set_settings};
use koloda::repo::sync::backfill::{backfill_batch, Backfill};
use koloda::repo::sync::SpaceRole;
use koloda_sync_proto::payload::{self as wire, Payload};
use koloda_sync_proto::registry::{Group, Kind};
use rusqlite::types::Value;
use serde_json::json;
use uuid::Uuid;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use crate::common::sync::{
    apply, count, enroll_as, hot_page, last_hlc, outbox, register, sealed, seeded_replica, stamp, FakeSpace,
    OutboxEntry,
};
use crate::common::{card_content, fsrs_algorithm_content, seed_data, test_db};

const SYNCED_TABLES: [&str; 5] = ["algorithms", "algorithm_revisions", "templates", "decks", "cards"];

struct Legacy {
    algorithm: String,
    template: String,
    deck: String,
    card: String,
}

fn seeded_db() -> Database {
    let db = test_db();
    koloda::app::init::seed_db(&db, seed_data("Simple", "Basic")).expect("test database seeds");
    db
}

/// A seeded database whose custom rows and learning settings were all written before it created the space.
fn legacy_creator() -> (Database, Legacy) {
    let db = seeded_db();
    let legacy = legacy_rows(&db);
    enroll_as(&db, SpaceRole::Creator);
    (db, legacy)
}

/// Edits every row once, so each carries a legacy `updated_at` and the algorithm has two revisions.
fn legacy_rows(db: &Database) -> Legacy {
    let algorithm = add_algorithm(db, "FSRS");
    let mut parameters = serde_json::to_value(fsrs_algorithm_content()).expect("parameters serialize");
    parameters
        .as_object_mut()
        .expect("parameters are an object")
        .insert("retention".to_string(), json!(85.0));
    update_algorithm(
        db,
        UpdateAlgorithmData {
            id: algorithm.clone(),
            values: UpdateAlgorithmValues {
                title: "FSRS tuned".to_string(),
                content: serde_json::from_value(parameters).expect("parameters deserialize"),
                notes: Some("for Spanish".to_string()),
            },
        },
    )
    .expect("algorithm updates");

    let template = add_template(db, "Vocabulary");
    let deck = add_deck(db, &algorithm, &template, "Spanish");
    let stored = get_deck(db, &deck).expect("deck reads").expect("deck exists");
    update_deck(
        db,
        UpdateDeckData {
            id: deck.clone(),
            values: UpdateDeckValues {
                title: stored.title,
                algorithm_id: stored.algorithm_id,
                template_id: stored.template_id,
                notes: Some("verbs first".to_string()),
            },
        },
    )
    .expect("deck updates");

    let card = add_card(db, &deck, &template, "hola");
    update_card(
        db,
        UpdateCardData {
            id: card.clone(),
            values: UpdateCardValues {
                content: card_content("hola", "hello"),
            },
        },
    )
    .expect("card updates");
    add_card(db, &deck, SEED_TEMPLATE_TYPE_ID, "adiós");

    set_learning(db, &algorithm, &template);
    Legacy {
        algorithm,
        template,
        deck,
        card,
    }
}

fn set_learning(db: &Database, algorithm: &str, template: &str) {
    let mut learning = learning(db);
    for (pointer, value) in [
        ("/defaults/algorithm", json!(algorithm)),
        ("/defaults/template", json!(template)),
        ("/dayStartsAt", json!("06:00")),
    ] {
        *learning.pointer_mut(pointer).expect("learning settings hold the key") = value;
    }
    set_settings(db, SettingsName::Learning, learning).expect("learning settings save");
}

fn learning(db: &Database) -> serde_json::Value {
    get_settings(db, SettingsName::Learning)
        .expect("learning settings read")
        .expect("learning settings exist")
        .content
}

/// A seeded joiner after a seed-only join: its starter rows stay at stamp zero, and the seed algorithm's local
/// revisions are gone because the space's history replaces them (PROTOCOL.md, Joining).
fn joiner() -> Database {
    let db = seeded_replica();
    db.with_conn(|conn| {
        conn.execute(
            "DELETE FROM algorithm_revisions WHERE algorithm_id = ?1",
            [SEED_ALGORITHM_SIMPLE_ID],
        )?;
        Ok(())
    })
    .expect("seed revisions delete");
    db
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

fn ids(db: &Database, table: &str) -> Vec<String> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(&format!("SELECT id FROM {table} ORDER BY id"))?;
        let ids = stmt.query_map([], |row| row.get(0))?.collect::<Result<Vec<_>, _>>()?;
        Ok(ids)
    })
    .expect("ids read")
}

fn drain(db: &Database, max_envelopes: usize) -> Vec<OutboxEntry> {
    while backfill_batch(db, max_envelopes).expect("backfill batch runs") == Backfill::Pending {}
    outbox(db)
}

fn target(entry: &OutboxEntry) -> (Kind, String) {
    (entry.envelope.header.kind, entry.envelope.header.id.clone())
}

#[test]
fn a_joiner_converges_on_every_row_and_learning_setting_the_creator_held_before_enrolling() {
    let (creator, legacy) = legacy_creator();
    let joiner = joiner();
    let mut space = FakeSpace::default();

    space.drain_backfill(&creator, 100);
    space.assert_referents_first();
    space.pull(&joiner);

    let deck = get_deck(&creator, &legacy.deck).unwrap().unwrap();
    assert!(deck.updated_at.is_some(), "the fixture holds a legacy updated_at");
    for table in SYNCED_TABLES {
        assert_eq!(dump(&joiner, table), dump(&creator, table), "{table}");
    }
    assert_eq!(learning(&joiner), learning(&creator));
    assert_eq!(
        get_algorithm(&joiner, &legacy.algorithm).unwrap().unwrap().title,
        "FSRS tuned"
    );
}

#[test]
fn batches_enqueue_in_scan_order_and_never_split_an_entity() {
    let (creator, legacy) = legacy_creator();

    let entries = drain(&creator, 2);

    let mut expected: Vec<(Kind, String)> = Vec::new();
    for (kind, table, envelopes) in [
        (Kind::Algorithms, "algorithms", 1),
        (Kind::AlgorithmRevisions, "algorithm_revisions", 1),
        (Kind::Templates, "templates", 1),
        (Kind::Decks, "decks", 3),
        (Kind::Cards, "cards", 1),
    ] {
        for id in ids(&creator, table) {
            expected.extend(std::iter::repeat_n((kind, id), envelopes));
        }
    }
    expected.extend(std::iter::repeat_n((Kind::SettingsLearning, "learning".to_string()), 5));
    assert_eq!(entries.iter().map(target).collect::<Vec<_>>(), expected);

    let mut commits: HashMap<[u8; 16], Vec<(Kind, String)>> = HashMap::new();
    for entry in &entries {
        commits
            .entry(entry.envelope.header.commit_id)
            .or_default()
            .push(target(entry));
    }
    for members in commits.values() {
        let is_one_entity = members.windows(2).all(|pair| pair.first() == pair.last());
        assert!(
            members.len() <= 2 || is_one_entity,
            "a batch overran its budget: {members:?}"
        );
    }
    let deck_commits = entries
        .iter()
        .filter(|entry| entry.envelope.header.id == legacy.deck)
        .map(|entry| entry.envelope.header.commit_id)
        .collect::<std::collections::HashSet<_>>();
    assert_eq!(deck_commits.len(), 1, "a deck's create and pointers share one batch");
}

#[test]
fn enrollment_reserves_increasing_backfill_stamps_below_every_later_write() {
    let (creator, _) = legacy_creator();
    let reserved = |column: &str| count(&creator, &format!("SELECT {column} FROM sync_state WHERE id = 1"));
    let (create, review, scheduling) = (
        reserved("backfill_create_hlc"),
        reserved("backfill_review_hlc"),
        reserved("backfill_scheduling_hlc"),
    );
    assert!(create < review && review < scheduling, "phases are stamped in order");
    assert_eq!(i64::try_from(last_hlc(&creator).raw()).unwrap(), scheduling);

    let later = add_algorithm(&creator, "Later");
    let entries = drain(&creator, 100);

    for entry in &entries {
        let hlc = i64::try_from(entry.envelope.header.stamp.hlc.raw()).unwrap();
        let is_later = entry.envelope.header.id == later
            || matches!(&entry.payload, Payload::AlgorithmRevision(revision) if revision.algorithm_id == later);
        if is_later {
            assert!(
                hlc > scheduling,
                "a write after enrollment sorts after every backfill phase"
            );
        } else {
            assert_eq!(
                hlc,
                create,
                "{:?} is backfilled at the create phase stamp",
                target(entry)
            );
        }
    }
}

#[test]
fn a_joiner_backfills_its_own_rows_but_not_seed_rows_seed_revisions_or_learning() {
    // Covers PROTOCOL.md conformance: Start-fresh-then-Join does not push a second initial seed revision.
    let db = seeded_db();
    let legacy = legacy_rows(&db);
    enroll_as(&db, SpaceRole::Joiner);

    let entries = drain(&db, 100);

    for id in [&legacy.algorithm, &legacy.template, &legacy.deck] {
        assert!(
            entries.iter().any(|entry| &entry.envelope.header.id == id),
            "{id} is backfilled"
        );
    }
    for entry in &entries {
        let header = &entry.envelope.header;
        assert!(
            header.id != SEED_ALGORITHM_SIMPLE_ID && header.id != SEED_TEMPLATE_TYPE_ID,
            "a seed row is backfilled: {header:?}"
        );
        assert_ne!(header.kind, Kind::SettingsLearning, "a joiner backfills learning");
        if let Payload::AlgorithmRevision(revision) = &entry.payload {
            assert_ne!(
                revision.algorithm_id, SEED_ALGORITHM_SIMPLE_ID,
                "a seed revision is backfilled"
            );
        }
    }
}

#[test]
fn a_space_created_after_its_device_deleted_the_seed_algorithm_moves_a_joiners_default_off_the_seed_id() {
    // Covers PROTOCOL.md conformance: Space created after its device deleted the seed algorithm.
    let creator = seeded_db();
    let algorithm = add_algorithm(&creator, "FSRS");
    set_learning(&creator, &algorithm, SEED_TEMPLATE_TYPE_ID);
    delete_algorithm(
        &creator,
        DeleteAlgorithmData {
            id: SEED_ALGORITHM_SIMPLE_ID.to_string(),
            successor_id: None,
        },
    )
    .unwrap();
    enroll_as(&creator, SpaceRole::Creator);
    let joiner = joiner();
    let mut space = FakeSpace::default();

    space.drain_backfill(&creator, 100);
    space.pull(&joiner);

    assert_eq!(
        learning(&joiner).pointer("/defaults/algorithm"),
        Some(&json!(algorithm))
    );
}

#[test]
fn the_scan_keeps_registers_that_remote_writes_set_on_a_legacy_row() {
    // WHY: only a copy that skipped the join's remint receives remote writes for a row it never pushed. The scan
    // must not demote those heads to its older reserved stamp.
    let (creator, legacy) = legacy_creator();
    let remote = Uuid::now_v7();
    let writes = [
        Payload::DeckTitle(wire::Title {
            title: "Remote".to_string(),
            updated_at: Some(1_900_000_000_000),
        }),
        Payload::DeckAlgorithm(wire::DeckAlgorithm {
            algorithm_id: SEED_ALGORITHM_SIMPLE_ID.to_string(),
            updated_at: None,
        }),
    ];
    let envelopes = writes
        .iter()
        .map(|payload| sealed(&legacy.deck, None, stamp(remote, 1_900_000_000_000), payload))
        .collect();
    apply(&creator, &hot_page(remote, envelopes, 2)).unwrap();

    let entries = drain(&creator, 100);

    let deck_groups: Vec<_> = entries
        .iter()
        .filter(|entry| entry.envelope.header.id == legacy.deck)
        .map(|entry| entry.envelope.header.group)
        .collect();
    assert_eq!(deck_groups, [Some(Group::Create), Some(Group::Template)]);
    for group in ["title", "algorithm"] {
        let register = register(&creator, "decks", &legacy.deck, group).unwrap();
        assert_eq!(register.sender, remote, "{group}");
        assert!(!register.is_synthetic, "{group}");
    }
}

fn grade(db: &Database, card: &str) {
    submit_lesson_result(
        db,
        LessonResultData {
            card: UpdateCardProgress {
                id: card.to_string(),
                state: 2,
                due_at: 1_900_000_000_000,
                stability: 5.5,
                difficulty: 4.25,
                scheduled_days: 7,
                learning_steps: 0,
                reps: 1,
                lapses: 0,
                last_reviewed_at: Some(1_800_000_000_000),
            },
            review: InsertReviewData {
                card_id: card.to_string(),
                rating: 3,
                state: 2,
                due_at: 1_900_000_000_000,
                stability: 5.5,
                difficulty: 4.25,
                scheduled_days: 7,
                learning_steps: 0,
                time: 12,
                is_ignored: false,
            },
        },
    )
    .expect("grade submits");
}

fn writes(entries: &[OutboxEntry]) -> Vec<(Kind, Option<Group>, String)> {
    entries
        .iter()
        .map(|entry| {
            let header = &entry.envelope.header;
            (header.kind, header.group, header.id.clone())
        })
        .collect()
}

/// The envelopes that backfill the legacy deck and the algorithm and template it points at.
fn deck_backfill(legacy: &Legacy) -> Vec<(Kind, Option<Group>, String)> {
    vec![
        (Kind::Algorithms, Some(Group::Create), legacy.algorithm.clone()),
        (Kind::Templates, Some(Group::Create), legacy.template.clone()),
        (Kind::Decks, Some(Group::Create), legacy.deck.clone()),
        (Kind::Decks, Some(Group::Algorithm), legacy.deck.clone()),
        (Kind::Decks, Some(Group::Template), legacy.deck.clone()),
    ]
}

#[test]
fn a_card_added_to_a_legacy_deck_backfills_its_referents_first_and_the_scan_skips_them() {
    // Covers PROTOCOL.md conformance: Card create before referent backfill.
    let (creator, legacy) = legacy_creator();
    let joiner = joiner();
    let mut space = FakeSpace::default();

    let card = add_card(&creator, &legacy.deck, &legacy.template, "nuevo");

    let mut expected = deck_backfill(&legacy);
    expected.push((Kind::Cards, Some(Group::Create), card.clone()));
    assert_eq!(writes(&outbox(&creator)), expected);

    space.push(&creator);
    space.pull(&joiner);
    assert!(
        get_card(&joiner, &card).unwrap().is_some(),
        "the joiner holds the new card"
    );

    let scanned = drain(&creator, 100);
    for written in &expected {
        assert!(!writes(&scanned).contains(written), "{written:?} is backfilled twice");
    }
    space.push(&creator);
    space.assert_referents_first();
}

#[test]
fn an_edit_or_grade_of_a_legacy_card_backfills_the_card_before_the_write() {
    for is_grade in [false, true] {
        let (creator, legacy) = legacy_creator();

        if is_grade {
            grade(&creator, &legacy.card);
        } else {
            update_card(
                &creator,
                UpdateCardData {
                    id: legacy.card.clone(),
                    values: UpdateCardValues {
                        content: card_content("hola", "hi"),
                    },
                },
            )
            .unwrap();
        }

        let entries = outbox(&creator);
        let mut expected = deck_backfill(&legacy);
        expected.push((Kind::Cards, Some(Group::Create), legacy.card.clone()));
        if is_grade {
            expected.push((Kind::Cards, Some(Group::Scheduling), legacy.card.clone()));
            let review = entries
                .last()
                .expect("the review is pending")
                .envelope
                .header
                .id
                .clone();
            expected.push((Kind::Reviews, Some(Group::Row), review));
        } else {
            expected.push((Kind::Cards, Some(Group::Content), legacy.card.clone()));
        }
        assert_eq!(writes(&entries), expected, "grade: {is_grade}");
        let commits: std::collections::HashSet<_> =
            entries.iter().map(|entry| entry.envelope.header.commit_id).collect();
        assert_eq!(
            commits.len(),
            1,
            "the backfill joins the write's commit; grade: {is_grade}"
        );
    }
}

#[test]
fn a_learning_default_switched_to_a_legacy_algorithm_backfills_that_algorithm_first() {
    let creator = seeded_db();
    let legacy = legacy_rows(&creator);
    let other = add_algorithm(&creator, "Other");
    enroll_as(&creator, SpaceRole::Creator);

    set_learning(&creator, &other, &legacy.template);

    assert_eq!(
        writes(&outbox(&creator)),
        [
            (Kind::Algorithms, Some(Group::Create), other),
            (
                Kind::SettingsLearning,
                Some(Group::DefaultsAlgorithm),
                "learning".to_string()
            ),
        ]
    );
}

#[test]
fn deleting_a_legacy_deck_enqueues_only_its_tombstone_and_the_scan_finds_none_of_its_cards() {
    let (creator, legacy) = legacy_creator();

    delete_deck(
        &creator,
        DeleteDeckData {
            id: legacy.deck.clone(),
        },
    )
    .unwrap();

    assert_eq!(writes(&outbox(&creator)), [(Kind::Decks, None, legacy.deck.clone())]);
    let scanned = drain(&creator, 100);
    assert!(
        scanned
            .iter()
            .all(|entry| !matches!(entry.envelope.header.kind, Kind::Decks | Kind::Cards)
                || entry.envelope.header.group.is_none()),
        "nothing of the deleted deck is backfilled"
    );
}

#[test]
fn a_joiners_edit_of_a_stamp_zero_seed_algorithm_enqueues_only_the_edit() {
    let joiner = seeded_db();
    enroll_as(&joiner, SpaceRole::Joiner);
    let seed = get_algorithm(&joiner, SEED_ALGORITHM_SIMPLE_ID).unwrap().unwrap();

    update_algorithm(
        &joiner,
        UpdateAlgorithmData {
            id: seed.id.clone(),
            values: UpdateAlgorithmValues {
                title: "Simple, renamed".to_string(),
                content: seed.content,
                notes: seed.notes,
            },
        },
    )
    .unwrap();

    assert_eq!(
        writes(&outbox(&joiner)),
        [(Kind::Algorithms, Some(Group::Title), seed.id)]
    );
}
