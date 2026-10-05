use std::collections::HashSet;

use koloda_sync::error::SyncError;
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::payload::{Delete, Payload, Title};
use koloda_sync_proto::registry::{Group, Kind, Lane};
use koloda_sync_proto::transport::ErrorCode;

use crate::common::{Fault, Space};
use crate::fixtures::Library;

/// The first try and 3 retries.
const ATTEMPTS: usize = 4;

/// What a push left behind locally once its outcomes were settled.
struct Expect {
    changed: Vec<Kind>,
    check: Box<dyn Fn(&Space)>,
}

fn synced_library(space: &Space) -> Library {
    let library = space.device.library();
    space.device.engine.sync_now().expect("the library is pushed");
    library
}

fn tombstone(space: &Space, kind: Kind, id: &str) {
    let payload = Payload::Delete {
        kind,
        delete: Delete { successor: None },
    };
    space.raw_push(id, None, space.raw_stamp(1_000), &payload);
}

fn applied(space: &Space) -> Expect {
    let library = space.device.library();
    Expect {
        changed: vec![],
        check: Box::new(move |space| {
            let pushed = pushed_ids(space);
            assert!(
                pushed.contains(&(Kind::Cards, library.card.clone())),
                "the card reaches the server"
            );
        }),
    }
}

fn stale(space: &Space) -> Expect {
    let library = synced_library(space);
    let remote = Payload::DeckTitle(Title {
        title: "Remote".to_string(),
        updated_at: Some(1),
    });
    space.raw_push(&library.deck, None, space.raw_stamp(60_000), &remote);
    space
        .device
        .update_deck(&library.deck, "Local", &library.algorithm, &library.template);
    Expect {
        changed: vec![],
        check: Box::new(move |space| {
            let deck = space.device.deck(&library.deck).expect("the deck stays");
            assert_eq!(
                deck.title, "Local",
                "a stale write keeps its local value; pull brings the winner"
            );
        }),
    }
}

fn fenced(space: &Space) -> Expect {
    let library = synced_library(space);
    tombstone(space, Kind::Decks, &library.deck);
    space
        .device
        .update_deck(&library.deck, "Renamed", &library.algorithm, &library.template);
    let rejected = space
        .device
        .outbox()
        .last()
        .expect("the rename is pending")
        .envelope
        .header
        .stamp;
    Expect {
        changed: vec![Kind::Cards, Kind::Decks],
        check: Box::new(move |space| {
            assert!(space.device.deck(&library.deck).is_none(), "the fenced deck is deleted");
            assert!(!space.device.has_card(&library.card), "with its cards");
            let device = space.device.state().expect("enrolled").device_id;
            let fence = format!(
                "SELECT COUNT(*) FROM sync_tombstones WHERE kind = 'decks' AND id = '{}' AND hlc = {} AND sender = x'{}'",
                library.deck,
                rejected.hlc.raw(),
                hex(device.as_bytes())
            );
            assert_eq!(
                space.device.count(&fence),
                1,
                "the deck is fenced at the rejected stamp"
            );
        }),
    }
}

fn existence(space: &Space) -> Expect {
    let algorithm = space.device.add_algorithm("FSRS");
    let template = space.device.add_template("Basic");
    space.device.engine.sync_now().expect("the referents are pushed");
    let deck = space.device.add_deck(&algorithm, &template, "Spanish");
    // WHY: capture always queues a deck's create before its pointers; only a lost create reaches `existence`.
    space
        .device
        .execute("DELETE FROM sync_outbox WHERE kind = 'decks' AND group_name = 'create'");
    Expect {
        changed: vec![],
        check: Box::new(move |space| {
            assert!(space.device.deck(&deck).is_some(), "the local deck keeps its value");
        }),
    }
}

fn dependency_drop(space: &Space) -> Expect {
    let library = synced_library(space);
    tombstone(space, Kind::Decks, &library.deck);
    let card = space.device.add_card(&library.deck, &library.template, "late");
    Expect {
        changed: vec![Kind::Cards],
        check: Box::new(move |space| {
            assert!(
                !space.device.has_card(&card),
                "a card created under a dead deck is dropped"
            );
            let fence = format!("SELECT COUNT(*) FROM sync_tombstones WHERE id = '{card}'");
            assert_eq!(space.device.count(&fence), 0, "the drop publishes nothing");
            assert!(
                space.device.deck(&library.deck).is_some(),
                "the deck waits for its tombstone"
            );
        }),
    }
}

