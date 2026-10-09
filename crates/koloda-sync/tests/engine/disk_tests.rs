use std::path::Path;
use std::sync::atomic::Ordering;

use koloda_server::quota::Storage;
use koloda_sync::error::SyncError;
use koloda_sync::status::{State, Stop};
use koloda_sync_proto::transport::ErrorCode;
use tempfile::TempDir;
use uuid::Uuid;

use crate::common::{system_ms, Device, Space, SERVER_URL};
use crate::fixtures::{review, seed_settings};

const MARGIN_BYTES: u64 = 64 * 1024 * 1024;

/// A blank file on disk that has claimed a code into the space and bootstraps on its next cycle.
fn joiner_on_disk(space: &Space, dir: &TempDir) -> Device {
    let phone = space.server.device_at(&dir.path().join("koloda.db"));
    let code = space.device.engine.issue_pairing(None).expect("a code is issued").code;
    phone
        .engine
        .join(SERVER_URL, &code, "Phone", seed_settings())
        .expect("the phone joins");
    phone
}

/// The database file and its write-ahead log, which together hold what a bootstrap writes.
fn on_disk(path: &Path) -> u64 {
    let size = |path: &Path| std::fs::metadata(path).map_or(0, |file| file.len());
    size(path) + size(&path.with_file_name("koloda.db-wal"))
}

#[test]
fn a_bootstrap_without_room_gives_its_lease_back_and_runs_once_there_is_room() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("the library is pushed");
    let dir = TempDir::new().expect("a directory for the file");
    let phone = joiner_on_disk(&space, &dir);
    let needed = space.snapshot_bytes() * 3 + MARGIN_BYTES;
    phone.disk.0.store(needed - 1, Ordering::SeqCst);

    let refused = phone.engine.sync_now();
    let leases = space.server.count_leases(space.space_id());
    let status = phone.engine.status().expect("the status reads");
    phone.disk.0.store(needed, Ordering::SeqCst);
    let ran = phone.engine.sync_now();

    assert!(
        matches!(refused, Err(SyncError::LowDisk { needed: asked, free }) if asked == needed && free == needed - 1),
        "one byte short refuses: {refused:?}"
    );
    assert_eq!(leases, 0, "the refused bootstrap gave its lease back");
    assert_eq!(
        status.state,
        State::Stopped(Stop::LowDisk {
            needed,
            free: needed - 1
        })
    );
    assert!(ran.is_ok(), "exactly enough room runs: {ran:?}");
    assert!(phone.deck(&library.deck).is_some(), "the bootstrap applied");
}

#[test]
fn a_bootstrap_grows_the_file_by_less_than_three_times_its_bytes() {
    let space = Space::new();
    let library = space.device.library();
    space.device.add_cards(&library.deck, &library.template, 1_000);
    space.device.engine.sync_now().expect("the cards are pushed");
    let now = i64::try_from(system_ms()).expect("now fits");
    for _ in 0..3 {
        let reviews = (0..1_000)
            .map(|_| {
                (
                    Uuid::now_v7().to_string(),
                    Some(library.card.clone()),
                    space.raw_stamp(0),
                    review(&library.card, now),
                )
            })
            .collect();
        let (status, reply) = space
            .server
            .request::<koloda_sync_proto::transport::PushReply>(space.raw_request(reviews));
        assert_eq!(status, 200, "the raw reviews are accepted: {:?}", reply.error);
    }
    let dir = TempDir::new().expect("a directory for the file");
    let phone = joiner_on_disk(&space, &dir);
    let path = dir.path().join("koloda.db");
    let bytes = space.snapshot_bytes();
    let before = on_disk(&path);

    phone.engine.sync_now().expect("the bootstrap runs");

    let grown = on_disk(&path) - before;
    assert!(
        grown < bytes * 3,
        "the file grew by {grown} bytes for a snapshot of {bytes}, past the preflight's factor"
    );
    assert_eq!(phone.reviews(&library.card), 3_000, "every review arrived");
}

// WHY: the server test owns the refusal; this one shows the status a host reads and that no write is lost.
#[test]
fn writes_a_server_out_of_disk_refuses_wait_in_the_outbox_and_go_once_it_has_room() {
    let space = Space::new();
    let a = &space.device;
    let library = a.library();
    a.engine.sync_now().expect("A pushes its library");
    // WHY: SQLite never caps a file below its size, so a cap of one page holds the space where it is.
    space.server.restart_with(Storage {
        max_space_pages: 1,
        ..Storage::default()
    });
    a.add_cards(&library.deck, &library.template, 200);
    let pending = a.outbox().len();

    let refused = a.engine.sync_now();
    let status = a.engine.status().expect("status reads");

    assert!(
        matches!(
            refused,
            Err(SyncError::PushRefused {
                code: ErrorCode::InsufficientStorage,
                ..
            })
        ),
        "{refused:?}"
    );
    assert_eq!(
        status.state,
        State::Stopped(Stop::PushRefused(ErrorCode::InsufficientStorage))
    );
    assert_eq!(a.outbox().len(), pending, "every card waits");
    space.server.restart_with(Storage::default());
    a.engine.sync_now().expect("A pushes once the server has room");
    assert!(a.outbox().is_empty());
}
