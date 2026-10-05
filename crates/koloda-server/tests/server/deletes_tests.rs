use axum::http::StatusCode;
use koloda_sync_proto::envelope::{Header, Refs};
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{
    DependencyAction, Enrollment, EntityId, ErrorCode, IssuePairing, Known, KnownIds, KnownState, Outcome, Pairing,
    PairingPreview, PreviewPairing, MAX_KNOWN_IDS,
};

use crate::common::{card_create, child, outcomes, stamp, tombstone, uuid, write, Harness};

const DROP: Outcome = Outcome::DependencyFenced {
    action: DependencyAction::DropEntity,
};
const REPAIR: Outcome = Outcome::DependencyFenced {
    action: DependencyAction::RepairPointer,
};

fn create(kind: Kind, id: &str) -> Header {
    write(kind, id, Group::Create, stamp(0, 0, 1))
}

fn pointer(kind: Kind, id: &str, group: Group, algorithm: Option<&str>, template: Option<&str>) -> Header {
    Header {
        refs: Refs {
            algorithm_id: algorithm.map(str::to_string),
            template_id: template.map(str::to_string),
            ..Refs::default()
        },
        ..write(kind, id, group, stamp(2, 0, 1))
    }
}

/// Pushes each header as its own batch, from `first_seq` on, and returns the outcomes.
async fn push_each(harness: &Harness, device: &Enrollment, first_seq: u64, headers: Vec<Header>) -> Vec<Outcome> {
    let mut seen = Vec::new();
    for (seq, header) in (first_seq..).zip(headers) {
        let reply = harness.push(device, vec![(seq, header)]).await.ok();
        seen.extend(reply.outcomes.into_iter().map(|outcome| outcome.outcome));
    }
    seen
}

async fn probe(harness: &Harness, device: &Enrollment, ids: &[(Kind, &str)]) -> Vec<(String, KnownState)> {
    let ids = ids
        .iter()
        .map(|(kind, id)| EntityId {
            kind: kind.as_wire().to_string(),
            id: (*id).to_string(),
        })
        .collect();
    harness
        .post(format!("/v1/spaces/{}/ids/known", uuid(device.space_id)))
        .token(&device.token)
        .body(&KnownIds { ids })
        .send::<Known>()
        .await
        .ok()
        .ids
        .into_iter()
        .map(|known| (known.id, known.state))
        .collect()
}

async fn counts(harness: &Harness, device: &Enrollment) -> Vec<(String, u64)> {
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
        .counts
        .into_iter()
        .collect()
}

#[tokio::test]
async fn a_deck_delete_removes_and_fences_its_cards_and_reviews() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let at = stamp(1, 0, 1);
    harness
        .push(
            &home,
            vec![
                (1, create(Kind::Templates, "template")),
                (2, create(Kind::Decks, "deck")),
                (3, card_create("card-a", "deck", "template", at)),
                (4, card_create("card-b", "deck", "template", at)),
                (5, child(Kind::Reviews, "review-a", "card-a", Group::Row, at)),
                (6, child(Kind::Cards, "card-a", "deck", Group::Scheduling, at)),
            ],
        )
        .await
        .ok();

    let deleted = push_each(
        &harness,
        &home,
        7,
        vec![tombstone(Kind::Decks, "deck", None, stamp(2, 0, 1))],
    )
    .await;
    let after = push_each(
        &harness,
        &home,
        8,
        vec![
            child(Kind::Cards, "card-a", "deck", Group::Content, stamp(3, 0, 1)),
            child(Kind::Reviews, "review-b", "card-a", Group::Row, stamp(3, 0, 1)),
            card_create("card-c", "deck", "template", stamp(3, 0, 1)),
            write(Kind::Decks, "deck", Group::Title, stamp(3, 0, 1)),
            tombstone(Kind::Cards, "card-b", Some("deck"), stamp(3, 0, 1)),
            tombstone(Kind::Decks, "deck", None, stamp(3, 0, 1)),
        ],
    )
    .await;

    assert_eq!(deleted, vec![Outcome::Applied]);
    assert_eq!(
        after,
        vec![
            Outcome::Fenced,
            DROP,
            DROP,
            Outcome::Fenced,
            Outcome::Stale,
            Outcome::Stale
        ],
        "a card update, a review, a card create, a deck update, a card delete, and a second deck delete"
    );
    assert_eq!(
        counts(&harness, &home).await,
        vec![("templates".to_string(), 1)],
        "no head of the deck, its cards, or their reviews is left"
    );
}

#[tokio::test]
async fn a_template_delete_drops_the_cards_that_use_it() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let at = stamp(1, 0, 1);
    harness
        .push(
            &home,
            vec![
                (1, create(Kind::Templates, "template-a")),
                (2, create(Kind::Templates, "template-b")),
                (3, create(Kind::Decks, "deck")),
                (4, card_create("card-a", "deck", "template-a", at)),
                (5, card_create("card-b", "deck", "template-b", at)),
                (6, tombstone(Kind::Templates, "template-a", None, stamp(2, 0, 1))),
            ],
        )
        .await
        .ok();

    let after = push_each(
        &harness,
        &home,
        7,
        vec![
            child(Kind::Cards, "card-a", "deck", Group::Content, stamp(3, 0, 1)),
            child(Kind::Cards, "card-b", "deck", Group::Content, stamp(3, 0, 1)),
            card_create("card-c", "deck", "template-a", stamp(3, 0, 1)),
            pointer(Kind::Decks, "deck", Group::Template, None, Some("template-a")),
        ],
    )
    .await;

    assert_eq!(
        after,
        vec![Outcome::Fenced, Outcome::Applied, DROP, REPAIR],
        "its card is fenced, another template's card lives, a new card on it drops, a pointer to it repairs"
    );
}

