//! `koloda-server restore`: a backup becomes a new generation with fresh epochs and accumulated restore points.

use std::path::Path;

use axum::http::{Method, StatusCode};
use koloda_server::backup::{backup, Manifest, MANIFEST};
use koloda_server::data_dir::DataDirLock;
use koloda_server::restore::{prepare, RestoreError, RestoreOptions};
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{
    DeviceInfo, Empty, ErrorCode, IssuePairing, Pairing, PairingClaim, RestoreMode, Snapshot, SnapshotPage, SpaceList,
};
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use tempfile::TempDir;
use uuid::Uuid;

use crate::common::{claim_request, nonce, stamp, uuid, write, Answer, Enrolled, Harness};

const HEAL: RestoreOptions = RestoreOptions {
    mode: RestoreMode::Heal,
    is_rotating_tokens: false,
};

fn backed_up(harness: &Harness) -> TempDir {
    let out = tempfile::tempdir().expect("backup directory");
    backup(harness.data_dir(), out.path(), 42).expect("backup runs");
    out
}

/// Restores `out` into the harness's data directory, commits, and serves the new generation.
fn restore(harness: &mut Harness, out: &Path, options: RestoreOptions) -> Vec<(Uuid, Uuid)> {
    let prepared = prepare(harness.data_dir(), out, options, 99).expect("restore prepares");
    let epochs = prepared.epochs().to_vec();
    prepared.commit().expect("restore commits");
    harness.reopen();
    epochs
}

async fn record(harness: &Harness, device: &Enrolled) -> Answer<DeviceInfo> {
    harness
        .get(format!(
            "/v1/spaces/{}/devices/{}",
            uuid(device.space_id),
            uuid(device.device_id)
        ))
        .token(&device.token)
        .send::<DeviceInfo>()
        .await
}

/// `(mode, epoch, head_hot, cutoffs)` of one restore point.
type Point = (String, Uuid, u64, Vec<(Uuid, u64)>);

/// Each point the active generation's copy of the space holds.
fn points(harness: &Harness, space: [u8; 16]) -> Vec<Point> {
    let path = harness
        .generation_dir()
        .join("spaces")
        .join(format!("{}.db", Uuid::from_bytes(space)));
    let conn = Connection::open(path).expect("space opens");
    let rows: Vec<(i64, String, Uuid, u64)> = conn
        .prepare("SELECT position, mode, epoch, head_hot FROM restore_points ORDER BY position")
        .expect("query prepares")
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
        .expect("query runs")
        .collect::<Result<_, _>>()
        .expect("rows read");
    rows.into_iter()
        .map(|(position, mode, epoch, head_hot)| {
            let cutoffs = conn
                .prepare("SELECT sender, last_seq FROM restore_cutoffs WHERE position = ?1 ORDER BY sender")
                .expect("query prepares")
                .query_map(params![position], |row| Ok((row.get(0)?, row.get(1)?)))
                .expect("query runs")
                .collect::<Result<_, _>>()
                .expect("rows read");
            (mode, epoch, head_hot, cutoffs)
        })
        .collect()
}

/// Edits one file of a backup and records its new checksum, as a backup taken across that edit would hold it.
fn edit_backup(out: &Path, file: &str, sql: &str) {
    Connection::open(out.join(file))
        .expect("copy opens")
        .execute(sql, [])
        .expect("edit runs");
    let path = out.join(MANIFEST);
    let mut manifest: Manifest =
        serde_json::from_slice(&std::fs::read(&path).expect("manifest reads")).expect("parses");
    let sha256 = format!(
        "{:x}",
        Sha256::digest(std::fs::read(out.join(file)).expect("file reads"))
    );
    if file == "server.db" {
        manifest.server_db.sha256 = sha256;
    }
    std::fs::write(path, serde_json::to_vec(&manifest).expect("manifest serializes")).expect("manifest writes");
}

