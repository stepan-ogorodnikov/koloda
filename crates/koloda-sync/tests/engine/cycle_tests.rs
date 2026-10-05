use std::collections::BTreeMap;

use koloda::domain::cards::{CardContentField, UpdateCardData, UpdateCardValues};
use koloda::domain::decks::DeleteDeckData;
use koloda::domain::seed_ids::{SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID};
use koloda::repo::{cards, decks};
use koloda_sync::error::SyncError;
use koloda_sync_proto::payload::{CardCreate, CardScheduling, Payload, Review};
use koloda_sync_proto::registry::{Kind, Lane};
use uuid::Uuid;

use crate::common::{system_ms, Device, Fault, Space};
use crate::fixtures::{BACK, FRONT};

#[test]
fn two_devices_converge_on_edits_grades_and_deletes() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A pushes its library");
    let b = space.server.join(a);
    b.engine.sync_now().expect("B pulls the library");
    assert!(b.has_card(&library.card), "B holds A's card");

    cards::update_card(
        &b.db,
        UpdateCardData {
            id: library.card.clone(),
            values: UpdateCardValues {
                content: [
                    (
                        FRONT.to_string(),
                        CardContentField {
                            text: "edited on B".to_string(),
                        },
                    ),
                    (
                        BACK.to_string(),
                        CardContentField {
                            text: "answer".to_string(),
                        },
                    ),
                ]
                .into_iter()
                .collect(),
            },
        },
    )
    .expect("B edits the card");
    b.grade(&library.card);
    a.update_deck(&library.deck, "Renamed on A", &library.algorithm, &library.template);
    a.engine.sync_now().expect("A pushes its rename");
    b.engine
        .sync_now()
        .expect("B pushes its edit and grade, and pulls the rename");
    a.engine.sync_now().expect("A pulls the edit and grade");

    assert_eq!(a.card_front(&library.card), "edited on B");
    assert_eq!(a.reviews(&library.card), 1, "B's grade reaches A");
    assert_eq!(
        b.deck(&library.deck).map(|deck| deck.title).as_deref(),
        Some("Renamed on A")
    );

    decks::delete_deck(
        &a.db,
        DeleteDeckData {
            id: library.deck.clone(),
        },
    )
    .expect("A deletes the deck");
    a.engine.sync_now().expect("A pushes the delete");
    let changed = b.engine.sync_now().expect("B pulls the delete");

    assert!(b.deck(&library.deck).is_none(), "the deck is gone on B");
    assert!(!b.has_card(&library.card), "with its card");
    assert_eq!(b.reviews(&library.card), 0, "and the card's review");
    assert!(
        changed.contains(&Kind::Decks) && changed.contains(&Kind::Cards),
        "{changed:?}"
    );
}

fn review(card: &str, now: i64) -> Payload {
    Payload::Review(Review {
        card_id: card.to_string(),
        rating: 3,
        state: 1,
        due_at: now + 600_000,
        stability: 1.0,
        difficulty: 5.0,
        scheduled_days: 0,
        learning_steps: 1,
        time: 10,
        is_ignored: false,
        created_at: now,
    })
}

#[test]
fn a_review_pushed_while_hot_is_pulled_waits_for_its_card() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("the library is pushed");
    let now = i64::try_from(system_ms()).expect("now fits");
    // WHY: a review already in `cold` makes the first round pull `cold` at all.
    space.raw_push(
        &Uuid::now_v7().to_string(),
        Some(&library.card),
        space.raw_stamp(0),
        &review(&library.card, now),
    );
    let card = Uuid::now_v7().to_string();
    let create = Payload::CardCreate(CardCreate {
        deck_id: library.deck.clone(),
        template_id: library.template.clone(),
        content: format!(r#"{{"{FRONT}":{{"text":"from the raw client"}}}}"#),
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
        created_at: now,
        initial_product_ts: BTreeMap::new(),
        legacy_product_ts_floor: None,
    });
    let stamp = space.raw_stamp(0);
    let push = space.raw_request(vec![
        (card.clone(), Some(library.deck.clone()), stamp, create),
        (
            Uuid::now_v7().to_string(),
            Some(card.clone()),
            stamp,
            review(&card, now),
        ),
    ]);
    // The raw client pushes a card and its review right after the engine's first `hot` page is read.
    space.device.transport.fault_on("lane=hot", Fault::After(vec![push]));

    space.device.engine.sync_now().expect("the cycle runs");

    assert_eq!(space.device.reviews(&library.card), 1, "the earlier review arrives");
    assert!(space.device.has_card(&card), "the card arrives in a later round");
    assert_eq!(
        space.device.reviews(&card),
        1,
        "the review is pulled after its card, never dropped for a missing parent"
    );
}

/// Builds a space and returns a file that is behind its own device record.
type BehindFile = fn(&Space) -> Device;

