//! Re-attaching a detached or revoked file to its space (`crates/koloda-sync-proto/PROTOCOL.md` §Re-attach).

use koloda::domain::decks::DeleteDeckData;
use koloda::repo::decks::delete_deck;
use koloda::repo::sync::join::JoinMode;
use koloda_sync::error::SyncError;
use koloda_sync::transport::Method;
use koloda_sync_proto::transport::{PullPage, Push, PushItem, PushReply};
use uuid::Uuid;

use crate::common::{Device, Fault, Space, SERVER_URL};
use crate::fixtures::{seed_settings, Library};

const DAY_MS: u64 = 24 * 60 * 60 * 1000;

fn device_id(device: &Device) -> Uuid {
    device.state().expect("the device is enrolled").device_id
}

fn opens(device: &Device) -> usize {
    device
        .transport
        .sent()
        .iter()
        .filter(|request| request.method == Method::Post && request.url.ends_with("/bootstrap"))
        .count()
}

/// A creator and a joiner that both hold a synced library and a second deck.
struct Pair {
    space: Space,
    b: Device,
    library: Library,
    doomed: String,
}

fn pair() -> Pair {
    let space = Space::new();
    let library = space.device.library();
    let doomed = space.device.add_deck(&library.algorithm, &library.template, "Doomed");
    space.device.engine.sync_now().expect("A syncs");
    let b = space.server.join(&space.device);
    b.engine.sync_now().expect("B syncs");
    Pair {
        space,
        b,
        library,
        doomed,
    }
}

fn reattach(pair: &Pair) {
    let code = pair.b.engine.issue_pairing(None).expect("B issues a code").code;
    let joined = pair
        .space
        .device
        .engine
        .join(SERVER_URL, &code, "Laptop", seed_settings())
        .expect("A re-attaches");
    assert_eq!(joined.mode, JoinMode::Reattach);
}

/// B deletes the doomed deck and passes the tombstone with every device in `passing`; the raw client, which never
/// pulls, is backdated; then a pass collects the tombstone.
fn delete_and_collect(pair: &Pair, passing: &[&Device]) {
    delete_deck(
        &pair.b.db,
        DeleteDeckData {
            id: pair.doomed.clone(),
        },
    )
    .expect("B deletes the deck");
    for device in std::iter::once(&pair.b).chain(passing.iter().copied()) {
        device.engine.sync_now().expect("the device pulls the tombstone");
        device.engine.sync_now().expect("the device passes it");
    }
    pair.space
        .server
        .backdate(Uuid::from_bytes(pair.space.raw.device_id), 91 * DAY_MS);
    pair.space.server.server().collect_garbage().expect("a collection pass");
    let (status, _) = pair.space.server.call::<PullPage>(
        Method::Get,
        &format!("/v1/spaces/{}/pull?lane=hot&after=0", pair.space.space_id()),
        &pair.b.token(),
    );
    assert_eq!(status, 409, "the pass collected the tombstone");
}

/// Detaches the creator's file in some way.
type Leave = fn(&Pair);

#[test]
fn a_detached_or_revoked_file_re_attaches_with_its_pending_writes() {
    let cases: [(&str, Leave); 2] = [
        ("detached itself", |pair| {
            pair.space.device.engine.detach().expect("A detaches");
        }),
        ("revoked by another device", |pair| {
            pair.b
                .engine
                .revoke_device(device_id(&pair.space.device))
                .expect("B revokes A");
            let result = pair.space.device.engine.sync_now();
            assert!(matches!(result, Err(SyncError::Revoked)), "{result:?}");
        }),
    ];

    for (name, leave) in cases {
        let pair = pair();
        let a = &pair.space.device;
        let old = device_id(a);
        leave(&pair);
        a.update_deck(
            &pair.library.deck,
            "Renamed",
            &pair.library.algorithm,
            &pair.library.template,
        );
        let card = pair.b.add_card(&pair.library.deck, &pair.library.template, "from B");
        pair.b.engine.sync_now().expect("B syncs");

        reattach(&pair);
        a.engine.sync_now().expect("A syncs");
        pair.b.engine.sync_now().expect("B syncs");

        assert_ne!(device_id(a), old, "{name}: a new device id");
        assert_eq!(
            pair.b.deck(&pair.library.deck).map(|deck| deck.title),
            Some("Renamed".to_string()),
            "{name}: the edit made while detached reaches the space"
        );
        assert!(a.has_card(&card), "{name}: the other device's write reaches the file");
        assert_eq!(opens(a), 0, "{name}: no re-bootstrap");
    }
}

