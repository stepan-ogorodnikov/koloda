//! Pull pages that meet an envelope this app cannot read (`crates/koloda-sync-proto/PROTOCOL.md` §Corrupt envelopes,
//! §Schema versions): what applies, where the cursor stops, and which hold is reported.

use std::time::{SystemTime, UNIX_EPOCH};

use ciborium::Value;
use koloda::app::db::Database;
use koloda::domain::cards::UpdateCardProgress;
use koloda::domain::decks::{UpdateDeckData, UpdateDeckValues};
use koloda::domain::lessons::LessonResultData;
use koloda::domain::reviews::InsertReviewData;
use koloda::repo::cards::get_card;
use koloda::repo::decks::{get_deck, update_deck};
use koloda::repo::lessons::submit_lesson_result;
use koloda::repo::sync::apply::{apply_page, apply_snapshot_page, Applied, Hold, HoldReason, Page, PageEntry};
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::payload::{CardReset, Delete, Payload, Review, SCHEMA};
use koloda_sync_proto::registry::{Kind, Lane};
use uuid::Uuid;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use crate::common::sync::{count, cursor, device, outbox, register, replica, sealed, stamp, starter};

/// Which pending write a case damages: its kind, id, and group.
type Target = fn(&Written) -> (Kind, String, &'static str);
type Damage = fn(&Envelope) -> Vec<u8>;

struct Written {
    deck: String,
    first: String,
    second: String,
}

/// On the writer: an algorithm, a template, a deck, a card, a deck rename, then a second card, in that order.
fn write_deck(writer: &Database) -> Written {
    let algorithm = add_algorithm(writer, "FSRS");
    let template = add_template(writer, "Basic");
    let deck = add_deck(writer, &algorithm, &template, "Spanish");
    let first = add_card(writer, &deck, &template, "hola");
    let current = get_deck(writer, &deck).expect("deck reads").expect("deck exists");
    update_deck(
        writer,
        UpdateDeckData {
            id: deck.clone(),
            values: UpdateDeckValues {
                title: "Renamed".to_string(),
                algorithm_id: current.algorithm_id,
                template_id: current.template_id,
                notes: current.notes,
            },
        },
    )
    .expect("deck renames");
    let second = add_card(writer, &deck, &template, "adiós");
    Written { deck, first, second }
}

fn grade(db: &Database, card: &str) {
    submit_lesson_result(
        db,
        LessonResultData {
            card: UpdateCardProgress {
                id: card.to_string(),
                state: 2,
                due_at: 1_900_000_000_000,
                stability: 5.5,
                difficulty: 4.25,
                scheduled_days: 9,
                learning_steps: 0,
                reps: 1,
                lapses: 0,
                last_reviewed_at: Some(1_800_000_000_000),
            },
            review: InsertReviewData {
                card_id: card.to_string(),
                rating: 3,
                state: 2,
                due_at: 1_900_000_000_000,
                stability: 5.5,
                difficulty: 4.25,
                scheduled_days: 9,
                learning_steps: 0,
                time: 12,
                is_ignored: false,
            },
        },
    )
    .expect("grade submits");
}

/// The writer's pending envelopes in one lane as one page from it, each at the lane seq of its position.
/// The first entry `pick` matches is replaced by `damage`'s bytes; returns the page and that entry's seq.
fn page_from(
    writer: &Database,
    lane: Lane,
    pick: impl Fn(&Envelope) -> bool,
    damage: impl Fn(&Envelope) -> Vec<u8>,
) -> (Page, i64) {
    let sender = device(writer);
    let mut damaged = None;
    let entries: Vec<PageEntry> = outbox(writer)
        .into_iter()
        .filter(|entry| entry.envelope.header.kind.spec().lane == lane)
        .enumerate()
        .map(|(index, entry)| {
            let seq = i64::try_from(index).expect("index fits") + 1;
            let envelope = if damaged.is_none() && pick(&entry.envelope) {
                damaged = Some(seq);
                damage(&entry.envelope)
            } else {
                entry.envelope.encode().expect("envelope encodes")
            };
            PageEntry {
                seq,
                sender,
                sender_seq: entry.sender_seq,
                envelope,
            }
        })
        .collect();
    let scanned_through = i64::try_from(entries.len()).expect("length fits");
    (
        Page {
            lane,
            entries,
            scanned_through,
        },
        damaged.expect("an entry matches the pick"),
    )
}

fn whole_page(writer: &Database, lane: Lane) -> Page {
    let (page, _) = page_from(
        writer,
        lane,
        |_| true,
        |envelope| envelope.encode().expect("envelope encodes"),
    );
    page
}

fn is_group<'a>(kind: Kind, id: &'a str, group: &'static str) -> impl Fn(&Envelope) -> bool + 'a {
    move |envelope| {
        envelope.header.kind == kind
            && envelope.header.id == id
            && envelope.header.group.map(|group| group.as_wire()) == Some(group)
    }
}

fn unreadable_payload(envelope: &Envelope) -> Vec<u8> {
    Envelope {
        header: envelope.header.clone(),
        payload: vec![0xff, 0x00],
    }
    .encode()
    .expect("envelope encodes")
}

fn garbage(_: &Envelope) -> Vec<u8> {
    vec![0xff, 0x00, 0x13]
}

/// The envelope with the first occurrence of `from` in its bytes replaced by `to`, which has the same length, so the
/// CBOR stays well-formed.
fn renamed(envelope: &Envelope, from: &str, to: &str) -> Vec<u8> {
    assert_eq!(from.len(), to.len());
    let mut bytes = envelope.encode().expect("envelope encodes");
    let at = bytes
        .windows(from.len())
        .position(|window| window == from.as_bytes())
        .expect("the envelope holds the text");
    bytes
        .get_mut(at..at + from.len())
        .expect("the text is inside the bytes")
        .copy_from_slice(to.as_bytes());
    bytes
}

/// `map`'s CBOR with one more key, as a newer app would write it.
fn with_key(map: &[u8], key: &str) -> Vec<u8> {
    let mut entries = ciborium::from_reader::<Value, _>(map)
        .expect("the map is CBOR")
        .into_map()
        .expect("the CBOR is a map");
    entries.push((Value::Text(key.to_string()), Value::Bytes(vec![1; 16])));
    let mut bytes = Vec::new();
    ciborium::into_writer(&Value::Map(entries), &mut bytes).expect("the map encodes");
    bytes
}

fn with_header_key(envelope: &Envelope) -> Vec<u8> {
    let header = with_key(&envelope.header.encode().expect("header encodes"), "key_id");
    let frame = Value::Map(vec![
        (Value::Text("header".to_string()), Value::Bytes(header)),
        (
            Value::Text("payload".to_string()),
            Value::Bytes(envelope.payload.clone()),
        ),
    ]);
    let mut bytes = Vec::new();
    ciborium::into_writer(&frame, &mut bytes).expect("the frame encodes");
    bytes
}

fn with_payload_key(envelope: &Envelope) -> Vec<u8> {
    Envelope {
        header: envelope.header.clone(),
        payload: with_key(&envelope.payload, "subtitle"),
    }
    .encode()
    .expect("envelope encodes")
}

fn at_schema(envelope: &Envelope, schema: u32) -> Vec<u8> {
    let mut envelope = envelope.clone();
    envelope.header.schema = schema;
    envelope.encode().expect("envelope encodes")
}

fn apply_held(db: &Database, page: &Page) -> Applied {
    apply_page(db, page, &starter()).expect("page applies")
}

fn hold(lane: Lane, seq: i64, reason: HoldReason) -> Option<Hold> {
    Some(Hold { lane, seq, reason })
}

fn now_ms() -> u64 {
    u64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock is past the epoch")
            .as_millis(),
    )
    .expect("now fits")
}

