use axum::http::{Method, StatusCode};
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{
    DeviceInfo, DeviceList, Empty, Enrollment, ErrorCode, ForkDevice, IssuePairing, Outcome, Pairing, PairingClaim,
    PairingPreview, Platform, PreviewPairing, Snapshot, SpaceList,
};
use rusqlite::Connection;

use crate::common::{
    claim_request, encode, nonce, outcomes, stamp, token, uuid, write, Call, Enrolled, Harness, START_MS,
};

fn device_path(space: [u8; 16], device: [u8; 16]) -> String {
    format!("/v1/spaces/{}/devices/{}", uuid(space), uuid(device))
}

#[tokio::test]
async fn a_device_reads_its_record_with_device_meta() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    harness.clock.advance(60_000);

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
        START_MS + 60_000,
        "a request a minute after the last updates last_seen"
    );
    assert_eq!(meta.server_time_ms, START_MS + 60_000);
    assert_eq!(meta.epoch, Some(home.epoch));
    let device_meta = meta.device.expect("a device call carries device meta");
    let kinds: Vec<_> = device_meta.write_schema.into_iter().collect();
    let mut expected: Vec<_> = Kind::ALL.iter().map(|kind| (kind.as_wire().to_string(), 1)).collect();
    expected.sort();
    assert_eq!(kinds, expected, "a new space accepts schema 1 of every kind");
}

/// The updates of `devices` rows since `count_device_updates`, which a test-only trigger counts.
fn device_updates(conn: &Connection) -> i64 {
    conn.query_row("SELECT n FROM device_updates", [], |row| row.get(0))
        .expect("the count reads")
}

fn count_device_updates(conn: &Connection) {
    // WHY: an update that leaves a row as it was writes no page, so only a trigger sees the write transaction.
    conn.execute_batch(
        "CREATE TABLE device_updates (n integer NOT NULL);
         INSERT INTO device_updates (n) VALUES (0);
         CREATE TRIGGER device_updated AFTER UPDATE ON devices BEGIN UPDATE device_updates SET n = n + 1; END;",
    )
    .expect("the trigger is created");
}

#[tokio::test]
async fn device_calls_write_last_seen_a_minute_apart_and_cursors_only_when_they_rise() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    harness
        .push(
            &home,
            vec![(1, write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1)))],
        )
        .await
        .ok();
    harness.clock.advance(60_000);
    harness.pull(&phone, "lane=hot&after=1").await.ok();
    let server_db = Connection::open(harness.generation_dir().join("server.db")).expect("server.db opens");
    count_device_updates(&server_db);
    let last_seen = |conn: &Connection| -> u64 {
        conn.query_row(
            "SELECT last_seen FROM devices WHERE id = ?1",
            [uuid::Uuid::from_bytes(phone.device_id)],
            |row| row.get(0),
        )
        .expect("last_seen reads")
    };

    harness.clock.advance(59_999);
    harness.pull(&phone, "lane=hot&after=0").await.ok();

    assert_eq!(
        device_updates(&server_db),
        0,
        "a page below the stored cursor, within a minute of the last call, writes nothing"
    );
    assert_eq!(last_seen(&server_db), START_MS + 60_000);

    harness.clock.advance(1);
    harness.pull(&phone, "lane=hot&after=0").await.ok();

    assert_eq!(
        device_updates(&server_db),
        1,
        "a call a minute after the last write moves it"
    );
    assert_eq!(last_seen(&server_db), START_MS + 120_000);
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

fn revoke<'a>(harness: &'a Harness, caller: &Enrolled, target: [u8; 16]) -> Call<'a> {
    harness
        .call(Method::DELETE, device_path(caller.space_id, target))
        .token(&caller.token)
}

async fn stored_bytes(harness: &Harness, device: &Enrolled) -> u64 {
    let code = harness
        .post(format!("/v1/spaces/{}/pairings", uuid(device.space_id)))
        .token(&device.token)
        .body(&IssuePairing::default())
        .send::<Pairing>()
        .await
        .ok()
        .code;
    harness
        .post("/v1/pairings/preview")
        .body(&PreviewPairing { code })
        .send::<PairingPreview>()
        .await
        .ok()
        .bytes
}

