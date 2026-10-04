use koloda::app::db::Database;
use koloda::domain::cards::{DeleteCardData, UpdateCardData, UpdateCardProgress, UpdateCardValues};
use koloda::domain::decks::DeleteDeckData;
use koloda::domain::lessons::LessonResultData;
use koloda::domain::reviews::InsertReviewData;
use koloda::repo::cards::{delete_card, get_card, update_card};
use koloda::repo::decks::{delete_deck, get_deck};
use koloda::repo::lessons::submit_lesson_result;

use koloda_sync_proto::payload::{DeckCreate, Delete, InitialProductTs, Payload, Title};
use koloda_sync_proto::registry::Kind;
use uuid::Uuid;

use crate::common::card_content;
use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use crate::common::sync::{apply, count, hot_page, mark_in_flight, replica, sealed, stamp, FakeSpace};

const NEW_MS: u64 = 4_000_000_000_000;
const DECK: &str = "01920000-0000-7000-8000-0000000000d1";

fn deck_delete() -> Payload {
    Payload::Delete {
        kind: Kind::Decks,
        delete: Delete { successor: None },
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
                scheduled_days: 3,
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
                scheduled_days: 3,
                learning_steps: 0,
                time: 12,
                is_ignored: false,
            },
        },
    )
    .expect("grade submits");
}

fn sync_rows(db: &Database, kind: &str, id: &str) -> i64 {
    db.with_conn(|conn| {
        Ok(conn.query_row(
            r#"
            SELECT (SELECT COUNT(*) FROM sync_stamps WHERE kind = ?1 AND id = ?2)
                 + (SELECT COUNT(*) FROM sync_origins WHERE kind = ?1 AND id = ?2)
            "#,
            rusqlite::params![kind, id],
            |row| row.get(0),
        )?)
    })
    .expect("sync rows count")
}

#[test]
fn a_deck_deleted_on_one_replica_wins_over_cards_added_and_edited_on_the_other() {
    for is_edit_pushed_first in [true, false] {
        let (a, b) = (replica(), replica());
        let algorithm = add_algorithm(&a, "FSRS");
        let template = add_template(&a, "Basic");
        let deck = add_deck(&a, &algorithm, &template, "Spanish");
        let edited = add_card(&a, &deck, &template, "hola");
        let mut space = FakeSpace::default();
        space.push(&a);
        space.pull(&b);

        delete_deck(&a, DeleteDeckData { id: deck.clone() }).unwrap();
        let added = add_card(&b, &deck, &template, "adiós");
        update_card(
            &b,
            UpdateCardData {
                id: edited.clone(),
                values: UpdateCardValues {
                    content: card_content("hola", "hello"),
                },
            },
        )
        .unwrap();

        if is_edit_pushed_first {
            space.push(&b);
            space.pull(&a);
            space.push(&a);
            space.pull(&b);
        } else {
            space.push(&a);
            space.pull(&b);
            space.push(&b);
            space.pull(&a);
        }

        for (name, db) in [("A", &a), ("B", &b)] {
            let case = format!("replica {name}, edit pushed first: {is_edit_pushed_first}");
            assert!(get_deck(db, &deck).unwrap().is_none(), "{case}");
            assert!(get_card(db, &edited).unwrap().is_none(), "{case}");
            assert!(get_card(db, &added).unwrap().is_none(), "{case}");
            assert_eq!(
                count(db, "SELECT COUNT(*) FROM sync_outbox WHERE kind = 'cards'"),
                0,
                "{case}"
            );
        }
    }
}

