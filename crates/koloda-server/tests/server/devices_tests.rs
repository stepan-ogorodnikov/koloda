use axum::http::StatusCode;
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::{DeviceInfo, ErrorCode, Platform};

use crate::common::{uuid, Harness, START_MS};

fn device_path(space: [u8; 16], device: [u8; 16]) -> String {
    format!("/v1/spaces/{}/devices/{}", uuid(space), uuid(device))
}

#[tokio::test]
async fn a_device_reads_its_record_with_device_meta() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    harness.clock.advance(5_000);

    let answer = harness
        .get(device_path(home.space_id, home.device_id))
        .token(&home.token)
        .send::<DeviceInfo>()
        .await;

    let meta = answer.reply.meta.clone();
    let device = answer.ok();
    assert_eq!(device.platform, Platform::DesktopLinux);
    assert_eq!(device.created_at, START_MS);
    assert_eq!(
        device.last_seen,
        START_MS + 5_000,
        "every authenticated request updates last_seen"
    );
    assert_eq!(meta.server_time_ms, START_MS + 5_000);
    assert_eq!(meta.epoch, Some(home.epoch));
    let device_meta = meta.device.expect("a device call carries device meta");
    let kinds: Vec<_> = device_meta.write_schema.into_iter().collect();
    let mut expected: Vec<_> = Kind::ALL.iter().map(|kind| (kind.as_wire().to_string(), 1)).collect();
    expected.sort();
    assert_eq!(kinds, expected, "a new space accepts schema 1 of every kind");
}

#[tokio::test]
async fn device_tokens_answer_only_for_their_own_space() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let work = harness.create_space("Work").await;

    let peer = harness
        .get(device_path(home.space_id, phone.device_id))
        .token(&home.token)
        .send::<DeviceInfo>()
        .await;
    let unknown = harness
        .get(device_path(home.space_id, home.device_id))
        .token(&"0".repeat(64))
        .send::<DeviceInfo>()
        .await;
    let other_space = harness
        .get(device_path(home.space_id, home.device_id))
        .token(&work.token)
        .send::<DeviceInfo>()
        .await;
    let missing_space = harness
        .get(device_path([7; 16], home.device_id))
        .token(&home.token)
        .send::<DeviceInfo>()
        .await;
    let other_device = harness
        .get(device_path(home.space_id, work.device_id))
        .token(&home.token)
        .send::<DeviceInfo>()
        .await;

    assert_eq!(peer.ok().name, "Phone", "a device reads the records of its space");
    assert_eq!(unknown.error(), (StatusCode::UNAUTHORIZED, ErrorCode::UnknownDevice));
    assert_eq!(
        unknown.reply.meta.epoch,
        Some(home.epoch),
        "an unknown device learns the epoch of an existing space"
    );
    assert_eq!(other_space.error(), (StatusCode::NOT_FOUND, ErrorCode::UnknownSpace));
    assert_eq!(missing_space.error(), (StatusCode::NOT_FOUND, ErrorCode::UnknownSpace));
    assert_eq!(
        other_space.reply.meta, missing_space.reply.meta,
        "a token of another space answers exactly like a missing space"
    );
    assert_eq!(other_space.reply.meta.epoch, None);
    assert_eq!(other_device.error(), (StatusCode::NOT_FOUND, ErrorCode::NotFound));
}
