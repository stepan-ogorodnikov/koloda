use koloda::domain::templates::{CloneTemplateData, DeleteTemplateData, UpdateTemplateData, UpdateTemplateValues};
use koloda::repo::templates;
use koloda_sync_proto::payload::{Delete, Payload};
use koloda_sync_proto::registry::{Group, Kind};

use crate::common::sync::{enroll, outbox};
use crate::common::{simple_template, simple_template_content, test_db};

#[test]
fn adding_or_cloning_a_template_records_a_create_with_the_stored_structure() {
    let db = test_db();
    enroll(&db);

    let template = templates::add_template(&db, simple_template()).unwrap();
    let clone = templates::clone_template(
        &db,
        CloneTemplateData {
            title: "Copy".to_string(),
            source_id: template.id.clone(),
        },
    )
    .unwrap();

    let entries = outbox(&db);
    assert_eq!(
        entries
            .iter()
            .map(|entry| entry.envelope.header.id.clone())
            .collect::<Vec<_>>(),
        [template.id.clone(), clone.id.clone()]
    );
    let stored = db
        .with_conn(|conn| {
            Ok(
                conn.query_row("SELECT content FROM templates WHERE id = ?1", [&template.id], |row| {
                    row.get::<_, String>(0)
                })?,
            )
        })
        .unwrap();
    let Payload::TemplateCreate(create) = &entries[0].payload else {
        panic!("expected a template create, got {:?}", entries[0].payload);
    };
    assert_eq!(create.content, stored);
    assert_eq!(create.title, "Basic");
}

#[test]
fn editing_a_template_records_only_the_groups_that_changed() {
    type Edit = fn(&mut UpdateTemplateValues);
    let cases: [(Edit, Vec<Group>); 4] = [
        (|_| {}, vec![]),
        (|values| values.title = "Vocabulary".to_string(), vec![Group::Title]),
        (
            |values| values.notes = Some("two sides".to_string()),
            vec![Group::Notes],
        ),
        (
            |values| values.content.fields[0].title = "Question".to_string(),
            vec![Group::Structure],
        ),
    ];

    for (edit, expected) in cases {
        let db = test_db();
        let template = templates::add_template(&db, simple_template()).unwrap();
        enroll(&db);

        let mut values = UpdateTemplateValues {
            title: "Basic".to_string(),
            content: simple_template_content(),
            notes: None,
        };
        edit(&mut values);
        templates::update_template(
            &db,
            UpdateTemplateData {
                id: template.id,
                values,
            },
        )
        .unwrap();

        let groups: Vec<_> = outbox(&db)
            .iter()
            .filter_map(|entry| entry.envelope.header.group)
            .collect();
        assert_eq!(groups, expected);
    }
}

#[test]
fn deleting_a_template_records_a_tombstone() {
    let db = test_db();
    let template = templates::add_template(&db, simple_template()).unwrap();
    enroll(&db);

    templates::delete_template(
        &db,
        DeleteTemplateData {
            id: template.id.clone(),
        },
    )
    .unwrap();

    let entries = outbox(&db);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].envelope.header.id, template.id);
    assert_eq!(
        entries[0].payload,
        Payload::Delete {
            kind: Kind::Templates,
            delete: Delete { successor: None },
        }
    );
}
