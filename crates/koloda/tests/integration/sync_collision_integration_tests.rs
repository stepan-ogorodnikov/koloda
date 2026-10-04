//! The collision outcomes of `crates/koloda-sync-proto/PROTOCOL.md` §Collision outcomes, across two replicas.
//!
//! Rows already proven elsewhere are not repeated: reset against grade and tied stamps in
//! `sync_reviews_integration_tests.rs`, deck delete against card writes in `sync_tombstones_integration_tests.rs`,
//! successor and last-row deletes in `sync_repair_integration_tests.rs`. The attachment row needs transport.

use koloda::app::db::Database;
use koloda::domain::algorithms::{DeleteAlgorithmData, UpdateAlgorithmData, UpdateAlgorithmValues};
use koloda::domain::algorithms_fsrs::AlgorithmFSRS;
use koloda::domain::cards::{UpdateCardData, UpdateCardProgress, UpdateCardValues};
use koloda::domain::decks::{UpdateDeckData, UpdateDeckValues};
use koloda::domain::lessons::LessonResultData;
use koloda::domain::reviews::InsertReviewData;
use koloda::domain::templates::{UpdateTemplateData, UpdateTemplateValues};
use koloda::repo::algorithms::{delete_algorithm, get_algorithm, update_algorithm};
use koloda::repo::cards::{get_card, update_card};
use koloda::repo::decks::{get_deck, update_deck};
use koloda::repo::lessons::submit_lesson_result;
use koloda::repo::templates::{get_template, update_template};
use koloda_sync_proto::hlc::Stamp;
use serde_json::json;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use crate::common::sync::{count, outbox, replica, FakeSpace};
use crate::common::{card_content, fsrs_algorithm_content, simple_template_content};

struct Pair {
    a: Database,
    b: Database,
    space: FakeSpace,
}

impl Pair {
    /// Two replicas that hold the same rows, written on `a` and pulled by `b`.
    fn synced(setup: impl FnOnce(&Database)) -> Pair {
        let (a, b) = (replica(), replica());
        setup(&a);
        let mut space = FakeSpace::default();
        space.push(&a);
        space.pull(&b);
        Pair { a, b, space }
    }

    /// Exchanges both outboxes until nothing is left, `first` pushing first.
    fn settle(&mut self, is_a_first: bool) {
        let order = if is_a_first {
            [&self.a, &self.b]
        } else {
            [&self.b, &self.a]
        };
        for _ in 0..3 {
            for replica in order {
                self.space.push(replica);
            }
            for replica in order {
                self.space.pull(replica);
            }
        }
    }
}

fn pending_stamp(db: &Database, kind: &str, id: &str, group: &str) -> Stamp {
    outbox(db)
        .into_iter()
        .rev()
        .find(|entry| {
            let header = &entry.envelope.header;
            header.kind.as_wire() == kind && header.id == id && header.group.map(|group| group.as_wire()) == Some(group)
        })
        .expect("the write is pending")
        .envelope
        .header
        .stamp
}

fn grade(db: &Database, card: &str, scheduled_days: i32) {
    submit_lesson_result(
        db,
        LessonResultData {
            card: UpdateCardProgress {
                id: card.to_string(),
                state: 2,
                due_at: 1_900_000_000_000,
                stability: 5.5,
                difficulty: 4.25,
                scheduled_days,
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
                scheduled_days,
                learning_steps: 0,
                time: 12,
                is_ignored: false,
            },
        },
    )
    .expect("grade submits");
}

fn retention(value: f64) -> AlgorithmFSRS {
    let mut parameters = serde_json::to_value(fsrs_algorithm_content()).expect("parameters serialize");
    parameters
        .as_object_mut()
        .expect("parameters are an object")
        .insert("retention".to_string(), json!(value));
    serde_json::from_value(parameters).expect("parameters deserialize")
}

fn edit_algorithm(db: &Database, id: &str, title: Option<&str>, parameters: Option<AlgorithmFSRS>) {
    let algorithm = get_algorithm(db, id)
        .expect("algorithm reads")
        .expect("algorithm exists");
    update_algorithm(
        db,
        UpdateAlgorithmData {
            id: id.to_string(),
            values: UpdateAlgorithmValues {
                title: title.map_or(algorithm.title, str::to_string),
                content: parameters.unwrap_or(algorithm.content),
                notes: algorithm.notes,
            },
        },
    )
    .expect("algorithm updates");
}

fn edit_deck(db: &Database, id: &str, title: Option<&str>, notes: Option<&str>) {
    let deck = get_deck(db, id).expect("deck reads").expect("deck exists");
    update_deck(
        db,
        UpdateDeckData {
            id: id.to_string(),
            values: UpdateDeckValues {
                title: title.map_or(deck.title, str::to_string),
                algorithm_id: deck.algorithm_id,
                template_id: deck.template_id,
                notes: notes.map(str::to_string).or(deck.notes),
            },
        },
    )
    .expect("deck updates");
}

