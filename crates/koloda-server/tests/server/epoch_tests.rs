//! Device calls on an older epoch: refused with the restore the device must apply (`PROTOCOL.md` §Server restore).

use axum::http::{Method, StatusCode};
use koloda_server::backup::backup;
use koloda_server::restore::{prepare, RestoreOptions};
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{Cutoff, DeviceInfo, Enrollment, ErrorCode, Restore, RestoreMode};
use tempfile::TempDir;
use uuid::Uuid;

use crate::common::{batch, stamp, uuid, write, Answer, Harness};

fn backed_up(harness: &Harness) -> TempDir {
    let out = tempfile::tempdir().expect("backup directory");
    backup(harness.data_dir(), out.path(), 42).expect("backup runs");
    out
}

fn restore(harness: &mut Harness, out: &TempDir, mode: RestoreMode) -> Uuid {
    let prepared = prepare(
        harness.data_dir(),
        out.path(),
        RestoreOptions {
            mode,
            is_rotating_tokens: false,
        },
        99,
    )
    .expect("restore prepares");
    let epoch = prepared.epochs().first().expect("one space is restored").1;
    prepared.commit().expect("restore commits");
    harness.reopen();
    epoch
}

async fn push_template(harness: &Harness, device: &Enrollment, seq: u64) {
    let id = Uuid::new_v4().to_string();
    harness
        .push(
            device,
            vec![(seq, write(Kind::Templates, &id, Group::Create, stamp(seq, 0, 1)))],
        )
        .await
        .ok();
}

async fn record_on(harness: &Harness, device: &Enrollment, epoch: Uuid) -> Answer<DeviceInfo> {
    harness
        .get(format!(
            "/v1/spaces/{}/devices/{}",
            uuid(device.space_id),
            uuid(device.device_id)
        ))
        .token(&device.token)
        .epoch(epoch)
        .send::<DeviceInfo>()
        .await
}

fn restore_of<T>(answer: &Answer<T>) -> Restore {
    assert_eq!(answer.error(), (StatusCode::CONFLICT, ErrorCode::EpochChanged));
    answer
        .reply
        .error
        .as_ref()
        .and_then(|error| error.restore.clone())
        .expect("epoch_changed carries the restore")
}

fn cutoff(device: &Enrollment, last_seq: u64) -> Cutoff {
    Cutoff {
        sender: device.device_id,
        last_seq,
    }
}

#[tokio::test]
async fn every_device_call_on_an_older_epoch_is_refused_before_any_work() {
    let mut harness = Harness::new();
    let writer = harness.create_space("Home").await;
    let reader = harness.pair(&writer, "Laptop").await;
    push_template(&harness, &writer, 1).await;
    let out = backed_up(&harness);
    let old = Uuid::from_bytes(writer.epoch);
    let epoch = restore(&mut harness, &out, RestoreMode::Heal);
    let space = uuid(writer.space_id);
    let item = Uuid::new_v4().to_string();
    let push = batch(vec![(2, write(Kind::Templates, &item, Group::Create, stamp(2, 0, 1)))]);
    let attachment = "0".repeat(64);

    let calls = [
        (Method::POST, format!("/v1/spaces/{space}/push")),
        (Method::GET, format!("/v1/spaces/{space}/pull?lane=hot&after=0")),
        (
            Method::GET,
            format!(
                "/v1/spaces/{space}/receipts?sender={}&after=0&through=1",
                uuid(writer.device_id)
            ),
        ),
        (Method::POST, format!("/v1/spaces/{space}/bootstrap")),
        (Method::GET, format!("/v1/spaces/{space}/devices")),
        (Method::GET, format!("/v1/spaces/{space}/attachments/{attachment}")),
    ];
    for (method, path) in calls {
        let call = harness
            .call(method.clone(), path.clone())
            .token(&writer.token)
            .epoch(old);
        let call = if path.ends_with("/push") {
            call.body(&push)
        } else {
            call
        };
        let answer = call.send::<ciborium::Value>().await;
        let restore = restore_of(&answer);
        assert_eq!(Uuid::from_bytes(restore.epoch), epoch, "{method} {path}");
        assert_eq!(restore.mode, RestoreMode::Heal);
    }
    let refused_pull = harness
        .get(format!("/v1/spaces/{space}/pull?lane=hot&after=0"))
        .token(&reader.token)
        .epoch(old)
        .send::<ciborium::Value>()
        .await;
    restore_of(&refused_pull);

    let writer_record = record_on(&harness, &writer, epoch).await.ok();
    assert_eq!(writer_record.last_sender_seq, 1, "the refused push consumed nothing");
    assert_eq!(
        record_on(&harness, &reader, epoch).await.ok().cursor_hot,
        0,
        "the refused pull recorded no cursor"
    );
}

#[tokio::test]
async fn a_device_call_without_an_epoch_is_refused() {
    let harness = Harness::new();
    let device = harness.create_space("Home").await;

    let answer = harness
        .get(format!("/v1/spaces/{}/devices", uuid(device.space_id)))
        .token(&device.token)
        .without_epoch()
        .send::<ciborium::Value>()
        .await;

    assert_eq!(answer.error(), (StatusCode::BAD_REQUEST, ErrorCode::BadRequest));
}

#[tokio::test]
async fn restores_a_device_missed_combine_as_one() {
    let mut harness = Harness::new();
    let first = harness.create_space("Home").await;
    let second = harness.pair(&first, "Laptop").await;
    let created = Uuid::from_bytes(first.epoch);
    push_template(&harness, &first, 1).await;
    push_template(&harness, &second, 1).await;
    let older = backed_up(&harness);
    let third = harness.pair(&first, "Phone").await;
    push_template(&harness, &third, 1).await;
    push_template(&harness, &first, 2).await;
    let newer = backed_up(&harness);

    // A heal from the newer backup, then an authoritative one from the older backup, which never had `third`.
    let healed = restore(&mut harness, &newer, RestoreMode::Heal);
    let current = restore(&mut harness, &older, RestoreMode::Authoritative);

    let both = restore_of(&record_on(&harness, &first, created).await);
    assert_eq!(Uuid::from_bytes(both.epoch), current);
    assert_eq!(both.mode, RestoreMode::Authoritative, "authoritative if any point is");
    assert_eq!((both.head_hot, both.head_cold), (2, 0), "the lowest heads");
    let mut expected = vec![cutoff(&first, 1), cutoff(&second, 1)];
    expected.sort_by_key(|cutoff| cutoff.sender);
    assert_eq!(
        both.cutoffs, expected,
        "the lowest cutoffs; a sender one point lacks is left out"
    );

    let last = restore_of(&record_on(&harness, &first, healed).await);
    assert_eq!(last.mode, RestoreMode::Authoritative);
    assert_eq!(last.head_hot, 2, "only the points after the device's epoch apply");

    let unknown = restore_of(&record_on(&harness, &first, Uuid::new_v4()).await);
    assert_eq!(unknown, both, "an epoch no point issued applies every point");
}
