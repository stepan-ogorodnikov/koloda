use axum::http::{Method, StatusCode};
use koloda_sync_proto::envelope::{Envelope, Header, Refs};
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{
    Empty, Enrollment, ErrorCode, IssuePairing, Lease, LogEntry, Pairing, PairingPreview, PreviewPairing, Snapshot,
    SnapshotPage,
};

use koloda_server::clock::Clock;

use crate::common::{card_create, child, encode, stamp, tombstone, uuid, write, Answer, Harness, START_MS};

const LEASE_TTL_MS: u64 = 5 * 60 * 1000;
const LEASE_LIFETIME_MS: u64 = 24 * 60 * 60 * 1000;

async fn open(harness: &Harness, device: &Enrollment) -> Answer<Snapshot> {
    harness
        .post(format!("/v1/spaces/{}/bootstrap", uuid(device.space_id)))
        .token(&device.token)
        .send::<Snapshot>()
        .await
}

fn lease_path(device: &Enrollment, snapshot: &Snapshot) -> String {
    format!(
        "/v1/spaces/{}/bootstrap/{}",
        uuid(device.space_id),
        uuid(snapshot.snapshot_id)
    )
}

async fn page(harness: &Harness, device: &Enrollment, snapshot: &Snapshot, query: &str) -> Answer<SnapshotPage> {
    harness
        .get(format!("{}?{query}", lease_path(device, snapshot)))
        .token(&device.token)
        .send::<SnapshotPage>()
        .await
}

/// Every entry of a lane, two per page, so the stream crosses page boundaries.
async fn stream(harness: &Harness, device: &Enrollment, snapshot: &Snapshot, lane: &str) -> Vec<LogEntry> {
    let mut entries = Vec::new();
    let mut after = 0;
    loop {
        let page = page(harness, device, snapshot, &format!("lane={lane}&after={after}&limit=2"))
            .await
            .ok();
        entries.extend(page.entries);
        after = page.next;
        if page.done {
            return entries;
        }
    }
}

fn headers(entries: &[LogEntry]) -> Vec<(Kind, String, Option<Group>)> {
    entries
        .iter()
        .map(|entry| {
            let header = Envelope::decode(&entry.envelope)
                .expect("decode a streamed envelope")
                .header;
            (header.kind, header.id, header.group)
        })
        .collect()
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

fn deck_title(offset_ms: u64) -> Header {
    write(Kind::Decks, "deck", Group::Title, stamp(offset_ms, 0, 1))
}

#[tokio::test]
async fn hot_streams_referents_first_and_cold_newest_first() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let at = stamp(1, 0, 1);
    let pointer = Header {
        refs: Refs {
            algorithm_id: Some("algorithm".to_string()),
            ..Refs::default()
        },
        ..write(Kind::Decks, "deck", Group::Algorithm, stamp(2, 0, 1))
    };
    harness
        .push(
            &home,
            vec![
                (1, write(Kind::Templates, "template", Group::Create, stamp(0, 0, 1))),
                (2, write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1))),
                (3, card_create("card", "deck", "template", at)),
                (4, write(Kind::Algorithms, "algorithm", Group::Create, at)),
                (5, write(Kind::AlgorithmRevisions, "revision", Group::Row, at)),
                (6, write(Kind::SettingsLearning, "learning", Group::DailyLimits, at)),
                (7, pointer),
                (
                    8,
                    child(Kind::Reviews, "review-old", "card", Group::Row, stamp(10, 0, 1)),
                ),
                (
                    9,
                    child(Kind::Reviews, "review-new", "card", Group::Row, stamp(30, 0, 1)),
                ),
                (
                    10,
                    child(Kind::Reviews, "review-mid", "card", Group::Row, stamp(20, 0, 1)),
                ),
            ],
        )
        .await
        .ok();

    let snapshot = open(&harness, &home).await.ok();
    let hot = stream(&harness, &home, &snapshot, "hot").await;
    let cold = stream(&harness, &home, &snapshot, "cold").await;

    assert_eq!(
        headers(&hot),
        vec![
            (Kind::Algorithms, "algorithm".to_string(), Some(Group::Create)),
            (Kind::AlgorithmRevisions, "revision".to_string(), Some(Group::Row)),
            (Kind::Templates, "template".to_string(), Some(Group::Create)),
            (Kind::Decks, "deck".to_string(), Some(Group::Create)),
            (Kind::Decks, "deck".to_string(), Some(Group::Algorithm)),
            (Kind::Cards, "card".to_string(), Some(Group::Create)),
            (Kind::SettingsLearning, "learning".to_string(), Some(Group::DailyLimits)),
        ],
        "an algorithm created after a deck still streams before it"
    );
    let cold_ids: Vec<_> = headers(&cold).into_iter().map(|(_, id, _)| id).collect();
    assert_eq!(cold_ids, ["review-new", "review-mid", "review-old"]);
    assert!(
        hot.iter().chain(&cold).all(|entry| entry.sender == home.device_id),
        "a bootstrap includes the caller's own entries"
    );
    assert_eq!((snapshot.head_hot, snapshot.head_cold), (7, 3));
    assert_eq!(snapshot.counts.get("reviews"), Some(&3));
    assert_eq!(
        (snapshot.ttl_ms, snapshot.expires_at, snapshot.absolute_expiry),
        (LEASE_TTL_MS, START_MS + LEASE_TTL_MS, START_MS + LEASE_LIFETIME_MS)
    );
}

