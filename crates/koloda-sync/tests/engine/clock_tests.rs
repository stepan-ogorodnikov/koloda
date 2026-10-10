//! Re-stamping writes captured on a wrong clock (`crates/koloda-sync-proto/PROTOCOL.md` §Skew guards, §Cohorts).
//!
//! A clock set ahead is simulated by moving the file's `last_hlc` a day ahead, so every capture after it stamps from
//! there; a skew pause by moving the server's clock.

use std::collections::BTreeMap;
use std::sync::Arc;

use koloda::domain::cards::ResetCardProgressData;
use koloda::repo::cards;
use koloda_sync::error::SyncError;
use koloda_sync::transport::Method;
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use koloda_sync_proto::payload::{CardReset, CardScheduling, Payload};
use koloda_sync_proto::registry::{Group, Kind, Lane};
use koloda_sync_proto::transport::{DeviceList, ErrorCode, PushReply, SpaceList};

use crate::common::{error_reply, system_ms, Device, Fault, Space, TestServer, SERVER_URL};
use crate::fixtures::seed_settings;

const MINUTE_MS: u64 = 60 * 1000;
const DAY_MS: u64 = 24 * 60 * MINUTE_MS;
// WHY: past the 5-minute skew tolerance, yet within the 10 minutes the server keeps a creation's nonce, so moving the
// server's clock back to system time stands in for correcting the device's clock.
const AHEAD_MS: i64 = 6 * 60 * 1000;

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
fn a_lost_push_refused_as_ahead_is_re_stamped_and_lands_while_the_cycle_pulls() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A syncs");
    let b = space.server.join(a);
    b.engine.sync_now().expect("B syncs");
    set_clock_ahead(a, DAY_MS);
    a.update_deck(&library.deck, "Renamed", &library.algorithm, &library.template);
    // WHY: the client sends a request up to four times while no complete reply arrives.
    for _ in 0..4 {
        a.transport.fault_on("/push", Fault::LoseReply);
    }
    assert!(a.engine.sync_now().is_err(), "every reply is lost");
    assert_eq!(
        a.cohort_states(),
        vec!["fixed"],
        "the lost push fixed the rename's cohort"
    );
    let card = b.add_card(&library.deck, &library.template, "from B");
    b.engine.sync_now().expect("B pushes a card");
    let before = pushes(a);

    a.engine.sync_now().expect("A re-stamps the rename and syncs");

    assert_eq!(pushes(a) - before, 2, "refused at the old stamp, then accepted");
    assert!(a.outbox().is_empty());
    assert!(a.has_card(&card), "the cycle pulls");
    let title = pushed(&space, a)
        .into_iter()
        .find(|(_, group, _)| *group == Some(Group::Title))
        .expect("the rename was pushed");
    assert!(
        title.2.hlc.wall_ms() < system_ms() + MINUTE_MS,
        "the rename went out from the corrected clock"
    );
}

#[test]
fn a_cohort_with_a_consumed_member_waits_for_server_time_and_keeps_its_stamp() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A pushes its library");
    let b = space.server.join(a);
    b.engine.sync_now().expect("B pulls the library");
    let server = space.server.server();
    server.set_quota(space.space_id(), Some(1)).expect("the quota is set");
    // The server's clock runs four minutes ahead and A stamps eight ahead: inside the tolerance of each other.
    space.server.clock.set_offset(4 * 60 * 1000);
    set_clock_ahead(a, 8 * MINUTE_MS);
    a.update_deck(&library.deck, "Renamed", &library.algorithm, &library.template);
    let captured = a.outbox()[0].envelope.header.stamp;
    a.engine.sync_now().expect("the rename is held over the quota");
    // The server's clock goes back, and the operator lifts the quota: the released rename is a consumed cohort.
    space.server.clock.set_offset(0);
    server.set_quota(space.space_id(), None).expect("the quota is lifted");
    let card = b.add_card(&library.deck, &library.template, "from B");
    b.engine.sync_now().expect("B pushes a card");

    a.engine.sync_now().expect("A pulls while its push waits");
    let waiting = a.engine.status().expect("status reads");
    let before = pushes(a);
    a.engine.sync_now().expect("A syncs again while its push waits");

    assert!(a.has_card(&card), "pulls go on");
    assert_eq!(a.outbox().len(), 1, "the rename waits");
    assert_eq!(pushes(a), before, "no push goes out while it waits");
    let resumes_in = waiting
        .push_resumes_at_ms
        .expect("the status shows when pushing resumes")
        - i64::try_from(system_ms()).expect("now fits");
    assert!(
        (2 * 60 * 1000..=4 * 60 * 1000).contains(&resumes_in),
        "three minutes, when server time is 5 minutes below the stamp: {resumes_in} ms"
    );

    // Server time moves past the stamp less the tolerance.
    space.server.clock.set_offset(4 * 60 * 1000);
    a.engine.sync_now().expect("A pushes once server time allows");

    assert!(a.outbox().is_empty());
    assert_eq!(a.engine.status().expect("status reads").push_resumes_at_ms, None);
    let title = pushed(&space, a)
        .into_iter()
        .find(|(_, group, _)| *group == Some(Group::Title))
        .expect("the rename was pushed");
    assert_eq!(title.2, captured, "the rename keeps its stamp");
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

