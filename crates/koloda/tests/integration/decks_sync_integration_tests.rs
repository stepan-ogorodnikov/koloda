use koloda::domain::decks::{DeleteDeckData, InsertDeckData, UpdateDeckData, UpdateDeckValues};
use koloda::repo::decks;
use koloda_sync_proto::payload::{Delete, Payload};
use koloda_sync_proto::registry::{Group, Kind};

use crate::common::fixtures::{add_algorithm, add_card, add_template, insert_review_row};
use crate::common::sync::{count, enroll, enrolled_deck, outbox, DeckFixture};
use crate::common::test_db;

#[test]
fn adding_a_deck_records_its_create_and_both_pointers_in_one_commit() {
    let db = test_db();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    enroll(&db);

    let deck = decks::add_deck(
        &db,
        InsertDeckData {
            title: "Spanish".to_string(),
            algorithm_id: algorithm.clone(),
            template_id: template.clone(),
        },
    )
    .unwrap();

    let entries = outbox(&db);
    let groups: Vec<_> = entries.iter().map(|entry| entry.envelope.header.group).collect();
    assert_eq!(
        groups,
        [Some(Group::Create), Some(Group::Algorithm), Some(Group::Template)]
    );
    assert!(entries
        .iter()
        .all(|entry| entry.envelope.header.commit_id == entries[0].envelope.header.commit_id));
    assert!(entries.iter().all(|entry| entry.envelope.header.id == deck.id));

    let refs: Vec<_> = entries.iter().map(|entry| &entry.envelope.header.refs).collect();
    assert_eq!(refs[0].algorithm_id, None, "a deck create carries no pointers");
    assert_eq!(refs[1].algorithm_id.as_deref(), Some(algorithm.as_str()));
    assert_eq!(refs[2].template_id.as_deref(), Some(template.as_str()));
}

#[test]
fn editing_a_deck_records_only_the_groups_that_changed() {
    type Edit = fn(&mut UpdateDeckValues, &str, &str);
    let cases: [(Edit, Vec<Group>); 5] = [
        (|_, _, _| {}, vec![]),
        (
            |values, _, _| values.title = "Spanish verbs".to_string(),
            vec![Group::Title],
        ),
        (
            |values, _, _| values.notes = Some("irregular".to_string()),
            vec![Group::Notes],
        ),
        (
            |values, algorithm, _| values.algorithm_id = algorithm.to_string(),
            vec![Group::Algorithm],
        ),
        (
            |values, _, template| values.template_id = template.to_string(),
            vec![Group::Template],
        ),
    ];

    for (edit, expected) in cases {
        let db = test_db();
        let other_algorithm = add_algorithm(&db, "Other");
        let other_template = add_template(&db, "Other");
        let DeckFixture {
            algorithm,
            template,
            deck,
        } = enrolled_deck(&db);

        let mut values = UpdateDeckValues {
            title: "Spanish".to_string(),
            algorithm_id: algorithm,
            template_id: template,
            notes: None,
        };
        edit(&mut values, &other_algorithm, &other_template);
        decks::update_deck(&db, UpdateDeckData { id: deck, values }).unwrap();

        let groups: Vec<_> = outbox(&db)
            .iter()
            .filter_map(|entry| entry.envelope.header.group)
            .collect();
        assert_eq!(groups, expected);
    }
}

#[test]
fn deleting_a_deck_records_one_tombstone_for_the_whole_subtree() {
    let db = test_db();
    let fixture = enrolled_deck(&db);
    let card = add_card(&db, &fixture.deck, &fixture.template, "hola");
    insert_review_row(&db, &card, 2, 0, 1_727_000_000_000);
    let before = outbox(&db).len();

    decks::delete_deck(
        &db,
        DeleteDeckData {
            id: fixture.deck.clone(),
        },
    )
    .unwrap();

    let entries = outbox(&db);
    assert_eq!(entries.len(), before + 1);
    let tombstone = &entries[before];
    assert_eq!(tombstone.envelope.header.id, fixture.deck);
    assert_eq!(
        tombstone.payload,
        Payload::Delete {
            kind: Kind::Decks,
            delete: Delete { successor: None },
        }
    );
    assert_eq!(count(&db, "SELECT COUNT(*) FROM sync_stamps WHERE kind = 'cards'"), 0);
}
