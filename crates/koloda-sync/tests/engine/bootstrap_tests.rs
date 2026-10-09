use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use koloda::domain::algorithms::DeleteAlgorithmData;
use koloda::domain::cards::{CardContentField, UpdateCardData, UpdateCardValues};
use koloda::repo::{algorithms, cards};
use koloda_sync::error::SyncError;
use koloda_sync::transport::Method;
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::payload::{CardContent, Delete, Payload};
use koloda_sync_proto::registry::{Group, Kind, Lane};
use koloda_sync_proto::transport::ErrorCode;

use crate::common::{error_reply, Device, Fault, Space};
use crate::fixtures::{review, BACK, FRONT};

fn tombstone(space: &Space, kind: Kind, id: &str) {
    let payload = Payload::Delete {
        kind,
        delete: Delete { successor: None },
    };
    space.raw_push(id, None, space.raw_stamp(1_000), &payload);
}

fn edit(device: &Device, card: &str, front: &str) {
    cards::update_card(
        &device.db,
        UpdateCardData {
            id: card.to_string(),
            values: UpdateCardValues {
                content: [
                    (
                        FRONT.to_string(),
                        CardContentField {
                            text: front.to_string(),
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
    .expect("the card is edited");
}

fn requests(device: &Device) -> Vec<String> {
    device
        .transport
        .sent()
        .into_iter()
        .map(|request| format!("{:?} {}", request.method, request.url))
        .collect()
}

fn opens(device: &Device) -> usize {
    requests(device)
        .iter()
        .filter(|request| request.starts_with("Post") && request.ends_with("/bootstrap"))
        .count()
}

#[test]
fn algorithms_stream_before_a_deck_older_than_every_live_algorithm() {
    let space = Space::new();
    let a = &space.device;
    let first = a.add_algorithm("First");
    let template = a.add_template("Basic");
    let deck = a.add_deck(&first, &template, "Spanish");
    let second = a.add_algorithm("Second");
    a.update_deck(&deck, "Spanish", &second, &template);
    algorithms::delete_algorithm(
        &a.db,
        DeleteAlgorithmData {
            id: first.clone(),
            successor_id: None,
        },
    )
    .expect("the first algorithm is deleted");
    a.engine.sync_now().expect("A syncs");

    let b = space.server.join(a);
    b.engine.sync_now().expect("B bootstraps");

    assert_eq!(
        b.ids("algorithms"),
        second,
        "no default row is created for the deck's placeholder"
    );
    assert_eq!(b.deck(&deck).map(|deck| deck.algorithm_id), Some(second));
}

#[test]
fn a_compacted_bootstrap_converges_while_another_device_writes_between_pages() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    let other = a.add_card(&library.deck, &library.template, "second");
    edit(a, &library.card, "edited first");
    a.grade(&library.card);
    a.grade(&other);
    edit(a, &other, "edited after the grade");
    a.engine.sync_now().expect("A syncs");
    let b = space.server.join(a);
    let remote = Payload::CardContent(CardContent {
        content: format!(r#"{{"{FRONT}":{{"text":"from the raw client"}},"{BACK}":{{"text":"answer"}}}}"#),
        updated_at: Some(1),
    });
    let between = space.raw_request(vec![(
        library.card.clone(),
        Some(library.deck.clone()),
        space.raw_stamp(1_000),
        remote,
    )]);
    b.transport.fault_on("/bootstrap/", Fault::After(vec![between]));

    b.engine.sync_now().expect("B bootstraps");
    a.engine.sync_now().expect("A pulls the raw client's edit");

    for card in [&library.card, &other] {
        assert_eq!(b.card_front(card), a.card_front(card), "content of {card}");
        assert_eq!(
            b.text(&format!("SELECT state || '/' || reps FROM cards WHERE id = '{card}'")),
            a.text(&format!("SELECT state || '/' || reps FROM cards WHERE id = '{card}'")),
            "scheduling of {card}"
        );
        assert_eq!(b.reviews(card), a.reviews(card), "reviews of {card}");
    }
    assert_eq!(b.card_front(&library.card), "from the raw client");
}

#[test]
fn a_deck_deleted_after_the_lease_opens_is_gone_once_hot_catches_up() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("A syncs");
    let b = space.server.join(&space.device);
    let delete = Payload::Delete {
        kind: Kind::Decks,
        delete: Delete { successor: None },
    };
    let after_open = space.raw_request(vec![(library.deck.clone(), None, space.raw_stamp(1_000), delete)]);
    b.transport.fault_on("/bootstrap", Fault::After(vec![after_open]));

    b.engine.sync_now().expect("B bootstraps");

    assert!(
        b.deck(&library.deck).is_none(),
        "the catch-up pull delivers the tombstone"
    );
    assert!(!b.has_card(&library.card), "and the deck's cards go with it");
}

#[test]
fn a_review_pushed_after_the_lease_opens_arrives_by_the_incremental_cold_pull() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("A syncs");
    let b = space.server.join(&space.device);
    let now = i64::try_from(crate::common::system_ms()).expect("now fits");
    let review = review(&library.card, now);
    let after_open = space.raw_request(vec![(
        uuid::Uuid::now_v7().to_string(),
        Some(library.card.clone()),
        space.raw_stamp(0),
        review,
    )]);
    b.transport.fault_on("/bootstrap", Fault::After(vec![after_open]));

    b.engine.sync_now().expect("B bootstraps");

    assert_eq!(
        b.reviews(&library.card),
        1,
        "the review past the lease's cold head is pulled after the bootstrap"
    );
}

#[test]
fn a_lease_that_lapses_mid_stream_restarts_the_bootstrap() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("A syncs");
    let b = space.server.join(&space.device);
    // The lease opens at server time 4 minutes behind, then the clock jumps past its 5-minute TTL; the skew stays
    // inside the 5-minute tolerance throughout.
    space.server.clock.set_offset(-4 * 60 * 1000);
    let clock = Arc::clone(&space.server.clock);
    let jumps = Arc::new(AtomicUsize::new(1));
    let remaining = Arc::clone(&jumps);
    b.transport.observe(move |request| {
        if request.url.contains("/bootstrap/")
            && remaining
                .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |left| left.checked_sub(1))
                .is_ok()
        {
            clock.set_offset(60 * 1000);
        }
    });

    b.engine.sync_now().expect("B bootstraps on a second lease");

    assert_eq!(
        opens(&b),
        2,
        "the lapsed lease restarts the bootstrap: {:?}",
        requests(&b)
    );
    assert!(
        b.deck(&library.deck).is_some() && b.has_card(&library.card),
        "B converges"
    );
}

#[test]
fn a_restarted_join_drops_what_only_the_lapsed_lease_delivered() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("A syncs");
    let b = space.server.join(&space.device);
    let delete = Payload::Delete {
        kind: Kind::Decks,
        delete: Delete { successor: None },
    };
    let during = space.raw_request(vec![(library.deck.clone(), None, space.raw_stamp(1_000), delete)]);
    b.transport.fault_on("/bootstrap/", Fault::After(vec![during]));
    b.transport.fault_when(
        Method::Get,
        "/pull",
        Fault::Reply(error_reply(410, ErrorCode::LeaseExpired)),
    );

    b.engine.sync_now().expect("B bootstraps on a second lease");

    assert!(
        b.deck(&library.deck).is_none(),
        "the deck only the first lease delivered is gone"
    );
    assert!(!b.has_card(&library.card), "and its card");
    assert_eq!(opens(&b), 2, "a second lease: {:?}", requests(&b));
}

#[test]
fn heartbeats_keep_a_lease_alive_past_its_ttl() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("A syncs");
    let b = space.server.join(&space.device);
    // Each of the bootstrap's three lane requests moves server time 2 minutes, from 4 behind to 2 ahead: the lease
    // spans 6 minutes of server time, past its 5-minute TTL, while the skew stays inside the tolerance.
    space.server.clock.set_offset(-4 * 60 * 1000);
    let clock = Arc::clone(&space.server.clock);
    let steps = Arc::new(AtomicUsize::new(3));
    let remaining = Arc::clone(&steps);
    b.transport.observe(move |request| {
        if request.url.contains("lane=")
            && remaining
                .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |left| left.checked_sub(1))
                .is_ok()
        {
            clock.advance(2 * 60 * 1000);
        }
    });

    b.engine.sync_now().expect("B bootstraps");

    assert_eq!(
        steps.load(Ordering::SeqCst),
        0,
        "server time moved 6 minutes during the bootstrap"
    );
    assert_eq!(opens(&b), 1, "one lease lasted the whole bootstrap: {:?}", requests(&b));
    assert!(
        requests(&b).iter().any(|request| request.ends_with("/heartbeat")),
        "a heartbeat extended it"
    );
    assert!(
        b.deck(&library.deck).is_some() && b.has_card(&library.card),
        "B converges"
    );
}

