use koloda::app::db::Database;
use koloda::domain::algorithms::{UpdateAlgorithmData, UpdateAlgorithmValues};
use koloda::domain::algorithms_fsrs::AlgorithmFSRS;
use koloda::domain::cards::{UpdateCardData, UpdateCardValues};
use koloda::domain::decks::{UpdateDeckData, UpdateDeckValues};
use koloda::domain::seed_ids::{SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID};
use koloda::domain::settings::SettingsName;
use koloda::domain::templates::{UpdateTemplateData, UpdateTemplateValues};
use koloda::repo::algorithms::{get_algorithm, update_algorithm};
use koloda::repo::cards::{get_card, update_card};
use koloda::repo::decks::{get_deck, update_deck};
use koloda::repo::settings::{get_settings, set_settings};

use koloda::repo::templates::{get_template, update_template};
use koloda_sync_proto::payload::{
    DeckCreate, DefaultAlgorithm, InitialProductTs, JsonContent, Payload, SettingValue, Title,
};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use crate::common::sync::{
    apply, count, hot_page, mark_in_flight, register, replica, sealed, seeded_replica, stamp, FakeSpace,
};
use crate::common::{card_content, fsrs_algorithm_content, learning_settings, simple_template_content};

const OLD_MS: u64 = 1_000_000_000_000;
const NEW_MS: u64 = 4_000_000_000_000;
const DECK: &str = "01920000-0000-7000-8000-0000000000d1";

fn title(text: &str, updated_at: Option<i64>) -> Payload {
    Payload::DeckTitle(Title {
        title: text.to_string(),
        updated_at,
    })
}

fn deck_title(db: &Database, id: &str) -> String {
    get_deck(db, id).expect("deck reads").expect("deck exists").title
}

fn rename_deck(db: &Database, id: &str, title: &str) {
    let deck = get_deck(db, id).expect("deck reads").expect("deck exists");
    update_deck(
        db,
        UpdateDeckData {
            id: id.to_string(),
            values: UpdateDeckValues {
                title: title.to_string(),
                algorithm_id: deck.algorithm_id,
                template_id: deck.template_id,
                notes: deck.notes,
            },
        },
    )
    .expect("deck renames");
}

fn retention(value: f64) -> AlgorithmFSRS {
    let mut parameters = serde_json::to_value(fsrs_algorithm_content()).expect("parameters serialize");
    parameters
        .as_object_mut()
        .expect("parameters are an object")
        .insert("retention".to_string(), json!(value));
    serde_json::from_value(parameters).expect("parameters deserialize")
}

fn learning(db: &Database) -> Value {
    get_settings(db, SettingsName::Learning)
        .expect("learning settings read")
        .expect("learning settings exist")
        .content
}

