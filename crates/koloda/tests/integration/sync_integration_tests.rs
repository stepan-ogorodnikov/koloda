use koloda::app::db::Database;
use koloda::app::error::AppError;
use koloda::repo::sync::{self, capture::Capture, SpaceRole};
use koloda_sync_proto::payload::{
    CardCreate, CardScheduling, DeckCreate, InitialProductTs, Notes, Payload, Review, Title,
};
use koloda_sync_proto::registry::Kind;
use uuid::Uuid;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template, insert_review_row};
use crate::common::sync::{count, enroll, outbox, register, SPACE};
use crate::common::test_db;

const DECK: &str = "01920000-0000-7000-8000-0000000000d1";

fn title(text: &str, updated_at: i64) -> Payload {
    Payload::DeckTitle(Title {
        title: text.to_string(),
        updated_at: Some(updated_at),
    })
}

fn capture(db: &Database, writes: impl FnOnce(&mut Capture<'_>) -> Result<(), AppError>) {
    db.with_transaction(|tx| {
        let mut capture = Capture::begin(tx)?;
        writes(&mut capture)
    })
    .expect("capture commit succeeds");
}

fn card_create(deck_id: &str, template_id: &str) -> Payload {
    Payload::CardCreate(CardCreate {
        deck_id: deck_id.to_string(),
        template_id: template_id.to_string(),
        content: "{}".to_string(),
        scheduling: CardScheduling {
            state: 0,
            due_at: None,
            stability: 0.0,
            difficulty: 0.0,
            scheduled_days: 0,
            learning_steps: 0,
            reps: 0,
            lapses: 0,
            last_reviewed_at: None,
        },
        created_at: 1_727_000_000_000,
        initial_product_ts: InitialProductTs::from([("content".to_string(), 1_727_000_000_500)]),
        legacy_product_ts_floor: Some(1_726_000_000_000),
    })
}

#[test]
fn enrollment_records_one_device_and_refuses_a_second() {
    let db = test_db();
    assert_eq!(sync::enrolled_device(&db).unwrap(), None);

    let device = Uuid::now_v7();
    sync::enroll_device(&db, device, SPACE, SpaceRole::Joiner).unwrap();
    assert_eq!(sync::enrolled_device(&db).unwrap(), Some(device));

    let second = sync::enroll_device(&db, Uuid::now_v7(), SPACE, SpaceRole::Joiner);
    assert_eq!(second.unwrap_err().code, "db.add");
    assert_eq!(
        sync::enrolled_device(&db).unwrap(),
        Some(device),
        "a second enrollment must not replace the device"
    );
}

#[test]
fn a_database_that_is_not_enrolled_records_nothing() {
    let db = test_db();
    capture(&db, |capture| {
        capture.write(DECK, None, &title("Spanish", 1))?;
        capture.delete(Kind::Decks, DECK, None, None)
    });

    for table in [
        "sync_outbox",
        "sync_stamps",
        "sync_origins",
        "sync_cohorts",
        "sync_tombstones",
    ] {
        assert_eq!(count(&db, &format!("SELECT COUNT(*) FROM {table}")), 0, "{table}");
    }
}

#[test]
fn a_commit_shares_one_stamp_and_commit_id_in_sender_order() {
    let db = test_db();
    let device = enroll(&db);

    capture(&db, |capture| {
        capture.write(DECK, None, &title("Spanish", 10))?;
        capture.write(
            DECK,
            None,
            &Payload::DeckNotes(Notes {
                notes: Some("verbs".to_string()),
                updated_at: Some(11),
            }),
        )
    });

    let entries = outbox(&db);
    assert_eq!(entries.iter().map(|entry| entry.sender_seq).collect::<Vec<_>>(), [1, 2]);
    let [first, second] = [&entries[0].envelope.header, &entries[1].envelope.header];
    assert_eq!(first.stamp, second.stamp);
    assert_eq!(first.commit_id, second.commit_id);
    assert_eq!(first.stamp.device.0, *device.as_bytes());

    let title_register = register(&db, "decks", DECK, "title").unwrap();
    assert_eq!(title_register.hlc, first.stamp.hlc);
    assert_eq!((title_register.sender_seq, title_register.product_ts), (1, Some(10)));
    assert!(!title_register.is_synthetic);
    assert_eq!(register(&db, "decks", DECK, "notes").unwrap().product_ts, Some(11));

    assert_eq!(count(&db, "SELECT COUNT(*) FROM sync_cohorts WHERE state = 'local'"), 1);
    assert_eq!(count(&db, "SELECT next_sender_seq FROM sync_state"), 3);
    assert_eq!(
        u64::try_from(count(&db, "SELECT last_hlc FROM sync_state")).unwrap(),
        first.stamp.hlc.raw()
    );
}

#[test]
fn every_commit_ticks_a_later_stamp() {
    let db = test_db();
    enroll(&db);

    capture(&db, |capture| capture.write(DECK, None, &title("one", 1)));
    capture(&db, |capture| {
        capture.write("01920000-0000-7000-8000-0000000000d2", None, &title("two", 2))
    });

    let entries = outbox(&db);
    assert!(entries[1].envelope.header.stamp > entries[0].envelope.header.stamp);
    assert_ne!(
        entries[1].envelope.header.commit_id,
        entries[0].envelope.header.commit_id
    );
}

#[test]
fn a_newer_write_replaces_the_pending_row_of_its_group_at_the_tail() {
    let db = test_db();
    enroll(&db);

    capture(&db, |capture| capture.write(DECK, None, &title("first", 1)));
    capture(&db, |capture| capture.write(DECK, None, &title("second", 2)));

    let entries = outbox(&db);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].sender_seq, 2);
    assert_eq!(entries[0].payload, title("second", 2));
    assert_eq!(
        count(&db, "SELECT COUNT(*) FROM sync_cohorts"),
        1,
        "the emptied cohort is removed"
    );

    db.with_conn(|conn| Ok(conn.execute("UPDATE sync_outbox SET in_flight = 1", [])?))
        .unwrap();
    capture(&db, |capture| capture.write(DECK, None, &title("third", 3)));
    let entries = outbox(&db);
    assert_eq!(entries.iter().map(|entry| entry.sender_seq).collect::<Vec<_>>(), [2, 3]);
    assert!(entries[0].in_flight, "an in-flight row is never replaced");
}