#[test]
fn a_corrupt_create_or_update_stops_the_hot_page_before_it() {
    // Which entry is damaged, and whether the first card, the rename, and the second card applied.
    let cases: [(&str, Target, [bool; 3]); 2] = [
        (
            "card create",
            |written| (Kind::Cards, written.first.clone(), "create"),
            [false, false, false],
        ),
        (
            "deck title",
            |written| (Kind::Decks, written.deck.clone(), "title"),
            [true, false, false],
        ),
    ];
    for (case, target, [has_first, is_renamed, has_second]) in cases {
        let (writer, reader) = (replica(), replica());
        let written = write_deck(&writer);
        let (kind, id, group) = target(&written);
        let (page, seq) = page_from(&writer, Lane::Hot, is_group(kind, &id, group), unreadable_payload);

        let applied = apply_held(&reader, &page);

        assert_eq!(
            applied.hold,
            hold(Lane::Hot, seq, HoldReason::CorruptEnvelope),
            "{case}"
        );
        assert_eq!(
            cursor(&reader, Lane::Hot),
            seq - 1,
            "{case}: the cursor stops below the entry"
        );
        let deck = get_deck(&reader, &written.deck)
            .unwrap()
            .expect("the deck before it applied");
        assert_eq!(deck.title == "Renamed", is_renamed, "{case}");
        assert_eq!(
            get_card(&reader, &written.first).unwrap().is_some(),
            has_first,
            "{case}"
        );
        assert_eq!(
            get_card(&reader, &written.second).unwrap().is_some(),
            has_second,
            "{case}"
        );
    }
}