#[test]
fn a_default_row_created_during_bootstrap_is_pushed_only_after_catch_up() {
    let space = Space::new();
    let algorithm = space.device.add_algorithm("Only");
    let template = space.device.add_template("Basic");
    let deck = space.device.add_deck(&algorithm, &template, "Spanish");
    space.device.engine.sync_now().expect("A syncs");
    // The space keeps the deck and loses its only algorithm, so a joiner's deck placeholder needs a new default.
    tombstone(&space, Kind::Algorithms, &algorithm);
    let b = space.server.join(&space.device);

    b.engine.sync_now().expect("B bootstraps");

    let created = b.ids("algorithms");
    assert!(
        !created.is_empty() && created != algorithm,
        "B created its own default algorithm"
    );
    assert_eq!(b.deck(&deck).map(|deck| deck.algorithm_id), Some(created.clone()));
    let sent = requests(&b);
    let released = sent
        .iter()
        .position(|request| request.starts_with("Delete") && request.contains("/bootstrap/"))
        .expect("the lease is released");
    let first_push = sent
        .iter()
        .position(|request| request.ends_with("/push"))
        .expect("the default is pushed");
    assert!(
        released < first_push,
        "nothing is pushed before the bootstrap ends: {sent:?}"
    );
    let b_id = b.state().expect("B is enrolled").device_id;
    let pushed: Vec<Envelope> = space
        .raw_pull(Lane::Hot, 0)
        .entries
        .into_iter()
        .filter(|entry| entry.sender == *b_id.as_bytes())
        .map(|entry| Envelope::decode(&entry.envelope).expect("decodes"))
        .collect();
    assert!(
        pushed
            .iter()
            .any(|envelope| envelope.header.kind == Kind::Algorithms && envelope.header.group == Some(Group::Create)),
        "the default's create reaches the server"
    );
}