#[tokio::test]
async fn an_algorithm_delete_keeps_its_revisions() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    harness
        .push(
            &home,
            vec![
                (1, create(Kind::Algorithms, "algorithm")),
                (
                    2,
                    write(Kind::AlgorithmRevisions, "revision", Group::Row, stamp(0, 0, 1)),
                ),
                (3, create(Kind::Decks, "deck")),
                (4, tombstone(Kind::Algorithms, "algorithm", None, stamp(1, 0, 1))),
            ],
        )
        .await
        .ok();

    let after = push_each(
        &harness,
        &home,
        5,
        vec![
            pointer(Kind::Decks, "deck", Group::Algorithm, Some("algorithm"), None),
            pointer(
                Kind::SettingsLearning,
                "learning",
                Group::DefaultsAlgorithm,
                Some("algorithm"),
                None,
            ),
        ],
    )
    .await;
    let known = probe(
        &harness,
        &home,
        &[(Kind::Algorithms, "algorithm"), (Kind::AlgorithmRevisions, "revision")],
    )
    .await;

    assert_eq!(after, vec![REPAIR, REPAIR], "pointers to a dead algorithm are repaired");
    assert_eq!(
        known,
        vec![
            ("algorithm".to_string(), KnownState::Fenced),
            ("revision".to_string(), KnownState::Live)
        ],
        "history outlives its algorithm"
    );
}

#[tokio::test]
async fn a_tombstone_wins_a_heal_race_in_either_order() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;

    // The tombstone arrives first, for an id the server never held.
    let fence_first = harness
        .push(&home, vec![(1, tombstone(Kind::Decks, "deck-a", None, stamp(5, 0, 1)))])
        .await
        .ok();
    let create_after = harness
        .push(&phone, vec![(1, create(Kind::Decks, "deck-a"))])
        .await
        .ok();
    // The create arrives first.
    let create_first = harness
        .push(&phone, vec![(2, create(Kind::Decks, "deck-b"))])
        .await
        .ok();
    let delete_after = harness
        .push(&home, vec![(2, tombstone(Kind::Decks, "deck-b", None, stamp(5, 0, 1)))])
        .await
        .ok();
    let recreate = harness
        .push(&phone, vec![(3, create(Kind::Decks, "deck-b"))])
        .await
        .ok();

    assert_eq!(outcomes(fence_first), vec![(1, Outcome::Applied, false)]);
    assert_eq!(outcomes(create_after), vec![(1, Outcome::Fenced, false)]);
    assert_eq!(outcomes(create_first), vec![(2, Outcome::Applied, false)]);
    assert_eq!(outcomes(delete_after), vec![(2, Outcome::Applied, false)]);
    assert_eq!(outcomes(recreate), vec![(3, Outcome::Fenced, false)]);
}

#[tokio::test]
async fn the_probe_answers_live_and_fenced_ids_the_space_holds() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let at = stamp(1, 0, 1);
    harness
        .push(
            &home,
            vec![
                (1, create(Kind::Templates, "template")),
                (2, create(Kind::Decks, "deck-live")),
                (3, create(Kind::Decks, "deck-dead")),
                (4, card_create("card-under-dead", "deck-dead", "template", at)),
                (5, tombstone(Kind::Decks, "deck-dead", None, stamp(2, 0, 1))),
            ],
        )
        .await
        .ok();

    let known = probe(
        &harness,
        &home,
        &[
            (Kind::Decks, "deck-unknown"),
            (Kind::Decks, "deck-dead"),
            (Kind::Cards, "card-under-dead"),
            (Kind::Decks, "deck-live"),
            (Kind::Templates, "template"),
        ],
    )
    .await;
    let too_many = harness
        .post(format!("/v1/spaces/{}/ids/known", uuid(home.space_id)))
        .token(&home.token)
        .body(&KnownIds {
            ids: vec![
                EntityId {
                    kind: "decks".to_string(),
                    id: "deck".to_string(),
                };
                MAX_KNOWN_IDS + 1
            ],
        })
        .send::<Known>()
        .await;
    let unknown_kind = harness
        .post(format!("/v1/spaces/{}/ids/known", uuid(home.space_id)))
        .token(&home.token)
        .body(&KnownIds {
            ids: vec![EntityId {
                kind: "notes".to_string(),
                id: "note".to_string(),
            }],
        })
        .send::<Known>()
        .await;

    assert_eq!(
        known,
        vec![
            ("deck-dead".to_string(), KnownState::Fenced),
            ("card-under-dead".to_string(), KnownState::Fenced),
            ("deck-live".to_string(), KnownState::Live),
            ("template".to_string(), KnownState::Live),
        ],
        "in the order asked, without the id the space never held"
    );
    assert_eq!(too_many.error(), (StatusCode::PAYLOAD_TOO_LARGE, ErrorCode::TooLarge));
    assert_eq!(unknown_kind.error(), (StatusCode::BAD_REQUEST, ErrorCode::BadRequest));
}
