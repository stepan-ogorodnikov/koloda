use std::num::NonZeroU32;

use axum::http::{Method, StatusCode};
use ciborium::Value;
use koloda_server::clock::Clock;
use koloda_sync_proto::envelope::{Header, Refs};
use koloda_sync_proto::hlc::Stamp;
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{
    AttachmentBody, Empty, Enrollment, ErrorCode, Outcome, PushOutcome, MAX_ATTACHMENT_BYTES,
};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use sha2::{Digest, Sha256};

use crate::common::{card_create, child, stamp, tombstone, uuid, write, Answer, Harness, START_MS};

/// Bytes the server stores as they are: it checks the hash, never the format.
fn image(seed: u8, len: usize) -> (String, AttachmentBody) {
    let bytes = vec![seed; len];
    let id = format!("{:x}", Sha256::digest(&bytes));
    (
        id,
        AttachmentBody {
            mime: "image/png".to_string(),
            width: NonZeroU32::new(640),
            height: NonZeroU32::new(480),
            bytes,
        },
    )
}

fn path(device: &Enrollment, id: &str) -> String {
    format!("/v1/spaces/{}/attachments/{id}", uuid(device.space_id))
}

async fn put(harness: &Harness, device: &Enrollment, id: &str, body: &AttachmentBody) -> Answer<Empty> {
    harness
        .call(Method::PUT, path(device, id))
        .token(&device.token)
        .body(body)
        .send::<Empty>()
        .await
}

async fn get(harness: &Harness, device: &Enrollment, id: &str) -> Answer<AttachmentBody> {
    harness
        .get(path(device, id))
        .token(&device.token)
        .send::<AttachmentBody>()
        .await
}

/// Every file in the space's attachment directory, temporary ones included.
fn files(harness: &Harness, device: &Enrollment) -> Vec<String> {
    let dir = harness.generation_dir().join("attachments").join(uuid(device.space_id));
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .map(|entry| {
            entry
                .expect("read a directory entry")
                .file_name()
                .to_string_lossy()
                .into_owned()
        })
        .collect();
    names.sort();
    names
}

#[tokio::test]
async fn a_stored_attachment_comes_back_with_its_metadata() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let (id, body) = image(1, 1_000);

    put(&harness, &home, &id, &body).await.ok();
    let fetched = get(&harness, &home, &id).await.ok();

    assert_eq!(fetched, body);
    assert_eq!(files(&harness, &home), vec![id]);
}

#[tokio::test]
async fn the_same_image_is_stored_once() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let (id, body) = image(2, 1_000);

    put(&harness, &home, &id, &body).await.ok();
    put(&harness, &home, &id, &body).await.ok();
    // The second device records other metadata; the first upload's stays.
    let other = AttachmentBody {
        width: None,
        height: None,
        ..body.clone()
    };
    put(&harness, &phone, &id, &other).await.ok();

    assert_eq!(files(&harness, &home), vec![id.clone()]);
    assert_eq!(get(&harness, &phone, &id).await.ok(), body);
}