#[test]
fn a_corrupt_review_stops_the_cold_page_before_it() {
    let (writer, reader) = (replica(), replica());
    let written = write_deck(&writer);
    for _ in 0..3 {
        grade(&writer, &written.first);
    }
    apply_held(&reader, &whole_page(&writer, Lane::Hot));
    let middle = outbox(&writer)
        .into_iter()
        .filter(|entry| entry.envelope.header.kind == Kind::Reviews)
        .nth(1)
        .expect("three reviews are pending")
        .envelope
        .header
        .id;
    let (page, seq) = page_from(
        &writer,
        Lane::Cold,
        |envelope| envelope.header.id == middle,
        unreadable_payload,
    );

    let applied = apply_held(&reader, &page);

    assert_eq!(applied.hold, hold(Lane::Cold, seq, HoldReason::CorruptEnvelope));
    assert_eq!(seq, 2);
    assert_eq!(cursor(&reader, Lane::Cold), 1);
    assert_eq!(
        count(&reader, "SELECT COUNT(*) FROM reviews"),
        1,
        "only the review before it applied"
    );
}

#[test]
fn a_corrupt_delete_applies_from_its_header_without_its_successor() {
    for is_damaged in [false, true] {
        let reader = replica();
        let dying = add_algorithm(&reader, "Dying");
        let lowest = add_algorithm(&reader, "Lowest");
        let successor = add_algorithm(&reader, "Successor");
        let template = add_template(&reader, "Basic");
        let deck = add_deck(&reader, &dying, &template, "Spanish");
        let remote = Uuid::now_v7();
        let delete = Envelope::decode(&sealed(
            &dying,
            None,
            stamp(remote, now_ms()),
            &Payload::Delete {
                kind: Kind::Algorithms,
                delete: Delete {
                    successor: Some(successor.clone()),
                },
            },
        ))
        .unwrap();
        let bytes = if is_damaged {
            unreadable_payload(&delete)
        } else {
            delete.encode().unwrap()
        };
        let page = Page {
            lane: Lane::Hot,
            entries: vec![PageEntry {
                seq: 1,
                sender: remote,
                sender_seq: 1,
                envelope: bytes,
            }],
            scanned_through: 1,
        };

        let applied = apply_held(&reader, &page);

        let case = format!("damaged: {is_damaged}");
        assert_eq!(applied.hold, None, "{case}");
        assert_eq!(cursor(&reader, Lane::Hot), 1, "{case}: the cursor passes the delete");
        assert_eq!(
            count(
                &reader,
                &format!("SELECT COUNT(*) FROM algorithms WHERE id = '{dying}'")
            ),
            0,
            "{case}"
        );
        let expected = if is_damaged { &lowest } else { &successor };
        assert_eq!(
            &get_deck(&reader, &deck).unwrap().unwrap().algorithm_id,
            expected,
            "{case}"
        );
    }
}

