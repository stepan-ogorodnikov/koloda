//! Space quotas and disk watermarks (`crates/koloda-sync-proto/PROTOCOL.md` §Quotas).

use std::num::NonZeroU32;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use axum::http::{Method, StatusCode};
use koloda_sync_proto::envelope::{Envelope, Header};
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{AttachmentBody, Empty, ErrorCode, HeldReason, Outcome, Push, PushItem, Snapshot};
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use koloda_server::quota::Storage;

use crate::common::{batch, card_create, child, outcomes, stamp, tombstone, uuid, write, Enrolled, Harness, TestDisk};

const QUOTA: Outcome = Outcome::Held {
    reason: HeldReason::Quota,
};
const DECK: &str = "01920000-0000-7000-8000-0000000000d1";
const OTHER_DECK: &str = "01920000-0000-7000-8000-0000000000d2";
const TEMPLATE: &str = "01920000-0000-7000-8000-0000000000e1";
const CARD: &str = "01920000-0000-7000-8000-0000000000c1";

fn space(device: &Enrolled) -> Uuid {
    Uuid::from_bytes(device.space_id)
}

/// What the space file holds: its pages in use plus the bytes of its attachments, as the quota counts them.
fn usage(harness: &Harness, device: &Enrolled) -> u64 {
    let conn = Connection::open(
        harness
            .generation_dir()
            .join("spaces")
            .join(format!("{}.db", space(device))),
    )
    .expect("the space database opens");
    conn.query_row(
        "SELECT ((SELECT page_count FROM pragma_page_count()) - (SELECT freelist_count FROM pragma_freelist_count()))
                * (SELECT page_size FROM pragma_page_size())
              + (SELECT coalesce(sum(size), 0) FROM attachments)",
        [],
        |row| row.get(0),
    )
    .expect("usage reads")
}

async fn is_over_quota(harness: &Harness, device: &Enrolled) -> bool {
    harness.device_meta(device).await.is_over_quota
}

async fn push_outcomes(harness: &Harness, device: &Enrolled, items: Vec<(u64, Header)>) -> Vec<Outcome> {
    outcomes(harness.push(device, items).await.ok())
        .into_iter()
        .map(|(_, outcome, _)| outcome)
        .collect()
}

/// A template and two decks, applied before any quota is set.
async fn decks(harness: &Harness, device: &Enrolled) {
    let applied = push_outcomes(
        harness,
        device,
        vec![
            (1, write(Kind::Templates, TEMPLATE, Group::Create, stamp(0, 0, 1))),
            (2, write(Kind::Decks, DECK, Group::Create, stamp(0, 1, 1))),
            (3, write(Kind::Decks, OTHER_DECK, Group::Create, stamp(0, 2, 1))),
        ],
    )
    .await;
    assert_eq!(applied, vec![Outcome::Applied; 3]);
}

fn image(seed: u8) -> (String, AttachmentBody) {
    let bytes = vec![seed; 64];
    let id = format!("{:x}", Sha256::digest(&bytes));
    (
        id,
        AttachmentBody {
            mime: "image/png".to_string(),
            width: NonZeroU32::new(8),
            height: NonZeroU32::new(8),
            bytes,
        },
    )
}

#[tokio::test]
async fn over_its_quota_a_space_holds_growing_writes_and_applies_deletes() {
    let harness = Harness::new();
    let device = harness.create_space("Study").await;
    decks(&harness, &device).await;
    assert!(
        !is_over_quota(&harness, &device).await,
        "a space with no quota is never over"
    );

    harness
        .server
        .set_quota(space(&device), Some(usage(&harness, &device)))
        .expect("the quota is set");

    assert!(is_over_quota(&harness, &device).await, "at the quota is over it");
    let held = push_outcomes(
        &harness,
        &device,
        vec![
            (4, card_create(CARD, DECK, TEMPLATE, stamp(1, 0, 1))),
            (5, write(Kind::Decks, DECK, Group::Title, stamp(1, 1, 1))),
            (6, tombstone(Kind::Decks, OTHER_DECK, None, stamp(1, 2, 1))),
        ],
    )
    .await;
    assert_eq!(held, vec![QUOTA, QUOTA, Outcome::Applied]);

    harness
        .server
        .set_quota(space(&device), None)
        .expect("the quota is cleared");

    assert!(!is_over_quota(&harness, &device).await);
    let applied = push_outcomes(
        &harness,
        &device,
        vec![(7, card_create(CARD, DECK, TEMPLATE, stamp(1, 0, 1)))],
    )
    .await;
    assert_eq!(
        applied,
        vec![Outcome::Applied],
        "the held create lands once pushed again"
    );
}

