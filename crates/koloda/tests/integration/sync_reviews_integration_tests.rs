use koloda::app::db::Database;
use koloda::domain::cards::{CardState, UpdateCardProgress};
use koloda::domain::lessons::LessonResultData;
use koloda::domain::reviews::InsertReviewData;
use koloda::repo::cards::get_card;
use koloda::repo::lessons::submit_lesson_result;

use koloda_sync_proto::hlc::Stamp;
use koloda_sync_proto::payload::{CardCreate, CardReset, CardScheduling, InitialProductTs, Payload, Review};
use koloda_sync_proto::registry::Lane;
use uuid::Uuid;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use crate::common::sync::{apply, count, hot_page, page, register, replica, sealed, stamp};

const NEW_MS: u64 = 4_000_000_000_000;

struct Fixture {
    db: Database,
    deck: String,
    card: String,
}

fn local_card() -> Fixture {
    let db = replica();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    let card = add_card(&db, &deck, &template, "hola");
    Fixture { db, deck, card }
}

fn graded() -> Payload {
    Payload::CardScheduling(CardScheduling {
        state: 2,
        due_at: Some(4_100_000_000_000),
        stability: 5.5,
        difficulty: 4.25,
        scheduled_days: 3,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        last_reviewed_at: Some(4_000_000_000_000),
    })
}

fn blank() -> Payload {
    Payload::CardScheduling(CardScheduling {
        state: 0,
        due_at: None,
        stability: 0.0,
        difficulty: 0.0,
        scheduled_days: 0,
        learning_steps: 0,
        reps: 0,
        lapses: 0,
        last_reviewed_at: None,
    })
}

fn review(card: &str) -> Payload {
    Payload::Review(Review {
        card_id: card.to_string(),
        rating: 3,
        state: 2,
        due_at: 4_100_000_000_000,
        stability: 5.5,
        difficulty: 4.25,
        scheduled_days: 3,
        learning_steps: 0,
        time: 1_200,
        is_ignored: false,
        created_at: 4_000_000_000_000,
    })
}

fn reset() -> Payload {
    Payload::CardReset(CardReset {
        wall_ms: 4_000_000_000_000,
    })
}

fn apply_hot(db: &Database, sender: Uuid, envelopes: Vec<Vec<u8>>) -> Vec<koloda_sync_proto::registry::Kind> {
    apply(db, &hot_page(sender, envelopes, 1)).expect("hot page applies")
}

fn apply_cold(db: &Database, sender: Uuid, envelopes: Vec<Vec<u8>>) {
    apply(db, &page(Lane::Cold, sender, envelopes, 1)).expect("cold page applies");
}

fn apply_grade(fixture: &Fixture, at: Stamp, review_id: &str) {
    let sender = Uuid::from_bytes(at.device.0);
    apply_hot(
        &fixture.db,
        sender,
        vec![sealed(&fixture.card, Some(&fixture.deck), at, &graded())],
    );
    apply_cold(
        &fixture.db,
        sender,
        vec![sealed(review_id, Some(&fixture.card), at, &review(&fixture.card))],
    );
}

fn apply_reset(fixture: &Fixture, at: Stamp) {
    apply_hot(
        &fixture.db,
        Uuid::from_bytes(at.device.0),
        vec![
            sealed(&fixture.card, Some(&fixture.deck), at, &reset()),
            sealed(&fixture.card, Some(&fixture.deck), at, &blank()),
        ],
    );
}

fn card_state(fixture: &Fixture) -> i32 {
    get_card(&fixture.db, &fixture.card)
        .expect("card reads")
        .expect("card exists")
        .state
}

fn review_ids(db: &Database, card: &str) -> Vec<String> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare("SELECT id FROM reviews WHERE card_id = ?1 ORDER BY id")?;
        let ids = stmt
            .query_map(rusqlite::params![card], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(ids)
    })
    .expect("reviews read")
}

fn ordered_devices() -> (Uuid, Uuid) {
    let mut devices = [Uuid::now_v7(), Uuid::now_v7()];
    devices.sort_by_key(|device| *device.as_bytes());
    let [low, high] = devices;
    (low, high)
}

#[test]
fn a_reset_and_a_grade_settle_by_one_stamp_order_whichever_arrives_first() {
    let (low, high) = ordered_devices();
    // (grade stamp, reset stamp, whether the grade wins)
    let cases = [
        (stamp(low, NEW_MS), stamp(high, NEW_MS + 10), false),
        (stamp(low, NEW_MS + 10), stamp(high, NEW_MS), true),
        (stamp(high, NEW_MS), stamp(low, NEW_MS), true),
        (stamp(low, NEW_MS), stamp(high, NEW_MS), false),
    ];
    for (grade_at, reset_at, does_grade_win) in cases {
        for is_grade_first in [true, false] {
            let fixture = local_card();
            let review_id = "01920000-0000-7000-8000-0000000000e1";
            if is_grade_first {
                apply_grade(&fixture, grade_at, review_id);
                apply_reset(&fixture, reset_at);
            } else {
                apply_reset(&fixture, reset_at);
                apply_grade(&fixture, grade_at, review_id);
            }

            let case = format!("grade {grade_at:?}, reset {reset_at:?}, grade first: {is_grade_first}");
            let reviews = review_ids(&fixture.db, &fixture.card);
            if does_grade_win {
                assert_eq!(card_state(&fixture), 2, "{case}");
                assert_eq!(reviews, [review_id], "{case}");
            } else {
                assert_eq!(card_state(&fixture), CardState::New.as_i32(), "{case}");
                assert!(reviews.is_empty(), "{case}");
            }
        }
    }
}

