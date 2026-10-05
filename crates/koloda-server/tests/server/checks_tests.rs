use axum::http::StatusCode;
use koloda_sync_proto::envelope::{Header, Refs};
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{ErrorCode, HeldReason, Outcome};
use uuid::Uuid;

use crate::common::{card_create, child, outcomes, stamp, write, Harness};

const ALGORITHM: &str = "algorithm-a";
const TEMPLATE: &str = "template-a";
const DECK: &str = "deck-a";
const OTHER_DECK: &str = "deck-b";
const CARD: &str = "card-a";
const ATTACHMENT: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const HELD_SCHEMA: Outcome = Outcome::Held {
    reason: HeldReason::Schema,
};
const HELD_DEPENDENCY: Outcome = Outcome::Held {
    reason: HeldReason::Dependency,
};

fn create(kind: Kind, id: &str) -> Header {
    write(kind, id, Group::Create, stamp(0, 0, 1))
}

fn with_refs(header: Header, algorithm: Option<&str>, template: Option<&str>) -> Header {
    Header {
        refs: Refs {
            algorithm_id: algorithm.map(str::to_string),
            template_id: template.map(str::to_string),
            ..Refs::default()
        },
        ..header
    }
}

fn at_schema(header: Header, schema: u32) -> Header {
    Header { schema, ..header }
}

#[tokio::test]
async fn an_envelope_must_name_entities_the_space_holds() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    harness
        .push(
            &home,
            vec![
                (1, create(Kind::Algorithms, ALGORITHM)),
                (2, create(Kind::Templates, TEMPLATE)),
                (3, create(Kind::Decks, DECK)),
                (4, create(Kind::Decks, OTHER_DECK)),
                (5, card_create(CARD, DECK, TEMPLATE, stamp(0, 0, 1))),
            ],
        )
        .await
        .ok();
    let later = stamp(1, 0, 1);
    let mut attachment_card = card_create("card-image", DECK, TEMPLATE, later);
    attachment_card.refs.attachment_ids = vec![ATTACHMENT.to_string()];
    let cases = [
        (
            "a card under a deck with no create",
            card_create("card-x", "deck-missing", TEMPLATE, later),
            Outcome::Existence,
        ),
        (
            "a review of a card with no create",
            child(Kind::Reviews, "review-x", "card-missing", Group::Row, later),
            Outcome::Existence,
        ),
        (
            "an update of a deck with no create",
            write(Kind::Decks, "deck-missing", Group::Title, later),
            Outcome::Existence,
        ),
        (
            "a card update naming another deck than its create",
            child(Kind::Cards, CARD, OTHER_DECK, Group::Content, later),
            Outcome::Existence,
        ),
        (
            "a second card create under another deck",
            card_create(CARD, OTHER_DECK, TEMPLATE, later),
            Outcome::Existence,
        ),
        (
            "a card naming a template with no create",
            card_create("card-y", DECK, "template-missing", later),
            Outcome::Existence,
        ),
        (
            "a deck pointer to an algorithm with no create",
            with_refs(
                write(Kind::Decks, DECK, Group::Algorithm, later),
                Some("algorithm-missing"),
                None,
            ),
            Outcome::Existence,
        ),
        (
            "a learning default naming a template with no create",
            with_refs(
                write(Kind::SettingsLearning, "learning", Group::DefaultsTemplate, later),
                None,
                Some("template-missing"),
            ),
            Outcome::Existence,
        ),
        (
            "a learning value, which has no create",
            write(Kind::SettingsLearning, "learning", Group::DailyLimits, later),
            Outcome::Applied,
        ),
        (
            "a card linking an attachment the server never saw",
            attachment_card,
            Outcome::Applied,
        ),
        (
            "a deck pointer to a live algorithm",
            with_refs(write(Kind::Decks, DECK, Group::Algorithm, later), Some(ALGORITHM), None),
            Outcome::Applied,
        ),
        (
            "a card update under its own deck",
            child(Kind::Cards, CARD, DECK, Group::Content, later),
            Outcome::Applied,
        ),
    ];
    for (seq, (name, header, expected)) in (6..).zip(cases) {
        let reply = harness.push(&home, vec![(seq, header)]).await;

        assert_eq!(outcomes(reply.ok()), vec![(seq, expected, false)], "{name}");
    }
}

