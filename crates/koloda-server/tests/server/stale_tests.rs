//! Stale devices and `rebase_required` (`crates/koloda-sync-proto/PROTOCOL.md` §Devices).

use axum::http::{Method, StatusCode};
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{
    DeviceInfo, Empty, Enrollment, ErrorCode, Outcome, Receipts, Snapshot, SnapshotPage,
};

use crate::common::{outcomes, stamp, uuid, write, Harness};

const HOUR_MS: u64 = 60 * 60 * 1000;
const DAY_MS: u64 = 24 * HOUR_MS;

async fn record(harness: &Harness, caller: &Enrollment, device: &Enrollment) -> DeviceInfo {
    harness
        .get(format!(
            "/v1/spaces/{}/devices/{}",
            uuid(caller.space_id),
            uuid(device.device_id)
        ))
        .token(&caller.token)
        .send::<DeviceInfo>()
        .await
        .ok()
}

async fn push_title(harness: &Harness, device: &Enrollment, seq: u64, offset_ms: u64) -> Option<ErrorCode> {
    let answer = harness
        .push(
            device,
            vec![(seq, write(Kind::Decks, "deck", Group::Title, stamp(offset_ms, 0, 2)))],
        )
        .await;
    if answer.status == StatusCode::OK {
        assert_eq!(outcomes(answer.ok()), vec![(seq, Outcome::Applied, false)]);
        None
    } else {
        Some(answer.error().1)
    }
}

async fn open_lease(harness: &Harness, device: &Enrollment) -> Snapshot {
    harness
        .post(format!("/v1/spaces/{}/bootstrap", uuid(device.space_id)))
        .token(&device.token)
        .send::<Snapshot>()
        .await
        .ok()
}

/// A space whose deck the phone may write a title to.
async fn space_with_deck(harness: &Harness) -> (Enrollment, Enrollment) {
    let home = harness.create_space("Home").await;
    harness
        .push(
            &home,
            vec![(1, write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1)))],
        )
        .await
        .ok();
    let phone = harness.pair(&home, "Phone").await;
    (home, phone)
}

#[tokio::test]
async fn a_device_unseen_for_90_days_must_re_bootstrap_before_it_pushes() {
    let harness = Harness::new();
    let (home, phone) = space_with_deck(&harness).await;

    harness.clock.advance(89 * DAY_MS);
    assert_eq!(
        push_title(&harness, &phone, 1, 1).await,
        None,
        "89 days idle is not stale"
    );

    harness.clock.advance(91 * DAY_MS);
    assert_eq!(
        push_title(&harness, &phone, 2, 2).await,
        Some(ErrorCode::CursorTooOld),
        "91 days idle is stale"
    );
    let flagged = record(&harness, &home, &phone).await;
    assert!(
        flagged.rebase_required,
        "the flag persists past the request that refreshed last_seen"
    );
    assert_eq!(flagged.last_sender_seq, 1, "the refused push consumed nothing");
    assert_eq!(
        push_title(&harness, &phone, 2, 2).await,
        Some(ErrorCode::CursorTooOld),
        "the flag outlives the refresh of last_seen"
    );
}

#[tokio::test]
async fn a_flagged_device_still_reads_and_bootstraps_and_a_release_clears_the_flag() {
    let harness = Harness::new();
    let (home, phone) = space_with_deck(&harness).await;
    push_title(&harness, &phone, 1, 1).await;
    harness.clock.advance(91 * DAY_MS);
    assert_eq!(push_title(&harness, &phone, 2, 2).await, Some(ErrorCode::CursorTooOld));

    let space = uuid(phone.space_id);
    let receipts = harness
        .get(format!(
            "/v1/spaces/{space}/receipts?sender={}&after=0&through=1",
            uuid(phone.device_id)
        ))
        .token(&phone.token)
        .send::<Receipts>()
        .await
        .ok();
    assert_eq!(receipts.receipts.len(), 1, "receipts answer");
    harness.pull(&phone, "lane=hot&after=0").await.ok();
    assert!(
        record(&harness, &phone, &phone).await.rebase_required,
        "its own record answers"
    );
    let lease = open_lease(&harness, &phone).await;
    let page = harness
        .get(format!(
            "/v1/spaces/{space}/bootstrap/{}?lane=hot",
            uuid(lease.snapshot_id)
        ))
        .token(&phone.token)
        .send::<SnapshotPage>()
        .await
        .ok();
    assert!(page.done, "bootstrap answers");
    assert_eq!(
        push_title(&harness, &phone, 2, 2).await,
        Some(ErrorCode::CursorTooOld),
        "until the lease ends"
    );

    harness
        .call(
            Method::DELETE,
            format!("/v1/spaces/{space}/bootstrap/{}", uuid(lease.snapshot_id)),
        )
        .token(&phone.token)
        .send::<Empty>()
        .await
        .ok();

    assert!(!record(&harness, &home, &phone).await.rebase_required);
    assert_eq!(push_title(&harness, &phone, 2, 2).await, None, "the next push lands");
}

#[tokio::test]
async fn a_record_another_was_forked_from_goes_stale_after_a_day() {
    let harness = Harness::new();
    let (home, phone) = space_with_deck(&harness).await;
    let tablet = harness.pair(&home, "Tablet").await;
    harness
        .post(format!("/v1/spaces/{}/devices/fork", uuid(phone.space_id)))
        .token(&phone.token)
        .send::<Enrollment>()
        .await
        .ok();

    harness.clock.advance(23 * HOUR_MS);
    assert_eq!(
        push_title(&harness, &phone, 1, 1).await,
        None,
        "23 hours idle is not stale yet"
    );

    harness.clock.advance(25 * HOUR_MS);
    assert_eq!(
        push_title(&harness, &phone, 2, 2).await,
        Some(ErrorCode::CursorTooOld),
        "a forked-from record is stale after 25 hours idle"
    );
    assert_eq!(
        push_title(&harness, &tablet, 1, 3).await,
        None,
        "a record nobody forked from is not stale at 48 hours"
    );
}