#[test]
fn a_cohort_the_old_id_partly_pushed_keeps_its_stamp_under_the_new_id() {
    let pair = pair();
    let a = &pair.space.device;
    let deck = a.add_deck(&pair.library.algorithm, &pair.library.template, "Spanish");
    let rows = a.outbox();
    assert_eq!(rows.len(), 3, "a deck's create and its two pointers share a commit");
    let stamp = rows[0].envelope.header.stamp;
    let first_seq = u64::try_from(a.count("SELECT MIN(sender_seq) FROM sync_outbox")).expect("seq fits");
    // The old id's push consumed only the create, as a push cut short after its first item would leave it.
    let (status, reply) = pair.space.server.post::<_, PushReply>(
        &format!("/v1/spaces/{}/push", pair.space.space_id()),
        Some(&a.token()),
        &Push {
            items: vec![PushItem {
                sender_seq: first_seq,
                envelope: rows[0].envelope.encode().expect("envelope encodes"),
            }],
        },
    );
    assert_eq!(status, 200, "{:?}", reply.error);
    a.engine.detach().expect("A detaches");

    reattach(&pair);

    let rows = a.outbox();
    assert_eq!(rows.len(), 2, "the accepted create is settled");
    assert!(
        rows.iter().all(|row| row.envelope.header.stamp == stamp),
        "the rest keeps the cohort's stamp"
    );
    a.engine.sync_now().expect("A syncs");
    pair.b.engine.sync_now().expect("B syncs");
    assert!(pair.b.deck(&deck).is_some());
}

#[test]
fn a_file_past_a_collected_tombstone_re_attaches_without_a_re_bootstrap() {
    let pair = pair();
    let a = &pair.space.device;
    delete_and_collect(&pair, &[a]);
    a.engine.detach().expect("A detaches");
    a.update_deck(
        &pair.library.deck,
        "Renamed",
        &pair.library.algorithm,
        &pair.library.template,
    );

    reattach(&pair);
    a.engine.sync_now().expect("A syncs");
    pair.b.engine.sync_now().expect("B syncs");

    assert_eq!(
        opens(a),
        0,
        "its own cursor is past the horizon, though its new record's is not"
    );
    assert_eq!(
        pair.b.deck(&pair.library.deck).map(|deck| deck.title),
        Some("Renamed".to_string())
    );
}

#[test]
fn a_file_below_the_horizon_re_attaches_through_a_re_bootstrap() {
    let pair = pair();
    let a = &pair.space.device;
    a.engine.detach().expect("A detaches");
    delete_and_collect(&pair, &[]);
    let created = a.add_deck(&pair.library.algorithm, &pair.library.template, "Created while away");

    reattach(&pair);
    a.engine.sync_now().expect("A syncs");
    pair.b.engine.sync_now().expect("B syncs");

    assert_eq!(opens(a), 1, "it re-bootstraps");
    assert!(a.deck(&pair.doomed).is_none(), "it loses what the space deleted");
    assert!(pair.b.deck(&created).is_some(), "its own create reaches the space");
}

#[test]
fn a_re_attach_that_fails_after_its_claim_finishes_on_the_next_join_with_the_same_code() {
    let pair = pair();
    let a = &pair.space.device;
    let old = device_id(a);
    a.engine.detach().expect("A detaches");
    let code = pair.b.engine.issue_pairing(None).expect("B issues a code").code;
    let before = pair.b.engine.devices().expect("the device list").len();
    for _ in 0..4 {
        a.transport
            .fault_when(Method::Get, &format!("/devices/{old}"), Fault::LoseReply);
    }

    let result = a.engine.join(SERVER_URL, &code, "Laptop", seed_settings());

    assert!(matches!(result, Err(SyncError::Transport(_))), "{result:?}");
    assert_eq!(device_id(a), old, "the file has not switched");
    let claimed: Vec<Uuid> = pair
        .b
        .engine
        .devices()
        .expect("the device list")
        .into_iter()
        .map(|device| device.id)
        .collect();
    assert_eq!(claimed.len(), before + 1, "the claim landed");

    let relaunched = pair.space.server.relaunch(a);
    let joined = relaunched
        .engine
        .join(SERVER_URL, &code, "Laptop", seed_settings())
        .expect("the next join finishes the re-attach");

    assert_eq!(joined.mode, JoinMode::Reattach);
    let device = device_id(&relaunched);
    assert_ne!(device, old, "a new device id");
    assert!(claimed.contains(&device), "the device the first claim made");
    assert_eq!(
        pair.b.engine.devices().expect("the device list").len(),
        before + 1,
        "no second device"
    );
    relaunched.engine.sync_now().expect("the claimed device's token works");
    assert_eq!(
        relaunched.count("SELECT COUNT(*) FROM sync_enrolling"),
        0,
        "the switch records the claim"
    );
}