#[test]
fn a_corrupt_reset_applies_from_its_header() {
    let reader = replica();
    let algorithm = add_algorithm(&reader, "FSRS");
    let template = add_template(&reader, "Basic");
    let deck = add_deck(&reader, &algorithm, &template, "Spanish");
    let card = add_card(&reader, &deck, &template, "hola");
    grade(&reader, &card);
    let remote = Uuid::now_v7();
    let wall_ms = now_ms() + 60_000;
    let reset = Envelope::decode(&sealed(
        &card,
        Some(&deck),
        stamp(remote, wall_ms),
        &Payload::CardReset(CardReset { wall_ms: 1 }),
    ))
    .unwrap();
    let page = Page {
        lane: Lane::Hot,
        entries: vec![PageEntry {
            seq: 1,
            sender: remote,
            sender_seq: 1,
            envelope: unreadable_payload(&reset),
        }],
        scanned_through: 1,
    };

    let applied = apply_held(&reader, &page);

    assert_eq!(applied.hold, None);
    assert_eq!(cursor(&reader, Lane::Hot), 1);
    assert_eq!(
        count(&reader, "SELECT COUNT(*) FROM reviews"),
        0,
        "the reset cuts the earlier review"
    );
    assert_eq!(
        get_card(&reader, &card).unwrap().unwrap().state,
        0,
        "scheduling is blank"
    );
    let register = register(&reader, "cards", &card, "reset").expect("the reset register is written");
    assert_eq!(register.hlc, reset.header.stamp.hlc);
}

#[test]
fn an_unreadable_hot_entry_reports_why() {
    let cases: [(&str, Target, Damage, HoldReason); 9] = [
        (
            "unknown kind",
            |written| (Kind::Decks, written.deck.clone(), "title"),
            |envelope| renamed(envelope, "decks", "dacks"),
            HoldReason::UpdateRequired,
        ),
        (
            "unknown group",
            |written| (Kind::Decks, written.deck.clone(), "title"),
            |envelope| renamed(envelope, "title", "tytle"),
            HoldReason::UpdateRequired,
        ),
        (
            "group outside its kind",
            |written| (Kind::Decks, written.deck.clone(), "title"),
            |envelope| renamed(envelope, "title", "reset"),
            HoldReason::UpdateRequired,
        ),
        (
            "newer schema",
            |written| (Kind::Decks, written.deck.clone(), "title"),
            |envelope| at_schema(envelope, SCHEMA + 1),
            HoldReason::UpdateRequired,
        ),
        (
            "a header key this app lacks",
            |written| (Kind::Decks, written.deck.clone(), "title"),
            with_header_key,
            HoldReason::UpdateRequired,
        ),
        (
            "a payload key this app lacks, which comes only with a schema raise",
            |written| (Kind::Decks, written.deck.clone(), "title"),
            with_payload_key,
            HoldReason::CorruptEnvelope,
        ),
        (
            "schema zero",
            |written| (Kind::Decks, written.deck.clone(), "title"),
            |envelope| at_schema(envelope, 0),
            HoldReason::CorruptEnvelope,
        ),
        (
            "bytes that are not an envelope",
            |written| (Kind::Cards, written.first.clone(), "create"),
            garbage,
            HoldReason::CorruptEnvelope,
        ),
        (
            "a review in the hot lane",
            |written| (Kind::Cards, written.first.clone(), "create"),
            |envelope| {
                let review = Payload::Review(Review {
                    card_id: envelope.header.id.clone(),
                    rating: 3,
                    state: 2,
                    due_at: 1_727_000_000_000,
                    stability: 1.0,
                    difficulty: 5.0,
                    scheduled_days: 1,
                    learning_steps: 0,
                    time: 1_000,
                    is_ignored: false,
                    created_at: 1_727_000_000_000,
                });
                sealed(&Uuid::now_v7().to_string(), None, envelope.header.stamp, &review)
            },
            HoldReason::CorruptEnvelope,
        ),
    ];
    for (case, target, damage, reason) in cases {
        let (writer, reader) = (replica(), replica());
        let written = write_deck(&writer);
        let (kind, id, group) = target(&written);
        let (page, seq) = page_from(&writer, Lane::Hot, is_group(kind, &id, group), damage);

        let applied = apply_held(&reader, &page);

        assert_eq!(applied.hold, hold(Lane::Hot, seq, reason), "{case}");
        assert_eq!(cursor(&reader, Lane::Hot), seq - 1, "{case}");
    }
}