#[tokio::test]
async fn a_restore_moves_current_to_a_new_generation_with_a_fresh_epoch_and_a_point() {
    let mut harness = Harness::new();
    let device = harness.create_space("Home").await;
    let reader = harness.pair(&device, "Laptop").await;
    let kept = Uuid::new_v4().to_string();
    harness
        .push(
            &device,
            vec![(1, write(Kind::Templates, &kept, Group::Create, stamp(0, 0, 1)))],
        )
        .await
        .ok();
    let out = backed_up(&harness);
    let lost = Uuid::new_v4().to_string();
    harness
        .push(
            &device,
            vec![(2, write(Kind::Templates, &lost, Group::Create, stamp(1, 0, 1)))],
        )
        .await
        .ok();
    let replaced = harness.generation_dir();

    let epochs = restore(&mut harness, out.path(), HEAL);

    assert_ne!(harness.generation_dir(), replaced);
    assert!(
        replaced.join("server.db").exists(),
        "the replaced generation stays on disk"
    );
    let answer = record(&harness, &device).await;
    let epoch = Uuid::from_bytes(answer.reply.meta.epoch.expect("the reply names the epoch"));
    assert_eq!(epochs, vec![(Uuid::from_bytes(device.space_id), epoch)]);
    assert_ne!(
        epoch,
        Uuid::from_bytes(device.epoch),
        "the epoch is one neither generation had"
    );
    assert_eq!(answer.ok().last_sender_seq, 1, "the record is the backup's");
    assert_eq!(
        points(&harness, device.space_id),
        vec![(
            "heal".to_string(),
            epoch,
            1,
            vec![(Uuid::from_bytes(device.device_id), 1)]
        )]
    );
    let page = harness.pull(&reader, "lane=hot&after=0").await.ok();
    assert_eq!(page.entries.len(), 1, "the write after the backup is gone");
}

#[tokio::test]
async fn the_same_backup_restored_twice_keeps_both_points() {
    let mut harness = Harness::new();
    let device = harness.create_space("Home").await;
    let out = backed_up(&harness);

    let first = restore(&mut harness, out.path(), HEAL);
    let second = restore(
        &mut harness,
        out.path(),
        RestoreOptions {
            mode: RestoreMode::Authoritative,
            is_rotating_tokens: false,
        },
    );

    assert_ne!(first[0].1, second[0].1);
    let held: Vec<(String, Uuid)> = points(&harness, device.space_id)
        .into_iter()
        .map(|(mode, epoch, _, _)| (mode, epoch))
        .collect();
    assert_eq!(
        held,
        vec![
            ("heal".to_string(), first[0].1),
            ("authoritative".to_string(), second[0].1)
        ],
        "the replaced generation's point carries forward"
    );
    assert_eq!(record(&harness, &device).await.status, StatusCode::OK, "tokens survive");
}

#[tokio::test]
async fn a_device_revoked_after_the_backup_stays_revoked_and_one_enrolled_after_it_is_unknown() {
    let mut harness = Harness::new();
    let first = harness.create_space("Home").await;
    let revoked = harness.pair(&first, "Laptop").await;
    let out = backed_up(&harness);
    harness
        .call(
            Method::DELETE,
            format!(
                "/v1/spaces/{}/devices/{}",
                uuid(first.space_id),
                uuid(revoked.device_id)
            ),
        )
        .token(&first.token)
        .send::<Empty>()
        .await
        .ok();
    let later = harness.pair(&first, "Phone").await;

    let epochs = restore(&mut harness, out.path(), HEAL);

    assert_eq!(
        record(&harness, &revoked).await.error(),
        (StatusCode::UNAUTHORIZED, ErrorCode::Revoked)
    );
    let unknown = record(&harness, &later).await;
    assert_eq!(unknown.error(), (StatusCode::UNAUTHORIZED, ErrorCode::UnknownDevice));
    assert_eq!(
        unknown.reply.meta.epoch.map(Uuid::from_bytes),
        Some(epochs[0].1),
        "a device the backup predates learns the new epoch"
    );
    assert_eq!(record(&harness, &first).await.status, StatusCode::OK);
}

#[tokio::test]
async fn rotating_tokens_revokes_every_device() {
    let mut harness = Harness::new();
    let first = harness.create_space("Home").await;
    let second = harness.pair(&first, "Laptop").await;
    let out = backed_up(&harness);

    restore(
        &mut harness,
        out.path(),
        RestoreOptions {
            mode: RestoreMode::Heal,
            is_rotating_tokens: true,
        },
    );

    for device in [&first, &second] {
        assert_eq!(
            record(&harness, device).await.error(),
            (StatusCode::UNAUTHORIZED, ErrorCode::Revoked)
        );
    }
}