#[tokio::test]
async fn an_attachment_that_fails_a_check_is_not_stored() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let (id, body) = image(3, 1_000);
    let (other_id, _) = image(4, 1_000);
    let (oversized_id, oversized) = image(5, MAX_ATTACHMENT_BYTES + 1);
    let cases = [
        (
            "bytes of another id",
            other_id.clone(),
            body.clone(),
            StatusCode::BAD_REQUEST,
        ),
        (
            "an uppercase id",
            id.to_uppercase(),
            body.clone(),
            StatusCode::BAD_REQUEST,
        ),
        (
            "a short id",
            id.chars().take(63).collect(),
            body.clone(),
            StatusCode::BAD_REQUEST,
        ),
        (
            "an svg",
            id.clone(),
            AttachmentBody {
                mime: "image/svg+xml".to_string(),
                ..body.clone()
            },
            StatusCode::BAD_REQUEST,
        ),
        (
            "one byte past the cap",
            oversized_id,
            oversized,
            StatusCode::PAYLOAD_TOO_LARGE,
        ),
    ];

    for (name, id, body, status) in cases {
        let answer = put(&harness, &home, &id, &body).await;
        let expected = if status == StatusCode::PAYLOAD_TOO_LARGE {
            ErrorCode::TooLarge
        } else {
            ErrorCode::BadRequest
        };
        assert_eq!(answer.error(), (status, expected), "{name}");
    }
    let zero_width = Value::Map(vec![
        (Value::Text("mime".to_string()), Value::Text("image/png".to_string())),
        (Value::Text("width".to_string()), Value::Integer(0.into())),
        (Value::Text("bytes".to_string()), Value::Bytes(body.bytes.clone())),
    ]);
    let zero_width = harness
        .call(Method::PUT, path(&home, &id))
        .token(&home.token)
        .body(&zero_width)
        .send::<Empty>()
        .await;
    assert_eq!(zero_width.error(), (StatusCode::BAD_REQUEST, ErrorCode::BadRequest));
    assert_eq!(files(&harness, &home), Vec::<String>::new());
    assert_eq!(
        get(&harness, &home, &id).await.error(),
        (StatusCode::NOT_FOUND, ErrorCode::NotFound)
    );
}

#[tokio::test]
async fn an_attachment_at_the_size_cap_is_stored() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let (id, body) = image(6, MAX_ATTACHMENT_BYTES);

    put(&harness, &home, &id, &body).await.ok();

    assert_eq!(get(&harness, &home, &id).await.ok().bytes.len(), MAX_ATTACHMENT_BYTES);
}

#[tokio::test]
async fn an_attachment_no_device_uploaded_is_not_found() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let (id, _) = image(7, 10);

    assert_eq!(
        get(&harness, &home, &id).await.error(),
        (StatusCode::NOT_FOUND, ErrorCode::NotFound)
    );
}

#[tokio::test]
async fn attachments_answer_only_devices_of_their_space() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let work = harness.create_space("Work").await;
    let (id, body) = image(8, 10);
    put(&harness, &home, &id, &body).await.ok();

    let foreign = harness
        .get(path(&home, &id))
        .token(&work.token)
        .send::<AttachmentBody>()
        .await;
    harness
        .call(
            Method::DELETE,
            format!("/v1/spaces/{}/devices/{}", uuid(home.space_id), uuid(phone.device_id)),
        )
        .token(&home.token)
        .send::<Empty>()
        .await
        .ok();
    let revoked = put(&harness, &phone, &id, &body).await;

    assert_eq!(foreign.error(), (StatusCode::NOT_FOUND, ErrorCode::UnknownSpace));
    assert_eq!(revoked.error(), (StatusCode::UNAUTHORIZED, ErrorCode::Revoked));
}

fn linking(header: Header, ids: &[&str]) -> Header {
    let mut attachment_ids: Vec<String> = ids.iter().map(|id| (*id).to_string()).collect();
    attachment_ids.sort();
    Header {
        refs: Refs {
            attachment_ids,
            ..header.refs.clone()
        },
        ..header
    }
}

fn card(ids: &[&str]) -> Header {
    linking(card_create("card", "deck", "template", stamp(1, 0, 1)), ids)
}

fn content(stamp: Stamp, ids: &[&str]) -> Header {
    linking(child(Kind::Cards, "card", "deck", Group::Content, stamp), ids)
}

/// Pushes the deck and template the test card needs, as seqs 1 and 2.
async fn push_parents(harness: &Harness, device: &Enrollment) {
    harness
        .push(
            device,
            vec![
                (1, write(Kind::Templates, "template", Group::Create, stamp(0, 0, 1))),
                (2, write(Kind::Decks, "deck", Group::Create, stamp(0, 1, 1))),
            ],
        )
        .await
        .ok();
}

