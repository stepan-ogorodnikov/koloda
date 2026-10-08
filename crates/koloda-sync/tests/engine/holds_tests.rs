//! A lane held at an envelope this app cannot read (`crates/koloda-sync-proto/PROTOCOL.md` §Corrupt envelopes): the
//! cycle goes on around it, and the next one passes it once the bytes read again.

use koloda::domain::cards::ResetCardProgressData;
use koloda::domain::decks::DeleteDeckData;
use koloda::repo::sync::apply::{Hold, HoldReason};
use koloda::repo::{cards, decks};
use koloda_sync::error::SyncError;
use koloda_sync::status::State;
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::registry::Lane;

use crate::common::{Device, Space, SERVER_URL};
use crate::fixtures::seed_settings;

/// The envelope with a payload no app version could have written; its header still reads.
fn unreadable_payload(bytes: &[u8]) -> Vec<u8> {
    let envelope = Envelope::decode(bytes).expect("the stored envelope decodes");
    Envelope {
        header: envelope.header,
        payload: vec![0xff, 0x00],
    }
    .encode()
    .expect("the damaged envelope encodes")
}

fn hold(device: &Device) -> Option<Hold> {
    device.engine.status().expect("status reads").hold
}

#[test]
fn a_corrupt_card_create_holds_both_lanes_while_pushes_go_on() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A pushes its library");
    let b = space.server.join(a);
    b.engine.sync_now().expect("B pulls the library");
    let added = a.add_card(&library.deck, &library.template, "nuevo");
    a.grade(&library.card);
    a.engine.sync_now().expect("A pushes the card and the grade");
    let at = space.server.version(space.space_id(), "cards", &added, "create");
    let stored = space.server.damage(space.space_id(), at, unreadable_payload);

    b.update_deck(&library.deck, "Renamed on B", &library.algorithm, &library.template);
    b.engine.sync_now().expect("B's cycle goes on around the hold");

    assert_eq!(
        hold(&b),
        Some(Hold {
            lane: Lane::Hot,
            seq: i64::try_from(at.1).expect("seq fits"),
            reason: HoldReason::CorruptEnvelope,
        })
    );
    assert!(!b.has_card(&added));
    assert_eq!(b.reviews(&library.card), 0, "a `hot` hold stops `cold` too");
    a.engine.sync_now().expect("A pulls");
    assert_eq!(
        a.deck(&library.deck).map(|deck| deck.title).as_deref(),
        Some("Renamed on B"),
        "B pushed while it held"
    );

    // Putting the bytes back stands in for an app upgrade that reads them.
    space.server.damage(space.space_id(), at, |_| stored);
    b.engine.sync_now().expect("B passes the entry");

    assert_eq!(hold(&b), None);
    assert!(b.has_card(&added));
    assert_eq!(b.reviews(&library.card), 1);
}

#[test]
fn a_corrupt_review_holds_cold_only() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A pushes its library");
    let b = space.server.join(a);
    b.engine.sync_now().expect("B pulls the library");
    a.grade(&library.card);
    a.engine.sync_now().expect("A pushes the grade");
    let review = a.text("SELECT id FROM reviews");
    let at = space.server.version(space.space_id(), "reviews", &review, "row");
    space.server.damage(space.space_id(), at, unreadable_payload);
    a.update_deck(&library.deck, "Renamed on A", &library.algorithm, &library.template);
    a.engine.sync_now().expect("A pushes its rename");

    b.engine.sync_now().expect("B's cycle goes on around the hold");

    assert_eq!(hold(&b).map(|hold| hold.lane), Some(Lane::Cold));
    assert_eq!(b.reviews(&library.card), 0);
    assert_eq!(
        b.deck(&library.deck).map(|deck| deck.title).as_deref(),
        Some("Renamed on A"),
        "`hot` writes still arrive"
    );
}

#[test]
fn a_corrupt_delete_and_reset_apply_and_the_cursor_passes_them() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    let other = a.add_deck(&library.algorithm, &library.template, "French");
    a.grade(&library.card);
    a.engine.sync_now().expect("A pushes its library");
    let b = space.server.join(a);
    b.engine.sync_now().expect("B pulls the library");
    assert_eq!(b.reviews(&library.card), 1);
    cards::reset_card_progress(
        &a.db,
        ResetCardProgressData {
            id: library.card.clone(),
        },
    )
    .expect("A resets the card");
    decks::delete_deck(&a.db, DeleteDeckData { id: other.clone() }).expect("A deletes a deck");
    a.engine.sync_now().expect("A pushes the reset and the delete");
    for (kind, id, group) in [("cards", &library.card, "reset"), ("decks", &other, "")] {
        let at = space.server.version(space.space_id(), kind, id, group);
        space.server.damage(space.space_id(), at, unreadable_payload);
    }

    b.engine.sync_now().expect("B syncs");

    let status = b.engine.status().expect("status reads");
    assert_eq!(status.hold, None);
    assert_eq!(status.lag_hot, Some(0), "the cursor passed both");
    assert_eq!(b.reviews(&library.card), 0, "the reset applied");
    assert!(b.deck(&other).is_none(), "the delete applied");
}

#[test]
fn an_envelope_of_an_unknown_kind_needs_an_update() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A pushes its library");
    let b = space.server.join(a);
    b.engine.sync_now().expect("B pulls the library");
    a.update_deck(&library.deck, "Renamed on A", &library.algorithm, &library.template);
    a.engine.sync_now().expect("A pushes its rename");
    let at = space.server.version(space.space_id(), "decks", &library.deck, "title");
    space.server.damage(space.space_id(), at, |stored| {
        let mut renamed = stored.to_vec();
        let kind = renamed
            .windows(5)
            .position(|window| window == b"decks")
            .expect("the header names its kind");
        renamed
            .get_mut(kind..kind + 5)
            .expect("the kind is inside the bytes")
            .copy_from_slice(b"dacks");
        renamed
    });

    b.engine.sync_now().expect("B syncs");

    assert_eq!(hold(&b).map(|hold| hold.reason), Some(HoldReason::UpdateRequired));
}

#[test]
fn a_bootstrap_that_meets_a_corrupt_entry_stops_and_starts_over_once_it_reads() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A pushes its library");
    let at = space.server.version(space.space_id(), "cards", &library.card, "create");
    let stored = space.server.damage(space.space_id(), at, unreadable_payload);
    let code = a.engine.issue_pairing(None).expect("a code is issued").code;
    let b = space.server.device();
    b.engine
        .join(SERVER_URL, &code, "Phone", seed_settings())
        .expect("B claims the code");

    let error = b.engine.sync_now().expect_err("the bootstrap stops at the entry");

    assert!(matches!(error, SyncError::Held(hold) if hold.reason == HoldReason::CorruptEnvelope));
    let status = b.engine.status().expect("status reads");
    assert_eq!(status.state, State::Bootstrapping);
    assert_eq!(status.hold.map(|hold| hold.lane), Some(Lane::Hot));
    assert_eq!(
        space.server.count_leases(space.space_id()),
        0,
        "the stopped bootstrap released its lease"
    );

    space.server.damage(space.space_id(), at, |_| stored);
    b.engine.sync_now().expect("B bootstraps from a new lease");

    let status = b.engine.status().expect("status reads");
    assert_eq!(status.state, State::Idle);
    assert_eq!(status.hold, None);
    assert!(b.has_card(&library.card));
}