#[tokio::test]
async fn codes_leases_and_cursors_from_before_the_restore_do_not_carry_over() {
    let mut harness = Harness::new();
    let device = harness.create_space("Home").await;
    let template = Uuid::new_v4().to_string();
    harness
        .push(
            &device,
            vec![(1, write(Kind::Templates, &template, Group::Create, stamp(0, 0, 1)))],
        )
        .await
        .ok();
    let code = harness
        .post(format!("/v1/spaces/{}/pairings", uuid(device.space_id)))
        .token(&device.token)
        .body(&IssuePairing::default())
        .send::<Pairing>()
        .await
        .ok()
        .code;
    let lease = harness
        .post(format!("/v1/spaces/{}/bootstrap", uuid(device.space_id)))
        .token(&device.token)
        .send::<Snapshot>()
        .await
        .ok()
        .snapshot_id;
    let out = backed_up(&harness);
    // The cut between files: the roster was copied after this device pulled past the space copy's head.
    edit_backup(out.path(), "server.db", "UPDATE devices SET cursor_hot = 50");

    restore(&mut harness, out.path(), HEAL);

    let claim = harness
        .post("/v1/pairings/claim")
        .body(&claim_request(&code, "Phone", nonce("phone")))
        .send::<PairingClaim>()
        .await;
    assert_eq!(claim.error(), (StatusCode::NOT_FOUND, ErrorCode::PairingFailed));
    let page = harness
        .get(format!(
            "/v1/spaces/{}/bootstrap/{}?lane=hot&after=0",
            uuid(device.space_id),
            uuid(lease)
        ))
        .token(&device.token)
        .send::<SnapshotPage>()
        .await;
    assert_eq!(page.error(), (StatusCode::GONE, ErrorCode::LeaseExpired));
    assert_eq!(
        record(&harness, &device).await.ok().cursor_hot,
        1,
        "the record's cursor is clamped to the head"
    );
}

#[tokio::test]
async fn a_backup_that_does_not_match_its_manifest_is_refused() {
    let harness = Harness::new();
    let device = harness.create_space("Home").await;
    let out = backed_up(&harness);
    let space = Uuid::from_bytes(device.space_id);
    Connection::open(out.path().join("spaces").join(format!("{space}.db")))
        .expect("copy opens")
        .execute("DELETE FROM write_schema", [])
        .expect("edit runs");
    let current = harness.generation_dir();

    let refused = prepare(harness.data_dir(), out.path(), HEAL, 99);

    assert!(matches!(refused, Err(RestoreError::Mismatch(_))));
    assert_eq!(harness.generation_dir(), current);
    assert_eq!(
        std::fs::read_dir(harness.data_dir().join("generations"))
            .expect("generations list")
            .count(),
        1,
        "the staged generation is gone"
    );
}

#[tokio::test]
async fn a_restore_onto_a_new_machine_needs_no_server_there() {
    let harness = Harness::new();
    harness.create_space("Home").await;
    let out = backed_up(&harness);
    let machine = tempfile::tempdir().expect("new data directory");

    prepare(machine.path(), out.path(), HEAL, 99)
        .expect("restore prepares")
        .commit()
        .expect("restore commits");

    let restored = Harness::open(machine, harness.setup_token.clone());
    let spaces = restored
        .get("/v1/spaces")
        .token(&restored.setup_token)
        .send::<SpaceList>()
        .await
        .ok();
    assert_eq!(spaces.spaces.len(), 1, "the setup token is the backup's");
}

#[tokio::test]
async fn a_restore_is_refused_while_the_server_holds_the_directory() {
    let harness = Harness::new();
    harness.create_space("Home").await;
    let out = backed_up(&harness);
    let _serving = DataDirLock::acquire(harness.data_dir()).expect("lock takes");

    let refused = prepare(harness.data_dir(), out.path(), HEAL, 99);

    assert!(matches!(refused, Err(RestoreError::DataDir(_))));
}