fn revisions_of(db: &Database, algorithm: &str) -> Vec<String> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare("SELECT id FROM algorithm_revisions WHERE algorithm_id = ?1 ORDER BY id")?;
        let ids = stmt
            .query_map(rusqlite::params![algorithm], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(ids)
    })
    .expect("revisions read")
}

#[test]
fn a_card_edited_on_one_replica_while_graded_on_the_other_keeps_both() {
    for is_a_first in [true, false] {
        let mut ids = (String::new(), String::new());
        let mut pair = Pair::synced(|a| {
            let algorithm = add_algorithm(a, "FSRS");
            let template = add_template(a, "Basic");
            let deck = add_deck(a, &algorithm, &template, "Spanish");
            ids = (deck.clone(), add_card(a, &deck, &template, "hola"));
        });
        let card = ids.1;

        update_card(
            &pair.a,
            UpdateCardData {
                id: card.clone(),
                values: UpdateCardValues {
                    content: card_content("hola", "hello"),
                },
            },
        )
        .unwrap();
        grade(&pair.b, &card, 7);
        pair.settle(is_a_first);

        for db in [&pair.a, &pair.b] {
            let stored = get_card(db, &card).unwrap().unwrap();
            assert_eq!(stored.content, card_content("hola", "hello"), "A first: {is_a_first}");
            assert_eq!(stored.scheduled_days, 7, "A first: {is_a_first}");
            assert_eq!(count(db, "SELECT COUNT(*) FROM reviews"), 1, "A first: {is_a_first}");
        }
    }
}

#[test]
fn two_offline_grades_of_one_card_keep_both_reviews_and_the_later_scheduling() {
    let mut card = String::new();
    let mut pair = Pair::synced(|a| {
        let algorithm = add_algorithm(a, "FSRS");
        let template = add_template(a, "Basic");
        let deck = add_deck(a, &algorithm, &template, "Spanish");
        card = add_card(a, &deck, &template, "hola");
    });

    grade(&pair.a, &card, 1);
    grade(&pair.b, &card, 2);
    let is_b_later =
        pending_stamp(&pair.b, "cards", &card, "scheduling") > pending_stamp(&pair.a, "cards", &card, "scheduling");
    pair.settle(true);

    let expected = if is_b_later { 2 } else { 1 };
    for db in [&pair.a, &pair.b] {
        assert_eq!(get_card(db, &card).unwrap().unwrap().scheduled_days, expected);
        assert_eq!(count(db, "SELECT COUNT(*) FROM reviews"), 2);
    }
}

#[test]
fn a_deck_renamed_on_one_replica_and_annotated_on_the_other_keeps_both() {
    let mut deck = String::new();
    let mut pair = Pair::synced(|a| {
        let algorithm = add_algorithm(a, "FSRS");
        let template = add_template(a, "Basic");
        deck = add_deck(a, &algorithm, &template, "Spanish");
    });

    edit_deck(&pair.a, &deck, Some("Español"), None);
    edit_deck(&pair.b, &deck, None, Some("verbs first"));
    pair.settle(true);

    for db in [&pair.a, &pair.b] {
        let stored = get_deck(db, &deck).unwrap().unwrap();
        assert_eq!(stored.title, "Español");
        assert_eq!(stored.notes.as_deref(), Some("verbs first"));
    }
    assert_eq!(get_deck(&pair.a, &deck).unwrap(), get_deck(&pair.b, &deck).unwrap());
}

#[test]
fn an_algorithm_renamed_on_one_replica_and_retuned_on_the_other_keeps_both_and_both_revisions() {
    let mut algorithm = String::new();
    let mut pair = Pair::synced(|a| algorithm = add_algorithm(a, "FSRS"));

    edit_algorithm(&pair.a, &algorithm, Some("FSRS gentle"), None);
    edit_algorithm(&pair.b, &algorithm, None, Some(retention(85.0)));
    pair.settle(true);

    for db in [&pair.a, &pair.b] {
        let stored = get_algorithm(db, &algorithm).unwrap().unwrap();
        assert_eq!(stored.title, "FSRS gentle");
        assert_eq!(stored.content, retention(85.0));
        assert_eq!(revisions_of(db, &algorithm).len(), 2, "the create's revision and B's");
    }
    assert_eq!(revisions_of(&pair.a, &algorithm), revisions_of(&pair.b, &algorithm));
}

#[test]
fn two_replicas_retuning_one_algorithm_keep_the_later_parameters_and_both_revisions() {
    let mut algorithm = String::new();
    let mut pair = Pair::synced(|a| algorithm = add_algorithm(a, "FSRS"));

    edit_algorithm(&pair.a, &algorithm, None, Some(retention(80.0)));
    edit_algorithm(&pair.b, &algorithm, None, Some(retention(95.0)));
    let is_b_later = pending_stamp(&pair.b, "algorithms", &algorithm, "content")
        > pending_stamp(&pair.a, "algorithms", &algorithm, "content");
    pair.settle(true);

    let expected = retention(if is_b_later { 95.0 } else { 80.0 });
    for db in [&pair.a, &pair.b] {
        assert_eq!(get_algorithm(db, &algorithm).unwrap().unwrap().content, expected);
        assert_eq!(
            revisions_of(db, &algorithm).len(),
            3,
            "the create's revision and one per device"
        );
    }
}

