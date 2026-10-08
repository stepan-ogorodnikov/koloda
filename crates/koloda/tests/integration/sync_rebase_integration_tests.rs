//! The re-bootstrap barrier and absence cleanup (`crates/koloda-sync-proto/PROTOCOL.md` §Re-bootstrap). A test
//! streams the creates the space still holds, as a snapshot and catch-up would, then ends the re-bootstrap.

use std::collections::HashMap;

use koloda::app::db::Database;
use koloda::domain::decks::{UpdateDeckData, UpdateDeckValues};
use koloda::repo::decks::{get_deck, update_deck};
use koloda::repo::sync::apply::{apply_snapshot_page, PageEntry};
use koloda::repo::sync::outbox::{push_batch, settle_push};
use koloda::repo::sync::rebase::{begin_rebase, finish_rebase};
use koloda_sync_proto::registry::{Kind, Lane};
use koloda_sync_proto::transport::{HeldReason, Outcome, PushOutcome};
use uuid::Uuid;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use crate::common::sync::{apply, count, device, hot_page, outbox, replica, starter, FakeSpace};

/// Every create the replica has not pushed yet, by entity id, as the bytes a server would hold.
fn creates(db: &Database) -> HashMap<String, Vec<u8>> {
    outbox(db)
        .into_iter()
        .filter(|entry| {
            entry
                .envelope
                .header
                .group
                .is_some_and(|group| group.as_wire() == "create")
        })
        .map(|entry| {
            (
                entry.envelope.header.id.clone(),
                entry.envelope.encode().expect("envelope encodes"),
            )
        })
        .collect()
}

/// Streams these envelopes as one `hot` snapshot page from the replica's own sender.
fn stream(db: &Database, envelopes: Vec<Vec<u8>>) {
    let sender = device(db);
    let entries: Vec<PageEntry> = envelopes
        .into_iter()
        .enumerate()
        .map(|(index, envelope)| PageEntry {
            seq: i64::try_from(index).expect("index fits") + 1,
            sender,
            sender_seq: i64::try_from(index).expect("index fits") + 1,
            envelope,
        })
        .collect();
    apply_snapshot_page(db, Lane::Hot, &entries, &starter()).expect("snapshot page applies");
}

fn finish(db: &Database) -> Vec<Kind> {
    finish_rebase(db, 0, &starter()).expect("re-bootstrap finishes")
}

fn present(db: &Database, table: &str, id: &str) -> bool {
    count(db, &format!("SELECT COUNT(*) FROM {table} WHERE id = '{id}'")) == 1
}

fn pending_for(db: &Database, id: &str) -> usize {
    outbox(db).iter().filter(|entry| entry.envelope.header.id == id).count()
}

fn generation(db: &Database) -> i64 {
    count(db, "SELECT rebase_generation FROM sync_state WHERE id = 1")
}

fn retitle(db: &Database, deck: &str, title: &str) {
    let current = get_deck(db, deck).expect("deck reads").expect("deck exists");
    update_deck(
        db,
        UpdateDeckData {
            id: deck.to_string(),
            values: UpdateDeckValues {
                title: title.to_string(),
                algorithm_id: current.algorithm_id,
                template_id: current.template_id,
                notes: current.notes,
            },
        },
    )
    .expect("deck updates");
}

#[test]
fn a_deck_the_space_no_longer_holds_goes_with_its_cards_and_pending_writes() {
    let db = replica();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let kept = add_deck(&db, &algorithm, &template, "Kept");
    let gone = add_deck(&db, &algorithm, &template, "Gone");
    let card = add_card(&db, &gone, &template, "hola");
    let sent = creates(&db);
    FakeSpace::default().push(&db);
    retitle(&db, &kept, "Kept again");
    retitle(&db, &gone, "Gone again");
    let pending_card = add_card(&db, &gone, &template, "nuevo");

    // Another device created a deck this replica never saw.
    let other = replica();
    let other_algorithm = add_algorithm(&other, "Other FSRS");
    let other_template = add_template(&other, "Other Basic");
    let arrived = add_deck(&other, &other_algorithm, &other_template, "Arrived");
    let other_creates = creates(&other);

    begin_rebase(&db).expect("barrier opens");
    stream(
        &db,
        vec![
            sent[&algorithm].clone(),
            sent[&template].clone(),
            other_creates[&other_algorithm].clone(),
            other_creates[&other_template].clone(),
            other_creates[&arrived].clone(),
        ],
    );
    // The kept deck arrives in catch-up rather than the snapshot.
    apply(&db, &hot_page(Uuid::now_v7(), vec![sent[&kept].clone()], 10)).expect("catch-up applies");
    let changed = finish(&db);

    assert!(present(&db, "decks", &kept), "a deck the space holds stays");
    assert_eq!(pending_for(&db, &kept), 1, "with its pending rename");
    assert!(present(&db, "decks", &arrived), "a deck the snapshot inserted stays");
    assert!(!present(&db, "decks", &gone), "a deck the space no longer holds goes");
    assert!(!present(&db, "cards", &card), "its card goes with it");
    assert!(
        !present(&db, "cards", &pending_card),
        "a pending card under it goes too"
    );
    assert_eq!(
        pending_for(&db, &gone) + pending_for(&db, &pending_card),
        0,
        "their pending writes go"
    );
    assert_eq!(
        count(&db, "SELECT COUNT(*) FROM sync_tombstones"),
        0,
        "cleanup records no tombstone"
    );
    assert!(changed.contains(&Kind::Decks) && changed.contains(&Kind::Cards));
    assert_eq!(
        count(&db, "SELECT is_rebasing FROM sync_state WHERE id = 1"),
        0,
        "the barrier closes"
    );
}