async fn push_one(harness: &Harness, device: &Enrollment, seq: u64, header: Header) -> PushOutcome {
    let mut reply = harness.push(device, vec![(seq, header)]).await.ok();
    assert_eq!(reply.outcomes.len(), 1);
    reply.outcomes.remove(0)
}

/// The space database as the server left it: `None` when no row, else the attachment's `unlinked_since`.
fn unlinked_since(harness: &Harness, device: &Enrollment, id: &str) -> Option<Option<u64>> {
    let path = harness
        .generation_dir()
        .join("spaces")
        .join(format!("{}.db", uuid(device.space_id)));
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).expect("open the space database");
    conn.query_row(
        "SELECT unlinked_since FROM attachments WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )
    .optional()
    .expect("read the attachment row")
}

#[tokio::test]
async fn a_card_push_names_the_linked_attachments_the_server_lacks() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let (stored, stored_body) = image(10, 10);
    let (absent, absent_body) = image(11, 10);
    put(&harness, &home, &stored, &stored_body).await.ok();
    push_parents(&harness, &home).await;

    let created = push_one(&harness, &home, 3, card(&[&stored, &absent])).await;
    put(&harness, &home, &absent, &absent_body).await.ok();
    let replayed = push_one(&harness, &home, 3, card(&[&stored, &absent])).await;

    assert_eq!(created.outcome, Outcome::Applied);
    assert_eq!(created.missing_attachments, vec![absent]);
    assert!(replayed.replayed);
    assert_eq!(
        replayed.missing_attachments,
        Vec::<String>::new(),
        "a replay reports what is missing now, not what the receipt saw"
    );
}

#[tokio::test]
async fn a_stale_content_envelope_still_names_what_is_missing() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let (absent, _) = image(12, 10);
    push_parents(&harness, &home).await;
    push_one(&harness, &home, 3, card(&[])).await;
    push_one(&harness, &home, 4, content(stamp(5, 0, 1), &[])).await;

    let stale = push_one(&harness, &phone, 1, content(stamp(4, 0, 2), &[&absent])).await;

    assert_eq!(stale.outcome, Outcome::Stale);
    assert_eq!(stale.missing_attachments, vec![absent]);
}

#[tokio::test]
async fn an_attachment_records_when_its_last_card_stopped_linking_it() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let (id, body) = image(13, 10);
    let (unlinked, unlinked_body) = image(14, 10);
    put(&harness, &home, &unlinked, &unlinked_body).await.ok();
    push_parents(&harness, &home).await;
    push_one(&harness, &home, 3, card(&[&id])).await;
    harness.clock.advance(1_000);
    put(&harness, &home, &id, &body).await.ok();
    let linked_at_upload = unlinked_since(&harness, &home, &id);

    harness.clock.advance(1_000);
    let dropped_at = harness.clock.now_ms();
    push_one(&harness, &home, 4, content(stamp(5, 0, 1), &[])).await;
    let after_drop = unlinked_since(&harness, &home, &id);
    harness.clock.advance(1_000);
    push_one(&harness, &home, 5, content(stamp(6, 0, 1), &[])).await;
    let after_second_edit = unlinked_since(&harness, &home, &id);
    push_one(&harness, &home, 6, content(stamp(7, 0, 1), &[&id])).await;
    let after_relink = unlinked_since(&harness, &home, &id);

    assert_eq!(
        unlinked_since(&harness, &home, &unlinked),
        Some(Some(START_MS)),
        "an attachment stored with no ref counts from when it was stored"
    );
    assert_eq!(linked_at_upload, Some(None), "an upload of a linked id starts linked");
    assert_eq!(after_drop, Some(Some(dropped_at)));
    assert_eq!(
        after_second_edit,
        Some(Some(dropped_at)),
        "another edit keeps the first unlink time"
    );
    assert_eq!(after_relink, Some(None));
}