#[test]
fn a_push_stops_before_its_next_batch_once_a_reply_moves_skew_past_the_tolerance() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A syncs");
    // WHY: each card is its own cohort, near a tenth of the 4 MiB push cap, so 25 take three batches.
    let text = "x".repeat(400 * 1024);
    for _ in 0..25 {
        a.add_card(&library.deck, &library.template, &text);
    }
    let clock = Arc::clone(&space.server.clock);
    let mut seen = 0;
    a.transport.observe(move |request| {
        if request.method == Method::Post && request.url.ends_with("/push") {
            seen += 1;
            // WHY: ahead, not behind, so the server still accepts the batch it answers.
            if seen == 2 {
                clock.set_offset(10 * 60 * 1000);
            }
        }
    });
    let before = pushes(a);

    let paused = a.engine.sync_now();

    assert!(matches!(paused, Err(SyncError::ClockSkew { .. })), "{paused:?}");
    assert_eq!(pushes(a) - before, 2, "no third batch");
    let waiting: BTreeMap<String, Stamp> = a
        .outbox()
        .into_iter()
        .map(|row| {
            assert!(
                !row.in_flight,
                "the second batch is settled and the rest was never sent"
            );
            (row.envelope.header.id, row.envelope.header.stamp)
        })
        .collect();
    assert!(!waiting.is_empty(), "cards wait for the clock");
    assert_eq!(a.cohort_states().iter().filter(|state| *state != "local").count(), 0);

    space.server.clock.set_offset(0);
    a.engine.sync_now().expect("the corrected clock syncs");

    assert!(a.outbox().is_empty(), "the rest lands");
    let sender = *a.state().expect("enrolled").device_id.as_bytes();
    let mut landed = BTreeMap::new();
    let mut after = 0;
    loop {
        let page = space.raw_pull(Lane::Hot, after);
        for entry in page.entries.iter().filter(|entry| entry.sender == sender) {
            let header = Envelope::decode(&entry.envelope).expect("entry decodes").header;
            if waiting.contains_key(&header.id) {
                landed.insert(header.id, header.stamp);
            }
        }
        if !page.has_more {
            break;
        }
        after = page.scanned_through;
    }
    assert_eq!(landed.len(), waiting.len(), "every waiting card lands");
    for (id, stamp) in &landed {
        assert!(*stamp > waiting[id], "{id} takes a new stamp");
    }
}

#[test]
fn a_join_on_a_clock_ahead_stops_before_it_enrolls_and_finishes_on_the_same_device() {
    let space = Space::new();
    let code = space.device.engine.issue_pairing(None).expect("a code is issued").code;
    let b = space.server.device();
    let devices = || {
        let path = format!("/v1/spaces/{}/devices", space.space_id());
        let (_, reply) = space
            .server
            .call::<DeviceList>(Method::Get, &path, &space.device.token());
        reply.ok.expect("the device list").devices.len()
    };
    // B's clock ahead of the server's.
    space.server.clock.set_offset(-AHEAD_MS);

    let stopped = b.engine.join(SERVER_URL, &code, "Phone", seed_settings());

    assert!(matches!(stopped, Err(SyncError::ClockSkew { .. })), "{stopped:?}");
    assert!(b.state().is_none(), "nothing is enrolled, so no stamp is reserved");
    assert_eq!(
        b.count("SELECT COUNT(*) FROM sync_enrolling"),
        1,
        "the claim stays pending"
    );
    assert_eq!(devices(), 3, "A, the raw client, and B's landed claim");

    space.server.clock.set_offset(0);
    b.engine
        .join(SERVER_URL, &code, "Phone", seed_settings())
        .expect("the join finishes on the corrected clock");

    assert_eq!(devices(), 3, "on the same device");
    b.engine.sync_now().expect("B syncs");
}

#[test]
fn a_space_created_on_a_clock_ahead_stops_before_it_enrolls_and_finishes_once_the_clock_is_back() {
    let server = TestServer::new();
    let a = server.device();
    server.clock.set_offset(-AHEAD_MS);

    let stopped = a
        .engine
        .create_space(SERVER_URL, &server.setup_token, "Study", "Laptop");

    assert!(matches!(stopped, Err(SyncError::ClockSkew { .. })), "{stopped:?}");
    assert!(a.state().is_none(), "nothing is enrolled, so no stamp is reserved");
    assert_eq!(
        a.count("SELECT COUNT(*) FROM sync_enrolling"),
        1,
        "the creation stays pending"
    );

    server.clock.set_offset(0);
    a.engine
        .create_space(SERVER_URL, &server.setup_token, "Study", "Laptop")
        .expect("the creation finishes on the corrected clock");

    let (_, reply) = server.call::<SpaceList>(Method::Get, "/v1/spaces", &server.setup_token);
    assert_eq!(
        reply.ok.expect("the space list").spaces.len(),
        1,
        "the retry records the space the first call created"
    );
    a.engine.sync_now().expect("A syncs");
}