#[tokio::test]
async fn a_freeing_delete_brings_the_space_back_under_its_quota() {
    let harness = Harness::new();
    let device = harness.create_space("Study").await;
    decks(&harness, &device).await;
    // WHY: large payloads, so the delete frees whole pages; the quota counts pages in use.
    let cards = Push {
        items: (0..40u16)
            .map(|index| PushItem {
                sender_seq: 4 + u64::from(index),
                envelope: Envelope {
                    header: card_create(
                        &format!("01920000-0000-7000-8000-{:012x}", 0xc100 + u64::from(index)),
                        OTHER_DECK,
                        TEMPLATE,
                        stamp(1, index, 1),
                    ),
                    payload: vec![0xab; 8 * 1024],
                }
                .encode()
                .expect("a card envelope encodes"),
            })
            .collect(),
    };
    harness.push_body(&device, &cards).await.ok();
    harness
        .server
        .set_quota(space(&device), Some(usage(&harness, &device)))
        .expect("the quota is set");
    assert!(is_over_quota(&harness, &device).await);

    let deleted = push_outcomes(
        &harness,
        &device,
        vec![(44, tombstone(Kind::Decks, OTHER_DECK, None, stamp(2, 0, 1)))],
    )
    .await;

    assert_eq!(deleted, vec![Outcome::Applied]);
    assert!(!is_over_quota(&harness, &device).await);
    let applied = push_outcomes(
        &harness,
        &device,
        vec![(45, card_create(CARD, DECK, TEMPLATE, stamp(2, 1, 1)))],
    )
    .await;
    assert_eq!(applied, vec![Outcome::Applied]);
}

#[tokio::test]
async fn the_disk_watermarks_hold_writes_then_refuse_every_push() {
    let disk = Arc::new(TestDisk(AtomicU64::new(10_000)));
    let harness = Harness::with_disk(Arc::clone(&disk), 1_000, 100);
    let device = harness.create_space("Study").await;
    decks(&harness, &device).await;

    disk.0.store(500, Ordering::SeqCst);
    assert!(
        is_over_quota(&harness, &device).await,
        "below the soft watermark counts as over"
    );
    let held = push_outcomes(
        &harness,
        &device,
        vec![
            (4, card_create(CARD, DECK, TEMPLATE, stamp(1, 0, 1))),
            (5, tombstone(Kind::Decks, OTHER_DECK, None, stamp(1, 1, 1))),
        ],
    )
    .await;
    assert_eq!(held, vec![QUOTA, Outcome::Applied]);

    disk.0.store(50, Ordering::SeqCst);
    let refused = harness
        .push_body(
            &device,
            &batch(vec![(6, tombstone(Kind::Decks, DECK, None, stamp(2, 0, 1)))]),
        )
        .await;
    assert_eq!(
        refused.error(),
        (StatusCode::INSUFFICIENT_STORAGE, ErrorCode::InsufficientStorage),
        "below the reserve even a tombstone is refused"
    );

    disk.0.store(10_000, Ordering::SeqCst);
    let retried = outcomes(
        harness
            .push(&device, vec![(6, tombstone(Kind::Decks, DECK, None, stamp(2, 0, 1)))])
            .await
            .ok(),
    );
    assert_eq!(
        retried,
        vec![(6, Outcome::Applied, false)],
        "the refused push consumed nothing"
    );
}

#[tokio::test]
async fn a_space_without_room_opens_no_bootstrap_and_stores_no_upload() {
    let harness = Harness::new();
    let device = harness.create_space("Study").await;
    decks(&harness, &device).await;
    let (id, body) = image(7);
    let open = || {
        harness
            .post(format!("/v1/spaces/{}/bootstrap", uuid(device.space_id)))
            .token(&device.token)
            .send::<Snapshot>()
    };
    let upload = || {
        harness
            .call(
                Method::PUT,
                format!("/v1/spaces/{}/attachments/{id}", uuid(device.space_id)),
            )
            .token(&device.token)
            .body(&body)
            .send::<Empty>()
    };
    harness
        .server
        .set_quota(space(&device), Some(usage(&harness, &device)))
        .expect("the quota is set");

    let refused = (open().await.error(), upload().await.error());

    let insufficient = (StatusCode::INSUFFICIENT_STORAGE, ErrorCode::InsufficientStorage);
    assert_eq!(refused, (insufficient, insufficient));
    harness
        .server
        .set_quota(space(&device), None)
        .expect("the quota is cleared");
    assert_eq!(open().await.status, StatusCode::OK);
    assert_eq!(upload().await.status, StatusCode::OK);
}