#[test]
fn an_algorithm_deleted_while_the_other_replica_retunes_it_stays_deleted_and_keeps_both_revisions() {
    for is_a_first in [true, false] {
        let mut algorithm = String::new();
        let mut pair = Pair::synced(|a| {
            algorithm = add_algorithm(a, "Doomed");
            add_algorithm(a, "Kept");
        });

        delete_algorithm(
            &pair.a,
            DeleteAlgorithmData {
                id: algorithm.clone(),
                successor_id: None,
            },
        )
        .unwrap();
        edit_algorithm(&pair.b, &algorithm, None, Some(retention(85.0)));
        pair.settle(is_a_first);

        for db in [&pair.a, &pair.b] {
            assert!(
                get_algorithm(db, &algorithm).unwrap().is_none(),
                "A first: {is_a_first}"
            );
            assert_eq!(revisions_of(db, &algorithm).len(), 2, "A first: {is_a_first}");
        }
    }
}

#[test]
fn two_replicas_restructuring_one_template_keep_the_later_structure() {
    let mut template = String::new();
    let mut pair = Pair::synced(|a| template = add_template(a, "Basic"));

    let restructure = |db: &Database, front: &str| {
        let mut structure = simple_template_content();
        structure.fields[0].title = front.to_string();
        update_template(
            db,
            UpdateTemplateData {
                id: template.clone(),
                values: UpdateTemplateValues {
                    title: "Basic".to_string(),
                    content: structure,
                    notes: None,
                },
            },
        )
        .unwrap();
    };
    restructure(&pair.a, "Front on A");
    restructure(&pair.b, "Front on B");
    let is_b_later = pending_stamp(&pair.b, "templates", &template, "structure")
        > pending_stamp(&pair.a, "templates", &template, "structure");
    pair.settle(true);

    let expected = if is_b_later { "Front on B" } else { "Front on A" };
    for db in [&pair.a, &pair.b] {
        assert_eq!(
            get_template(db, &template).unwrap().unwrap().content.fields[0].title,
            expected
        );
    }
}

#[test]
fn two_replicas_deleting_different_algorithms_repair_every_deck_to_a_live_successor() {
    let mut ids = Vec::new();
    let mut pair = Pair::synced(|a| {
        let doomed_on_a = add_algorithm(a, "Doomed on A");
        let doomed_on_b = add_algorithm(a, "Doomed on B");
        let kept = add_algorithm(a, "Kept");
        let template = add_template(a, "Basic");
        let first = add_deck(a, &doomed_on_a, &template, "First");
        let second = add_deck(a, &doomed_on_b, &template, "Second");
        ids = vec![doomed_on_a, doomed_on_b, kept, first, second];
    });
    let [doomed_on_a, doomed_on_b, kept, first, second] = <[String; 5]>::try_from(ids).unwrap();

    // WHY: each successor is the row the other replica deletes, so only the tombstones' hints chain to `kept`.
    delete_algorithm(
        &pair.a,
        DeleteAlgorithmData {
            id: doomed_on_a.clone(),
            successor_id: Some(doomed_on_b.clone()),
        },
    )
    .unwrap();
    delete_algorithm(
        &pair.b,
        DeleteAlgorithmData {
            id: doomed_on_b.clone(),
            successor_id: Some(kept.clone()),
        },
    )
    .unwrap();
    pair.settle(true);

    for db in [&pair.a, &pair.b] {
        assert_eq!(get_deck(db, &first).unwrap().unwrap().algorithm_id, kept);
        assert_eq!(get_deck(db, &second).unwrap().unwrap().algorithm_id, kept);
        assert!(get_algorithm(db, &doomed_on_a).unwrap().is_none());
        assert!(get_algorithm(db, &doomed_on_b).unwrap().is_none());
    }
}

#[test]
fn an_algorithm_retuned_after_a_dependent_deck_was_created_reaches_a_fresh_replica() {
    let a = replica();
    let algorithm = add_algorithm(&a, "FSRS");
    let template = add_template(&a, "Basic");
    let deck = add_deck(&a, &algorithm, &template, "Spanish");
    edit_algorithm(&a, &algorithm, None, Some(retention(85.0)));

    let b = replica();
    let mut space = FakeSpace::default();
    space.push(&a);
    space.pull(&b);

    assert_eq!(get_deck(&b, &deck).unwrap().unwrap().algorithm_id, algorithm);
    assert_eq!(get_algorithm(&b, &algorithm).unwrap().unwrap().content, retention(85.0));
}