#[test]
fn a_reset_without_its_paired_scheduling_still_blanks_scheduling() {
    let fixture = local_card();
    let remote = Uuid::now_v7();
    apply_grade(&fixture, stamp(remote, NEW_MS), "01920000-0000-7000-8000-0000000000e1");

    let reset_at = stamp(remote, NEW_MS + 10);
    apply_hot(
        &fixture.db,
        remote,
        vec![sealed(&fixture.card, Some(&fixture.deck), reset_at, &reset())],
    );
    assert_eq!(card_state(&fixture), CardState::New.as_i32());
    assert_eq!(
        register(&fixture.db, "cards", &fixture.card, "scheduling").unwrap().hlc,
        reset_at.hlc
    );
    assert!(review_ids(&fixture.db, &fixture.card).is_empty());

    let changed = apply_hot(
        &fixture.db,
        remote,
        vec![sealed(&fixture.card, Some(&fixture.deck), reset_at, &blank())],
    );
    assert!(
        changed.is_empty(),
        "the late paired scheduling meets its own stamp and is dropped"
    );
}

#[test]
fn reviews_arriving_after_their_cards_reset_survive_only_if_they_strictly_beat_it() {
    let fixture = local_card();
    let (low, high) = ordered_devices();
    let reset_at = stamp(high, NEW_MS);
    apply_reset(&fixture, reset_at);

    let older = "01920000-0000-7000-8000-0000000000e1";
    let tied_losing_device = "01920000-0000-7000-8000-0000000000e2";
    let newer = "01920000-0000-7000-8000-0000000000e3";
    apply_cold(
        &fixture.db,
        low,
        vec![
            sealed(
                older,
                Some(&fixture.card),
                stamp(low, NEW_MS - 10),
                &review(&fixture.card),
            ),
            sealed(
                tied_losing_device,
                Some(&fixture.card),
                stamp(low, NEW_MS),
                &review(&fixture.card),
            ),
            sealed(
                newer,
                Some(&fixture.card),
                stamp(low, NEW_MS + 10),
                &review(&fixture.card),
            ),
        ],
    );

    assert_eq!(review_ids(&fixture.db, &fixture.card), [newer]);
}

#[test]
fn a_creates_synthetic_reset_floor_never_cuts_off_a_review() {
    let fixture = local_card();
    let remote = Uuid::now_v7();
    let card = "01920000-0000-7000-8000-0000000000c2";
    let template: String = fixture
        .db
        .with_conn(|conn| Ok(conn.query_row("SELECT id FROM templates", [], |row| row.get(0))?))
        .unwrap();
    let create = Payload::CardCreate(CardCreate {
        deck_id: fixture.deck.clone(),
        template_id: template,
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
        created_at: 1,
        initial_product_ts: InitialProductTs::new(),
        legacy_product_ts_floor: None,
    });
    apply_hot(
        &fixture.db,
        remote,
        vec![sealed(card, Some(&fixture.deck), stamp(remote, NEW_MS), &create)],
    );

    let review_id = "01920000-0000-7000-8000-0000000000e1";
    apply_cold(
        &fixture.db,
        remote,
        vec![sealed(review_id, Some(card), stamp(remote, NEW_MS - 10), &review(card))],
    );

    assert_eq!(review_ids(&fixture.db, card), [review_id]);
}

#[test]
fn a_remote_reset_drops_the_pending_local_grade_it_kills() {
    let fixture = local_card();
    submit_lesson_result(
        &fixture.db,
        LessonResultData {
            card: UpdateCardProgress {
                id: fixture.card.clone(),
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
                card_id: fixture.card.clone(),
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
    .unwrap();
    let pending = "SELECT COUNT(*) FROM sync_outbox WHERE group_name = 'scheduling' OR kind = 'reviews'";
    assert_eq!(count(&fixture.db, pending), 2);
    let cohorts = count(&fixture.db, "SELECT COUNT(*) FROM sync_cohorts");

    apply_reset(&fixture, stamp(Uuid::now_v7(), NEW_MS));

    assert!(review_ids(&fixture.db, &fixture.card).is_empty());
    assert_eq!(card_state(&fixture), CardState::New.as_i32());
    assert_eq!(
        count(&fixture.db, pending),
        0,
        "neither half of the killed grade is pushed"
    );
    assert_eq!(count(&fixture.db, "SELECT COUNT(*) FROM sync_cohorts"), cohorts - 1);
}

#[test]
fn a_remote_review_outside_the_review_bounds_fails_its_page() {
    let fixture = local_card();
    let remote = Uuid::now_v7();
    let Payload::Review(mut invalid) = review(&fixture.card) else {
        panic!("review() builds a review payload");
    };
    invalid.rating = 9;
    let review_id = "01920000-0000-7000-8000-0000000000e1";

    let error = apply(
        &fixture.db,
        &page(
            Lane::Cold,
            remote,
            vec![sealed(
                review_id,
                Some(&fixture.card),
                stamp(remote, NEW_MS),
                &Payload::Review(invalid),
            )],
            1,
        ),
    )
    .unwrap_err();

    assert_eq!(error.code, "validation.reviews.rating");
    assert!(review_ids(&fixture.db, &fixture.card).is_empty());
}
