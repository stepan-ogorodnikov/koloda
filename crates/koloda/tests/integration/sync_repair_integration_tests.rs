use koloda::app::db::Database;
use koloda::domain::algorithms::DeleteAlgorithmData;
use koloda::domain::decks::{UpdateDeckData, UpdateDeckValues};
use koloda::domain::seed_ids::SEED_ALGORITHM_SIMPLE_ID;
use koloda::domain::settings::SettingsName;
use koloda::domain::templates::DeleteTemplateData;
use koloda::repo::algorithms::{delete_algorithm, get_algorithm, get_algorithms};
use koloda::repo::cards::get_card;
use koloda::repo::decks::get_deck;
use koloda::repo::settings::get_settings;
use koloda::repo::sync::repair::repair_dangling_defaults;
use koloda::repo::templates::{delete_template, get_template, get_templates};
use koloda_sync_proto::payload::{DeckAlgorithm, DeckCreate, Delete, InitialProductTs, Payload};
use koloda_sync_proto::registry::{Group, Kind};
use uuid::Uuid;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use crate::common::sync::{apply, count, hot_page, outbox, replica, sealed, seeded_replica, stamp, starter, FakeSpace};

const OLD_MS: u64 = 1_000_000_000_000;
const NEW_MS: u64 = 4_000_000_000_000;
const DECK: &str = "01920000-0000-7000-8000-0000000000d1";
const GONE: &str = "01920000-0000-7000-8000-0000000000ff";

fn repoint_deck(db: &Database, id: &str, algorithm_id: Option<&str>, template_id: Option<&str>) {
    let deck = get_deck(db, id).expect("deck reads").expect("deck exists");
    koloda::repo::decks::update_deck(
        db,
        UpdateDeckData {
            id: id.to_string(),
            values: UpdateDeckValues {
                title: deck.title,
                algorithm_id: algorithm_id.map_or(deck.algorithm_id, str::to_string),
                template_id: template_id.map_or(deck.template_id, str::to_string),
                notes: deck.notes,
            },
        },
    )
    .expect("deck repoints");
}

/// Pushes and pulls every replica until nothing new is left to exchange.
fn settle(space: &mut FakeSpace, replicas: &[&Database]) {
    for _ in 0..4 {
        for replica in replicas {
            space.push(replica);
        }
        for replica in replicas {
            space.pull(replica);
        }
    }
}

fn deck_pointers(db: &Database, id: &str) -> (String, String) {
    let deck = get_deck(db, id).expect("deck reads").expect("deck exists");
    (deck.algorithm_id, deck.template_id)
}

fn algorithm_tombstone(successor: Option<&str>) -> Payload {
    Payload::Delete {
        kind: Kind::Algorithms,
        delete: Delete {
            successor: successor.map(str::to_string),
        },
    }
}

fn learning_default(db: &Database, key: &str) -> String {
    get_settings(db, SettingsName::Learning)
        .expect("learning settings read")
        .expect("learning settings exist")
        .content
        .pointer(&format!("/defaults/{key}"))
        .and_then(serde_json::Value::as_str)
        .expect("the default is an id")
        .to_string()
}

#[test]
fn a_deck_switched_to_an_algorithm_deleted_with_a_successor_follows_the_successor() {
    for is_switch_pushed_first in [true, false] {
        let (a, b) = (replica(), replica());
        let doomed = add_algorithm(&a, "Doomed");
        let successor = add_algorithm(&a, "Successor");
        let template = add_template(&a, "Basic");
        let on_doomed = add_deck(&a, &doomed, &template, "On doomed");
        let switched = add_deck(&a, &successor, &template, "Switched");
        let mut space = FakeSpace::default();
        space.push(&a);
        space.pull(&b);

        delete_algorithm(
            &a,
            DeleteAlgorithmData {
                id: doomed.clone(),
                successor_id: Some(successor.clone()),
            },
        )
        .unwrap();
        repoint_deck(&b, &switched, Some(&doomed), None);

        let order: [&Database; 2] = if is_switch_pushed_first { [&b, &a] } else { [&a, &b] };
        settle(&mut space, &order);

        for (name, db) in [("A", &a), ("B", &b)] {
            let case = format!("replica {name}, switch pushed first: {is_switch_pushed_first}");
            assert_eq!(deck_pointers(db, &on_doomed).0, successor, "{case}");
            assert_eq!(deck_pointers(db, &switched).0, successor, "{case}");
            assert!(get_algorithm(db, &doomed).unwrap().is_none(), "{case}");
        }
    }
}

