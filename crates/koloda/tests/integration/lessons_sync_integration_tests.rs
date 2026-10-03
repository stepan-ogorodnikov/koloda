use koloda::domain::cards::UpdateCardProgress;
use koloda::domain::lessons::LessonResultData;
use koloda::domain::reviews::InsertReviewData;
use koloda::repo::lessons;
use koloda_sync_proto::payload::{CardScheduling, Payload, Review};

use crate::common::fixtures::add_card;
use crate::common::sync::{enrolled_deck, outbox};
use crate::common::test_db;

#[test]
fn a_grade_records_its_scheduling_and_review_in_one_commit() {
    let db = test_db();
    let fixture = enrolled_deck(&db);
    let card_id = add_card(&db, &fixture.deck, &fixture.template, "hola");

    lessons::submit_lesson_result(
        &db,
        LessonResultData {
            card: UpdateCardProgress {
                id: card_id.clone(),
                state: 2,
                due_at: 1_900_000_000_000,
                stability: 5.5,
                difficulty: 4.25,
                scheduled_days: 3,
                learning_steps: 1,
                reps: 1,
                lapses: 0,
                last_reviewed_at: Some(1_800_000_000_000),
            },
            review: InsertReviewData {
                card_id: card_id.clone(),
                rating: 3,
                state: 2,
                due_at: 1_900_000_000_000,
                stability: 5.5,
                difficulty: 4.25,
                scheduled_days: 3,
                learning_steps: 1,
                time: 12,
                is_ignored: false,
            },
        },
    )
    .unwrap();

    let entries = outbox(&db);
    let [scheduling, review] = [&entries[entries.len() - 2], &entries[entries.len() - 1]];
    assert_eq!(scheduling.envelope.header.stamp, review.envelope.header.stamp);
    assert_eq!(scheduling.envelope.header.commit_id, review.envelope.header.commit_id);

    assert_eq!(scheduling.envelope.header.id, card_id);
    assert_eq!(
        scheduling.envelope.header.parent.as_deref(),
        Some(fixture.deck.as_str())
    );
    assert_eq!(
        scheduling.payload,
        Payload::CardScheduling(CardScheduling {
            state: 2,
            due_at: Some(1_900_000_000_000),
            stability: 5.5,
            difficulty: 4.25,
            scheduled_days: 3,
            learning_steps: 1,
            reps: 1,
            lapses: 0,
            last_reviewed_at: Some(1_800_000_000_000),
        })
    );

    let stored = koloda::repo::reviews::get_reviews(
        &db,
        koloda::domain::reviews::GetReviewsData {
            card_id: card_id.clone(),
        },
    )
    .unwrap();
    assert_eq!(review.envelope.header.id, stored[0].id);
    assert_eq!(review.envelope.header.parent.as_deref(), Some(card_id.as_str()));
    assert_eq!(
        review.payload,
        Payload::Review(Review {
            card_id: card_id.clone(),
            rating: 3,
            state: 2,
            due_at: 1_900_000_000_000,
            stability: 5.5,
            difficulty: 4.25,
            scheduled_days: 3,
            learning_steps: 1,
            time: 12,
            is_ignored: false,
            created_at: stored[0].created_at,
        })
    );
}
