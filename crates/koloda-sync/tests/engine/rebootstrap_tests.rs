//! Re-bootstrap of a device the server left behind (`crates/koloda-sync-proto/PROTOCOL.md` §Cycle, §Re-bootstrap).

use koloda::domain::decks::DeleteDeckData;
use koloda::repo::decks::delete_deck;
use koloda_sync::transport::Method;
use koloda_sync_proto::transport::{ErrorCode, PullPage};
use uuid::Uuid;

use crate::common::{error_reply, Device, Fault, Space};

const DAY_MS: u64 = 24 * 60 * 60 * 1000;

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

/// Whether the requests sent since `before` opened a lease before any push.
fn opens_before_pushing(device: &Device, before: usize) -> bool {
    let sent: Vec<String> = requests(device).split_off(before);
    let opened = sent.iter().position(|request| request.ends_with("/bootstrap"));
    let pushed = sent.iter().position(|request| request.ends_with("/push"));
    opened.is_some() && opened < pushed
}

fn device_id(device: &Device) -> Uuid {
    device.state().expect("the device is enrolled").device_id
}

fn generation(device: &Device) -> i64 {
    device.count("SELECT rebase_generation FROM sync_state")
}

fn is_rebasing(device: &Device) -> bool {
    device.count("SELECT is_rebasing FROM sync_state") == 1
}

/// The space's creator syncs a library and a second deck with a card, and a joiner pulls them.
struct Away {
    space: Space,
    b: Device,
    deck: String,
    algorithm: String,
    template: String,
    doomed: String,
    doomed_card: String,
}

fn away() -> Away {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    let doomed = a.add_deck(&library.algorithm, &library.template, "Doomed");
    let doomed_card = a.add_card(&doomed, &library.template, "adiós");
    a.engine.sync_now().expect("A syncs");
    let b = space.server.join(a);
    b.engine.sync_now().expect("B syncs");
    Away {
        b,
        deck: library.deck,
        algorithm: library.algorithm,
        template: library.template,
        doomed,
        doomed_card,
        space,
    }
}

/// B deletes the doomed deck, and B and every device in `passing` sync twice, so their recorded cursors pass the
/// tombstone. The raw client, which never pulls, is backdated so it does not pin the collection pass.
fn delete_and_collect(away: &Away, passing: &[&Device]) {
    delete_deck(
        &away.b.db,
        DeleteDeckData {
            id: away.doomed.clone(),
        },
    )
    .expect("B deletes the deck");
    for device in std::iter::once(&away.b).chain(passing.iter().copied()) {
        device.engine.sync_now().expect("the device pulls the tombstone");
        device.engine.sync_now().expect("the device passes it");
    }
    away.space
        .server
        .backdate(Uuid::from_bytes(away.space.raw.device_id), 91 * DAY_MS);
    away.space.server.server().collect_garbage().expect("a collection pass");
    let (status, _) = away.space.server.call::<PullPage>(
        Method::Get,
        &format!("/v1/spaces/{}/pull?lane=hot&after=0", away.space.space_id()),
        &away.b.token(),
    );
    assert_eq!(status, 409, "the pass collected the tombstone");
}

#[test]
fn a_device_back_after_90_days_keeps_what_the_space_takes_and_loses_what_it_deleted() {
    let away = away();
    let a = &away.space.device;
    away.space.server.backdate(device_id(a), 91 * DAY_MS);
    delete_and_collect(&away, &[]);

    // Meanwhile A renamed a surviving deck, added a card to it, graded a card of the deleted deck, and added a card
    // to the deleted deck.
    a.update_deck(&away.deck, "Renamed", &away.algorithm, &away.template);
    let kept = a.add_card(&away.deck, &away.template, "nuevo");
    a.grade(&away.doomed_card);
    let lost = a.add_card(&away.doomed, &away.template, "perdido");
    let before = requests(a).len();

    a.engine.sync_now().expect("A re-bootstraps and syncs");
    away.b.engine.sync_now().expect("B syncs");

    assert_eq!(opens(a), 1, "A re-bootstraps once");
    assert!(
        opens_before_pushing(a, before),
        "the device record's flag stops the push"
    );
    assert!(a.deck(&away.doomed).is_none(), "the deck the space deleted is gone");
    assert!(
        !a.has_card(&away.doomed_card) && !a.has_card(&lost),
        "its cards go, pending writes and all"
    );
    assert!(a.outbox().is_empty(), "everything left went out");
    assert_eq!(
        away.b.deck(&away.deck).map(|deck| deck.title),
        Some("Renamed".to_string())
    );
    assert!(away.b.has_card(&kept), "a create made while away reaches the space");
    assert!(
        away.b.deck(&away.doomed).is_none() && !away.b.has_card(&lost),
        "nothing comes back"
    );
    assert!(!is_rebasing(a));
}

