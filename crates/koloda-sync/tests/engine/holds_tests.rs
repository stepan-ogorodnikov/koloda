//! A lane held at an envelope this app cannot read (`crates/koloda-sync-proto/PROTOCOL.md` §Corrupt envelopes): the
//! cycle goes on around it, and the next one passes it once the bytes read again.

use koloda::domain::cards::ResetCardProgressData;
use koloda::domain::decks::DeleteDeckData;
use koloda::repo::sync::apply::{Hold, HoldReason};
use koloda::repo::{cards, decks};
use koloda_sync::error::SyncError;
use koloda_sync::status::State;
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::payload::{Payload, Review};
use koloda_sync_proto::registry::Lane;
use koloda_sync_proto::transport::{ErrorCode, RestoreMode};
use uuid::Uuid;

use crate::common::{error_reply, system_ms, Device, Fault, Space, SERVER_URL};
use crate::fixtures::{review, seed_settings};

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

fn drop_version(space: &Space, at: (Lane, u64)) {
    let server = space.server.server();
    let dropping = server
        .describe_drop(space.space_id(), at.0, at.1)
        .expect("the version is described");
    server
        .drop_envelope(space.space_id(), &dropping)
        .expect("the version is dropped");
}

#[test]
fn a_dropped_envelope_releases_the_hold_and_a_dropped_create_ends_deleted_everywhere() {
    // Which write is damaged, then dropped; and what each device ends with: the added card on A and B, B's deck
    // title, and B's reviews of the first card.
    let cases = [
        ("card create", "cards", "create", (false, false), "Renamed on A", 1),
        ("deck title", "decks", "title", (true, true), "Spanish", 1),
        ("review", "reviews", "row", (true, true), "Renamed on A", 0),
    ];
    for (case, kind, group, has_added, title, reviews) in cases {
        let space = Space::new();
        let a = &space.device;
        let library = a.library();
        a.engine.sync_now().expect("A pushes its library");
        let b = space.server.join(a);
        b.engine.sync_now().expect("B pulls the library");
        let added = a.add_card(&library.deck, &library.template, "nuevo");
        a.update_deck(&library.deck, "Renamed on A", &library.algorithm, &library.template);
        a.grade(&library.card);
        a.engine.sync_now().expect("A pushes its writes");
        let id = match kind {
            "cards" => added.clone(),
            "decks" => library.deck.clone(),
            _ => a.text("SELECT id FROM reviews"),
        };
        let at = space.server.version(space.space_id(), kind, &id, group);
        space.server.damage(space.space_id(), at, unreadable_payload);
        b.engine.sync_now().expect("B holds");
        assert!(hold(&b).is_some(), "{case}");

        drop_version(&space, at);
        b.engine.sync_now().expect("B passes the dropped seq");
        a.engine.sync_now().expect("A pulls what the drop wrote");

        assert_eq!(hold(&b), None, "{case}");
        assert_eq!((a.has_card(&added), b.has_card(&added)), has_added, "{case}");
        assert_eq!(
            b.deck(&library.deck).map(|deck| deck.title).as_deref(),
            Some(title),
            "{case}"
        );
        assert_eq!(b.reviews(&library.card), reviews, "{case}");
    }
}

#[test]
fn a_review_that_breaks_a_domain_rule_holds_cold_until_it_is_dropped() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A pushes its library");
    let b = space.server.join(a);
    b.engine.sync_now().expect("B pulls the library");
    let now = i64::try_from(system_ms()).expect("now fits");
    let broken = Uuid::now_v7().to_string();
    let valid = match review(&library.card, now) {
        Payload::Review(valid) => Some(valid),
        _ => None,
    }
    .expect("the fixture is a review");
    // The server never reads a payload, so it takes a rating no app writes.
    space.raw_push(
        &broken,
        Some(&library.card),
        space.raw_stamp(0),
        &Payload::Review(Review { rating: 7, ..valid }),
    );
    space.raw_push(
        &Uuid::now_v7().to_string(),
        Some(&library.card),
        space.raw_stamp(1),
        &review(&library.card, now),
    );

    a.update_deck(&library.deck, "Renamed on A", &library.algorithm, &library.template);
    a.engine.sync_now().expect("A's cycle goes on around the hold");

    let at = space.server.version(space.space_id(), "reviews", &broken, "row");
    assert_eq!(
        hold(a),
        Some(Hold {
            lane: Lane::Cold,
            seq: i64::try_from(at.1).expect("seq fits"),
            reason: HoldReason::CorruptEnvelope,
        })
    );
    assert_eq!(a.reviews(&library.card), 0, "nothing after the held review applies");
    b.engine.sync_now().expect("B's cycle goes on around the hold");
    assert_eq!(
        b.deck(&library.deck).map(|deck| deck.title).as_deref(),
        Some("Renamed on A"),
        "A pushed while it held"
    );

    drop_version(&space, at);
    a.engine.sync_now().expect("A passes the dropped seq");

    assert_eq!(hold(a), None);
    assert_eq!(a.reviews(&library.card), 1, "the review after it applies");
}