fn dependency_repair(space: &Space) -> Expect {
    let library = synced_library(space);
    let second = space.device.add_algorithm("Second");
    space.device.engine.sync_now().expect("the second algorithm is pushed");
    tombstone(space, Kind::Algorithms, &second);
    space
        .device
        .update_deck(&library.deck, "Spanish", &second, &library.template);
    Expect {
        changed: vec![],
        check: Box::new(move |space| {
            let deck = space.device.deck(&library.deck).expect("the deck stays");
            assert_eq!(
                deck.algorithm_id, second,
                "the pointer waits for the algorithm's tombstone to sweep it"
            );
        }),
    }
}

fn held(space: &Space) -> Expect {
    let library = synced_library(space);
    space
        .server
        .server
        .set_write_schema(space.space_id(), Kind::Decks, 2)
        .expect("write schema is raised");
    space
        .device
        .update_deck(&library.deck, "Renamed", &library.algorithm, &library.template);
    space.device.rename_template(&library.template, "Renamed");
    Expect {
        changed: vec![],
        check: Box::new(move |space| {
            let held = format!(
                "SELECT COUNT(*) FROM sync_held WHERE kind = 'decks' AND id = '{}' AND reason = 'schema'",
                library.deck
            );
            assert_eq!(space.device.count(&held), 1, "the deck rename waits in sync_held");
            let titles: Vec<_> = pushed(space)
                .into_iter()
                .filter(|envelope| {
                    envelope.header.kind == Kind::Templates && envelope.header.group == Some(Group::Title)
                })
                .collect();
            assert_eq!(titles.len(), 1, "a writable kind in the same push still lands");
        }),
    }
}

/// Builds a space whose next push meets one outcome, and says what that outcome leaves.
type Arrange = fn(&Space) -> Expect;

const OUTCOMES: [(&str, Arrange); 7] = [
    ("applied", applied),
    ("stale", stale),
    ("fenced", fenced),
    ("existence", existence),
    ("dependency_fenced drop_entity", dependency_drop),
    ("dependency_fenced repair_pointer", dependency_repair),
    ("held schema", held),
];

#[test]
fn every_consuming_outcome_settles_its_row() {
    for (name, arrange) in OUTCOMES {
        let space = Space::new();
        let expect = arrange(&space);

        let changed = space.device.engine.sync_now().expect(name);

        assert_settled(&space, name, &expect, changed);
    }
}

#[test]
fn a_lost_reply_is_settled_by_the_same_bytes_once_a_reply_arrives() {
    for (name, arrange) in OUTCOMES {
        let space = Space::new();
        let expect = arrange(&space);
        let before = space.device.transport.sent().len();
        for _ in 0..ATTEMPTS {
            space.device.transport.fault(Fault::LoseReply);
        }

        let lost = space.device.engine.sync_now();

        assert!(matches!(lost, Err(SyncError::Transport(_))), "{name}: {lost:?}");
        assert!(
            space.device.outbox().iter().all(|row| row.in_flight),
            "{name}: the rows stay in flight"
        );
        let states = space.device.cohort_states();
        assert!(
            !states.is_empty() && states.iter().all(|state| state == "fixed"),
            "{name}: any member may have been consumed, so every cohort is fixed: {states:?}"
        );
        let lost_body = push_bodies(&space, before).first().cloned();

        let changed = space.device.engine.sync_now().expect(name);

        let resent = push_bodies(&space, before + ATTEMPTS).first().cloned();
        assert!(lost_body.is_some(), "{name}: a push was sent");
        assert_eq!(resent, lost_body, "{name}: the same bytes go out again");
        assert_settled(&space, name, &expect, changed);
    }
}

fn assert_settled(space: &Space, name: &str, expect: &Expect, changed: Vec<Kind>) {
    assert!(space.device.outbox().is_empty(), "{name}: the outbox is empty");
    assert!(space.device.cohort_states().is_empty(), "{name}: no cohort is left");
    assert_eq!(sorted(changed), sorted(expect.changed.clone()), "{name}: changed kinds");
    let seqs: Vec<u64> = space
        .raw_pull(Lane::Hot, 0)
        .entries
        .iter()
        .filter(|entry| entry.sender != space.raw.device_id)
        .map(|entry| entry.sender_seq)
        .collect();
    assert_eq!(
        seqs.len(),
        seqs.iter().collect::<HashSet<_>>().len(),
        "{name}: the server holds each envelope once"
    );
    (expect.check)(space);
}

