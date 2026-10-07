//! `koloda-server backup`: an online copy of the active generation and its manifest.

use std::num::NonZeroU32;

use axum::http::Method;
use koloda_server::backup::{backup, BackupError, Manifest, SenderSeq, MANIFEST};
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{AttachmentBody, Empty};
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::common::{stamp, uuid, write, Harness};

fn count(path: &std::path::Path, sql: &str) -> i64 {
    Connection::open(path)
        .expect("copy opens")
        .query_row(sql, [], |row| row.get(0))
        .expect("count query runs")
}

fn sha256(path: &std::path::Path) -> String {
    format!("{:x}", Sha256::digest(std::fs::read(path).expect("file reads")))
}

#[tokio::test]
async fn a_backup_holds_what_was_committed_before_it_and_matches_its_manifest() {
    let harness = Harness::new();
    let device = harness.create_space("Home").await;
    let template = Uuid::new_v4().to_string();
    harness
        .push(
            &device,
            vec![(1, write(Kind::Templates, &template, Group::Create, stamp(0, 0, 1)))],
        )
        .await
        .ok();
    let out = tempfile::tempdir().expect("backup directory");

    let manifest = backup(harness.data_dir(), out.path(), 42).expect("backup runs");
    let later = Uuid::new_v4().to_string();
    harness
        .push(
            &device,
            vec![(2, write(Kind::Templates, &later, Group::Create, stamp(1, 0, 1)))],
        )
        .await
        .ok();

    let space = Uuid::from_bytes(device.space_id);
    let copy = out.path().join("spaces").join(format!("{space}.db"));
    assert_eq!(
        count(&copy, "SELECT COUNT(*) FROM versions"),
        1,
        "the later push is not in the copy"
    );
    assert_eq!(manifest.spaces.len(), 1);
    let entry = &manifest.spaces[0];
    assert_eq!((entry.id, entry.epoch), (space, Uuid::from_bytes(device.epoch)));
    assert_eq!((entry.head_hot, entry.head_cold), (1, 0));
    assert_eq!(
        entry.senders,
        vec![SenderSeq {
            sender: Uuid::from_bytes(device.device_id),
            last_seq: 1,
        }]
    );
    assert_eq!(entry.file.sha256, sha256(&copy));
    assert_eq!(manifest.server_db.sha256, sha256(&out.path().join("server.db")));
    assert_eq!(count(&out.path().join("server.db"), "SELECT COUNT(*) FROM devices"), 1);
    let written: Manifest = serde_json::from_slice(&std::fs::read(out.path().join(MANIFEST)).expect("manifest reads"))
        .expect("manifest parses");
    assert_eq!(written, manifest);
}

#[tokio::test]
async fn an_attachment_whose_file_was_collected_meanwhile_is_left_out() {
    let harness = Harness::new();
    let device = harness.create_space("Home").await;
    let mut ids = Vec::new();
    for seed in [1_u8, 2] {
        let bytes = vec![seed; 64];
        let id = format!("{:x}", Sha256::digest(&bytes));
        harness
            .call(
                Method::PUT,
                format!("/v1/spaces/{}/attachments/{id}", uuid(device.space_id)),
            )
            .token(&device.token)
            .body(&AttachmentBody {
                mime: "image/png".to_string(),
                width: NonZeroU32::new(1),
                height: NonZeroU32::new(1),
                bytes,
            })
            .send::<Empty>()
            .await
            .ok();
        ids.push(id);
    }
    // A collection pass deletes the row, then the file; this backup sees the row and finds no file.
    let space = Uuid::from_bytes(device.space_id);
    std::fs::remove_file(
        harness
            .generation_dir()
            .join("attachments")
            .join(space.to_string())
            .join(&ids[1]),
    )
    .expect("file removes");
    let out = tempfile::tempdir().expect("backup directory");

    let manifest = backup(harness.data_dir(), out.path(), 42).expect("backup runs");

    assert_eq!(manifest.spaces[0].attachments, vec![ids[0].clone()]);
    let copy = out.path().join("spaces").join(format!("{space}.db"));
    assert_eq!(count(&copy, "SELECT COUNT(*) FROM attachments"), 1);
    assert_eq!(
        sha256(&out.path().join("attachments").join(space.to_string()).join(&ids[0])),
        ids[0],
        "the copied bytes hash to their id"
    );
}

#[tokio::test]
async fn a_directory_that_is_not_empty_is_refused() {
    let harness = Harness::new();
    harness.create_space("Home").await;
    let out = tempfile::tempdir().expect("backup directory");
    std::fs::write(out.path().join("note"), "keep").expect("file writes");

    assert!(matches!(
        backup(harness.data_dir(), out.path(), 42),
        Err(BackupError::NotEmpty(_))
    ));
    assert!(!out.path().join(MANIFEST).exists());
}
