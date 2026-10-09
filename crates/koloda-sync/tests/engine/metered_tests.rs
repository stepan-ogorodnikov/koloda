use koloda::repo::sync::outbox::pending_bytes;
use koloda_sync::error::SyncError;
use koloda_sync::metered::{MeteredPause, Network};
use koloda_sync::transport::Method;
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::payload::{Payload, Title};
use koloda_sync_proto::registry::{Group, Kind, Lane};
use koloda_sync_proto::transport::RestoreMode;

use crate::common::{Device, Space, SERVER_URL};
use crate::fixtures::{links, seed_settings, Library};

// WHY: above a grade's outbox, and below a library's snapshot or a page of a hundred reviews, even compressed.
const LIMIT: u64 = 2_000;

fn metered() -> Network {
    Network {
        is_metered: true,
        bulk_limit_bytes: LIMIT,
    }
}

/// Card creates the server holds, as the raw client pulls them.
fn cards_on_server(space: &Space) -> usize {
    space
        .raw_pull(Lane::Hot, 0)
        .entries
        .iter()
        .map(|entry| Envelope::decode(&entry.envelope).expect("an envelope").header)
        .filter(|header| header.kind == Kind::Cards && header.group == Some(Group::Create))
        .count()
}

fn card_ids(device: &Device) -> Vec<String> {
    device.ids("cards").split(',').map(str::to_string).collect()
}

/// Grades every card of the device five times, enough reviews that one `cold` page spends the allowance.
fn grade_all(device: &Device) {
    let cards = card_ids(device);
    for _ in 0..5 {
        for card in &cards {
            device.grade(card);
        }
    }
}

#[test]
fn a_bootstrap_above_the_limit_waits_with_its_estimate_until_allowed() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("the library is pushed");
    let phone = space.server.device();
    phone.engine.set_network(metered()).expect("the network is set");
    let code = space.device.engine.issue_pairing(None).expect("a code is issued").code;
    phone
        .engine
        .join(SERVER_URL, &code, "Phone", seed_settings())
        .expect("the phone joins");
    let bytes = space.snapshot_bytes();

    let paused = phone.engine.sync_now();
    let leases = space.server.count_leases(space.space_id());
    let again = phone.engine.sync_now();
    let status = phone.engine.status().expect("the status reads");
    let opened = phone
        .transport
        .sent()
        .iter()
        .filter(|request| request.method == Method::Post && request.url.ends_with("/bootstrap"))
        .count();
    phone.engine.allow_metered().expect("bulk sync is allowed");
    let allowed = phone.engine.sync_now();

    assert!(
        matches!(paused, Err(SyncError::Metered { estimate_bytes }) if estimate_bytes == bytes),
        "{paused:?}"
    );
    assert_eq!(leases, 0, "the paused bootstrap gave its lease back");
    assert!(matches!(again, Err(SyncError::Metered { .. })), "{again:?}");
    assert_eq!(opened, 1, "the second cycle paused without opening another lease");
    assert_eq!(
        status.metered,
        Some(MeteredPause {
            estimate_bytes: Some(bytes)
        })
    );
    assert!(allowed.is_ok(), "{allowed:?}");
    assert!(phone.deck(&library.deck).is_some(), "the bootstrap ran once allowed");
    assert_eq!(phone.engine.status().expect("the status reads").metered, None);
}

/// A second device that pulled the creator's library and twenty cards, now on a metered network.
fn metered_peer(space: &Space) -> (Library, Device) {
    let library = space.device.library();
    space.device.add_cards(&library.deck, &library.template, 20);
    space.device.engine.sync_now().expect("the cards are pushed");
    let peer = space.server.join(&space.device);
    peer.engine.sync_now().expect("the peer pulls the cards");
    peer.engine.set_network(metered()).expect("the network is set");
    (library, peer)
}

#[test]
fn a_spent_allowance_stops_cold_pulls_while_grades_and_edits_sync() {
    let space = Space::new();
    let (library, peer) = metered_peer(&space);
    let cards = card_ids(&space.device);
    grade_all(&space.device);
    space.device.engine.sync_now().expect("the grades are pushed");
    peer.engine.sync_now().expect("the first reviews arrive");

    space.device.grade(&library.card);
    space.device.rename_template(&library.template, "Renamed elsewhere");
    space.device.engine.sync_now().expect("the later writes are pushed");
    let reviews_before = peer.reviews(&library.card);
    let graded = cards.iter().find(|card| **card != library.card).expect("another card");
    let graded_before = space.device.reviews(graded);
    peer.grade(graded);
    peer.engine.sync_now().expect("incremental sync runs");
    let status = peer.engine.status().expect("the status reads");

    assert_eq!(
        peer.text(&format!(
            "SELECT title FROM templates WHERE id = '{}'",
            library.template
        )),
        "Renamed elsewhere",
        "the other device's edit is pulled while the allowance is spent"
    );
    assert_eq!(
        peer.reviews(&library.card),
        reviews_before,
        "the new review waits in `cold`"
    );
    assert_eq!(status.metered, Some(MeteredPause { estimate_bytes: None }));
    space.device.engine.sync_now().expect("the creator pulls");
    assert_eq!(
        space.device.reviews(graded),
        graded_before + 1,
        "the peer's grade was pushed while its pulls were paused"
    );
}