#[tokio::test]
async fn an_upload_counts_toward_the_quota_once_until_it_is_collected() {
    let harness = Harness::new();
    let device = harness.create_space("Study").await;
    decks(&harness, &device).await;
    let (id, body) = image(8);
    let upload = || {
        harness
            .call(
                Method::PUT,
                format!("/v1/spaces/{}/attachments/{id}", uuid(device.space_id)),
            )
            .token(&device.token)
            .body(&body)
            .send::<Empty>()
    };
    assert_eq!(upload().await.status, StatusCode::OK);
    assert_eq!(upload().await.status, StatusCode::OK, "a repeat upload stores nothing");
    let with_image = usage(&harness, &device);
    let set_quota = |quota| {
        harness
            .server
            .set_quota(space(&device), Some(quota))
            .expect("the quota is set");
    };

    set_quota(with_image + 1);
    let is_over_above = is_over_quota(&harness, &device).await;
    set_quota(with_image);
    let is_over_at = is_over_quota(&harness, &device).await;
    // An image no card links is collected after 90 days.
    harness.clock.advance(91 * 24 * 60 * 60 * 1000);
    harness.server.collect_garbage().expect("collection runs");
    let is_over_after_collection = is_over_quota(&harness, &device).await;

    assert!(!is_over_above, "the image counts once");
    assert!(is_over_at, "the image counts");
    assert!(!is_over_after_collection, "a collected image counts no more");
}

/// The space file's heads and its lanes' highest seq, which a push that consumed nothing leaves alone.
fn heads_and_seq(harness: &Harness, device: &Enrolled) -> (i64, i64) {
    let conn = Connection::open(
        harness
            .generation_dir()
            .join("spaces")
            .join(format!("{}.db", space(device))),
    )
    .expect("the space database opens");
    conn.query_row(
        "SELECT (SELECT COUNT(*) FROM heads), (SELECT MAX(head) FROM lanes)",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .expect("counts read")
}

#[tokio::test]
async fn a_push_that_runs_out_of_disk_consumes_nothing_and_applies_once_there_is_room() {
    let mut harness = Harness::new();
    let device = harness.create_space("Study").await;
    decks(&harness, &device).await;
    let mut items = Vec::new();
    for card in 0..200_u64 {
        let card_id = format!("01920000-0000-7000-8000-{card:012x}");
        let seq = 4 + card * 2;
        items.push((seq, card_create(&card_id, DECK, TEMPLATE, stamp(1, 0, 1))));
        let review_id = format!("01920000-0000-7000-9000-{card:012x}");
        items.push((
            seq + 1,
            child(Kind::Reviews, &review_id, &card_id, Group::Row, stamp(1, 0, 1)),
        ));
    }
    let before = heads_and_seq(&harness, &device);
    // WHY: SQLite never caps a file below its size, so a cap of one page holds the space where it is.
    harness.reopen_with(Storage {
        max_space_pages: 1,
        ..Storage::default()
    });

    let refused = harness.push(&device, items.clone()).await.error();
    let after_refusal = heads_and_seq(&harness, &device);
    harness.reopen();
    let applied = push_outcomes(&harness, &device, items).await;

    assert_eq!(
        refused,
        (StatusCode::INSUFFICIENT_STORAGE, ErrorCode::InsufficientStorage)
    );
    assert_eq!(after_refusal, before, "the push consumed nothing");
    assert_eq!(
        applied,
        vec![Outcome::Applied; 400],
        "the same push applies once there is room"
    );
}

#[tokio::test]
async fn a_quota_names_a_space_that_exists() {
    let harness = Harness::new();

    let error = harness
        .server
        .set_quota(Uuid::new_v4(), Some(1))
        .expect_err("no such space");

    assert_eq!(error.code(), ErrorCode::UnknownSpace);
}
