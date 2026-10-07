//! Re-stamping writes captured on a wrong clock (`crates/koloda-sync-proto/PROTOCOL.md` §Skew guards, §Cohorts).
//!
//! A clock set ahead is simulated by moving the file's `last_hlc` a day ahead, so every capture after it stamps from
//! there; a skew pause by moving the server's clock.

use std::collections::BTreeMap;

use koloda::domain::cards::ResetCardProgressData;
use koloda::repo::cards;
use koloda_sync::error::SyncError;
use koloda_sync::transport::Method;
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use koloda_sync_proto::payload::{CardReset, CardScheduling, Payload};
use koloda_sync_proto::registry::{Group, Kind, Lane};
use koloda_sync_proto::transport::{ErrorCode, PushReply};

use crate::common::{error_reply, system_ms, Device, Fault, Space};

const MINUTE_MS: u64 = 60 * 1000;
const DAY_MS: u64 = 24 * 60 * MINUTE_MS;

fn set_clock_ahead(device: &Device, ahead_ms: u64) {
    let raw = Hlc::new(system_ms() + ahead_ms, 0).expect("wall time fits").raw();
    device.execute(&format!("UPDATE sync_state SET last_hlc = {raw}"));
}

fn pushes(device: &Device) -> usize {
    device
        .transport
        .sent()
        .iter()
        .filter(|request| request.method == Method::Post && request.url.ends_with("/push"))
        .count()
}

/// What the device's sender put in the space, as `(kind, group)` and stamp, in log order.
fn pushed(space: &Space, device: &Device) -> Vec<(Kind, Option<Group>, Stamp)> {
    let sender = *device.state().expect("enrolled").device_id.as_bytes();
    [Lane::Hot, Lane::Cold]
        .into_iter()
        .flat_map(|lane| space.raw_pull(lane, 0).entries)
        .filter(|entry| entry.sender == sender)
        .map(|entry| {
            let header = Envelope::decode(&entry.envelope).expect("entry decodes").header;
            (header.kind, header.group, header.stamp)
        })
        .collect()
}

fn reset(device: &Device, card: &str) {
    cards::reset_card_progress(&device.db, ResetCardProgressData { id: card.to_string() }).expect("the card resets");
}

#[test]
fn writes_captured_during_a_pause_take_the_corrected_clocks_stamps_after_a_relaunch() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    let other = a.add_card(&library.deck, &library.template, "second");
    a.engine.sync_now().expect("A syncs");
    space.server.clock.set_offset(-10 * 60 * 1000);
    let paused = a.engine.sync_now();
    assert!(matches!(paused, Err(SyncError::ClockSkew { .. })), "{paused:?}");

    set_clock_ahead(a, DAY_MS);
    a.grade(&library.card);
    reset(a, &other);
    a.update_deck(&library.deck, "Renamed", &library.algorithm, &library.template);

    let relaunched = space.server.relaunch(a);
    space.server.clock.set_offset(0);
    relaunched.engine.sync_now().expect("the corrected clock syncs");

    assert_eq!(
        pushes(&relaunched),
        1,
        "one push, accepted: nothing went out at the wrong stamps"
    );
    assert!(relaunched.outbox().is_empty());
    let mut by_commit: BTreeMap<Stamp, Vec<(Kind, Option<Group>)>> = BTreeMap::new();
    for (kind, group, stamp) in pushed(&space, &relaunched) {
        assert!(
            stamp.hlc.wall_ms() < system_ms() + MINUTE_MS,
            "{kind:?} {group:?} came from the corrected clock"
        );
        by_commit.entry(stamp).or_default().push((kind, group));
    }
    let commits: Vec<Vec<(Kind, Option<Group>)>> = by_commit.into_values().collect();
    // WHY: the library's commits went out before the pause, below the three captured during it.
    let commits = &commits[commits.len() - 3..];
    assert!(
        commits[0].contains(&(Kind::Reviews, Some(Group::Row))),
        "the grade first, its pair on one stamp"
    );
    assert!(commits[0].contains(&(Kind::Cards, Some(Group::Scheduling))));
    assert!(
        commits[1].contains(&(Kind::Cards, Some(Group::Reset))),
        "the reset next, its pair on one stamp"
    );
    assert!(commits[1].contains(&(Kind::Cards, Some(Group::Scheduling))));
    assert_eq!(commits[2], vec![(Kind::Decks, Some(Group::Title))], "the rename last");
}