#[test]
fn a_create_records_its_origin_and_synthetic_registers_for_every_update_group() {
    let db = test_db();
    enroll(&db);
    let card = "01920000-0000-7000-8000-0000000000c1";

    capture(&db, |capture| {
        capture.write(card, None, &card_create(DECK, "01920000-0000-7000-8000-0000000000e1"))
    });

    let stamp = outbox(&db)[0].envelope.header.stamp;
    let floor = count(
        &db,
        "SELECT legacy_product_ts_floor FROM sync_origins WHERE kind = 'cards' AND group_name = 'create'",
    );
    assert_eq!(floor, 1_726_000_000_000);

    for (group, product_ts) in [
        ("content", Some(1_727_000_000_500)),
        ("scheduling", None),
        ("reset", None),
    ] {
        let register = register(&db, "cards", card, group).unwrap_or_else(|| panic!("{group} register"));
        assert!(register.is_synthetic, "{group}");
        assert_eq!(register.hlc, stamp.hlc, "{group}");
        assert_eq!(register.product_ts, product_ts, "{group}");
    }
}

#[test]
fn a_delete_records_a_tombstone_and_forgets_its_descendants() {
    let db = test_db();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    let card = add_card(&db, &deck, &template, "hola");
    insert_review_row(&db, &card, 2, 0, 1_727_000_000_000);
    let review = db
        .with_conn(|conn| Ok(conn.query_row("SELECT id FROM reviews", [], |row| row.get::<_, String>(0))?))
        .unwrap();
    enroll(&db);

    capture(&db, |capture| {
        capture.write(
            &deck,
            None,
            &Payload::DeckCreate(DeckCreate {
                title: "Spanish".to_string(),
                notes: None,
                created_at: 1,
                initial_product_ts: InitialProductTs::new(),
                legacy_product_ts_floor: None,
            }),
        )?;
        capture.write(&card, None, &card_create(&deck, &template))?;
        capture.write(
            &review,
            None,
            &Payload::Review(Review {
                card_id: card.clone(),
                rating: 3,
                state: 2,
                due_at: 2,
                stability: 1.0,
                difficulty: 5.0,
                scheduled_days: 0,
                learning_steps: 0,
                time: 10,
                is_ignored: false,
                created_at: 1_727_000_000_000,
            }),
        )
    });
    capture(&db, |capture| capture.delete(Kind::Decks, &deck, None, None));

    assert_eq!(
        count(&db, "SELECT COUNT(*) FROM sync_tombstones WHERE kind = 'decks'"),
        1
    );
    let subtree = "kind IN ('decks', 'cards', 'reviews')";
    assert_eq!(
        count(&db, &format!("SELECT COUNT(*) FROM sync_stamps WHERE {subtree}")),
        0
    );
    assert_eq!(
        count(&db, &format!("SELECT COUNT(*) FROM sync_origins WHERE {subtree}")),
        0
    );

    let entries = outbox(&db);
    assert_eq!(entries.len(), 4, "pending creates stay queued ahead of the tombstone");
    assert_eq!(
        entries[3].payload,
        Payload::Delete {
            kind: Kind::Decks,
            delete: koloda_sync_proto::payload::Delete { successor: None },
        }
    );
}