#[test]
fn creates_the_server_never_took_stay_whether_pending_in_flight_or_held() {
    let db = replica();
    let algorithm = add_algorithm(&db, "FSRS");
    let sent = creates(&db);
    FakeSpace::default().push(&db);

    let held = add_template(&db, "Held");
    let batch = push_batch(&db, 1000, usize::MAX).expect("batch picks");
    let outcomes: Vec<PushOutcome> = batch
        .items
        .iter()
        .map(|item| PushOutcome {
            sender_seq: item.sender_seq,
            outcome: Outcome::Held {
                reason: HeldReason::Schema,
            },
            replayed: false,
            missing_attachments: Vec::new(),
        })
        .collect();
    settle_push(&db, &batch, &outcomes, &starter()).expect("reply settles");
    let in_flight = add_template(&db, "In flight");
    push_batch(&db, 1000, usize::MAX).expect("batch picks");
    let pending = add_template(&db, "Pending");

    begin_rebase(&db).expect("barrier opens");
    stream(&db, vec![sent[&algorithm].clone()]);
    finish(&db);

    for (template, case) in [(held, "held"), (in_flight, "in flight"), (pending, "pending")] {
        assert!(present(&db, "templates", &template), "a {case} create stays");
    }
}

#[test]
fn writes_captured_while_the_barrier_is_open_stay() {
    let db = replica();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    let sent = creates(&db);
    FakeSpace::default().push(&db);

    begin_rebase(&db).expect("barrier opens");
    let during = add_template(&db, "During");
    let card = add_card(&db, &deck, &template, "hola");
    retitle(&db, &deck, "Renamed");
    stream(
        &db,
        vec![sent[&algorithm].clone(), sent[&template].clone(), sent[&deck].clone()],
    );
    finish(&db);

    assert!(present(&db, "templates", &during));
    assert!(present(&db, "cards", &card));
    assert_eq!(pending_for(&db, &deck), 1, "the rename stays pending");
}

#[test]
fn a_template_the_space_no_longer_holds_repairs_pointers_and_drops_its_cards() {
    let db = replica();
    let algorithm = add_algorithm(&db, "FSRS");
    let gone = add_template(&db, "Gone");
    let live = add_template(&db, "Live");
    let deck = add_deck(&db, &algorithm, &live, "Spanish");
    let card = add_card(&db, &deck, &gone, "hola");
    let sent = creates(&db);
    FakeSpace::default().push(&db);
    let pending_deck = add_deck(&db, &algorithm, &gone, "Pending");

    begin_rebase(&db).expect("barrier opens");
    stream(
        &db,
        vec![sent[&algorithm].clone(), sent[&live].clone(), sent[&deck].clone()],
    );
    finish(&db);

    assert!(!present(&db, "templates", &gone));
    assert!(!present(&db, "cards", &card), "a card on the template goes with it");
    let repaired = get_deck(&db, &pending_deck)
        .expect("deck reads")
        .expect("pending deck stays");
    assert_eq!(repaired.template_id, live, "the pointer repairs to the live template");
    let published = outbox(&db).into_iter().any(|entry| {
        let header = &entry.envelope.header;
        header.id == pending_deck
            && header.group.is_some_and(|group| group.as_wire() == "template")
            && header.refs.template_id.as_deref() == Some(live.as_str())
    });
    assert!(published, "the repair is published");
    assert_eq!(
        count(&db, "SELECT COUNT(*) FROM sync_tombstones"),
        0,
        "cleanup records no tombstone"
    );
}

#[test]
fn one_barrier_per_rebase_and_old_marks_protect_nothing() {
    let db = replica();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    let sent = creates(&db);
    FakeSpace::default().push(&db);

    begin_rebase(&db).expect("barrier opens");
    begin_rebase(&db).expect("open barrier resumes");
    assert_eq!(generation(&db), 1, "a second open resumes the same re-bootstrap");
    stream(
        &db,
        vec![sent[&algorithm].clone(), sent[&template].clone(), sent[&deck].clone()],
    );
    finish(&db);
    assert!(present(&db, "decks", &deck));

    begin_rebase(&db).expect("barrier opens again");
    assert_eq!(generation(&db), 2);
    stream(&db, vec![sent[&algorithm].clone(), sent[&template].clone()]);
    finish(&db);
    assert!(
        !present(&db, "decks", &deck),
        "a mark from the last re-bootstrap does not keep it"
    );
}

#[test]
fn an_empty_space_empties_the_four_kinds_and_keeps_revisions_and_settings() {
    let db = replica();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    add_card(&db, &deck, &template, "hola");
    FakeSpace::default().push(&db);
    let revisions = count(&db, "SELECT COUNT(*) FROM algorithm_revisions");
    let settings = count(&db, "SELECT COUNT(*) FROM settings");

    begin_rebase(&db).expect("barrier opens");
    finish(&db);

    for table in ["algorithms", "templates", "decks", "cards"] {
        assert_eq!(
            count(&db, &format!("SELECT COUNT(*) FROM {table}")),
            0,
            "{table} empties"
        );
    }
    assert_eq!(
        count(&db, "SELECT COUNT(*) FROM algorithm_revisions"),
        revisions,
        "revisions outlive it"
    );
    assert_eq!(
        count(&db, "SELECT COUNT(*) FROM settings"),
        settings,
        "settings are never absent"
    );
}
