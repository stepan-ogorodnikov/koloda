//! A file behind its own device record forks to a new device and re-bootstraps (`crates/koloda-sync-proto/PROTOCOL.md`
//! §Behind its own record).

use koloda::domain::cards::ResetCardProgressData;
use koloda::domain::decks::DeleteDeckData;
use koloda::repo::{cards, decks};
use koloda_sync::transport::Method;
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::registry::{Group, Kind, Lane};
use koloda_sync_proto::transport::{PullPage, Push, PushItem, PushReply};
use uuid::Uuid;

use crate::common::{Device, Fault, Space};
use crate::fixtures::Library;

const DAY_MS: u64 = 24 * 60 * 60 * 1000;

fn device_id(device: &Device) -> Uuid {
    device.state().expect("the device is enrolled").device_id
}

fn title(device: &Device, deck: &str) -> String {
    device.deck(deck).expect("the deck exists").title
}

fn rename(device: &Device, library: &Library, title: &str) {
    device.update_deck(&library.deck, title, &library.algorithm, &library.template);
}

/// The URLs of the requests the device sent after its first `skip`.
fn urls_after(device: &Device, skip: usize) -> Vec<String> {
    device
        .transport
        .sent()
        .into_iter()
        .skip(skip)
        .map(|request| format!("{:?} {}", request.method, request.url))
        .collect()
}

/// Builds a space with a synced library and returns a file that is behind its own device record.
type BehindFile = fn(&Space, &Library) -> Device;

#[test]
fn each_way_a_file_is_found_behind_forks_it_before_any_push_or_pull() {
    let cases: [(&str, BehindFile); 3] = [
        ("the record has consumed the file's next seq", |space, library| {
            let copy = space.server.copy(&space.device);
            rename(&space.device, library, "Renamed");
            space.device.engine.sync_now().expect("the original pushes on");
            copy
        }),
        ("a row not yet sent has a consumed seq", |space, library| {
            let copy = space.server.copy(&space.device);
            rename(&space.device, library, "Renamed");
            space.device.engine.sync_now().expect("the original pushes on");
            rename(&copy, library, "Copy");
            copy
        }),
        ("a seq the file never kept was consumed", |space, library| {
            let first = space.server.copy(&space.device);
            rename(&first, library, "First copy");
            first.engine.sync_now().expect("the first copy pushes");
            // WHY: a second save of the same group replaces the unsent row at a new seq, so the file keeps no row
            // at the seq the first copy used.
            rename(&space.device, library, "Renamed");
            rename(&space.device, library, "Copy");
            space.server.copy(&space.device)
        }),
    ];

    for (name, arrange) in cases {
        let space = Space::new();
        let library = space.device.library();
        space.device.engine.sync_now().expect("the library is pushed");
        let original = device_id(&space.device);
        let file = arrange(&space, &library);
        let sent = file.transport.sent().len();

        file.engine.sync_now().expect("the file forks and syncs");

        let urls = urls_after(&file, sent);
        let forked = urls.iter().position(|url| url.ends_with("/devices/fork"));
        let first_exchange = urls
            .iter()
            .position(|url| url.contains("/push") || url.contains("/pull?"));
        assert!(
            forked.is_some() && forked < first_exchange,
            "{name}: fork first: {urls:?}"
        );
        assert_ne!(device_id(&file), original, "{name}: the file has a new device id");
        space.device.engine.sync_now().expect("the original syncs");
        file.engine.sync_now().expect("the file syncs again");
        space.device.engine.sync_now().expect("the original syncs again");
        assert_eq!(
            title(&file, &library.deck),
            title(&space.device, &library.deck),
            "{name}: both files converge"
        );
        assert!(file.outbox().is_empty() && space.device.outbox().is_empty(), "{name}");
    }
}

#[test]
fn two_live_copies_both_keep_syncing_and_a_write_on_the_copy_reaches_the_space() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("the library is pushed");
    let original = device_id(&space.device);
    let copy = space.server.copy(&space.device);
    rename(&space.device, &library, "Original");
    space.device.engine.sync_now().expect("the original pushes");
    rename(&copy, &library, "Copy");

    copy.engine.sync_now().expect("the copy forks");
    space.device.engine.sync_now().expect("the original pulls");
    assert_eq!(
        title(&space.device, &library.deck),
        "Copy",
        "the copy's pending write reached the space"
    );

    let card = space
        .device
        .add_card(&library.deck, &library.template, "from the original");
    space.device.engine.sync_now().expect("the original pushes");
    let other = copy.add_card(&library.deck, &library.template, "from the copy");
    copy.engine.sync_now().expect("the copy syncs");
    space.device.engine.sync_now().expect("the original syncs");

    assert_eq!(device_id(&space.device), original, "the original never forks");
    assert!(
        copy.has_card(&card) && space.device.has_card(&other),
        "both keep syncing"
    );
    assert_eq!(
        copy.engine.devices().expect("devices list").len(),
        3,
        "creator, raw client, and one fork"
    );
}