#[test]
fn a_delete_at_a_newer_schema_holds_instead_of_applying() {
    let reader = replica();
    let algorithm = add_algorithm(&reader, "Kept");
    let remote = Uuid::now_v7();
    let delete = Envelope::decode(&sealed(
        &algorithm,
        None,
        stamp(remote, now_ms()),
        &Payload::Delete {
            kind: Kind::Algorithms,
            delete: Delete { successor: None },
        },
    ))
    .unwrap();
    let page = Page {
        lane: Lane::Hot,
        entries: vec![PageEntry {
            seq: 4,
            sender: remote,
            sender_seq: 1,
            envelope: at_schema(&delete, SCHEMA + 1),
        }],
        scanned_through: 4,
    };

    let applied = apply_held(&reader, &page);

    assert_eq!(applied.hold, hold(Lane::Hot, 4, HoldReason::UpdateRequired));
    assert_eq!(cursor(&reader, Lane::Hot), 3);
    assert_eq!(
        count(
            &reader,
            &format!("SELECT COUNT(*) FROM algorithms WHERE id = '{algorithm}'")
        ),
        1,
        "an app that does not know a schema decodes nothing, not even a delete"
    );
}

#[test]
fn a_snapshot_page_stops_at_an_unreadable_entry_and_leaves_the_cursors() {
    let cases: [(&str, Damage, HoldReason); 3] = [
        ("corrupt card create", unreadable_payload, HoldReason::CorruptEnvelope),
        (
            "a header key this app lacks",
            with_header_key,
            HoldReason::UpdateRequired,
        ),
        (
            "unknown kind",
            |envelope| renamed(envelope, "cards", "carts"),
            HoldReason::UpdateRequired,
        ),
    ];
    for (case, damage, reason) in cases {
        let (writer, reader) = (replica(), replica());
        let written = write_deck(&writer);
        let (page, seq) = page_from(
            &writer,
            Lane::Hot,
            is_group(Kind::Cards, &written.first, "create"),
            damage,
        );

        let applied = apply_snapshot_page(&reader, Lane::Hot, &page.entries, &starter()).expect("page applies");

        assert_eq!(applied.hold, hold(Lane::Hot, seq, reason), "{case}");
        assert!(
            get_deck(&reader, &written.deck).unwrap().is_some(),
            "{case}: entries before it applied"
        );
        assert!(get_card(&reader, &written.first).unwrap().is_none(), "{case}");
        assert!(
            get_card(&reader, &written.second).unwrap().is_none(),
            "{case}: nothing after it applied"
        );
        assert_eq!(
            (cursor(&reader, Lane::Hot), cursor(&reader, Lane::Cold)),
            (0, 0),
            "{case}"
        );
    }
}
