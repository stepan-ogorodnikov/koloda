//! Tombstone collection and the GC horizon (`crates/koloda-sync-proto/PROTOCOL.md` §Pull cursor, §Devices).
//!
//! Every test logs a deck create at `hot` seq 1 and its tombstone at seq 2.

use axum::http::{Method, StatusCode};
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{Empty, Enrollment, ErrorCode, Outcome, Snapshot};

use crate::common::{outcomes, stamp, tombstone, uuid, write, Harness};

const DAY_MS: u64 = 24 * 60 * 60 * 1000;

fn collect(harness: &Harness) {
    harness.server.collect_garbage().expect("a collection pass");
}

async fn create_and_delete_deck(harness: &Harness, home: &Enrollment) {
    let pushed = harness
        .push(
            home,
            vec![
                (1, write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1))),
                (2, tombstone(Kind::Decks, "deck", None, stamp(1, 0, 1))),
            ],
        )
        .await
        .ok();
    assert_eq!(outcomes(pushed).len(), 2);
}

/// Pulls `hot` from `after`: the seqs it returned, or the error code.
async fn pull_hot(harness: &Harness, device: &Enrollment, after: u64) -> Result<Vec<u64>, ErrorCode> {
    let answer = harness.pull(device, &format!("lane=hot&after={after}")).await;
    if answer.status == StatusCode::OK {
        Ok(answer.ok().entries.iter().map(|entry| entry.seq).collect())
    } else {
        Err(answer.error().1)
    }
}

/// A pull from 2 records cursor 2: the device has passed the tombstone.
async fn pass_tombstone(harness: &Harness, device: &Enrollment) {
    pull_hot(harness, device, 2).await.expect("a pull from 2 answers");
}

async fn horizon(harness: &Harness, device: &Enrollment) -> u64 {
    harness.device_meta(device).await.gc_horizon_hot
}

#[tokio::test]
async fn a_tombstone_is_collected_once_every_active_device_has_passed_it() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    create_and_delete_deck(&harness, &home).await;
    pass_tombstone(&harness, &home).await;

    collect(&harness);
    assert_eq!(
        pull_hot(&harness, &phone, 0).await,
        Ok(vec![2]),
        "the phone has not passed it, so it stays"
    );
    assert_eq!(horizon(&harness, &home).await, 0);

    pass_tombstone(&harness, &phone).await;
    collect(&harness);
    assert_eq!(horizon(&harness, &home).await, 2, "the reply carries the horizon");
    assert_eq!(pull_hot(&harness, &home, 2).await, Ok(vec![]));
    assert_eq!(
        pull_hot(&harness, &phone, 1).await,
        Err(ErrorCode::CursorTooOld),
        "a pull from below the horizon may have missed it"
    );
    assert_eq!(
        harness.device_meta(&home).await.gc_horizon_cold,
        0,
        "cold holds no tombstones"
    );

    collect(&harness);
    assert_eq!(
        horizon(&harness, &home).await,
        2,
        "a pass that removes nothing keeps the horizon"
    );

    let recreated = harness
        .push(
            &home,
            vec![(3, write(Kind::Decks, "deck", Group::Create, stamp(2, 0, 1)))],
        )
        .await
        .ok();
    assert_eq!(
        outcomes(recreated),
        vec![(3, Outcome::Fenced, false)],
        "the fence outlives the tombstone"
    );
}

#[tokio::test]
async fn a_revoked_device_does_not_hold_a_pass_back() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    create_and_delete_deck(&harness, &home).await;
    pass_tombstone(&harness, &home).await;
    harness
        .call(
            Method::DELETE,
            format!("/v1/spaces/{}/devices/{}", uuid(home.space_id), uuid(phone.device_id)),
        )
        .token(&home.token)
        .send::<Empty>()
        .await
        .ok();

    collect(&harness);

    assert_eq!(horizon(&harness, &home).await, 2);
}