#[test]
fn a_copy_whose_original_pushed_only_the_reset_sends_the_blank_scheduling_at_its_stamp() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("the library is pushed");
    cards::reset_card_progress(
        &space.device.db,
        ResetCardProgressData {
            id: library.card.clone(),
        },
    )
    .expect("the card resets");
    let copy = space.server.copy(&space.device);
    // The original pushes only the reset envelope, as a push cut short after its first item would leave it.
    let reset = space
        .device
        .outbox()
        .into_iter()
        .find(|row| row.envelope.header.group == Some(Group::Reset))
        .expect("the reset is pending");
    let reset_seq: u64 = space
        .device
        .count("SELECT sender_seq FROM sync_outbox WHERE group_name = 'reset'")
        .try_into()
        .expect("seq fits");
    let stamp = reset.envelope.header.stamp;
    let (status, reply) = space.server.post::<_, PushReply>(
        &format!("/v1/spaces/{}/push", space.space_id()),
        Some(&space.device.token()),
        &Push {
            items: vec![PushItem {
                sender_seq: reset_seq,
                envelope: reset.envelope.encode().expect("envelope encodes"),
            }],
        },
    );
    assert_eq!(status, 200, "{:?}", reply.error);

    copy.engine.sync_now().expect("the copy forks and syncs");

    let scheduling: Vec<Envelope> = space
        .raw_pull(Lane::Hot, 0)
        .entries
        .iter()
        .map(|entry| Envelope::decode(&entry.envelope).expect("entry decodes"))
        .filter(|envelope| envelope.header.kind == Kind::Cards && envelope.header.group == Some(Group::Scheduling))
        .collect();
    assert_eq!(scheduling.len(), 1);
    assert_eq!(
        scheduling[0].header.stamp, stamp,
        "the blank scheduling keeps the reset's stamp and device"
    );
}

#[test]
fn what_the_space_deleted_while_the_file_was_behind_goes_with_the_fork() {
    let space = Space::new();
    let library = space.device.library();
    let doomed = space.device.add_deck(&library.algorithm, &library.template, "Doomed");
    space.device.engine.sync_now().expect("the library is pushed");
    let copy = space.server.copy(&space.device);
    decks::delete_deck(&space.device.db, DeleteDeckData { id: doomed.clone() }).expect("the deck is deleted");
    space.device.engine.sync_now().expect("the original pushes the delete");

    copy.engine.sync_now().expect("the copy forks and syncs");

    assert!(copy.deck(&doomed).is_none());
}

#[test]
fn a_crash_between_the_fork_reply_and_the_switch_makes_one_fork_record() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("the library is pushed");
    let copy = space.server.copy(&space.device);
    rename(&space.device, &library, "Renamed");
    space.device.engine.sync_now().expect("the original pushes on");
    for _ in 0..4 {
        copy.transport
            .fault_when(Method::Post, "/devices/fork", Fault::LoseReply);
    }
    assert!(copy.engine.sync_now().is_err(), "no fork reply arrives");
    assert_eq!(device_id(&copy), device_id(&space.device), "the file has not switched");

    let relaunched = space.server.relaunch(&copy);
    relaunched.engine.sync_now().expect("the relaunch finishes the fork");

    assert_ne!(device_id(&relaunched), device_id(&space.device));
    assert_eq!(
        relaunched.engine.devices().expect("devices list").len(),
        3,
        "creator, raw client, and one fork"
    );
}

#[test]
fn a_rolled_back_files_old_record_stops_holding_collection_back() {
    let space = Space::new();
    let library = space.device.library();
    let doomed = space.device.add_deck(&library.algorithm, &library.template, "Doomed");
    space.device.engine.sync_now().expect("the library is pushed");
    let restored = space.server.copy(&space.device);
    rename(&space.device, &library, "Renamed");
    space
        .device
        .engine
        .sync_now()
        .expect("the original pushes on, then is lost");
    restored.engine.sync_now().expect("the restored file forks");
    decks::delete_deck(&restored.db, DeleteDeckData { id: doomed }).expect("the deck is deleted");
    restored.engine.sync_now().expect("the delete is pushed");
    restored.engine.sync_now().expect("the restored file passes it");
    space.server.backdate(device_id(&space.device), DAY_MS + 60 * 60 * 1000);
    space
        .server
        .backdate(Uuid::from_bytes(space.raw.device_id), 91 * DAY_MS);

    space.server.server.collect_garbage().expect("a collection pass");

    let (status, _) = space.server.call::<PullPage>(
        Method::Get,
        &format!("/v1/spaces/{}/pull?lane=hot&after=0", space.space_id()),
        &restored.token(),
    );
    assert_eq!(
        status, 409,
        "the forked-from record, idle past a day, no longer pins the tombstone"
    );
}
