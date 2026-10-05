use axum::http::StatusCode;
use koloda_sync_proto::envelope::{self, Header};
use koloda_sync_proto::hlc::SKEW_TOLERANCE_MS;
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{
    DeviceInfo, ErrorCode, IssuePairing, Outcome, Pairing, PairingPreview, PreviewPairing, Push, PushItem, PushReply,
    Receipts, MAX_PUSH_ITEMS, MAX_RECEIPT_RANGE,
};

use crate::common::{batch, card_create, child, encode, outcomes, stamp, uuid, write, Harness};

const DECK: &str = "deck-a";
const CARD: &str = "card-a";
const TEMPLATE: &str = "template-a";

fn deck_title(offset_ms: u64, counter: u16, device: u8) -> Header {
    write(Kind::Decks, DECK, Group::Title, stamp(offset_ms, counter, device))
}

#[tokio::test]
async fn applied_envelopes_take_the_next_seq_of_their_own_lane() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;

    let reply = harness
        .push(
            &home,
            vec![
                (1, write(Kind::Templates, TEMPLATE, Group::Create, stamp(0, 0, 1))),
                (2, write(Kind::Decks, DECK, Group::Create, stamp(0, 0, 1))),
                (3, card_create(CARD, DECK, TEMPLATE, stamp(0, 0, 1))),
                (4, child(Kind::Reviews, "review-a", CARD, Group::Row, stamp(1, 0, 1))),
                (5, child(Kind::Cards, CARD, DECK, Group::Scheduling, stamp(1, 0, 1))),
            ],
        )
        .await;

    let meta = reply.reply.meta.device.clone().expect("device meta");
    assert_eq!(
        outcomes(reply.ok()),
        (1..=5).map(|seq| (seq, Outcome::Applied, false)).collect::<Vec<_>>(),
        "the server accepts payloads it cannot decode"
    );
    assert_eq!(
        (meta.head_hot, meta.head_cold),
        (4, 1),
        "reviews travel in `cold`, the rest in `hot`"
    );
    assert_eq!(meta.last_sender_seq, 5);
}

#[tokio::test]
async fn an_update_applies_only_when_its_stamp_beats_the_head() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    harness
        .push(
            &home,
            vec![
                (1, write(Kind::Templates, TEMPLATE, Group::Create, stamp(0, 0, 1))),
                (2, write(Kind::Decks, DECK, Group::Create, stamp(0, 0, 1))),
                (3, card_create(CARD, DECK, TEMPLATE, stamp(0, 0, 1))),
            ],
        )
        .await
        .ok();
    let cases = [
        ("the first write of a group", deck_title(10, 0, 2), Outcome::Applied),
        ("a lower HLC", deck_title(9, 5, 9), Outcome::Stale),
        ("the same stamp", deck_title(10, 0, 2), Outcome::Stale),
        ("a tied HLC from a lower device", deck_title(10, 0, 1), Outcome::Stale),
        (
            "a tied HLC from a higher device",
            deck_title(10, 0, 3),
            Outcome::Applied,
        ),
        ("a higher counter", deck_title(10, 1, 1), Outcome::Applied),
        (
            "a second create",
            write(Kind::Decks, DECK, Group::Create, stamp(20, 0, 1)),
            Outcome::Stale,
        ),
        (
            "a review",
            child(Kind::Reviews, "review-a", CARD, Group::Row, stamp(20, 0, 1)),
            Outcome::Applied,
        ),
        (
            "the same review again",
            child(Kind::Reviews, "review-a", CARD, Group::Row, stamp(30, 0, 1)),
            Outcome::Stale,
        ),
    ];
    for (seq, (name, header, expected)) in (4..).zip(cases) {
        let reply = harness.push(&home, vec![(seq, header)]).await;

        assert_eq!(outcomes(reply.ok()), vec![(seq, expected, false)], "{name}");
    }
}

#[tokio::test]
async fn a_retried_seq_replays_and_a_reused_one_stops_the_batch() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let first = vec![
        (1, write(Kind::Decks, DECK, Group::Create, stamp(0, 0, 1))),
        (2, deck_title(1, 0, 1)),
        (5, deck_title(2, 0, 1)),
    ];
    let applied = outcomes(harness.push(&home, first.clone()).await.ok());

    // The reply was lost; the device retries the same bytes.
    let replayed = outcomes(harness.push(&home, first).await.ok());
    let reused = outcomes(
        harness
            .push(
                &home,
                vec![
                    (1, write(Kind::Decks, DECK, Group::Create, stamp(0, 0, 1))),
                    (2, deck_title(3, 0, 1)),
                    (6, deck_title(4, 0, 1)),
                ],
            )
            .await
            .ok(),
    );
    let gap = outcomes(harness.push(&home, vec![(3, deck_title(5, 0, 1))]).await.ok());

    assert_eq!(
        replayed,
        applied
            .iter()
            .map(|&(seq, outcome, _)| (seq, outcome, true))
            .collect::<Vec<_>>()
    );
    assert_eq!(
        reused,
        vec![(1, Outcome::Applied, true), (2, Outcome::SeqReused, false)],
        "a different digest at a consumed seq stops the batch"
    );
    assert_eq!(
        gap,
        vec![(3, Outcome::SeqReused, false)],
        "a seq below high-water with no receipt was never this envelope"
    );
    assert_eq!(
        harness.device_meta(&home).await.last_sender_seq,
        5,
        "seq 6 was not consumed"
    );
}

