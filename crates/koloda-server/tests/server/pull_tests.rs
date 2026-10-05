use axum::http::StatusCode;
use koloda_sync_proto::envelope::{Envelope, Header};
use koloda_sync_proto::registry::{Group, Kind, Op};
use koloda_sync_proto::transport::{DeviceInfo, ErrorCode, PullPage, Push, PushItem};

use crate::common::{card_create, child, encode, seqs, stamp, tombstone, uuid, write, Harness};

fn deck_title(offset_ms: u64) -> Header {
    write(Kind::Decks, "deck", Group::Title, stamp(offset_ms, 0, 1))
}

#[tokio::test]
async fn a_pull_skips_the_callers_own_entries_but_scans_past_them() {
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
    harness
        .push(
            &phone,
            vec![(1, write(Kind::Decks, "deck", Group::Notes, stamp(1, 0, 2)))],
        )
        .await
        .ok();
    harness.push(&home, vec![(2, deck_title(2))]).await.ok();

    let for_phone = harness.pull(&phone, "lane=hot&after=0").await;
    let for_home = harness.pull(&home, "lane=hot&after=0").await;

    let meta = for_phone.reply.meta.clone();
    let for_phone = for_phone.ok();
    let for_home = for_home.ok();
    assert_eq!(seqs(&for_phone), vec![(1, 1), (3, 2)]);
    assert!(
        for_phone.entries.iter().all(|entry| entry.sender == home.device_id),
        "every entry carries its sender"
    );
    assert_eq!(seqs(&for_home), vec![(2, 1)]);
    assert_eq!((for_phone.scanned_through, for_phone.has_more), (3, false));
    assert_eq!((for_home.scanned_through, for_home.has_more), (3, false));
    assert_eq!(meta.epoch, Some(home.epoch));
    assert_eq!(meta.device.map(|device| device.head_hot), Some(3));
}

#[tokio::test]
async fn a_page_of_holes_and_own_entries_is_empty_but_makes_progress() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    harness
        .push(
            &home,
            vec![
                (1, write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1))),
                (2, deck_title(1)),
                (3, deck_title(2)),
            ],
        )
        .await
        .ok();

    let hole = harness.pull(&phone, "lane=hot&after=1&max_seq=2").await.ok();
    let own = harness.pull(&home, "lane=hot&after=0").await.ok();

    assert!(hole.entries.is_empty(), "seq 2 was compacted away");
    assert_eq!((hole.scanned_through, hole.has_more), (2, false));
    assert!(own.entries.is_empty());
    assert_eq!((own.scanned_through, own.has_more), (3, false));
}

#[tokio::test]
async fn max_seq_bounds_a_page_and_limit_cuts_it() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let at = stamp(1, 0, 1);
    harness
        .push(
            &home,
            vec![
                (1, write(Kind::Templates, "template", Group::Create, stamp(0, 0, 1))),
                (2, write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1))),
                (3, card_create("card", "deck", "template", at)),
                (4, child(Kind::Reviews, "review-1", "card", Group::Row, at)),
                (5, child(Kind::Reviews, "review-2", "card", Group::Row, at)),
                (6, child(Kind::Reviews, "review-3", "card", Group::Row, at)),
            ],
        )
        .await
        .ok();

    let bounded = harness.pull(&phone, "lane=cold&after=0&max_seq=2").await.ok();
    let cut = harness.pull(&phone, "lane=cold&after=0&limit=1").await.ok();
    let rest = harness.pull(&phone, "lane=cold&after=1").await.ok();
    let bad = [
        harness.pull(&phone, "lane=warm&after=0").await,
        harness.pull(&phone, "lane=hot&after=0&limit=0").await,
        harness.pull(&phone, "lane=hot&after=0&limit=5001").await,
        harness.pull(&phone, "after=0").await,
    ];
    harness.pull(&phone, "lane=hot&after=0&limit=5000").await.ok();

    assert_eq!(seqs(&bounded).len(), 2);
    assert_eq!(
        (bounded.scanned_through, bounded.has_more),
        (2, false),
        "max_seq is the bound"
    );
    assert_eq!(seqs(&cut).len(), 1);
    assert_eq!((cut.scanned_through, cut.has_more), (1, true), "limit cuts the page");
    assert_eq!((rest.entries.len(), rest.scanned_through, rest.has_more), (2, 3, false));
    for answer in bad {
        assert_eq!(answer.error(), (StatusCode::BAD_REQUEST, ErrorCode::BadRequest));
    }
}

