use koloda::domain::algorithms::{
    CloneAlgorithmData, DeleteAlgorithmData, InsertAlgorithmData, UpdateAlgorithmData, UpdateAlgorithmValues,
};
use koloda::repo::algorithms;
use koloda_sync_proto::payload::{DeckAlgorithm, Delete, Payload};
use koloda_sync_proto::registry::{Group, Kind};

use crate::common::fixtures::{add_algorithm, add_deck, add_template};
use crate::common::sync::{enroll, outbox};
use crate::common::{fsrs_algorithm_content, test_db};

#[test]
fn adding_or_cloning_an_algorithm_records_its_create_and_first_revision_in_one_commit() {
    let db = test_db();
    enroll(&db);

    let algorithm = algorithms::add_algorithm(
        &db,
        InsertAlgorithmData {
            title: "FSRS".to_string(),
            content: fsrs_algorithm_content(),
        },
    )
    .unwrap();
    algorithms::clone_algorithm(
        &db,
        CloneAlgorithmData {
            title: "Copy".to_string(),
            source_id: algorithm.id.clone(),
        },
    )
    .unwrap();

    let entries = outbox(&db);
    assert_eq!(entries.len(), 4);
    for pair in entries.chunks(2) {
        let [create, revision] = pair else {
            panic!("entries come in create and revision pairs");
        };
        assert!(matches!(create.payload, Payload::AlgorithmCreate(_)));
        let Payload::AlgorithmRevision(row) = &revision.payload else {
            panic!("expected a revision, got {:?}", revision.payload);
        };
        assert_eq!(row.algorithm_id, create.envelope.header.id);
        assert_eq!(row.actor, r#"{"kind":"user"}"#);
        assert_eq!(create.envelope.header.commit_id, revision.envelope.header.commit_id);
    }
}

#[test]
fn editing_an_algorithm_records_changed_groups_and_a_revision_only_for_parameters() {
    type Edit = fn(&mut UpdateAlgorithmValues);
    type Target = (Kind, Option<Group>);
    let cases: [(Edit, Vec<Target>); 4] = [
        (|_| {}, vec![]),
        (
            |values| values.title = "Gentle".to_string(),
            vec![(Kind::Algorithms, Some(Group::Title))],
        ),
        (
            |values| values.notes = Some("for vocabulary".to_string()),
            vec![(Kind::Algorithms, Some(Group::Notes))],
        ),
        (
            |values| values.content.retention = 85.0,
            vec![
                (Kind::Algorithms, Some(Group::Content)),
                (Kind::AlgorithmRevisions, Some(Group::Row)),
            ],
        ),
    ];

    for (edit, expected) in cases {
        let db = test_db();
        let algorithm = add_algorithm(&db, "FSRS");
        enroll(&db);

        let mut values = UpdateAlgorithmValues {
            title: "FSRS".to_string(),
            content: fsrs_algorithm_content(),
            notes: None,
        };
        edit(&mut values);
        algorithms::update_algorithm(&db, UpdateAlgorithmData { id: algorithm, values }).unwrap();

        let targets: Vec<_> = outbox(&db)
            .iter()
            .map(|entry| (entry.envelope.header.kind, entry.envelope.header.group))
            .collect();
        assert_eq!(targets, expected);
    }
}

#[test]
fn deleting_an_algorithm_reassigns_its_decks_then_tombstones_it_with_the_successor() {
    let db = test_db();
    let doomed = add_algorithm(&db, "Old");
    let successor = add_algorithm(&db, "New");
    let template = add_template(&db, "Basic");
    let decks = [
        add_deck(&db, &doomed, &template, "One"),
        add_deck(&db, &doomed, &template, "Two"),
    ];
    enroll(&db);

    algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: doomed.clone(),
            successor_id: Some(successor.clone()),
        },
    )
    .unwrap();

    let entries = outbox(&db);
    assert_eq!(entries.len(), 3);
    for (entry, deck) in entries.iter().zip(&decks) {
        assert_eq!(entry.envelope.header.id, *deck);
        assert_eq!(
            entry.payload,
            Payload::DeckAlgorithm(DeckAlgorithm {
                algorithm_id: successor.clone(),
                updated_at: None,
            })
        );
    }
    assert_eq!(entries[2].envelope.header.id, doomed);
    assert_eq!(
        entries[2].payload,
        Payload::Delete {
            kind: Kind::Algorithms,
            delete: Delete {
                successor: Some(successor.clone()),
            },
        }
    );
    assert!(entries
        .iter()
        .all(|entry| entry.envelope.header.commit_id == entries[0].envelope.header.commit_id));
}
