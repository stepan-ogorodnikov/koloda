use std::sync::mpsc::channel;
use std::sync::Arc;
use std::time::Duration;

use koloda_sync::runner::{Budget, Event};
use koloda_sync_proto::payload::{CardCreate, CardScheduling, Payload, Title};
use koloda_sync_proto::registry::Kind;
use uuid::Uuid;

use crate::common::{system_ms, Device, Space};
use crate::fixtures::{review, FRONT};
use crate::runner_support::{channel_sink, wait_for, ManualTimer, COALESCE, POLL};

/// Cycles the device ran, counted by the device record each one reads first.
fn cycles(device: &Device) -> usize {
    device
        .transport
        .sent()
        .iter()
        .filter(|request| request.url.contains("/devices/"))
        .count()
}

#[test]
fn local_changes_within_the_window_share_one_cycle() {
    let space = Space::new();
    let timer = ManualTimer::default();
    let (sink, _events) = channel_sink();
    space
        .device
        .engine
        .start_runner(sink, Arc::new(timer.clone()))
        .expect("the runner starts");
    timer.wait_for_sleep(POLL);
    assert_eq!(cycles(&space.device), 1, "the runner syncs once when it starts");

    for _ in 0..3 {
        space.device.engine.notify_local_change();
    }
    timer.wait_for_sleep(COALESCE);
    timer.advance(COALESCE);
    timer.wait_for_sleep(POLL);

    assert_eq!(
        cycles(&space.device),
        2,
        "three local changes within 300 ms run one cycle"
    );
}

#[test]
fn triggers_during_a_cycle_run_exactly_one_more() {
    let space = Space::new();
    let timer = ManualTimer::default();
    let (sink, _events) = channel_sink();
    let (started, starts) = channel();
    let (release, releases) = channel::<()>();
    let mut is_first = true;
    space.device.transport.observe(move |request| {
        if is_first && request.url.contains("/devices/") {
            is_first = false;
            started.send(()).expect("the test waits");
            releases.recv().expect("the test releases the cycle");
        }
    });
    space
        .device
        .engine
        .start_runner(sink, Arc::new(timer.clone()))
        .expect("the runner starts");
    starts
        .recv_timeout(Duration::from_secs(20))
        .expect("the first cycle starts");

    for _ in 0..3 {
        space.device.engine.nudge();
    }
    release.send(()).expect("the cycle goes on");
    timer.wait_for_sleep(POLL);

    assert_eq!(
        cycles(&space.device),
        2,
        "the first cycle, and one more for every trigger during it"
    );
}

#[test]
fn a_changed_event_names_the_kinds_a_pull_changed() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("the library is pushed");
    let rename = Payload::DeckTitle(Title {
        title: "Renamed elsewhere".to_string(),
        updated_at: Some(1),
    });
    space.raw_push(&library.deck, None, space.raw_stamp(1_000), &rename);
    let (sink, events) = channel_sink();

    space
        .device
        .engine
        .start_runner(sink, Arc::new(ManualTimer::default()))
        .expect("the runner starts");

    let changed = wait_for(&events, |event| matches!(event, Event::Changed { .. }));
    assert_eq!(
        changed,
        Event::Changed {
            kinds: vec![Kind::Decks]
        }
    );
}

/// The raw client pushes a new card and its review, so a pull reads one `hot` page and one `cold` page.
fn card_with_review(space: &Space) -> String {
    let library = space.device.library();
    space.device.engine.sync_now().expect("the library is pushed");
    let card = Uuid::now_v7().to_string();
    let now = i64::try_from(system_ms()).expect("now fits");
    let create = Payload::CardCreate(CardCreate {
        deck_id: library.deck.clone(),
        template_id: library.template,
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
        initial_product_ts: std::collections::BTreeMap::new(),
        legacy_product_ts_floor: None,
    });
    let stamp = space.raw_stamp(0);
    let push = space.raw_request(vec![
        (card.clone(), Some(library.deck), stamp, create),
        (
            Uuid::now_v7().to_string(),
            Some(card.clone()),
            stamp,
            review(&card, now),
        ),
    ]);
    let (status, _) = space.server.request::<koloda_sync_proto::transport::PushReply>(push);
    assert_eq!(status, 200, "the raw push is accepted");
    card
}

#[test]
fn a_tick_stops_between_pages_once_its_bytes_are_spent() {
    let space = Space::new();
    let card = card_with_review(&space);

    let first = space
        .device
        .engine
        .tick(Budget {
            wall: Duration::from_secs(60),
            page_bytes: 1,
        })
        .expect("the tick runs");

    assert!(!first.is_done, "the budget runs out after the first page");
    assert!(space.device.has_card(&card), "the `hot` page is applied");
    assert_eq!(
        space.device.reviews(&card),
        0,
        "the `cold` page waits for the next tick"
    );

    let second = space
        .device
        .engine
        .tick(Budget {
            wall: Duration::from_secs(60),
            page_bytes: usize::MAX,
        })
        .expect("the tick runs");

    assert!(second.is_done, "the next tick finishes");
    assert_eq!(space.device.reviews(&card), 1, "it resumes from the `cold` cursor");
}

#[test]
fn a_tick_without_time_sends_nothing() {
    let space = Space::new();
    let sent = space.device.transport.sent().len();

    let ticked = space
        .device
        .engine
        .tick(Budget {
            wall: Duration::ZERO,
            page_bytes: usize::MAX,
        })
        .expect("the tick runs");

    assert!(!ticked.is_done);
    assert_eq!(
        space.device.transport.sent().len(),
        sent,
        "the budget is checked before every request"
    );
}