#[test]
fn a_relaunch_mid_bootstrap_bootstraps_again() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("A syncs");
    let b = space.server.join(&space.device);
    b.transport
        .fault_on("lane=cold&after=0", Fault::Reply(error_reply(500, ErrorCode::Internal)));
    let stopped = b.engine.sync_now();
    assert!(
        matches!(stopped, Err(SyncError::Server { status: 500, .. })),
        "{stopped:?}"
    );
    assert_eq!(
        b.count("SELECT is_bootstrapping FROM sync_state"),
        1,
        "the flag outlives the failure"
    );

    let relaunched = space.server.relaunch(&b);
    relaunched.engine.sync_now().expect("the relaunched engine bootstraps");

    let sent = requests(&relaunched);
    assert_eq!(opens(&relaunched), 1, "the relaunch opens a new lease: {sent:?}");
    assert!(
        !sent.iter().any(|request| request.contains("/pull?lane=hot&after=0")),
        "it never pulls hot from 0: {sent:?}"
    );
    assert!(relaunched.deck(&library.deck).is_some() && relaunched.has_card(&library.card));
}

#[test]
fn a_lease_that_lapses_after_the_last_page_ends_the_bootstrap_all_the_same() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("A syncs");
    let b = space.server.join(&space.device);
    b.transport.fault_when(
        Method::Delete,
        "/bootstrap/",
        Fault::Reply(error_reply(410, ErrorCode::LeaseExpired)),
    );

    b.engine.sync_now().expect("B bootstraps");

    assert_eq!(
        opens(&b),
        1,
        "a lease gone by its release is not a reason to bootstrap again"
    );
    assert_eq!(b.count("SELECT is_bootstrapping FROM sync_state"), 0);
    assert!(
        b.deck(&library.deck).is_some() && b.has_card(&library.card),
        "B converges"
    );
}