#[test]
fn heal_re_pushes_the_server_tombstone_of_a_dropped_create() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A pushes its library");
    let b = space.server.join(a);
    b.engine.sync_now().expect("B pulls the library");
    let backup = space.server.backup();
    let at = space.server.version(space.space_id(), "cards", &library.card, "create");
    space.server.damage(space.space_id(), at, unreadable_payload);
    drop_version(&space, at);
    a.engine.sync_now().expect("A applies the server's tombstone");
    assert!(!a.has_card(&library.card));

    // B was offline across the drop; the backup still holds the card's create, intact.
    space.server.restore(&backup, RestoreMode::Heal);
    a.engine.sync_now().expect("A heals, re-pushing the tombstone");
    b.engine.sync_now().expect("B heals and pulls the tombstone");

    assert!(!b.has_card(&library.card), "the card stays deleted");
    let c = space.server.join(a);
    c.engine.sync_now().expect("a new device pulls the space");
    assert!(!c.has_card(&library.card));
    assert!(c.deck(&library.deck).is_some());
}

fn create_hlc(device: &Device, kind: &str, id: &str) -> i64 {
    device.count(&format!(
        "SELECT hlc FROM sync_origins WHERE kind = '{kind}' AND id = '{id}' AND group_name = 'create'"
    ))
}

#[test]
fn writes_held_over_the_quota_go_out_at_their_stamps_once_the_space_has_room() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A pushes its library");
    let b = space.server.join(a);
    b.engine.sync_now().expect("B pulls the library");
    let server = space.server.server();
    server.set_quota(space.space_id(), Some(1)).expect("the quota is set");
    let deck = a.add_deck(&library.algorithm, &library.template, "French");
    let card = a.add_card(&deck, &library.template, "bonjour");

    a.engine.sync_now().expect("A's writes are held");

    let status = a.engine.status().expect("status reads");
    assert!(status.is_over_quota);
    assert!(status.held > 0);
    decks::delete_deck(
        &a.db,
        DeleteDeckData {
            id: library.deck.clone(),
        },
    )
    .expect("A deletes a deck");
    a.engine.sync_now().expect("A's delete goes out over the quota");
    b.engine.sync_now().expect("B pulls");
    assert!(b.deck(&library.deck).is_none(), "a delete applies over the quota");
    assert!(b.deck(&deck).is_none(), "the held deck has not reached the space");

    server
        .set_quota(space.space_id(), None)
        .expect("the operator lifts the quota");
    // A push refused after the release stands in for the app stopping between the two.
    a.transport
        .fault_on("/push", Fault::Reply(error_reply(507, ErrorCode::InsufficientStorage)));
    a.engine.sync_now().expect_err("the push is refused");
    assert_eq!(
        a.engine.status().expect("status reads").held,
        0,
        "the release is stored"
    );
    let a = space.server.relaunch(a);
    a.engine.sync_now().expect("A pushes its held writes");
    b.engine.sync_now().expect("B pulls them");

    let status = a.engine.status().expect("status reads");
    assert!(!status.is_over_quota);
    assert_eq!(status.held, 0);
    assert!(b.deck(&deck).is_some());
    assert!(b.has_card(&card));
    assert_eq!(
        create_hlc(&b, "cards", &card),
        create_hlc(&a, "cards", &card),
        "the card keeps the stamp it was captured with"
    );
}
