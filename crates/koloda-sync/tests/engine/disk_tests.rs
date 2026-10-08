use std::path::Path;
use std::sync::atomic::Ordering;

use koloda_sync::error::SyncError;
use koloda_sync::status::{State, Stop};
use koloda_sync::transport::Method;
use koloda_sync_proto::transport::{Empty, Snapshot};
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

/// The bytes a bootstrap of the space carries, as a lease the raw client opens and gives back reports them.
fn snapshot_bytes(space: &Space) -> u64 {
    let path = format!("/v1/spaces/{}/bootstrap", space.space_id());
    let (status, reply) = space.server.call::<Snapshot>(Method::Post, &path, &space.raw.token);
    assert_eq!(status, 200, "the raw client opens a lease: {:?}", reply.error);
    let snapshot = reply.ok.expect("a lease");
    let release = format!("{path}/{}", Uuid::from_bytes(snapshot.snapshot_id));
    let (status, _) = space.server.call::<Empty>(Method::Delete, &release, &space.raw.token);
    assert_eq!(status, 200, "the raw client gives its lease back");
    snapshot.bytes
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
    let needed = snapshot_bytes(&space) * 3 + MARGIN_BYTES;
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
    let bytes = snapshot_bytes(&space);
    let before = on_disk(&path);

    phone.engine.sync_now().expect("the bootstrap runs");

    let grown = on_disk(&path) - before;
    assert!(
        grown < bytes * 3,
        "the file grew by {grown} bytes for a snapshot of {bytes}, past the preflight's factor"
    );
    assert_eq!(phone.reviews(&library.card), 3_000, "every review arrived");
}
