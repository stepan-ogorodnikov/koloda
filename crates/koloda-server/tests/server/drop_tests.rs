//! `koloda-server drop-envelope`: one damaged version leaves the log, and a dropped create or tombstone becomes a
//! tombstone the server authors (`crates/koloda-sync-proto/PROTOCOL.md` §Corrupt envelopes).

use koloda_server::clock::Clock;
use koloda_sync_proto::envelope::{Envelope, Header, Refs};
use koloda_sync_proto::registry::{Group, Kind, Lane};
use koloda_sync_proto::transport::{Enrollment, ErrorCode, LogEntry, Outcome, Snapshot, SnapshotPage, SERVER_SENDER};
use rusqlite::Connection;
use uuid::Uuid;

use crate::common::{card_create, child, outcomes, stamp, tombstone, uuid, write, Harness};

const DECK: &str = "01920000-0000-7000-8000-0000000000d1";
const TEMPLATE: &str = "01920000-0000-7000-8000-0000000000e1";
const FIRST: &str = "01920000-0000-7000-8000-0000000000c1";
const SECOND: &str = "01920000-0000-7000-8000-0000000000c2";
const ATTACHMENT_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ATTACHMENT_B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

fn space(device: &Enrollment) -> Uuid {
    Uuid::from_bytes(device.space_id)
}

fn space_db(harness: &Harness, device: &Enrollment) -> Connection {
    Connection::open(
        harness
            .generation_dir()
            .join("spaces")
            .join(format!("{}.db", space(device))),
    )
    .expect("the space database opens")
}