fn pending_commit(db: &Database, kind: &str, id: &str, group: &str) -> Option<Vec<u8>> {
    db.with_conn(|conn| {
        let commit = conn.query_row(
            "SELECT commit_id FROM sync_outbox WHERE kind = ?1 AND id = ?2 AND group_name = ?3",
            rusqlite::params![kind, id, group],
            |row| row.get(0),
        );
        match commit {
            Ok(commit) => Ok(Some(commit)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(error.into()),
        }
    })
    .expect("outbox reads")
}

fn has_cohort(db: &Database, commit_id: &[u8]) -> bool {
    db.with_conn(|conn| {
        Ok(conn.query_row(
            "SELECT COUNT(*) > 0 FROM sync_cohorts WHERE commit_id = ?1",
            rusqlite::params![commit_id],
            |row| row.get(0),
        )?)
    })
    .expect("cohorts read")
}

#[test]
fn every_remote_update_group_reaches_the_other_replica() {
    let (a, b) = (seeded_replica(), seeded_replica());
    let algorithm = add_algorithm(&a, "FSRS");
    let template = add_template(&a, "Basic");
    let deck = add_deck(&a, &algorithm, &template, "Spanish");
    let card = add_card(&a, &deck, &template, "hola");
    let mut space = FakeSpace::default();
    space.push(&a);
    space.pull(&b);

    update_card(
        &a,
        UpdateCardData {
            id: card.clone(),
            values: UpdateCardValues {
                content: card_content("adiós", "goodbye"),
            },
        },
    )
    .unwrap();
    update_deck(
        &a,
        UpdateDeckData {
            id: deck.clone(),
            values: UpdateDeckValues {
                title: "Español".to_string(),
                algorithm_id: SEED_ALGORITHM_SIMPLE_ID.to_string(),
                template_id: SEED_TEMPLATE_TYPE_ID.to_string(),
                notes: Some("verbs first".to_string()),
            },
        },
    )
    .unwrap();
    let mut structure = simple_template_content();
    structure.fields[0].title = "Front side".to_string();
    update_template(
        &a,
        UpdateTemplateData {
            id: template.clone(),
            values: UpdateTemplateValues {
                title: "Basic two-sided".to_string(),
                content: structure,
                notes: Some("for vocabulary".to_string()),
            },
        },
    )
    .unwrap();
    update_algorithm(
        &a,
        UpdateAlgorithmData {
            id: algorithm.clone(),
            values: UpdateAlgorithmValues {
                title: "FSRS gentle".to_string(),
                content: retention(85.0),
                notes: Some("for new decks".to_string()),
            },
        },
    )
    .unwrap();
    let mut settings = learning_settings(80, 10, 20, 40);
    settings["defaults"] = json!({ "algorithm": algorithm, "template": template });
    settings["dayStartsAt"] = json!("05:30");
    settings["learnAheadLimit"] = json!([2, 0]);
    set_settings(&a, SettingsName::Learning, settings).unwrap();

    space.push(&a);
    space.pull(&b);

    assert_eq!(get_card(&b, &card).unwrap(), get_card(&a, &card).unwrap());
    assert_eq!(get_deck(&b, &deck).unwrap(), get_deck(&a, &deck).unwrap());
    assert_eq!(
        get_template(&b, &template).unwrap(),
        get_template(&a, &template).unwrap()
    );
    assert_eq!(
        get_algorithm(&b, &algorithm).unwrap(),
        get_algorithm(&a, &algorithm).unwrap()
    );
    assert_eq!(learning(&b), learning(&a));
    assert_eq!(
        count(&b, "SELECT COUNT(*) FROM algorithm_revisions"),
        count(&a, "SELECT COUNT(*) FROM algorithm_revisions"),
        "the remote parameter change arrives with its own revision"
    );
}

#[test]
fn a_remote_update_and_a_pending_local_edit_settle_by_stamp() {
    // (remote wall time, whether the local edit is in flight, expected title, whether the local row stays)
    let cases = [
        (OLD_MS, false, "Local", true),
        (NEW_MS, false, "Remote", false),
        (NEW_MS, true, "Remote", true),
    ];
    for (remote_ms, is_in_flight, expected, does_row_stay) in cases {
        let b = replica();
        let algorithm = add_algorithm(&b, "FSRS");
        let template = add_template(&b, "Basic");
        let deck = add_deck(&b, &algorithm, &template, "Spanish");
        rename_deck(&b, &deck, "Local");
        if is_in_flight {
            mark_in_flight(&b);
        }
        let commit = pending_commit(&b, "decks", &deck, "title").expect("the edit is pending");

        let remote = Uuid::now_v7();
        let page = hot_page(
            remote,
            vec![sealed(&deck, None, stamp(remote, remote_ms), &title("Remote", Some(1)))],
            1,
        );
        apply(&b, &page).unwrap();

        let case = format!("remote at {remote_ms}, in flight: {is_in_flight}");
        assert_eq!(deck_title(&b, &deck), expected, "{case}");
        assert_eq!(
            pending_commit(&b, "decks", &deck, "title").is_some(),
            does_row_stay,
            "{case}"
        );
        assert_eq!(has_cohort(&b, &commit), does_row_stay, "{case}");
    }
}

#[test]
fn an_equal_stamp_wins_only_over_a_synthetic_register() {
    let b = replica();
    add_algorithm(&b, "FSRS");
    add_template(&b, "Basic");
    let remote = Uuid::now_v7();
    let at = stamp(remote, OLD_MS);
    let create = Payload::DeckCreate(DeckCreate {
        title: "Created".to_string(),
        notes: None,
        created_at: 1,
        initial_product_ts: InitialProductTs::new(),
        legacy_product_ts_floor: None,
    });

    let page = hot_page(
        remote,
        vec![
            sealed(DECK, None, at, &create),
            sealed(DECK, None, at, &title("Same commit", None)),
            sealed(DECK, None, at, &title("Replayed stamp", None)),
        ],
        3,
    );
    apply(&b, &page).unwrap();

    assert_eq!(deck_title(&b, DECK), "Same commit");
    assert!(!register(&b, "decks", DECK, "title").unwrap().is_synthetic);
}

#[test]
fn a_tied_hlc_goes_to_the_higher_stamp_device() {
    let mut devices = [Uuid::now_v7(), Uuid::now_v7()];
    devices.sort_by_key(|device| *device.as_bytes());
    let [low, high] = devices;

    for order in [[low, high], [high, low]] {
        let b = replica();
        let algorithm = add_algorithm(&b, "FSRS");
        let template = add_template(&b, "Basic");
        let deck = add_deck(&b, &algorithm, &template, "Spanish");

        for device in order {
            let name = if device == high { "High" } else { "Low" };
            let page = hot_page(
                device,
                vec![sealed(&deck, None, stamp(device, NEW_MS), &title(name, None))],
                1,
            );
            apply(&b, &page).unwrap();
        }

        assert_eq!(deck_title(&b, &deck), "High", "order {order:?}");
    }
}

#[test]
fn updated_at_follows_the_winning_register_even_when_it_is_earlier() {
    let b = replica();
    let algorithm = add_algorithm(&b, "FSRS");
    let template = add_template(&b, "Basic");
    let deck = add_deck(&b, &algorithm, &template, "Spanish");
    rename_deck(&b, &deck, "Local");
    let local_updated_at = get_deck(&b, &deck).unwrap().unwrap().updated_at;
    assert!(local_updated_at > Some(1_000));

    let remote = Uuid::now_v7();
    let page = hot_page(
        remote,
        vec![sealed(
            &deck,
            None,
            stamp(remote, NEW_MS),
            &title("Remote", Some(1_000)),
        )],
        1,
    );
    apply(&b, &page).unwrap();

    assert_eq!(
        get_deck(&b, &deck).unwrap().unwrap().updated_at,
        Some(1_000),
        "the losing local edit's later product timestamp does not stay"
    );
}

#[test]
fn a_remote_parameter_change_records_no_revision() {
    let b = replica();
    let algorithm = add_algorithm(&b, "FSRS");
    let revisions = count(&b, "SELECT COUNT(*) FROM algorithm_revisions");

    let content = serde_json::to_string(&retention(80.0)).expect("parameters serialize");
    let remote = Uuid::now_v7();
    let payload = Payload::AlgorithmContent(JsonContent {
        content,
        updated_at: Some(1),
    });
    apply(
        &b,
        &hot_page(
            remote,
            vec![sealed(&algorithm, None, stamp(remote, NEW_MS), &payload)],
            1,
        ),
    )
    .unwrap();

    assert_eq!(get_algorithm(&b, &algorithm).unwrap().unwrap().content, retention(80.0));
    assert_eq!(count(&b, "SELECT COUNT(*) FROM algorithm_revisions"), revisions);
}

#[test]
fn a_remote_learning_key_replaces_only_that_key() {
    let b = seeded_replica();
    let before = learning(&b);
    let remote = Uuid::now_v7();
    let limits = json!({
        "total": 5,
        "untouched": { "value": 1, "counts": true },
        "learn": { "value": 2, "counts": true },
        "review": { "value": 3, "counts": false },
    });
    let missing_algorithm = Payload::LearningDefaultAlgorithm(DefaultAlgorithm {
        algorithm_id: "01920000-0000-7000-8000-0000000000ff".to_string(),
    });

    let page = hot_page(
        remote,
        vec![
            sealed(
                "learning",
                None,
                stamp(remote, NEW_MS),
                &Payload::LearningDailyLimits(SettingValue {
                    value: limits.to_string(),
                }),
            ),
            sealed("learning", None, stamp(remote, NEW_MS), &missing_algorithm),
        ],
        2,
    );
    apply(&b, &page).unwrap();

    let after = learning(&b);
    assert_eq!(after["dailyLimits"], limits);
    assert_eq!(after["dayStartsAt"], before["dayStartsAt"]);
    assert_eq!(
        after["defaults"], before["defaults"],
        "a default naming an algorithm this device lacks is dropped"
    );
}

#[test]
fn an_update_for_an_absent_row_is_dropped() {
    let b = replica();
    let remote = Uuid::now_v7();
    let page = hot_page(
        remote,
        vec![
            sealed(DECK, None, stamp(remote, NEW_MS), &title("Nowhere", None)),
            sealed(
                "learning",
                None,
                stamp(remote, NEW_MS),
                &Payload::LearningDayStartsAt(SettingValue {
                    value: "\"06:00\"".to_string(),
                }),
            ),
        ],
        2,
    );

    assert!(apply(&b, &page).unwrap().is_empty());
    assert!(get_deck(&b, DECK).unwrap().is_none());
    assert!(get_settings(&b, SettingsName::Learning).unwrap().is_none());
}