#[tokio::test]
async fn a_revoked_device_is_shut_out_and_its_codes_and_lease_end() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let first_title = write(Kind::Decks, "deck", Group::Title, stamp(1, 0, 1));
    harness
        .push(
            &home,
            vec![
                (1, write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1))),
                (2, first_title.clone()),
            ],
        )
        .await
        .ok();
    let code = harness
        .post(format!("/v1/spaces/{}/pairings", uuid(home.space_id)))
        .token(&phone.token)
        .body(&IssuePairing::default())
        .send::<Pairing>()
        .await
        .ok()
        .code;
    harness
        .post(format!("/v1/spaces/{}/bootstrap", uuid(home.space_id)))
        .token(&phone.token)
        .send::<Snapshot>()
        .await
        .ok();
    harness
        .push(
            &home,
            vec![(3, write(Kind::Decks, "deck", Group::Title, stamp(2, 0, 1)))],
        )
        .await
        .ok();
    let pinned = stored_bytes(&harness, &home).await;

    revoke(&harness, &home, phone.device_id).send::<Empty>().await.ok();

    let record = harness
        .get(device_path(home.space_id, phone.device_id))
        .token(&phone.token)
        .send::<DeviceInfo>()
        .await;
    let push = harness.push(&phone, vec![]).await;
    let claim = harness
        .post("/v1/pairings/claim")
        .body(&claim_request(&code, "Tablet", nonce("tablet")))
        .send::<PairingClaim>()
        .await;
    assert_eq!(record.error(), (StatusCode::UNAUTHORIZED, ErrorCode::Revoked));
    assert_eq!(
        record.reply.meta.epoch,
        Some(home.epoch),
        "a revoked device learns the epoch"
    );
    assert_eq!(push.error(), (StatusCode::UNAUTHORIZED, ErrorCode::Revoked));
    assert_eq!(
        claim.error(),
        (StatusCode::NOT_FOUND, ErrorCode::PairingFailed),
        "the revoked issuer's code no longer works"
    );
    assert_eq!(
        stored_bytes(&harness, &home).await,
        pinned - u64::try_from(encode(first_title).len()).expect("small"),
        "the revoked device's lease no longer pins the superseded title"
    );
    let seen_by_home = harness
        .get(device_path(home.space_id, phone.device_id))
        .token(&home.token)
        .send::<DeviceInfo>()
        .await
        .ok();
    assert_eq!(seen_by_home.revoked_at, Some(START_MS));
}

#[tokio::test]
async fn a_device_detaches_by_revoking_itself() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;

    revoke(&harness, &phone, phone.device_id).send::<Empty>().await.ok();

    let after = harness
        .get(device_path(home.space_id, phone.device_id))
        .token(&phone.token)
        .send::<DeviceInfo>()
        .await;
    assert_eq!(after.error(), (StatusCode::UNAUTHORIZED, ErrorCode::Revoked));
    let spaces = harness
        .get("/v1/spaces")
        .token(&harness.setup_token)
        .send::<SpaceList>()
        .await
        .ok();
    assert_eq!(
        spaces.spaces.first().map(|space| space.device_count),
        Some(1),
        "the space counts only devices that are not revoked"
    );
}

#[tokio::test]
async fn a_fork_is_a_new_device_and_the_old_token_keeps_working() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    harness
        .push(
            &home,
            vec![(1, write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1)))],
        )
        .await
        .ok();

    let forked = fork(&harness, &home, [1; 16]).await;
    let fork_pushed = harness
        .push(
            &forked,
            vec![(1, write(Kind::Decks, "deck", Group::Title, stamp(1, 0, 1)))],
        )
        .await
        .ok();
    let pulled_by_home = harness.pull(&home, "lane=hot&after=0").await.ok();
    let fork_record = harness
        .get(device_path(home.space_id, forked.device_id))
        .token(&home.token)
        .send::<DeviceInfo>()
        .await
        .ok();
    let home_record = harness
        .get(device_path(home.space_id, home.device_id))
        .token(&home.token)
        .send::<DeviceInfo>()
        .await
        .ok();

    assert_ne!(forked.device_id, home.device_id);
    assert_eq!((forked.space_id, forked.epoch), (home.space_id, home.epoch));
    assert_eq!(
        outcomes(fork_pushed),
        vec![(1, Outcome::Applied, false)],
        "the fork starts its own sender sequence at 1"
    );
    assert_eq!(
        pulled_by_home
            .entries
            .iter()
            .map(|entry| (entry.sender, entry.sender_seq))
            .collect::<Vec<_>>(),
        vec![(forked.device_id, 1)],
        "the fork's pushes carry its own sender"
    );
    assert_eq!(fork_record.name, "Home laptop");
    assert_eq!(home_record.last_sender_seq, 1, "the old record keeps its own progress");
}