/// The lane and seq of the version that holds a write; `group` is `""` for a tombstone.
fn version(harness: &Harness, device: &Enrollment, kind: Kind, id: &str, group: &str) -> (Lane, u64) {
    let (lane, seq): (String, u64) = space_db(harness, device)
        .query_row(
            "SELECT lane, seq FROM versions WHERE kind = ?1 AND id = ?2 AND grp = ?3",
            rusqlite::params![kind.as_wire(), id, group],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("the version is stored");
    (Lane::from_wire(&lane).expect("a known lane"), seq)
}

fn drop_version(harness: &Harness, device: &Enrollment, (lane, seq): (Lane, u64)) {
    let dropping = harness
        .server
        .describe_drop(space(device), lane, seq)
        .expect("the version is described");
    harness
        .server
        .drop_envelope(space(device), &dropping)
        .expect("the version is dropped");
}

/// A deck with two cards on a template, three reviews of the first card, and a deck rename, all from `writer`.
async fn library(harness: &Harness, writer: &Enrollment) {
    let reply = harness
        .push(
            writer,
            vec![
                (1, write(Kind::Templates, TEMPLATE, Group::Create, stamp(0, 0, 1))),
                (2, write(Kind::Decks, DECK, Group::Create, stamp(0, 1, 1))),
                (3, card_create(FIRST, DECK, TEMPLATE, stamp(0, 2, 1))),
                (4, card_create(SECOND, DECK, TEMPLATE, stamp(0, 3, 1))),
                (5, child(Kind::Reviews, "r1", FIRST, Group::Row, stamp(1, 0, 1))),
                (6, child(Kind::Reviews, "r2", FIRST, Group::Row, stamp(1, 1, 1))),
                (7, child(Kind::Reviews, "r3", FIRST, Group::Row, stamp(1, 2, 1))),
                (8, write(Kind::Decks, DECK, Group::Title, stamp(2, 0, 1))),
            ],
        )
        .await
        .ok();
    assert!(outcomes(reply)
        .iter()
        .all(|(_, outcome, _)| *outcome == Outcome::Applied));
}

async fn pulled(harness: &Harness, reader: &Enrollment, lane: Lane) -> Vec<LogEntry> {
    harness
        .pull(reader, &format!("lane={}&after=0", lane.as_wire()))
        .await
        .ok()
        .entries
}

fn header(entry: &LogEntry) -> Header {
    Envelope::decode(&entry.envelope)
        .expect("a pulled envelope decodes")
        .header
}

#[tokio::test]
async fn a_dropped_update_leaves_the_log_and_the_entity_stays() {
    let harness = Harness::new();
    let writer = harness.create_space("Study").await;
    let reader = harness.pair(&writer, "Phone").await;
    library(&harness, &writer).await;
    let title = version(&harness, &writer, Kind::Decks, DECK, "title");

    drop_version(&harness, &writer, title);

    let hot = pulled(&harness, &reader, Lane::Hot).await;
    assert!(
        hot.iter().all(|entry| entry.seq != title.1),
        "a pull passes the dropped seq"
    );
    let deck_groups: Vec<Option<Group>> = hot
        .iter()
        .map(header)
        .filter(|header| header.id == DECK)
        .map(|header| header.group)
        .collect();
    assert_eq!(deck_groups, vec![Some(Group::Create)], "the deck is as it was created");
    let reply = harness
        .push(
            &writer,
            vec![(9, write(Kind::Decks, DECK, Group::Title, stamp(0, 9, 1)))],
        )
        .await
        .ok();
    assert_eq!(
        outcomes(reply),
        vec![(9, Outcome::Applied, false)],
        "the group has no head, so even an older title applies"
    );
}

#[tokio::test]
async fn a_dropped_review_leaves_the_cold_lane() {
    let harness = Harness::new();
    let writer = harness.create_space("Study").await;
    let reader = harness.pair(&writer, "Phone").await;
    library(&harness, &writer).await;
    let review = version(&harness, &writer, Kind::Reviews, "r2", "row");

    drop_version(&harness, &writer, review);

    let ids: Vec<String> = pulled(&harness, &reader, Lane::Cold)
        .await
        .iter()
        .map(|entry| header(entry).id)
        .collect();
    assert_eq!(ids, vec!["r1", "r3"]);
}

#[tokio::test]
async fn a_dropped_create_becomes_a_server_tombstone_that_cascades() {
    let harness = Harness::new();
    let writer = harness.create_space("Study").await;
    let reader = harness.pair(&writer, "Phone").await;
    library(&harness, &writer).await;
    harness.clock.advance(60_000);
    let create = version(&harness, &writer, Kind::Decks, DECK, "create");

    let dropping = harness
        .server
        .describe_drop(space(&writer), create.0, create.1)
        .expect("the create is described");
    assert_eq!((dropping.cards, dropping.reviews), (2, 3));
    harness
        .server
        .drop_envelope(space(&writer), &dropping)
        .expect("the create is dropped");

    let hot = pulled(&harness, &reader, Lane::Hot).await;
    let last = hot.last().expect("the tombstone is in the log");
    let tombstone = header(last);
    assert_eq!(
        (tombstone.kind, tombstone.id.as_str(), tombstone.group),
        (Kind::Decks, DECK, None)
    );
    assert_eq!((last.sender, last.sender_seq), (SERVER_SENDER, 1));
    assert_eq!(tombstone.stamp.device.0, SERVER_SENDER);
    assert!(tombstone.stamp.hlc > stamp(2, 0, 1).hlc);
    assert!(tombstone.stamp.hlc.wall_ms() >= harness.clock.now_ms());
    assert!(
        hot.iter().all(|entry| header(entry).kind != Kind::Cards),
        "the deck's cards went with it"
    );
    assert!(
        pulled(&harness, &reader, Lane::Cold).await.is_empty(),
        "and their reviews"
    );
    let reply = harness
        .push(
            &writer,
            vec![
                (9, write(Kind::Decks, DECK, Group::Notes, stamp(3, 0, 1))),
                (10, child(Kind::Cards, FIRST, DECK, Group::Content, stamp(3, 1, 1))),
            ],
        )
        .await
        .ok();
    assert_eq!(
        outcomes(reply),
        vec![(9, Outcome::Fenced, false), (10, Outcome::Fenced, false)]
    );
}

#[tokio::test]
async fn a_dropped_tombstone_is_written_again_by_the_server() {
    let harness = Harness::new();
    let writer = harness.create_space("Study").await;
    let reader = harness.pair(&writer, "Phone").await;
    library(&harness, &writer).await;
    harness
        .push(&writer, vec![(9, tombstone(Kind::Decks, DECK, None, stamp(3, 0, 1)))])
        .await
        .ok();
    let deleted = version(&harness, &writer, Kind::Decks, DECK, "");

    drop_version(&harness, &writer, deleted);

    let tombstones: Vec<(u64, [u8; 16])> = pulled(&harness, &reader, Lane::Hot)
        .await
        .iter()
        .filter(|entry| header(entry).group.is_none())
        .map(|entry| (entry.seq, entry.sender))
        .collect();
    assert_eq!(tombstones.len(), 1);
    assert!(tombstones[0].0 > deleted.1);
    assert_eq!(tombstones[0].1, SERVER_SENDER);
    let reply = harness
        .push(
            &writer,
            vec![(10, write(Kind::Decks, DECK, Group::Notes, stamp(4, 0, 1)))],
        )
        .await
        .ok();
    assert_eq!(outcomes(reply), vec![(10, Outcome::Fenced, false)], "the fence stays");
}

#[tokio::test]
async fn a_dropped_version_leaves_a_lease_that_pinned_it() {
    let harness = Harness::new();
    let writer = harness.create_space("Study").await;
    let reader = harness.pair(&writer, "Phone").await;
    library(&harness, &writer).await;
    let snapshot = harness
        .post(format!("/v1/spaces/{}/bootstrap", uuid(reader.space_id)))
        .token(&reader.token)
        .send::<Snapshot>()
        .await
        .ok();
    let title = version(&harness, &writer, Kind::Decks, DECK, "title");

    drop_version(&harness, &writer, title);

    let page = harness
        .get(format!(
            "/v1/spaces/{}/bootstrap/{}?lane=hot&after=0",
            uuid(reader.space_id),
            uuid(snapshot.snapshot_id)
        ))
        .token(&reader.token)
        .send::<SnapshotPage>()
        .await
        .ok();
    assert!(page.done);
    assert!(page.entries.iter().all(|entry| entry.seq != title.1));
    assert!(!page.entries.is_empty(), "the rest of the snapshot still streams");
}

#[tokio::test]
async fn a_dropped_content_head_links_the_create_attachments_again() {
    let harness = Harness::new();
    let writer = harness.create_space("Study").await;
    let mut create = card_create(FIRST, DECK, TEMPLATE, stamp(0, 2, 1));
    create.refs.attachment_ids = vec![ATTACHMENT_A.to_string()];
    let content = Header {
        refs: Refs {
            attachment_ids: vec![ATTACHMENT_B.to_string()],
            ..Refs::default()
        },
        ..child(Kind::Cards, FIRST, DECK, Group::Content, stamp(1, 0, 1))
    };
    harness
        .push(
            &writer,
            vec![
                (1, write(Kind::Templates, TEMPLATE, Group::Create, stamp(0, 0, 1))),
                (2, write(Kind::Decks, DECK, Group::Create, stamp(0, 1, 1))),
                (3, create),
                (4, content),
            ],
        )
        .await
        .ok();
    let links = |harness: &Harness| -> Vec<String> {
        let conn = space_db(harness, &writer);
        let mut statement = conn
            .prepare("SELECT attachment FROM attachment_refs WHERE card = ?1")
            .expect("refs query prepares");
        statement
            .query_map([FIRST], |row| row.get(0))
            .expect("refs read")
            .collect::<Result<_, _>>()
            .expect("refs read")
    };
    assert_eq!(links(&harness), vec![ATTACHMENT_B]);

    drop_version(
        &harness,
        &writer,
        version(&harness, &writer, Kind::Cards, FIRST, "content"),
    );

    assert_eq!(links(&harness), vec![ATTACHMENT_A]);
}

#[tokio::test]
async fn a_drop_refuses_a_seq_with_no_version_and_one_that_changed() {
    let harness = Harness::new();
    let writer = harness.create_space("Study").await;
    library(&harness, &writer).await;
    let missing = harness
        .server
        .describe_drop(space(&writer), Lane::Hot, 999)
        .expect_err("no version is there");
    assert_eq!(missing.code(), ErrorCode::NotFound);
    let title = version(&harness, &writer, Kind::Decks, DECK, "title");
    let dropping = harness
        .server
        .describe_drop(space(&writer), title.0, title.1)
        .expect("the title is described");
    harness
        .push(
            &writer,
            vec![(9, write(Kind::Decks, DECK, Group::Title, stamp(5, 0, 1)))],
        )
        .await
        .ok();

    let refused = harness
        .server
        .drop_envelope(space(&writer), &dropping)
        .expect_err("a newer title compacted the described one");

    assert_eq!(refused.code(), ErrorCode::NotFound);
    assert_eq!(
        version(&harness, &writer, Kind::Decks, DECK, "title").1,
        title.1 + 1,
        "the newer title stays"
    );
}