#[test]
fn an_algorithm_repair_racing_a_template_change_on_the_same_deck_keeps_both() {
    for is_template_change_pushed_first in [true, false] {
        let (a, b) = (replica(), replica());
        let doomed = add_algorithm(&a, "Doomed");
        let successor = add_algorithm(&a, "Successor");
        let (basic, cloze) = (add_template(&a, "Basic"), add_template(&a, "Cloze"));
        let deck = add_deck(&a, &doomed, &basic, "Spanish");
        let mut space = FakeSpace::default();
        space.push(&a);
        space.pull(&b);

        delete_algorithm(
            &a,
            DeleteAlgorithmData {
                id: doomed.clone(),
                successor_id: Some(successor.clone()),
            },
        )
        .unwrap();
        repoint_deck(&b, &deck, None, Some(&cloze));

        let order: [&Database; 2] = if is_template_change_pushed_first {
            [&b, &a]
        } else {
            [&a, &b]
        };
        settle(&mut space, &order);

        for (name, db) in [("A", &a), ("B", &b)] {
            assert_eq!(
                deck_pointers(db, &deck),
                (successor.clone(), cloze.clone()),
                "replica {name}, template change pushed first: {is_template_change_pushed_first}"
            );
        }
    }
}

#[test]
fn a_dead_pointer_without_a_live_successor_repairs_to_the_lowest_live_id() {
    for successor in [None, Some(GONE), Some("live")] {
        let b = replica();
        let doomed = add_algorithm(&b, "Doomed");
        let live = [add_algorithm(&b, "First"), add_algorithm(&b, "Second")];
        let template = add_template(&b, "Basic");
        let deck = add_deck(&b, &doomed, &template, "Spanish");
        let successor = successor.map(|successor| {
            if successor == "live" {
                live[1].as_str()
            } else {
                successor
            }
        });
        let expected = match successor {
            Some(id) if id != GONE => id.to_string(),
            _ => live.iter().min().expect("two live algorithms").clone(),
        };

        let remote = Uuid::now_v7();
        apply(
            &b,
            &hot_page(
                remote,
                vec![sealed(
                    &doomed,
                    None,
                    stamp(remote, NEW_MS),
                    &algorithm_tombstone(successor),
                )],
                1,
            ),
        )
        .unwrap();

        assert_eq!(deck_pointers(&b, &deck).0, expected, "successor {successor:?}");
        let repair = outbox(&b).into_iter().last().expect("the repair is captured");
        assert_eq!(
            repair.payload,
            Payload::DeckAlgorithm(DeckAlgorithm {
                algorithm_id: expected.clone(),
                updated_at: None,
            }),
            "successor {successor:?}"
        );
        assert!(
            repair.envelope.header.stamp.hlc > stamp(remote, NEW_MS).hlc,
            "the repair beats the tombstone it follows"
        );
    }
}

#[test]
fn concurrent_deletes_of_the_last_two_algorithms_converge_on_a_default() {
    let (a, b) = (replica(), replica());
    let first = add_algorithm(&a, "First");
    let second = add_algorithm(&a, "Second");
    let template = add_template(&a, "Basic");
    let deck = add_deck(&a, &first, &template, "Spanish");
    let mut space = FakeSpace::default();
    space.push(&a);
    space.pull(&b);

    delete_algorithm(
        &a,
        DeleteAlgorithmData {
            id: first.clone(),
            successor_id: Some(second.clone()),
        },
    )
    .unwrap();
    delete_algorithm(
        &b,
        DeleteAlgorithmData {
            id: second.clone(),
            successor_id: None,
        },
    )
    .unwrap();
    settle(&mut space, &[&a, &b]);

    let ids = |db: &Database| -> Vec<String> { get_algorithms(db).unwrap().into_iter().map(|a| a.id).collect() };
    assert_eq!(ids(&a), ids(&b));
    assert!(!ids(&a).contains(&first) && !ids(&a).contains(&second));
    assert!(get_algorithms(&a)
        .unwrap()
        .iter()
        .all(|algorithm| algorithm.title == "Starter algorithm"));
    let pointer = deck_pointers(&a, &deck).0;
    assert_eq!(pointer, deck_pointers(&b, &deck).0);
    assert!(ids(&a).contains(&pointer));
}

#[test]
fn concurrent_deletes_of_the_last_two_templates_converge_on_a_default() {
    let (a, b) = (replica(), replica());
    let algorithm = add_algorithm(&a, "FSRS");
    let first = add_template(&a, "First");
    let second = add_template(&a, "Second");
    let deck = add_deck(&a, &algorithm, &first, "Spanish");
    let mut space = FakeSpace::default();
    space.push(&a);
    space.pull(&b);

    repoint_deck(&a, &deck, None, Some(&second));
    delete_template(&a, DeleteTemplateData { id: first.clone() }).unwrap();
    delete_template(&b, DeleteTemplateData { id: second.clone() }).unwrap();
    settle(&mut space, &[&a, &b]);

    let ids = |db: &Database| -> Vec<String> { get_templates(db).unwrap().into_iter().map(|t| t.id).collect() };
    assert_eq!(ids(&a), ids(&b));
    assert!(!ids(&a).contains(&first) && !ids(&a).contains(&second));
    let pointer = deck_pointers(&a, &deck).1;
    assert_eq!(pointer, deck_pointers(&b, &deck).1);
    assert_eq!(get_template(&a, &pointer).unwrap().unwrap().title, "Starter template");
}