#[tokio::test]
async fn a_tombstone_reaches_a_pull_and_its_removed_descendants_do_not() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let at = stamp(1, 0, 1);
    harness
        .push(
            &home,
            vec![
                (1, write(Kind::Templates, "template", Group::Create, stamp(0, 0, 1))),
                (2, write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1))),
                (3, card_create("card", "deck", "template", at)),
                (4, child(Kind::Reviews, "review", "card", Group::Row, at)),
                (5, tombstone(Kind::Decks, "deck", None, stamp(2, 0, 1))),
            ],
        )
        .await
        .ok();

    let hot = harness.pull(&phone, "lane=hot&after=0").await.ok();
    let cold = harness.pull(&phone, "lane=cold&after=0").await.ok();

    let delivered: Vec<_> = hot
        .entries
        .iter()
        .map(|entry| {
            let header = Envelope::decode(&entry.envelope)
                .expect("decode a pulled envelope")
                .header;
            (header.kind, header.id, header.op)
        })
        .collect();
    assert_eq!(
        delivered,
        vec![
            (Kind::Templates, "template".to_string(), Op::Write),
            (Kind::Decks, "deck".to_string(), Op::Delete),
        ]
    );
    assert!(cold.entries.is_empty(), "the review died with its card");
    assert_eq!(cold.scanned_through, 1);
}

#[tokio::test]
async fn devices_exchange_a_grade_across_both_lanes() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let at = stamp(1, 0, 1);
    harness
        .push(
            &home,
            vec![
                (1, write(Kind::Templates, "template", Group::Create, stamp(0, 0, 1))),
                (2, write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1))),
                (3, card_create("card", "deck", "template", at)),
            ],
        )
        .await
        .ok();
    let scheduling = child(Kind::Cards, "card", "deck", Group::Scheduling, stamp(2, 0, 2));
    let review = child(Kind::Reviews, "review", "card", Group::Row, stamp(2, 0, 2));
    harness
        .push(&phone, vec![(1, scheduling.clone()), (2, review.clone())])
        .await
        .ok();

    let head_cold = harness.device_meta(&home).await.head_cold;
    let hot = harness.pull(&home, "lane=hot&after=3").await.ok();
    let cold = harness
        .pull(&home, &format!("lane=cold&after=0&max_seq={head_cold}"))
        .await
        .ok();
    let record = harness
        .get(format!(
            "/v1/spaces/{}/devices/{}",
            uuid(home.space_id),
            uuid(home.device_id)
        ))
        .token(&home.token)
        .send::<DeviceInfo>()
        .await
        .ok();

    let entry = |page: &PullPage| {
        page.entries
            .iter()
            .map(|entry| (entry.sender, entry.sender_seq, entry.envelope.clone()))
            .collect::<Vec<_>>()
    };
    assert_eq!(entry(&hot), vec![(phone.device_id, 1, encode(scheduling))]);
    assert_eq!(
        entry(&cold),
        vec![(phone.device_id, 2, encode(review))],
        "envelopes arrive exactly as pushed"
    );
    assert_eq!(
        (record.cursor_hot, record.cursor_cold),
        (3, 0),
        "the server records the cursor each pull starts from"
    );
}

#[tokio::test]
async fn the_byte_cap_cuts_a_page_of_large_envelopes() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    // WHY: 16 envelopes of about 500 KB fit under the 8 MiB page cap, and a 17th does not.
    let items = (1..=17)
        .map(|seq| PushItem {
            sender_seq: seq,
            envelope: Envelope {
                header: write(Kind::Decks, &format!("deck-{seq}"), Group::Create, stamp(0, 0, 1)),
                payload: vec![0; 500_000],
            }
            .encode()
            .expect("encode a large test envelope"),
        })
        .collect();
    harness.push_body(&home, &Push { items }).await.ok();

    let page = harness.pull(&phone, "lane=hot&after=0").await.ok();

    assert_eq!(page.entries.len(), 16);
    assert_eq!((page.scanned_through, page.has_more), (16, true));
}
