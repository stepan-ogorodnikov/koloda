use koloda::domain::cards::{
    DeleteCardData, DeleteCardsData, InsertCardData, ResetCardProgressData, UpdateCardData, UpdateCardValues,
};
use koloda::repo::cards;
use koloda::repo::sync::Capture;
use koloda_sync_proto::envelope::Refs;
use koloda_sync_proto::payload::{CardScheduling, Delete, Payload, Review};
use koloda_sync_proto::registry::Kind;

use crate::common::card_content;
use crate::common::fixtures::insert_review_row;
use crate::common::sync::{count, enrolled_deck, outbox};
use crate::common::test_db;

const ATTACHMENT: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

fn insert_data(deck: &str, template: &str, front: &str) -> InsertCardData {
    InsertCardData {
        deck_id: deck.to_string(),
        template_id: template.to_string(),
        content: card_content(front, "answer"),
        state: None,
        due_at: None,
        stability: None,
        difficulty: None,
        scheduled_days: None,
        learning_steps: None,
        reps: None,
        lapses: None,
        last_reviewed_at: None,
    }
}

fn blank_scheduling() -> CardScheduling {
    CardScheduling {
        state: 0,
        due_at: None,
        stability: 0.0,
        difficulty: 0.0,
        scheduled_days: 0,
        learning_steps: 0,
        reps: 0,
        lapses: 0,
        last_reviewed_at: None,
    }
}

#[test]
fn adding_a_card_records_a_create_naming_its_deck_template_and_attachments() {
    let db = test_db();
    let fixture = enrolled_deck(&db);

    let front = format!("![cat](attachment:{ATTACHMENT})");
    let card = cards::add_card(&db, insert_data(&fixture.deck, &fixture.template, &front)).unwrap();

    let entries = outbox(&db);
    assert_eq!(entries.len(), 1);
    let header = &entries[0].envelope.header;
    assert_eq!(header.id, card.id);
    assert_eq!(header.parent.as_deref(), Some(fixture.deck.as_str()));
    assert_eq!(
        header.refs,
        Refs {
            algorithm_id: None,
            template_id: Some(fixture.template.clone()),
            attachment_ids: vec![ATTACHMENT.to_string()],
        }
    );

    let stored_content = db
        .with_conn(|conn| {
            Ok(
                conn.query_row("SELECT content FROM cards WHERE id = ?1", [&card.id], |row| {
                    row.get::<_, String>(0)
                })?,
            )
        })
        .unwrap();
    let Payload::CardCreate(create) = &entries[0].payload else {
        panic!("expected a card create, got {:?}", entries[0].payload);
    };
    assert_eq!(
        create.content, stored_content,
        "the payload carries the stored JSON text"
    );
    assert_eq!(create.scheduling, blank_scheduling());
    assert_eq!(create.created_at, card.created_at);
}

#[test]
fn editing_a_card_records_content_only_when_it_changed() {
    let db = test_db();
    let fixture = enrolled_deck(&db);
    let card = cards::add_card(&db, insert_data(&fixture.deck, &fixture.template, "hola")).unwrap();

    let edit = |front: &str| {
        cards::update_card(
            &db,
            UpdateCardData {
                id: card.id.clone(),
                values: UpdateCardValues {
                    content: card_content(front, "answer"),
                },
            },
        )
        .unwrap()
    };

    let edited = edit("adiós");
    let entries = outbox(&db);
    assert_eq!(entries.len(), 2);
    assert_eq!(
        entries[1].envelope.header.parent.as_deref(),
        Some(fixture.deck.as_str())
    );
    let Payload::CardContent(content) = &entries[1].payload else {
        panic!("expected card content, got {:?}", entries[1].payload);
    };
    assert_eq!(content.updated_at, edited.updated_at);

    edit("adiós");
    assert_eq!(outbox(&db).len(), 2, "a save that changes nothing records nothing");
}

#[test]
fn deleting_cards_records_one_tombstone_per_card_under_its_deck() {
    let db = test_db();
    let fixture = enrolled_deck(&db);
    let ids: Vec<String> = ["a", "b", "c"]
        .into_iter()
        .map(|front| {
            cards::add_card(&db, insert_data(&fixture.deck, &fixture.template, front))
                .unwrap()
                .id
        })
        .collect();

    cards::delete_card(&db, DeleteCardData { id: ids[0].clone() }).unwrap();
    cards::delete_cards(
        &db,
        DeleteCardsData {
            ids: vec![ids[1].clone(), ids[2].clone()],
        },
    )
    .unwrap();

    let tombstones: Vec<_> = outbox(&db)
        .into_iter()
        .filter(|entry| entry.envelope.header.group.is_none())
        .collect();
    assert_eq!(
        tombstones
            .iter()
            .map(|entry| entry.envelope.header.id.clone())
            .collect::<Vec<_>>(),
        ids
    );
    for entry in &tombstones {
        assert_eq!(entry.envelope.header.parent.as_deref(), Some(fixture.deck.as_str()));
        assert_eq!(
            entry.payload,
            Payload::Delete {
                kind: Kind::Cards,
                delete: Delete { successor: None },
            }
        );
    }
    assert_eq!(
        tombstones[1].envelope.header.commit_id, tombstones[2].envelope.header.commit_id,
        "a batch delete is one commit"
    );
    assert_eq!(count(&db, "SELECT COUNT(*) FROM sync_stamps"), 0);
}

#[test]
fn resetting_progress_records_reset_and_blank_scheduling_at_one_stamp() {
    let db = test_db();
    let fixture = enrolled_deck(&db);
    let card = cards::add_card(
        &db,
        InsertCardData {
            state: Some(2),
            reps: Some(4),
            stability: Some(12.5),
            due_at: Some(1_900_000_000_000),
            last_reviewed_at: Some(1_727_000_000_000),
            ..insert_data(&fixture.deck, &fixture.template, "hola")
        },
    )
    .unwrap();
    insert_review_row(&db, &card.id, 2, 0, 1_727_000_000_000);
    let review_id = db
        .with_conn(|conn| Ok(conn.query_row("SELECT id FROM reviews", [], |row| row.get::<_, String>(0))?))
        .unwrap();
    db.with_transaction(|tx| {
        Capture::begin(tx)?.write(
            &review_id,
            None,
            &Payload::Review(Review {
                card_id: card.id.clone(),
                rating: 3,
                state: 2,
                due_at: 1_900_000_000_000,
                stability: 1.0,
                difficulty: 5.0,
                scheduled_days: 0,
                learning_steps: 0,
                time: 10,
                is_ignored: false,
                created_at: 1_727_000_000_000,
            }),
        )
    })
    .unwrap();

    cards::reset_card_progress(&db, ResetCardProgressData { id: card.id.clone() }).unwrap();

    let entries = outbox(&db);
    let [reset, scheduling] = [&entries[entries.len() - 2], &entries[entries.len() - 1]];
    assert!(matches!(reset.payload, Payload::CardReset(_)));
    assert_eq!(scheduling.payload, Payload::CardScheduling(blank_scheduling()));
    assert_eq!(reset.envelope.header.stamp, scheduling.envelope.header.stamp);
    assert_eq!(reset.envelope.header.commit_id, scheduling.envelope.header.commit_id);
    assert_eq!(reset.envelope.header.parent.as_deref(), Some(fixture.deck.as_str()));
    assert_eq!(
        count(&db, "SELECT COUNT(*) FROM sync_origins WHERE kind = 'reviews'"),
        0,
        "the reset's deleted reviews leave no origins behind"
    );
}