#[tokio::test]
async fn a_lease_keeps_serving_what_it_pinned() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let first_title = deck_title(1);
    harness
        .push(
            &home,
            vec![
                (1, write(Kind::Templates, "template", Group::Create, stamp(0, 0, 1))),
                (2, write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1))),
                (3, first_title.clone()),
                (4, card_create("card", "deck", "template", stamp(1, 0, 1))),
            ],
        )
        .await
        .ok();
    let snapshot = open(&harness, &phone).await.ok();

    let second_title = deck_title(2);
    harness.push(&home, vec![(5, second_title.clone())]).await.ok();
    let after_update = stream(&harness, &phone, &snapshot, "hot").await;
    let pulled = harness.pull(&phone, "lane=hot&after=0").await.ok();
    harness
        .push(&home, vec![(6, tombstone(Kind::Decks, "deck", None, stamp(3, 0, 1)))])
        .await
        .ok();
    let after_delete = stream(&harness, &phone, &snapshot, "hot").await;

    let envelopes = |entries: &[LogEntry]| entries.iter().map(|entry| entry.envelope.clone()).collect::<Vec<_>>();
    assert!(
        envelopes(&after_update).contains(&encode(first_title.clone())),
        "the lease serves the title it pinned"
    );
    assert!(envelopes(&pulled.entries).contains(&encode(second_title)));
    assert!(
        !envelopes(&pulled.entries).contains(&encode(first_title)),
        "pull serves only the live head"
    );
    assert_eq!(
        envelopes(&after_delete),
        envelopes(&after_update),
        "a deck deleted after the lease opened still streams with its card"
    );
}

#[tokio::test]
async fn a_lease_lives_for_its_ttl_and_heartbeats_up_to_its_absolute_expiry() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    harness
        .push(
            &home,
            vec![(1, write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1)))],
        )
        .await
        .ok();
    let heartbeat = |snapshot: Snapshot| {
        harness
            .post(format!("{}/heartbeat", lease_path(&home, &snapshot)))
            .token(&home.token)
            .send::<Lease>()
    };

    let unattended = open(&harness, &home).await.ok();
    harness.clock.advance(LEASE_TTL_MS);
    page(&harness, &home, &unattended, "lane=hot").await.ok();
    harness.clock.advance(1);
    let lapsed = page(&harness, &home, &unattended, "lane=hot").await;
    assert_eq!(
        lapsed.error(),
        (StatusCode::GONE, ErrorCode::LeaseExpired),
        "one millisecond past the TTL"
    );

    let kept = open(&harness, &home).await.ok();
    let mut lease = Lease {
        expires_at: kept.expires_at,
        absolute_expiry: kept.absolute_expiry,
    };
    while lease.expires_at < lease.absolute_expiry {
        harness.clock.advance(LEASE_TTL_MS);
        lease = heartbeat(kept.clone()).await.ok();
    }
    assert_eq!(
        lease.expires_at, kept.absolute_expiry,
        "a heartbeat never extends past the absolute expiry"
    );
    harness.clock.advance(kept.absolute_expiry - harness.clock.now_ms());
    heartbeat(kept.clone()).await.ok();
    harness.clock.advance(1);
    assert_eq!(
        heartbeat(kept).await.error(),
        (StatusCode::GONE, ErrorCode::LeaseExpired)
    );
}

#[tokio::test]
async fn a_device_holds_one_lease_and_a_space_at_most_four() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let mut devices = vec![home.clone()];
    for name in ["Phone", "Tablet", "Laptop", "Desktop"] {
        devices.push(harness.pair(&home, name).await);
    }

    let replaced = open(&harness, &home).await.ok();
    let mut leases = Vec::new();
    for device in devices.iter().take(4) {
        leases.push(open(&harness, device).await.ok());
    }
    let fifth = open(&harness, devices.get(4).expect("five devices")).await;

    assert_eq!(
        page(&harness, &home, &replaced, "lane=hot").await.error(),
        (StatusCode::GONE, ErrorCode::LeaseExpired),
        "a second lease for one device releases the first"
    );
    for (device, lease) in devices.iter().zip(&leases) {
        page(&harness, device, lease, "lane=hot").await.ok();
    }
    assert_eq!(fifth.error(), (StatusCode::TOO_MANY_REQUESTS, ErrorCode::RateLimited));
    let phone = devices.get(1).expect("a phone");
    let other_device = harness
        .get(format!("{}?lane=hot", lease_path(phone, &replaced)))
        .token(&phone.token)
        .send::<SnapshotPage>()
        .await;
    assert_eq!(
        other_device.error(),
        (StatusCode::GONE, ErrorCode::LeaseExpired),
        "a device reads only its own lease"
    );
}

#[tokio::test]
async fn ending_a_lease_sweeps_the_versions_only_it_kept() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let create = write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1));
    let first_title = deck_title(1);
    let second_title = deck_title(2);
    harness
        .push(&home, vec![(1, create.clone()), (2, first_title.clone())])
        .await
        .ok();
    let snapshot = open(&harness, &home).await.ok();
    harness.push(&home, vec![(3, second_title.clone())]).await.ok();
    let len = |header: Header| u64::try_from(encode(header).len()).expect("small");

    let pinned = stored_bytes(&harness, &home).await;
    harness
        .call(Method::DELETE, lease_path(&home, &snapshot))
        .token(&home.token)
        .send::<Empty>()
        .await
        .ok();
    let released = stored_bytes(&harness, &home).await;

    assert_eq!(
        pinned,
        len(create.clone()) + len(first_title.clone()) + len(second_title.clone())
    );
    assert_eq!(
        released,
        len(create) + len(second_title),
        "the superseded title is gone with its lease"
    );
    assert_eq!(
        page(&harness, &home, &snapshot, "lane=hot").await.error(),
        (StatusCode::GONE, ErrorCode::LeaseExpired)
    );
}