#[tokio::test]
async fn a_parent_created_earlier_in_the_same_batch_counts() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;

    let reply = harness
        .push(
            &home,
            vec![
                (1, create(Kind::Templates, TEMPLATE)),
                (2, create(Kind::Decks, DECK)),
                (3, card_create(CARD, DECK, TEMPLATE, stamp(0, 0, 1))),
                (4, child(Kind::Reviews, "review-a", CARD, Group::Row, stamp(1, 0, 1))),
            ],
        )
        .await;

    assert_eq!(
        outcomes(reply.ok()),
        (1..=4).map(|seq| (seq, Outcome::Applied, false)).collect::<Vec<_>>()
    );
}

#[tokio::test]
async fn write_schema_holds_older_writes_and_refuses_newer_ones() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    harness
        .server
        .set_write_schema(Uuid::from_bytes(home.space_id), Kind::Decks, 2)
        .expect("raise the deck write schema");

    let older = harness.push(&home, vec![(1, create(Kind::Decks, DECK))]).await;
    let newer = harness
        .push(
            &home,
            vec![
                (2, create(Kind::Templates, TEMPLATE)),
                (3, at_schema(create(Kind::Decks, OTHER_DECK), 3)),
            ],
        )
        .await;
    let current = harness
        .push(&home, vec![(2, at_schema(create(Kind::Decks, OTHER_DECK), 2))])
        .await;

    assert_eq!(
        outcomes(older.ok()),
        vec![(1, HELD_SCHEMA, false)],
        "holding consumes the seq"
    );
    assert_eq!(newer.error(), (StatusCode::CONFLICT, ErrorCode::SchemaReadOnly));
    assert_eq!(
        outcomes(current.ok()),
        vec![(2, Outcome::Applied, false)],
        "the refused push consumed nothing"
    );
}

#[tokio::test]
async fn a_held_create_holds_what_its_sender_builds_on_it_until_it_lands() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let space = Uuid::from_bytes(home.space_id);
    harness
        .push(&home, vec![(1, create(Kind::Templates, TEMPLATE))])
        .await
        .ok();
    for kind in [Kind::Decks, Kind::Algorithms] {
        harness
            .server
            .set_write_schema(space, kind, 2)
            .expect("raise the write schema");
    }
    let later = stamp(1, 0, 1);

    let held = harness
        .push(
            &home,
            vec![
                (2, create(Kind::Decks, DECK)),
                (3, card_create(CARD, DECK, TEMPLATE, later)),
                (4, child(Kind::Cards, CARD, DECK, Group::Content, later)),
                (5, create(Kind::Algorithms, ALGORITHM)),
                (
                    6,
                    with_refs(
                        write(Kind::SettingsLearning, "learning", Group::DefaultsAlgorithm, later),
                        Some(ALGORITHM),
                        None,
                    ),
                ),
            ],
        )
        .await;
    let other_sender = harness
        .push(&phone, vec![(1, card_create("card-phone", DECK, TEMPLATE, later))])
        .await;
    // The schema clears; the device regenerates its held writes at the tail.
    let regenerated = harness
        .push(
            &home,
            vec![
                (7, at_schema(create(Kind::Decks, DECK), 2)),
                (8, card_create(CARD, DECK, TEMPLATE, later)),
                (9, child(Kind::Cards, CARD, DECK, Group::Content, later)),
            ],
        )
        .await;

    assert_eq!(
        outcomes(held.ok()),
        vec![
            (2, HELD_SCHEMA, false),
            (3, HELD_DEPENDENCY, false),
            (4, HELD_DEPENDENCY, false),
            (5, HELD_SCHEMA, false),
            (6, HELD_DEPENDENCY, false),
        ],
        "a child, an update, and a pointer naming a held create are held"
    );
    assert_eq!(
        outcomes(other_sender.ok()),
        vec![(1, Outcome::Existence, false)],
        "holds are per sender"
    );
    assert_eq!(
        outcomes(regenerated.ok()),
        (7..=9).map(|seq| (seq, Outcome::Applied, false)).collect::<Vec<_>>(),
        "a landed create releases what was held on it, its own held create included"
    );
}