#[test]
fn a_reused_seq_stops_the_push_as_behind() {
    let space = Space::new();
    let library = synced_library(&space);
    // WHY: a file restored from a backup numbers new writes from a seq the server already consumed.
    space.device.execute("UPDATE sync_state SET next_sender_seq = 1");
    space
        .device
        .update_deck(&library.deck, "Renamed", &library.algorithm, &library.template);

    let result = space.device.engine.sync_now();

    assert!(matches!(result, Err(SyncError::Behind)), "{result:?}");
    let outbox = space.device.outbox();
    assert_eq!(outbox.len(), 1, "nothing was consumed");
    assert!(
        outbox.iter().all(|row| !row.in_flight),
        "the unreached row leaves flight"
    );
    assert_eq!(space.device.cohort_states(), vec!["local"]);
}

#[test]
fn a_refused_push_returns_its_cohorts_to_local() {
    let space = Space::new();
    space.server.clock.set_offset(-10 * 60 * 1000);
    space.device.library();
    let pending = space.device.outbox().len();

    let result = space.device.engine.sync_now();

    assert!(
        matches!(
            result,
            Err(SyncError::Server {
                status: 409,
                code: ErrorCode::StampAhead,
                ..
            })
        ),
        "a server 10 minutes behind refuses stamps from now: {result:?}"
    );
    let outbox = space.device.outbox();
    assert_eq!(outbox.len(), pending, "nothing was consumed");
    assert!(outbox.iter().all(|row| !row.in_flight), "every row leaves flight");
    let states = space.device.cohort_states();
    assert!(
        !states.is_empty() && states.iter().all(|state| state == "local"),
        "{states:?}"
    );
}

/// The bodies of the pushes the device sent after its first `skip` requests.
fn push_bodies(space: &Space, skip: usize) -> Vec<Vec<u8>> {
    space
        .device
        .transport
        .sent()
        .into_iter()
        .skip(skip)
        .filter(|request| request.url.ends_with("/push"))
        .filter_map(|request| request.body)
        .collect()
}

/// The envelopes the engine's device pushed, as the raw client pulls them.
fn pushed(space: &Space) -> Vec<Envelope> {
    space
        .raw_pull(Lane::Hot, 0)
        .entries
        .into_iter()
        .filter(|entry| entry.sender != space.raw.device_id)
        .map(|entry| Envelope::decode(&entry.envelope).expect("a pulled envelope decodes"))
        .collect()
}

fn pushed_ids(space: &Space) -> Vec<(Kind, String)> {
    pushed(space)
        .into_iter()
        .map(|envelope| (envelope.header.kind, envelope.header.id))
        .collect()
}

fn sorted(mut kinds: Vec<Kind>) -> Vec<&'static str> {
    kinds.sort_by_key(|kind| kind.as_wire());
    kinds.into_iter().map(Kind::as_wire).collect()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[test]
fn a_cohort_cut_by_a_reused_seq_after_a_replay_keeps_its_stamp() {
    let space = Space::new();
    space.device.add_algorithm("FSRS");
    assert_eq!(
        space.device.outbox().len(),
        2,
        "an algorithm create and its revision share a cohort"
    );
    space.device.execute(
        "CREATE TABLE saved_outbox AS SELECT * FROM sync_outbox; CREATE TABLE saved_cohorts AS SELECT * FROM sync_cohorts;",
    );
    space.device.engine.sync_now().expect("the algorithm is pushed");
    // WHY: only a restored or copied file holds a cohort whose first seq the server consumed with the same bytes and
    // whose second seq it consumed with other bytes. SQL rebuilds one: the second row takes the first row's bytes.
    space.device.execute(
        r#"
        INSERT INTO sync_outbox SELECT * FROM saved_outbox;
        INSERT INTO sync_cohorts SELECT * FROM saved_cohorts;
        UPDATE sync_outbox
        SET envelope = (SELECT envelope FROM saved_outbox ORDER BY sender_seq LIMIT 1),
            digest = (SELECT digest FROM saved_outbox ORDER BY sender_seq LIMIT 1)
        WHERE sender_seq = (SELECT MAX(sender_seq) FROM saved_outbox);
        "#,
    );

    let result = space.device.engine.sync_now();

    assert!(matches!(result, Err(SyncError::Behind)), "{result:?}");
    let outbox = space.device.outbox();
    assert_eq!(outbox.len(), 1, "the replayed row is settled; the reused one stays");
    assert!(
        outbox.iter().all(|row| !row.in_flight),
        "the reused row was not consumed, so it leaves flight"
    );
    assert_eq!(
        space.device.cohort_states(),
        vec!["fixed"],
        "a member was consumed, so the cohort keeps its stamp"
    );
}