#[tokio::test]
async fn deleting_a_deck_unlinks_the_attachments_of_its_cards() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let (id, body) = image(15, 10);
    put(&harness, &home, &id, &body).await.ok();
    push_parents(&harness, &home).await;
    push_one(&harness, &home, 3, card(&[&id])).await;
    let linked = unlinked_since(&harness, &home, &id);
    harness.clock.advance(1_000);

    push_one(&harness, &home, 4, tombstone(Kind::Decks, "deck", None, stamp(9, 0, 1))).await;

    assert_eq!(linked, Some(None));
    assert_eq!(unlinked_since(&harness, &home, &id), Some(Some(START_MS + 1_000)));
}

const DAY_MS: u64 = 24 * 60 * 60 * 1000;

fn collect(harness: &Harness) {
    harness.server.collect_garbage().expect("a collection pass");
}

#[tokio::test]
async fn an_attachment_unlinked_for_more_than_90_days_is_collected() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let (kept, kept_body) = image(20, 10);
    let (collected, collected_body) = image(21, 10);
    put(&harness, &home, &collected, &collected_body).await.ok();
    harness.clock.advance(2 * DAY_MS);
    put(&harness, &home, &kept, &kept_body).await.ok();

    harness.clock.advance(89 * DAY_MS);
    collect(&harness);

    assert_eq!(
        get(&harness, &home, &kept).await.ok(),
        kept_body,
        "unlinked for 89 days"
    );
    assert_eq!(
        get(&harness, &home, &collected).await.error(),
        (StatusCode::NOT_FOUND, ErrorCode::NotFound),
        "unlinked for 91 days"
    );
    assert_eq!(files(&harness, &home), vec![kept]);
}

#[tokio::test]
async fn a_linked_attachment_is_kept_at_any_age() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let (id, body) = image(22, 10);
    push_parents(&harness, &home).await;
    push_one(&harness, &home, 3, card(&[&id])).await;
    put(&harness, &home, &id, &body).await.ok();

    harness.clock.advance(400 * DAY_MS);
    collect(&harness);

    assert_eq!(get(&harness, &home, &id).await.ok(), body);
}

#[tokio::test]
async fn the_90_days_start_from_the_last_unlink() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let (id, body) = image(23, 10);
    put(&harness, &home, &id, &body).await.ok();
    push_parents(&harness, &home).await;
    harness.clock.advance(60 * DAY_MS);
    push_one(&harness, &home, 3, card(&[&id])).await;
    harness.clock.advance(60 * DAY_MS);
    push_one(&harness, &home, 4, content(stamp(5, 0, 1), &[])).await;

    harness.clock.advance(89 * DAY_MS);
    collect(&harness);
    let after_89_days = get(&harness, &home, &id).await;
    harness.clock.advance(2 * DAY_MS);
    collect(&harness);

    assert_eq!(after_89_days.ok(), body);
    assert_eq!(
        get(&harness, &home, &id).await.error(),
        (StatusCode::NOT_FOUND, ErrorCode::NotFound)
    );
}

#[tokio::test]
async fn a_collected_attachment_linked_again_is_reported_and_stored_again() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let (id, body) = image(24, 10);
    put(&harness, &home, &id, &body).await.ok();
    // WHY: the device calls midway, so it is not stale when it pushes after the collection.
    harness.clock.advance(45 * DAY_MS);
    harness.device_meta(&home).await;
    harness.clock.advance(46 * DAY_MS);
    collect(&harness);
    push_parents(&harness, &home).await;

    let linked = push_one(&harness, &home, 3, card(&[&id])).await;
    put(&harness, &home, &id, &body).await.ok();

    assert_eq!(linked.missing_attachments, vec![id.clone()]);
    assert_eq!(get(&harness, &home, &id).await.ok(), body);
    assert_eq!(files(&harness, &home), vec![id]);
}