#[test]
fn a_paused_grade_and_a_remote_reset_stay_consistent_across_the_re_stamp() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A syncs");
    let b = space.server.join(a);
    b.engine.sync_now().expect("B syncs");
    space.server.clock.set_offset(-10 * 60 * 1000);
    assert!(a.engine.sync_now().is_err(), "A pauses");
    set_clock_ahead(a, DAY_MS);
    a.grade(&library.card);
    space.server.clock.set_offset(0);
    // A reset from another device, a minute ahead: above where the re-stamp lands, below where the grade was.
    let stamp = space.raw_stamp(MINUTE_MS);
    let reset_at = space.raw_request(vec![
        (
            library.card.clone(),
            Some(library.deck.clone()),
            stamp,
            Payload::CardReset(CardReset {
                wall_ms: i64::try_from(stamp.hlc.wall_ms()).expect("wall fits"),
            }),
        ),
        (
            library.card.clone(),
            Some(library.deck.clone()),
            stamp,
            Payload::CardScheduling(CardScheduling {
                state: 0,
                due_at: None,
                stability: 0.0,
                difficulty: 0.0,
                scheduled_days: 0,
                learning_steps: 0,
                reps: 0,
                lapses: 0,
                last_reviewed_at: None,
            }),
        ),
    ]);
    let (status, reply) = space.server.request::<PushReply>(reset_at);
    assert_eq!(status, 200, "{:?}", reply.error);

    a.engine.sync_now().expect("A re-stamps and syncs");
    b.engine.sync_now().expect("B syncs");

    for (name, device) in [("A", a), ("B", &b)] {
        assert_eq!(device.reviews(&library.card), 0, "{name}: the reset kills the review");
        assert_eq!(
            device.count(&format!("SELECT state FROM cards WHERE id = '{}'", library.card)),
            0,
            "{name}: and the scheduling is blank, never a review beside blank scheduling"
        );
    }
}

#[test]
fn a_push_refused_for_a_stamp_ahead_is_re_stamped_once_and_lands() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A syncs");
    set_clock_ahead(a, DAY_MS);
    a.update_deck(&library.deck, "Renamed", &library.algorithm, &library.template);
    let before = pushes(a);

    a.engine.sync_now().expect("A re-stamps and syncs");

    assert_eq!(pushes(a) - before, 2, "refused, then accepted");
    assert!(a.outbox().is_empty());
}

#[test]
fn a_space_that_keeps_refusing_gets_one_retry_per_cycle() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A syncs");
    a.update_deck(&library.deck, "Renamed", &library.algorithm, &library.template);
    for _ in 0..3 {
        a.transport.fault_when(
            Method::Post,
            "/push",
            Fault::Reply(error_reply(409, ErrorCode::StampAhead)),
        );
    }
    let before = pushes(a);

    let result = a.engine.sync_now();

    assert!(
        matches!(
            result,
            Err(SyncError::PushRefused {
                code: ErrorCode::StampAhead,
                ..
            })
        ),
        "{result:?}"
    );
    assert_eq!(pushes(a) - before, 2, "one re-stamp, then the refusal is reported");
}

#[test]
fn a_cycle_with_no_pause_leaves_the_stamps_it_captured_alone() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A syncs");
    a.update_deck(&library.deck, "Renamed", &library.algorithm, &library.template);
    let captured = a.outbox()[0].envelope.header.stamp;

    a.engine.sync_now().expect("A syncs");

    let title = pushed(&space, a)
        .into_iter()
        .find(|(_, group, _)| *group == Some(Group::Title))
        .expect("the rename was pushed");
    assert_eq!(title.2, captured);
    assert_eq!(
        captured.device,
        DeviceId(*a.state().expect("enrolled").device_id.as_bytes())
    );
}