#[tokio::test]
async fn a_stale_device_does_not_hold_a_pass_back() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let tablet = harness.pair(&home, "Tablet").await;
    create_and_delete_deck(&harness, &home).await;
    // WHY: home calls midway, so only the tablet goes stale.
    harness.clock.advance(45 * DAY_MS);
    pass_tombstone(&harness, &home).await;
    harness.clock.advance(46 * DAY_MS);
    pass_tombstone(&harness, &home).await;

    collect(&harness);

    assert_eq!(
        horizon(&harness, &home).await,
        2,
        "a pass reads staleness without waiting for the tablet's call"
    );
    assert_eq!(
        pull_hot(&harness, &tablet, 0).await,
        Err(ErrorCode::CursorTooOld),
        "the stale tablet's old cursor is refused"
    );
}

#[tokio::test]
async fn a_live_lease_keeps_what_its_catch_up_still_needs() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    harness
        .push(
            &home,
            vec![(1, write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1)))],
        )
        .await
        .ok();
    let phone = harness.pair(&home, "Phone").await;
    // WHY: the phone goes stale, so only its lease can hold the pass back.
    harness.clock.advance(45 * DAY_MS);
    harness.device_meta(&home).await;
    harness.clock.advance(46 * DAY_MS);
    let lease = harness
        .post(format!("/v1/spaces/{}/bootstrap", uuid(phone.space_id)))
        .token(&phone.token)
        .send::<Snapshot>()
        .await
        .ok();
    assert_eq!(lease.head_hot, 1);
    harness
        .push(&home, vec![(2, tombstone(Kind::Decks, "deck", None, stamp(1, 0, 1)))])
        .await
        .ok();
    pass_tombstone(&harness, &home).await;

    collect(&harness);
    assert_eq!(
        pull_hot(&harness, &phone, 1).await,
        Ok(vec![2]),
        "catch-up from the lease's head gets it"
    );

    harness
        .call(
            Method::DELETE,
            format!(
                "/v1/spaces/{}/bootstrap/{}",
                uuid(phone.space_id),
                uuid(lease.snapshot_id)
            ),
        )
        .token(&phone.token)
        .send::<Empty>()
        .await
        .ok();
    pass_tombstone(&harness, &phone).await;
    collect(&harness);
    assert_eq!(
        horizon(&harness, &home).await,
        2,
        "collected once the lease ends and the phone passed it"
    );
}

#[tokio::test]
async fn a_device_whose_recorded_cursor_is_below_the_horizon_must_re_bootstrap() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    create_and_delete_deck(&harness, &home).await;
    pass_tombstone(&harness, &home).await;
    collect(&harness);
    let laptop = harness.pair(&home, "Laptop").await;

    let pushed = harness
        .push(
            &laptop,
            vec![(1, write(Kind::Decks, "other", Group::Create, stamp(2, 0, 3)))],
        )
        .await;
    assert_eq!(pushed.error(), (StatusCode::CONFLICT, ErrorCode::CursorTooOld));
    assert_eq!(
        harness.device_meta(&laptop).await.last_sender_seq,
        0,
        "the refused push consumed nothing"
    );
    assert_eq!(pull_hot(&harness, &laptop, 0).await, Err(ErrorCode::CursorTooOld));

    // A bootstrap catches up from its lease's head, which records a cursor past the horizon.
    let lease = harness
        .post(format!("/v1/spaces/{}/bootstrap", uuid(laptop.space_id)))
        .token(&laptop.token)
        .send::<Snapshot>()
        .await
        .ok();
    pull_hot(&harness, &laptop, lease.head_hot)
        .await
        .expect("catch-up answers");
    let pushed = harness
        .push(
            &laptop,
            vec![(1, write(Kind::Decks, "other", Group::Create, stamp(2, 0, 3)))],
        )
        .await
        .ok();
    assert_eq!(outcomes(pushed), vec![(1, Outcome::Applied, false)]);
}