#[test]
fn a_card_created_under_a_template_deleted_on_the_other_replica_is_dropped() {
    for is_card_pushed_first in [true, false] {
        let (a, b) = (replica(), replica());
        let algorithm = add_algorithm(&a, "FSRS");
        let kept = add_template(&a, "Kept");
        let doomed = add_template(&a, "Doomed");
        let deck = add_deck(&a, &algorithm, &kept, "Spanish");
        let mut space = FakeSpace::default();
        space.push(&a);
        space.pull(&b);

        delete_template(&a, DeleteTemplateData { id: doomed.clone() }).unwrap();
        let card = add_card(&b, &deck, &doomed, "hola");

        let order: [&Database; 2] = if is_card_pushed_first { [&b, &a] } else { [&a, &b] };
        settle(&mut space, &order);

        for (name, db) in [("A", &a), ("B", &b)] {
            let case = format!("replica {name}, card pushed first: {is_card_pushed_first}");
            assert!(get_card(db, &card).unwrap().is_none(), "{case}");
            assert!(get_template(db, &doomed).unwrap().is_none(), "{case}");
            assert_eq!(
                count(db, "SELECT COUNT(*) FROM sync_outbox WHERE kind = 'cards'"),
                0,
                "{case}"
            );
        }
    }
}

#[test]
fn a_pointer_arriving_for_a_deleted_algorithm_is_repaired_only_if_it_would_win() {
    for (pointer_ms, is_repaired) in [(NEW_MS + 10, true), (OLD_MS, false)] {
        let b = replica();
        let doomed = add_algorithm(&b, "Doomed");
        let successor = add_algorithm(&b, "Successor");
        let other = add_algorithm(&b, "Other");
        let template = add_template(&b, "Basic");
        let deck = add_deck(&b, &other, &template, "Spanish");
        let remote = Uuid::now_v7();
        apply(
            &b,
            &hot_page(
                remote,
                vec![sealed(
                    &doomed,
                    None,
                    stamp(remote, NEW_MS),
                    &algorithm_tombstone(Some(&successor)),
                )],
                1,
            ),
        )
        .unwrap();

        let pointer = Payload::DeckAlgorithm(DeckAlgorithm {
            algorithm_id: doomed.clone(),
            updated_at: None,
        });
        apply(
            &b,
            &hot_page(
                remote,
                vec![sealed(&deck, None, stamp(remote, pointer_ms), &pointer)],
                2,
            ),
        )
        .unwrap();

        let expected = if is_repaired { &successor } else { &other };
        assert_eq!(&deck_pointers(&b, &deck).0, expected, "pointer at {pointer_ms}");
        let pending = outbox(&b)
            .into_iter()
            .find(|entry| entry.envelope.header.id == deck && entry.envelope.header.group == Some(Group::Algorithm))
            .expect("the deck pointer is pending");
        assert_eq!(
            pending.payload,
            Payload::DeckAlgorithm(DeckAlgorithm {
                algorithm_id: expected.clone(),
                updated_at: None,
            }),
            "pointer at {pointer_ms}: only a repair replaces the pending pointer"
        );
    }
}

#[test]
fn a_learning_default_naming_no_live_row_is_repaired_after_catch_up() {
    for has_other_algorithm in [true, false] {
        let b = seeded_replica();
        let other = has_other_algorithm.then(|| add_algorithm(&b, "Other"));
        let template_default = learning_default(&b, "template");
        // WHY: a joiner deletes an untouched seed row the space does not hold, leaving its stamp-zero default behind.
        b.with_conn(|conn| {
            conn.execute(
                "DELETE FROM algorithms WHERE id = ?1",
                rusqlite::params![SEED_ALGORITHM_SIMPLE_ID],
            )?;
            Ok(())
        })
        .unwrap();

        let changed = repair_dangling_defaults(&b, &starter()).unwrap();

        let repaired = learning_default(&b, "algorithm");
        match &other {
            Some(other) => assert_eq!(&repaired, other),
            None => assert_eq!(
                get_algorithm(&b, &repaired).unwrap().unwrap().title,
                "Starter algorithm"
            ),
        }
        assert_eq!(learning_default(&b, "template"), template_default);
        assert!(changed.contains(&Kind::SettingsLearning));
        assert!(
            outbox(&b).iter().any(|entry| entry.envelope.header.id == "learning"),
            "the repaired default is published"
        );
    }
}

#[test]
fn a_deck_create_with_no_live_template_gets_a_new_default_as_its_placeholder() {
    let b = replica();
    add_algorithm(&b, "FSRS");
    let remote = Uuid::now_v7();
    let create = Payload::DeckCreate(DeckCreate {
        title: "Remote".to_string(),
        notes: None,
        created_at: 1,
        initial_product_ts: InitialProductTs::new(),
        legacy_product_ts_floor: None,
    });

    let changed = apply(
        &b,
        &hot_page(remote, vec![sealed(DECK, None, stamp(remote, NEW_MS), &create)], 1),
    )
    .unwrap();

    let (_, template) = deck_pointers(&b, DECK);
    assert_eq!(get_template(&b, &template).unwrap().unwrap().title, "Starter template");
    assert!(changed.contains(&Kind::Templates));
    assert!(outbox(&b).iter().any(|entry| entry.envelope.header.id == template));
}
