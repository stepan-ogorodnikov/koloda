use koloda::domain::settings::SettingsName;
use koloda::repo::settings;
use koloda_sync_proto::payload::{Payload, SettingValue};
use koloda_sync_proto::registry::{Group, Kind};
use serde_json::json;

use crate::common::sync::{enroll, outbox};
use crate::common::{interface_settings, learning_settings, test_db};

fn learning_db() -> koloda::app::db::Database {
    let db = test_db();
    settings::set_settings(&db, SettingsName::Learning, learning_settings(200, 20, 50, 100))
        .expect("learning settings save");
    settings::set_settings(&db, SettingsName::Interface, interface_settings("en", "light", "on"))
        .expect("interface settings save");
    enroll(&db);
    db
}

#[test]
fn changing_one_learning_key_records_that_key_alone() {
    let db = learning_db();

    settings::patch_settings(&db, SettingsName::Learning, json!({ "dayStartsAt": "05:00" })).unwrap();

    let entries = outbox(&db);
    assert_eq!(entries.len(), 1);
    let header = &entries[0].envelope.header;
    assert_eq!(
        (header.kind, header.id.as_str(), header.group),
        (Kind::SettingsLearning, "learning", Some(Group::DayStartsAt))
    );
    assert_eq!(
        entries[0].payload,
        Payload::LearningDayStartsAt(SettingValue {
            value: r#""05:00""#.to_string(),
        })
    );
}

#[test]
fn changing_several_learning_keys_records_one_commit_with_refs_on_defaults() {
    let db = learning_db();
    let template = "01900000-0000-7000-8000-0000000000ff";

    settings::patch_settings(
        &db,
        SettingsName::Learning,
        json!({ "defaults": { "template": template }, "learnAheadLimit": [2, 30] }),
    )
    .unwrap();

    let entries = outbox(&db);
    let groups: Vec<_> = entries.iter().map(|entry| entry.envelope.header.group).collect();
    assert_eq!(groups, [Some(Group::DefaultsTemplate), Some(Group::LearnAheadLimit)]);
    assert_eq!(entries[0].envelope.header.refs.template_id.as_deref(), Some(template));
    assert_eq!(
        entries[0].envelope.header.commit_id,
        entries[1].envelope.header.commit_id
    );
}

#[test]
fn saves_that_change_no_learning_key_record_nothing() {
    let db = learning_db();

    settings::set_settings(&db, SettingsName::Learning, learning_settings(200, 20, 50, 100)).unwrap();
    settings::set_settings(&db, SettingsName::Interface, interface_settings("ru", "dark", "off")).unwrap();

    assert!(outbox(&db).is_empty());
}