#[test]
fn another_network_lifts_the_pause_and_starts_a_new_allowance() {
    let space = Space::new();
    let (library, peer) = metered_peer(&space);
    grade_all(&space.device);
    space.device.engine.sync_now().expect("the grades are pushed");
    peer.engine.sync_now().expect("the reviews spend the allowance");
    space.device.grade(&library.card);
    space.device.engine.sync_now().expect("a later grade is pushed");
    peer.engine.sync_now().expect("its review waits");
    let waiting = peer.reviews(&library.card);

    peer.engine.set_network(Network::default()).expect("the network is set");
    peer.engine.sync_now().expect("the review arrives");
    let unmetered = peer.reviews(&library.card);
    peer.engine.set_network(metered()).expect("the network is set");
    space.device.grade(&library.card);
    space.device.engine.sync_now().expect("another grade is pushed");
    peer.engine.sync_now().expect("a fresh allowance pulls it");

    assert_eq!(unmetered, waiting + 1, "an unmetered network pulls what waited");
    assert_eq!(
        peer.reviews(&library.card),
        unmetered + 1,
        "a new metered network starts a new allowance"
    );
    assert_eq!(peer.engine.status().expect("the status reads").metered, None);
}

#[test]
fn backfill_stops_once_the_allowance_is_spent() {
    let space = Space::with(|device| {
        let library = device.library();
        device.add_cards(&library.deck, &library.template, 1_000);
    });
    space.device.engine.set_network(metered()).expect("the network is set");

    space.device.engine.sync_now().expect("the cycle runs");
    let pushed = cards_on_server(&space);
    let status = space.device.engine.status().expect("the status reads");
    space.device.engine.allow_metered().expect("bulk sync is allowed");
    space.device.engine.sync_now().expect("the backfill finishes");

    assert!(pushed < 1_001, "only the first batch went out: {pushed}");
    assert_eq!(status.metered, Some(MeteredPause { estimate_bytes: None }));
    assert_eq!(cards_on_server(&space), 1_001, "the rest went out once allowed");
}

/// Spends the peer's allowance with work that leaves none of its own waiting.
type Spend = fn(&Space, &Device, &Library);

#[test]
fn a_heal_that_meets_a_spent_allowance_shows_the_pause() {
    let cases: [(&str, Spend); 2] = [
        ("the last cold page", |space, peer, _| {
            grade_all(&space.device);
            space.device.engine.sync_now().expect("the grades are pushed");
            peer.engine.sync_now().expect("one cold page brings every review");
        }),
        ("the last image of a due batch", |space, peer, library| {
            let image = space.device.add_image(1, 3_000);
            space
                .device
                .add_card(&library.deck, &library.template, &links(&[&image]));
            space.device.engine.sync_now().expect("the image is uploaded");
            peer.engine.sync_now().expect("the peer fetches the image");
        }),
    ];

    for (name, spend) in cases {
        let space = Space::new();
        let (library, peer) = metered_peer(&space);
        spend(&space, &peer, &library);
        let spent = peer.engine.status().expect("the status reads").metered;
        let backup = space.server.backup();
        peer.update_deck(
            &library.deck,
            "Renamed on the peer",
            &library.algorithm,
            &library.template,
        );
        peer.engine.sync_now().expect("the rename is pushed");
        space.server.restore(&backup, RestoreMode::Heal);

        peer.engine.sync_now().expect("the peer takes the restore");
        let healing = peer.engine.status().expect("the status reads").metered;
        peer.engine.sync_now().expect("the next cycle runs");
        let next = peer.engine.status().expect("the status reads").metered;
        peer.engine.allow_metered().expect("bulk sync is allowed");
        peer.engine.sync_now().expect("the heal runs");
        space.device.engine.sync_now().expect("the creator pulls");

        assert_eq!(spent, None, "{name}: nothing waits while no heal runs");
        let paused = Some(MeteredPause { estimate_bytes: None });
        assert_eq!(healing, paused, "{name}: the heal waits for the allowance");
        assert_eq!(next, paused, "{name}: and still does a cycle later");
        assert_eq!(
            space.device.deck(&library.deck).map(|deck| deck.title),
            Some("Renamed on the peer".to_string()),
            "{name}: the heal re-pushes the rename once allowed"
        );
    }
}

#[test]
fn an_outbox_past_the_limit_waits_while_pulls_go_on() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("the library is pushed");
    space.device.engine.set_network(metered()).expect("the network is set");
    space.device.add_cards(&library.deck, &library.template, 20);
    let outbox = pending_bytes(&space.device.db).expect("the outbox reads");
    let rename = Payload::DeckTitle(Title {
        title: "Renamed elsewhere".to_string(),
        updated_at: Some(1),
    });
    space.raw_push(&library.deck, None, space.raw_stamp(1_000), &rename);

    space.device.engine.sync_now().expect("the cycle runs");
    let pushed = cards_on_server(&space);
    let status = space.device.engine.status().expect("the status reads");
    space.device.engine.allow_metered().expect("bulk sync is allowed");
    space.device.engine.sync_now().expect("the outbox goes out");

    assert!(outbox > LIMIT, "twenty cards are past the limit: {outbox}");
    assert_eq!(pushed, 1, "only the library's card went out");
    assert_eq!(
        space.device.deck(&library.deck).expect("the deck").title,
        "Renamed elsewhere",
        "the pull ran"
    );
    assert_eq!(
        status.metered,
        Some(MeteredPause {
            estimate_bytes: Some(outbox)
        })
    );
    assert_eq!(cards_on_server(&space), 21);
}