#[tokio::test]
async fn a_stamp_too_far_ahead_fails_the_whole_push() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let at_limit = write(Kind::Decks, DECK, Group::Create, stamp(SKEW_TOLERANCE_MS, 0, 1));
    let past_limit = deck_title(SKEW_TOLERANCE_MS + 1, 0, 1);

    let refused = harness.push(&home, vec![(1, at_limit.clone()), (2, past_limit)]).await;
    let accepted = harness.push(&home, vec![(1, at_limit)]).await;

    assert_eq!(refused.error(), (StatusCode::CONFLICT, ErrorCode::StampAhead));
    assert_eq!(
        outcomes(accepted.ok()),
        vec![(1, Outcome::Applied, false)],
        "the refused push consumed nothing, so seq 1 is new"
    );
}

#[tokio::test]
async fn compaction_keeps_only_the_head_of_each_group() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let create = write(Kind::Decks, DECK, Group::Create, stamp(0, 0, 1));
    let latest = deck_title(2, 0, 1);
    let expected_bytes = encode(create.clone()).len() + encode(latest.clone()).len();

    harness
        .push(&home, vec![(1, create), (2, deck_title(1, 0, 1)), (3, latest)])
        .await
        .ok();

    let code = harness
        .post(format!("/v1/spaces/{}/pairings", uuid(home.space_id)))
        .token(&home.token)
        .body(&IssuePairing::default())
        .send::<Pairing>()
        .await
        .ok()
        .code;
    let preview = harness
        .post("/v1/pairings/preview")
        .body(&PreviewPairing { code })
        .send::<PairingPreview>()
        .await
        .ok();
    assert_eq!(
        preview.bytes,
        u64::try_from(expected_bytes).expect("small"),
        "the superseded title is gone"
    );
    assert_eq!(preview.counts.get("decks"), Some(&1));
}

#[tokio::test]
async fn a_bad_batch_consumes_nothing() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let create = || write(Kind::Decks, DECK, Group::Create, stamp(0, 0, 1));
    let too_many = Push {
        items: (1..=u64::try_from(MAX_PUSH_ITEMS + 1).expect("small"))
            .map(|seq| PushItem {
                sender_seq: seq,
                envelope: encode(create()),
            })
            .collect(),
    };
    let mut garbage = batch(vec![(1, create())]);
    garbage.items.push(PushItem {
        sender_seq: 2,
        envelope: vec![0xff],
    });
    let cases = [
        (
            "out-of-order seqs",
            batch(vec![(2, create()), (1, deck_title(1, 0, 1))]),
            StatusCode::BAD_REQUEST,
        ),
        (
            "a repeated seq",
            batch(vec![(1, create()), (1, create())]),
            StatusCode::BAD_REQUEST,
        ),
        ("an envelope that does not decode", garbage, StatusCode::BAD_REQUEST),
        ("more items than the cap", too_many, StatusCode::PAYLOAD_TOO_LARGE),
    ];
    for (name, push, status) in cases {
        let answer = harness.push_body(&home, &push).await;

        assert_eq!(answer.status, status, "{name}");
        assert_eq!(
            harness.device_meta(&home).await.last_sender_seq,
            0,
            "{name} consumed a seq"
        );
    }
}

#[tokio::test]
async fn any_device_of_the_space_reads_a_senders_receipts() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let pushed = vec![
        (1, write(Kind::Decks, DECK, Group::Create, stamp(0, 0, 1))),
        (2, deck_title(1, 0, 1)),
        (3, deck_title(0, 0, 1)),
    ];
    let digests: Vec<_> = pushed
        .iter()
        .map(|(_, header)| envelope::digest(&encode(header.clone())).0)
        .collect();
    harness.push(&home, pushed).await.ok();
    let receipts_path = |after: u64, through: u64| {
        format!(
            "/v1/spaces/{}/receipts?sender={}&after={after}&through={through}",
            uuid(home.space_id),
            uuid(home.device_id)
        )
    };

    let read = harness
        .get(receipts_path(1, 3))
        .token(&phone.token)
        .send::<Receipts>()
        .await
        .ok();
    let too_wide = harness
        .get(receipts_path(0, MAX_RECEIPT_RANGE + 1))
        .token(&phone.token)
        .send::<Receipts>()
        .await;
    let record = harness
        .get(format!(
            "/v1/spaces/{}/devices/{}",
            uuid(home.space_id),
            uuid(home.device_id)
        ))
        .token(&phone.token)
        .send::<DeviceInfo>()
        .await
        .ok();

    let read: Vec<_> = read
        .receipts
        .into_iter()
        .map(|receipt| (receipt.sender_seq, receipt.digest, receipt.outcome))
        .collect();
    let digest = |index: usize| digests.get(index).copied().expect("three digests");
    assert_eq!(
        read,
        vec![(2, digest(1), Outcome::Applied), (3, digest(2), Outcome::Stale)],
        "receipts after seq 1 through 3"
    );
    assert_eq!(too_wide.error(), (StatusCode::BAD_REQUEST, ErrorCode::BadRequest));
    harness
        .get(receipts_path(0, MAX_RECEIPT_RANGE))
        .token(&phone.token)
        .send::<Receipts>()
        .await
        .ok();
    assert_eq!(
        (record.last_sender_seq, record.last_sender_digest),
        (3, Some(digest(2))),
        "the device record carries the sender's high-water and its digest"
    );
    assert_eq!(
        harness.push(&phone, vec![]).await.ok(),
        PushReply { outcomes: vec![] },
        "an empty push is a no-op"
    );
}
