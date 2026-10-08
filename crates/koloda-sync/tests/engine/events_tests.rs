use std::sync::mpsc::{channel, Receiver};
use std::sync::Arc;
use std::time::Duration;

use koloda_sync::runner::Event;
use koloda_sync_proto::payload::{Payload, Title};
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::{ErrorCode, RestoreMode};
use uuid::Uuid;

use crate::common::{error_reply, Device, Fault, Space};
use crate::fixtures::Library;
use crate::runner_support::{
    channel_sink, wait_for, ManualTimer, COALESCE, FIRST_RETRY, POLL, POLL_LISTENING, SILENT_FOR,
};

/// Cycles the device ran, counted by the device record each one reads first.
fn cycles(device: &Device) -> usize {
    device
        .transport
        .sent()
        .iter()
        .filter(|request| request.url.contains("/devices/"))
        .count()
}

/// Signals every cycle the device starts and every events socket it opens.
fn starts(device: &Device) -> (Receiver<()>, Receiver<()>) {
    let (cycle, cycles) = channel();
    let (socket, sockets) = channel();
    device.transport.observe(move |request| {
        if request.url.contains("/devices/") {
            cycle.send(()).expect("the test reads cycle starts");
        } else if request.url.ends_with("/events") {
            socket.send(()).expect("the test reads socket opens");
        }
    });
    (cycles, sockets)
}

fn next(signals: &Receiver<()>) {
    signals
        .recv_timeout(Duration::from_secs(20))
        .expect("the runner gets there");
}

/// Starts the runner with the events socket served, after the device pushed its library, and waits until the socket
/// is open.
fn listening(space: &Space) -> (Library, ManualTimer, Receiver<Event>) {
    let library = space.device.library();
    space.device.engine.sync_now().expect("the library is pushed");
    space.device.transport.serve_events();
    let timer = ManualTimer::default();
    let (sink, events) = channel_sink();
    space
        .device
        .engine
        .start_runner(sink, Arc::new(timer.clone()))
        .expect("the runner starts");
    timer.wait_for_sleep(SILENT_FOR);
    (library, timer, events)
}

fn renamed_elsewhere() -> Title {
    Title {
        title: "Renamed elsewhere".to_string(),
        updated_at: Some(1),
    }
}

#[test]
fn a_push_by_another_device_starts_a_cycle_with_no_poll() {
    let space = Space::new();
    let (library, _timer, events) = listening(&space);

    space.raw_push(
        &library.deck,
        None,
        space.raw_stamp(1_000),
        &Payload::DeckTitle(renamed_elsewhere()),
    );

    let changed = wait_for(&events, |event| matches!(event, Event::Changed { .. }));
    assert_eq!(
        changed,
        Event::Changed {
            kinds: vec![Kind::Decks]
        },
        "the nudge started a cycle that pulled the rename, though no poll elapsed"
    );
    assert_eq!(
        space.device.deck(&library.deck).expect("the deck is there").title,
        "Renamed elsewhere"
    );
}

#[test]
fn a_nudge_that_echoes_the_device_own_push_starts_no_cycle() {
    let space = Space::new();
    let (library, timer, events) = listening(&space);
    space.device.engine.nudge();
    timer.wait_for_sleep(POLL_LISTENING);
    let before = cycles(&space.device);

    space
        .device
        .update_deck(&library.deck, "Renamed here", &library.algorithm, &library.template);
    space.device.engine.notify_local_change();
    timer.wait_for_sleep(COALESCE);
    timer.advance(COALESCE);
    timer.wait_for_sleep(POLL_LISTENING);
    // WHY: the socket delivers frames in order, so by the time it delivers this push's heads it has delivered the
    // heads of the device's own push before it.
    space.raw_push(
        &library.template,
        None,
        space.raw_stamp(2_000),
        &Payload::TemplateTitle(renamed_elsewhere()),
    );
    wait_for(
        &events,
        |event| matches!(event, Event::Changed { kinds } if kinds.contains(&Kind::Templates)),
    );
    timer.wait_for_sleep(POLL_LISTENING);

    assert_eq!(
        cycles(&space.device) - before,
        2,
        "one cycle for the local change and one for the other device's push; none for the device's own push"
    );
}

#[test]
fn a_refused_upgrade_starts_one_cycle_and_retries_with_backoff() {
    let space = Space::new();
    let (cycle_starts, socket_opens) = starts(&space.device);
    space.device.transport.serve_events();
    for _ in 0..2 {
        space
            .device
            .transport
            .fault_on("/events", Fault::Reply(error_reply(404, ErrorCode::NotFound)));
    }
    let timer = ManualTimer::default();
    let (sink, _events) = channel_sink();
    space
        .device
        .engine
        .start_runner(sink, Arc::new(timer.clone()))
        .expect("the runner starts");

    next(&cycle_starts);
    next(&socket_opens);
    next(&cycle_starts);
    timer.wait_for_sleep(FIRST_RETRY);
    timer.advance(FIRST_RETRY);
    next(&socket_opens);
    timer.wait_for_sleep(FIRST_RETRY * 2);
    timer.wait_for_sleep(POLL);

    assert_eq!(
        cycles(&space.device),
        2,
        "the runner's first cycle, and one for the first refusal only"
    );
    assert!(socket_opens.try_recv().is_err(), "the third try waits out its backoff");
}

#[test]
fn the_runner_polls_less_while_the_socket_is_up_and_cycles_when_it_drops() {
    let space = Space::new();
    let (_library, timer, _events) = listening(&space);
    space.device.engine.nudge();
    timer.wait_for_sleep(POLL_LISTENING);
    let before = cycles(&space.device);

    space.device.transport.drop_sockets();
    timer.wait_for_sleep(POLL);

    assert_eq!(
        cycles(&space.device) - before,
        1,
        "losing the socket starts a cycle, after which the runner polls every minute"
    );
}

#[test]
fn a_restore_behind_a_dropped_socket_is_applied_and_the_socket_reconnects_on_the_new_epoch() {
    let space = Space::new();
    let (_cycle_starts, socket_opens) = starts(&space.device);
    let (_library, timer, _events) = listening(&space);
    next(&socket_opens);
    let backup = space.server.backup();
    space.server.restore(&backup, RestoreMode::Heal);

    // The server restarts after a restore, which ends every socket.
    space.device.transport.drop_sockets();
    next(&socket_opens);
    timer.wait_for_sleep(SILENT_FOR);

    let epoch = space
        .device
        .state()
        .expect("the file syncs")
        .epoch
        .map(Uuid::from_bytes);
    let listens: Vec<_> = space
        .device
        .transport
        .sent()
        .into_iter()
        .filter(|request| request.url.ends_with("/events"))
        .collect();
    assert_eq!(listens.len(), 2);
    assert_ne!(listens[0].epoch, epoch, "the space has a new epoch");
    assert_eq!(
        listens[1].epoch, epoch,
        "the socket reconnected once the cycle applied the restore"
    );
}