#[test]
fn a_file_behind_its_own_record_pushes_and_pulls_nothing() {
    let cases: [(&str, BehindFile); 3] = [
        ("the record has consumed the file's next seq", |space| {
            let library = space.device.library();
            space.device.engine.sync_now().expect("the library is pushed");
            let copy = space.server.copy(&space.device);
            space
                .device
                .update_deck(&library.deck, "Renamed", &library.algorithm, &library.template);
            space.device.engine.sync_now().expect("the original pushes on");
            copy
        }),
        ("a row not yet sent has a consumed seq", |space| {
            let library = space.device.library();
            space.device.engine.sync_now().expect("the library is pushed");
            let copy = space.server.copy(&space.device);
            space
                .device
                .update_deck(&library.deck, "Renamed", &library.algorithm, &library.template);
            space.device.engine.sync_now().expect("the original pushes on");
            copy.update_deck(&library.deck, "Copy", &library.algorithm, &library.template);
            copy
        }),
        ("a seq the file never kept was consumed", |space| {
            let library = space.device.library();
            space.device.engine.sync_now().expect("the library is pushed");
            let copy = space.server.copy(&space.device);
            copy.update_deck(&library.deck, "Copy", &library.algorithm, &library.template);
            copy.engine.sync_now().expect("the copy pushes first");
            // WHY: a second save of the same group replaces the unsent row at a new seq, so the file keeps no row
            // at the seq the copy used.
            space
                .device
                .update_deck(&library.deck, "Renamed", &library.algorithm, &library.template);
            space
                .device
                .update_deck(&library.deck, "Renamed again", &library.algorithm, &library.template);
            space.server.copy(&space.device)
        }),
    ];

    for (name, arrange) in cases {
        let space = Space::new();
        let file = arrange(&space);
        let pending = file.outbox().len();
        let cursors = file.cursors();
        let sent = file.transport.sent().len();

        let result = file.engine.sync_now();

        assert!(matches!(result, Err(SyncError::Behind)), "{name}: {result:?}");
        let requests: Vec<String> = file
            .transport
            .sent()
            .into_iter()
            .skip(sent)
            .map(|request| request.url)
            .collect();
        assert!(
            requests
                .iter()
                .all(|url| !url.contains("/push") && !url.contains("/pull")),
            "{name}: no push and no pull: {requests:?}"
        );
        assert_eq!(file.outbox().len(), pending, "{name}: nothing is pushed");
        assert_eq!(file.cursors(), cursors, "{name}: nothing is applied");
    }
}

#[test]
fn a_clock_off_by_more_than_five_minutes_pauses_push_and_apply() {
    for (offset_minutes, is_paused) in [(6, true), (-6, true), (4, false), (-4, false)] {
        let space = Space::new();
        space.server.clock.set_offset(offset_minutes * 60 * 1000);
        space.device.library();
        let pending = space.device.outbox().len();
        let sent = space.device.transport.sent().len();

        let result = space.device.engine.sync_now();

        if is_paused {
            assert!(
                matches!(result, Err(SyncError::ClockSkew { .. })),
                "{offset_minutes} min: {result:?}"
            );
            assert_eq!(
                space.device.transport.sent().len(),
                sent + 1,
                "{offset_minutes} min: only the device record is read"
            );
            assert_eq!(
                space.device.outbox().len(),
                pending,
                "{offset_minutes} min: nothing is pushed"
            );
        } else {
            let error = result.err();
            assert!(error.is_none(), "{offset_minutes} min: {error:?}");
            assert!(
                space.device.outbox().is_empty(),
                "{offset_minutes} min: the outbox is pushed"
            );
        }
    }
}

#[test]
fn a_dangling_learning_default_is_repaired_after_catch_up_and_pushed() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("the library is pushed");
    let b = space.server.join(&space.device);
    assert_eq!(
        b.learning_defaults(),
        (SEED_ALGORITHM_SIMPLE_ID.to_string(), SEED_TEMPLATE_TYPE_ID.to_string()),
        "a blank joiner's defaults name the seed ids, which this space never held"
    );

    b.engine.sync_now().expect("B syncs");

    assert_eq!(
        b.learning_defaults(),
        (library.algorithm.clone(), library.template.clone()),
        "the defaults move to the live rows once B has caught up"
    );
    assert!(b.outbox().is_empty(), "the repair is pushed in the same call");
    let b_id = b.state().expect("B is enrolled").device_id;
    let repairs = space
        .raw_pull(Lane::Hot, 0)
        .entries
        .into_iter()
        .filter(|entry| entry.sender == *b_id.as_bytes())
        .count();
    assert_eq!(repairs, 2, "both default pointers reach the server");
}

#[test]
fn a_seq_the_file_dropped_is_not_taken_for_another_copy() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("the library is pushed");
    // A second save of the same group replaces the unsent row at a new seq, so the first seq is never pushed.
    space
        .device
        .update_deck(&library.deck, "Renamed", &library.algorithm, &library.template);
    space
        .device
        .update_deck(&library.deck, "Renamed again", &library.algorithm, &library.template);
    for _ in 0..4 {
        space.device.transport.fault_on("/push", Fault::LoseReply);
    }
    let lost = space.device.engine.sync_now();
    assert!(matches!(lost, Err(SyncError::Transport(_))), "{lost:?}");

    let error = space.device.engine.sync_now().err();

    assert!(
        error.is_none(),
        "the record is ahead of what the file saw consumed, but every receipt there is the file's own row: {error:?}"
    );
    assert!(space.device.outbox().is_empty(), "the replay settles the rename");
}