async fn fork(harness: &Harness, device: &Enrolled, nonce: [u8; 16]) -> Enrolled {
    let minted = token(&nonce);
    let enrollment = harness
        .post(format!("/v1/spaces/{}/devices/fork", uuid(device.space_id)))
        .token(&device.token)
        .body(&ForkDevice {
            nonce,
            token: minted.clone(),
        })
        .send::<Enrollment>()
        .await
        .ok();
    Enrolled::from_reply(enrollment, minted)
}

#[tokio::test]
async fn a_fork_retried_with_its_nonce_and_token_returns_the_same_device() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let nonce = [1; 16];

    let first = fork(&harness, &home, nonce).await;
    let retried = fork(&harness, &home, nonce).await;
    let other = fork(&harness, &home, [2; 16]).await;

    assert_eq!(retried, first, "one record per nonce and token");
    assert_ne!(other.device_id, first.device_id, "another nonce is another fork");
    let list = harness
        .get(format!("/v1/spaces/{}/devices", uuid(home.space_id)))
        .token(&token(&nonce))
        .send::<DeviceList>()
        .await
        .ok();
    assert_eq!(list.devices.len(), 3, "the creator and two forks");
}

#[tokio::test]
async fn two_forks_with_one_nonce_and_token_return_one_device_and_another_token_changes_nothing() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let nonce = [7; 16];
    let (first, second) = tokio::join!(fork(&harness, &home, nonce), fork(&harness, &home, nonce));

    assert_eq!(first, second, "either order returns the one device");
    let list = harness
        .get(format!("/v1/spaces/{}/devices", uuid(home.space_id)))
        .token(&token(&nonce))
        .send::<DeviceList>()
        .await
        .ok();
    assert_eq!(list.devices.len(), 2, "the creator and one fork");

    let refused = harness
        .post(format!("/v1/spaces/{}/devices/fork", uuid(home.space_id)))
        .token(&home.token)
        .body(&ForkDevice {
            nonce,
            token: token(&[8; 16]),
        })
        .send::<Enrollment>()
        .await;
    assert_eq!(refused.error(), (StatusCode::BAD_REQUEST, ErrorCode::BadRequest));
    let unchanged = harness
        .get(format!("/v1/spaces/{}/devices", uuid(home.space_id)))
        .token(&token(&nonce))
        .send::<DeviceList>()
        .await
        .ok();
    assert_eq!(unchanged.devices.len(), 2, "the refused token wrote nothing");

    let malformed = harness
        .post(format!("/v1/spaces/{}/devices/fork", uuid(home.space_id)))
        .token(&home.token)
        .body(&ForkDevice {
            nonce,
            token: "not-a-token".to_string(),
        })
        .send::<Enrollment>()
        .await;
    assert_eq!(malformed.error(), (StatusCode::BAD_REQUEST, ErrorCode::BadRequest));
}

#[tokio::test]
async fn a_device_manages_only_the_devices_of_its_own_space() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    harness.clock.advance(1);
    let phone = harness.pair(&home, "Phone").await;
    let work = harness.create_space("Work").await;

    let foreign_path = harness
        .call(Method::DELETE, device_path(home.space_id, home.device_id))
        .token(&work.token)
        .send::<Empty>()
        .await;
    let foreign_device = revoke(&harness, &home, work.device_id).send::<Empty>().await;
    let list = harness
        .get(format!("/v1/spaces/{}/devices", uuid(home.space_id)))
        .token(&phone.token)
        .send::<DeviceList>()
        .await
        .ok();

    assert_eq!(foreign_path.error(), (StatusCode::NOT_FOUND, ErrorCode::UnknownSpace));
    assert_eq!(foreign_device.error(), (StatusCode::NOT_FOUND, ErrorCode::NotFound));
    let listed: Vec<_> = list.devices.iter().map(|device| device.id).collect();
    assert_eq!(
        listed,
        vec![home.device_id, phone.device_id],
        "every device of the space and no other"
    );
}