#[test]
fn a_remote_card_delete_takes_its_reviews_and_their_bookkeeping() {
    let (a, b) = (replica(), replica());
    let algorithm = add_algorithm(&a, "FSRS");
    let template = add_template(&a, "Basic");
    let deck = add_deck(&a, &algorithm, &template, "Spanish");
    let card = add_card(&a, &deck, &template, "hola");
    grade(&a, &card);
    let mut space = FakeSpace::default();
    space.push(&a);
    space.pull(&b);
    let review: String = b
        .with_conn(|conn| Ok(conn.query_row("SELECT id FROM reviews", [], |row| row.get(0))?))
        .unwrap();
    assert_eq!(sync_rows(&b, "reviews", &review), 1);

    delete_card(&a, DeleteCardData { id: card.clone() }).unwrap();
    space.push(&a);
    let changed = space.pull(&b);

    assert!(get_card(&b, &card).unwrap().is_none());
    assert_eq!(count(&b, "SELECT COUNT(*) FROM reviews"), 0);
    assert_eq!(sync_rows(&b, "cards", &card), 0);
    assert_eq!(sync_rows(&b, "reviews", &review), 0);
    assert!(changed.contains(&Kind::Cards) && changed.contains(&Kind::Reviews));
}

#[test]
fn a_tombstone_for_an_unknown_id_fences_its_later_writes() {
    let b = replica();
    add_algorithm(&b, "FSRS");
    add_template(&b, "Basic");
    let remote = Uuid::now_v7();
    let create = Payload::DeckCreate(DeckCreate {
        title: "Too late".to_string(),
        notes: None,
        created_at: 1,
        initial_product_ts: InitialProductTs::new(),
        legacy_product_ts_floor: None,
    });
    let rename = Payload::DeckTitle(Title {
        title: "Renamed".to_string(),
        updated_at: None,
    });

    apply(
        &b,
        &hot_page(
            remote,
            vec![sealed(DECK, None, stamp(remote, NEW_MS), &deck_delete())],
            1,
        ),
    )
    .unwrap();
    let changed = apply(
        &b,
        &hot_page(
            remote,
            vec![
                sealed(DECK, None, stamp(remote, NEW_MS + 1), &create),
                sealed(DECK, None, stamp(remote, NEW_MS + 2), &rename),
            ],
            3,
        ),
    )
    .unwrap();

    assert!(changed.is_empty());
    assert!(get_deck(&b, DECK).unwrap().is_none());
    assert_eq!(
        count(&b, &format!("SELECT COUNT(*) FROM sync_tombstones WHERE id = '{DECK}'")),
        1
    );
}

#[test]
fn a_remote_tombstone_drops_pending_local_writes_under_it_but_not_in_flight_ones() {
    for is_in_flight in [false, true] {
        let b = replica();
        let algorithm = add_algorithm(&b, "FSRS");
        let template = add_template(&b, "Basic");
        let deck = add_deck(&b, &algorithm, &template, "Spanish");
        add_card(&b, &deck, &template, "hola");
        if is_in_flight {
            mark_in_flight(&b);
        }
        let under_deck = "SELECT COUNT(*) FROM sync_outbox WHERE kind IN ('decks', 'cards')";
        let others = "SELECT COUNT(*) FROM sync_outbox WHERE kind NOT IN ('decks', 'cards')";
        let (before_under, before_others) = (count(&b, under_deck), count(&b, others));
        assert!(before_under > 0 && before_others > 0);

        let remote = Uuid::now_v7();
        apply(
            &b,
            &hot_page(
                remote,
                vec![sealed(&deck, None, stamp(remote, NEW_MS), &deck_delete())],
                1,
            ),
        )
        .unwrap();

        let case = format!("in flight: {is_in_flight}");
        let expected_under = if is_in_flight { before_under } else { 0 };
        assert_eq!(count(&b, under_deck), expected_under, "{case}");
        assert_eq!(count(&b, others), before_others, "{case}");
        assert_eq!(
            count(
                &b,
                "SELECT COUNT(*) FROM sync_cohorts WHERE commit_id NOT IN (SELECT commit_id FROM sync_outbox)"
            ),
            0,
            "{case}: no cohort outlives its rows"
        );
        assert!(get_deck(&b, &deck).unwrap().is_none(), "{case}");
    }
}