#[test]
fn cursor_too_old_on_a_push_or_a_pull_starts_a_re_bootstrap() {
    for (method, pattern) in [(Method::Post, "/push"), (Method::Get, "/pull")] {
        let space = Space::new();
        let a = &space.device;
        let library = a.library();
        a.engine.sync_now().expect("A syncs");
        a.update_deck(&library.deck, "Renamed", &library.algorithm, &library.template);
        a.transport
            .fault_when(method, pattern, Fault::Reply(error_reply(409, ErrorCode::CursorTooOld)));

        a.engine.sync_now().expect("A re-bootstraps and syncs");

        assert_eq!(opens(a), 1, "{pattern}: one re-bootstrap");
        assert!(a.outbox().is_empty(), "{pattern}: the rename goes out after it");
        assert!(!is_rebasing(a), "{pattern}");
    }
}

#[test]
fn a_file_whose_own_cursor_is_below_the_horizon_re_bootstraps_before_it_pushes() {
    let away = away();
    let a = &away.space.device;
    delete_and_collect(&away, &[a]);
    a.execute("UPDATE sync_state SET cursor_hot = 0");
    a.update_deck(&away.deck, "Renamed", &away.algorithm, &away.template);
    let before = requests(a).len();

    a.engine.sync_now().expect("A re-bootstraps and syncs");

    assert!(opens_before_pushing(a, before), "the re-bootstrap runs before the push");
    away.b.engine.sync_now().expect("B syncs");
    assert_eq!(
        away.b.deck(&away.deck).map(|deck| deck.title),
        Some("Renamed".to_string())
    );
}

#[test]
fn a_lapsed_lease_restarts_the_stream_under_the_same_barrier() {
    let away = away();
    let a = &away.space.device;
    away.space.server.backdate(device_id(a), 91 * DAY_MS);
    delete_and_collect(&away, &[]);
    a.transport.fault_when(
        Method::Get,
        "/bootstrap/",
        Fault::Reply(error_reply(410, ErrorCode::LeaseExpired)),
    );

    a.engine.sync_now().expect("A re-bootstraps and syncs");

    assert_eq!(opens(a), 2, "a second lease");
    assert_eq!(generation(a), 1, "under the same barrier");
    assert!(a.deck(&away.doomed).is_none());
    assert!(!is_rebasing(a));
}

#[test]
fn a_relaunch_mid_rebase_finishes_the_same_re_bootstrap() {
    let away = away();
    let a = &away.space.device;
    away.space.server.backdate(device_id(a), 91 * DAY_MS);
    delete_and_collect(&away, &[]);
    a.transport.fault_when(
        Method::Get,
        "/bootstrap/",
        Fault::Reply(error_reply(500, ErrorCode::Internal)),
    );
    assert!(a.engine.sync_now().is_err(), "the stream stops mid-way");
    assert!(is_rebasing(a), "the barrier outlives the stop");

    let relaunched = away.space.server.relaunch(a);
    relaunched.engine.sync_now().expect("the relaunch resumes it");

    assert_eq!(generation(&relaunched), 1, "the same barrier");
    assert!(!is_rebasing(&relaunched));
    assert!(relaunched.deck(&away.doomed).is_none());
    assert_eq!(
        relaunched.count("SELECT COUNT(*) FROM cards"),
        1,
        "the library's card stays, the deleted deck's goes"
    );
}

#[test]
fn a_stale_device_re_bootstraps_before_it_pushes_even_with_nothing_collected() {
    let away = away();
    let a = &away.space.device;
    away.space.server.backdate(device_id(a), 91 * DAY_MS);
    a.update_deck(&away.deck, "Renamed", &away.algorithm, &away.template);
    let before = requests(a).len();

    a.engine.sync_now().expect("A re-bootstraps and syncs");

    assert!(opens_before_pushing(a, before), "the record's flag alone starts it");
    assert!(a.outbox().is_empty());
}
