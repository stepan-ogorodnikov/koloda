use std::num::NonZeroU32;

use axum::http::{Method, StatusCode};
use ciborium::Value;
use koloda_sync_proto::transport::{AttachmentBody, Empty, Enrollment, ErrorCode, MAX_ATTACHMENT_BYTES};
use sha2::{Digest, Sha256};

use crate::common::{uuid, Answer, Harness};

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
