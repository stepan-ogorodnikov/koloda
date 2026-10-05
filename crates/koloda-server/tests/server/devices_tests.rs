use axum::http::{Method, StatusCode};
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{
    DeviceInfo, DeviceList, Empty, Enrollment, ErrorCode, IssuePairing, Outcome, Pairing, PairingClaim, PairingPreview,
    Platform, PreviewPairing, Snapshot, SpaceList,
};

use crate::common::{claim_request, encode, nonce, outcomes, stamp, uuid, write, Call, Harness, START_MS};

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

fn revoke<'a>(harness: &'a Harness, caller: &Enrollment, target: [u8; 16]) -> Call<'a> {
    harness
        .call(Method::DELETE, device_path(caller.space_id, target))
        .token(&caller.token)
}

async fn stored_bytes(harness: &Harness, device: &Enrollment) -> u64 {
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

    let forked = harness
        .post(format!("/v1/spaces/{}/devices/fork", uuid(home.space_id)))
        .token(&home.token)
        .send::<Enrollment>()
        .await
        .ok();
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
