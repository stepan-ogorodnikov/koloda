use std::collections::BTreeMap;
use std::net::SocketAddr;

use axum::http::StatusCode;
use koloda_sync_proto::registry::{Group, Kind, Lane};
use koloda_sync_proto::transport::{
    DeviceInfo, ErrorCode, IssuePairing, Outcome, Pairing, PairingClaim, PairingPreview, PreviewPairing, MAX_HINT_BYTES,
};
use rusqlite::Connection;
use uuid::Uuid;

use crate::common::{
    card_create, child, claim_request, nonce, outcomes, stamp, token, tombstone, uuid, write, Enrolled, Harness,
    START_MS,
};

const CODE_TTL_MS: u64 = 10 * 60 * 1000;

async fn issue(harness: &Harness, space: &Enrolled, token: &str, hint: Option<Vec<u8>>) -> Pairing {
    harness
        .post(format!("/v1/spaces/{}/pairings", uuid(space.space_id)))
        .token(token)
        .body(&IssuePairing { hint })
        .send::<Pairing>()
        .await
        .ok()
}

fn peer(last_octet: u8) -> SocketAddr {
    SocketAddr::from(([203, 0, 113, last_octet], 4000))
}

#[tokio::test]
async fn a_claimed_code_enrolls_a_device_with_its_own_token() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let hint = Some(b"interface settings".to_vec());
    let pairing = issue(&harness, &home, &home.token, hint.clone()).await;
    assert_eq!(pairing.code.len(), 10);
    assert_eq!(pairing.expires_at, START_MS + CODE_TTL_MS);

    let preview = harness
        .post("/v1/pairings/preview")
        .body(&PreviewPairing {
            code: pairing.code.clone(),
        })
        .send::<PairingPreview>()
        .await
        .ok();
    let claim = claim_request(&pairing.code, "Phone", nonce("phone"));
    let claimed = harness
        .post("/v1/pairings/claim")
        .body(&claim)
        .send::<PairingClaim>()
        .await
        .ok();
    // A lost reply is retried with the same nonce.
    let replayed = harness
        .post("/v1/pairings/claim")
        .body(&claim)
        .send::<PairingClaim>()
        .await
        .ok();

    assert_eq!(preview.name, "Home");
    assert_eq!((preview.space_id, preview.epoch), (home.space_id, home.epoch));
    assert_eq!(claimed.hint, hint, "the claim returns the inviting device's setup hint");
    assert_eq!(replayed, claimed, "the same nonce and token return the same device");
    let joined = claimed.enrollment;
    assert_eq!((joined.space_id, joined.epoch), (home.space_id, home.epoch));
    assert_ne!(joined.device_id, home.device_id);
    let record = harness
        .get(format!(
            "/v1/spaces/{}/devices/{}",
            uuid(joined.space_id),
            uuid(joined.device_id)
        ))
        .token(&claim.token)
        .send::<DeviceInfo>()
        .await
        .ok();
    assert_eq!(record.name, "Phone");
}

#[tokio::test]
async fn a_claim_retried_with_another_token_fails_and_a_malformed_token_is_bad_request() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let pairing = issue(&harness, &home, &home.token, None).await;
    let claim = claim_request(&pairing.code, "Phone", nonce("phone"));
    let claimed = harness
        .post("/v1/pairings/claim")
        .body(&claim)
        .send::<PairingClaim>()
        .await
        .ok();

    let mut other = claim.clone();
    other.token = token(&nonce("other"));
    let refused = harness
        .post("/v1/pairings/claim")
        .body(&other)
        .send::<PairingClaim>()
        .await;
    assert_eq!(refused.error(), (StatusCode::NOT_FOUND, ErrorCode::PairingFailed));

    let mut malformed = claim.clone();
    malformed.token = "not-a-token".to_string();
    let malformed = harness
        .post("/v1/pairings/claim")
        .body(&malformed)
        .send::<PairingClaim>()
        .await;
    assert_eq!(malformed.error(), (StatusCode::BAD_REQUEST, ErrorCode::BadRequest));

    let record = harness
        .get(format!(
            "/v1/spaces/{}/devices/{}",
            uuid(claimed.enrollment.space_id),
            uuid(claimed.enrollment.device_id)
        ))
        .token(&claim.token)
        .send::<DeviceInfo>()
        .await
        .ok();
    assert_eq!(record.name, "Phone", "the original token still authenticates");
}

#[tokio::test]
async fn devices_of_the_space_and_the_setup_token_issue_codes() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let work = harness.create_space("Work").await;

    let break_glass = issue(&harness, &home, &harness.setup_token, None).await;
    let claimed = harness
        .post("/v1/pairings/claim")
        .body(&claim_request(&break_glass.code, "Rescue", nonce("rescue")))
        .send::<PairingClaim>()
        .await
        .ok();
    let foreign = harness
        .post(format!("/v1/spaces/{}/pairings", uuid(home.space_id)))
        .token(&work.token)
        .body(&IssuePairing::default())
        .send::<Pairing>()
        .await;
    let missing = harness
        .post(format!("/v1/spaces/{}/pairings", uuid([9; 16])))
        .token(&harness.setup_token)
        .body(&IssuePairing::default())
        .send::<Pairing>()
        .await;
    let oversized = harness
        .post(format!("/v1/spaces/{}/pairings", uuid(home.space_id)))
        .token(&home.token)
        .body(&IssuePairing {
            hint: Some(vec![0; MAX_HINT_BYTES + 1]),
        })
        .send::<Pairing>()
        .await;

    assert_eq!(
        claimed.enrollment.space_id, home.space_id,
        "a break-glass code joins its space"
    );
    assert_eq!(foreign.error(), (StatusCode::NOT_FOUND, ErrorCode::UnknownSpace));
    assert_eq!(missing.error(), (StatusCode::NOT_FOUND, ErrorCode::UnknownSpace));
    assert_eq!(oversized.error(), (StatusCode::PAYLOAD_TOO_LARGE, ErrorCode::TooLarge));
    issue(&harness, &home, &home.token, Some(vec![0; MAX_HINT_BYTES])).await;
}

#[tokio::test]
async fn used_expired_and_wrong_codes_fail_alike() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let used = issue(&harness, &home, &home.token, None).await;
    harness
        .post("/v1/pairings/claim")
        .body(&claim_request(&used.code, "First", nonce("first")))
        .send::<PairingClaim>()
        .await
        .ok();
    let at_expiry = issue(&harness, &home, &home.token, None).await;
    let past_expiry = issue(&harness, &home, &home.token, None).await;
    harness.clock.advance(CODE_TTL_MS);

    let typed = at_expiry.code.to_lowercase().replace('0', "o");
    let typed = format!(
        "{}-{}",
        typed.get(..5).expect("ten characters"),
        typed.get(5..).expect("ten characters")
    );
    harness
        .post("/v1/pairings/claim")
        .body(&claim_request(&typed, "Typed", nonce("typed")))
        .send::<PairingClaim>()
        .await
        .ok();
    harness.clock.advance(1);
    let cases = [
        ("a used code with another nonce", used.code.clone()),
        ("a code one millisecond past its expiry", past_expiry.code.clone()),
        ("a wrong code", "0000000000".to_string()),
    ];
    for (name, code) in cases {
        let preview = harness
            .post("/v1/pairings/preview")
            .body(&PreviewPairing { code: code.clone() })
            .send::<PairingPreview>()
            .await;
        let claim = harness
            .post("/v1/pairings/claim")
            .body(&claim_request(&code, "Second", nonce("second")))
            .send::<PairingClaim>()
            .await;

        assert_eq!(
            preview.error(),
            (StatusCode::NOT_FOUND, ErrorCode::PairingFailed),
            "preview {name}"
        );
        assert_eq!(
            claim.error(),
            (StatusCode::NOT_FOUND, ErrorCode::PairingFailed),
            "claim {name}"
        );
        assert_eq!(
            claim.reply.error.map(|error| error.message),
            Some("unknown, expired, or used pairing code".to_string()),
            "{name}: the reply never says which"
        );
    }
}

#[tokio::test]
async fn wrong_codes_are_limited_per_address_and_server_wide() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let guess = |address: SocketAddr| {
        harness
            .post("/v1/pairings/preview")
            .peer(address)
            .body(&PreviewPairing {
                code: "0000000000".to_string(),
            })
            .send::<PairingPreview>()
    };

    for attempt in 1..=10 {
        let answer = guess(peer(1)).await;
        assert_eq!(
            answer.error().1,
            ErrorCode::PairingFailed,
            "guess {attempt} is within the address limit"
        );
    }
    let limited = guess(peer(1)).await;
    let pairing = issue(&harness, &home, &home.token, None).await;
    let right_code_while_limited = harness
        .post("/v1/pairings/claim")
        .peer(peer(1))
        .body(&claim_request(&pairing.code, "Phone", nonce("phone")))
        .send::<PairingClaim>()
        .await;
    assert_eq!(limited.error(), (StatusCode::TOO_MANY_REQUESTS, ErrorCode::RateLimited));
    assert_eq!(
        right_code_while_limited.error(),
        (StatusCode::TOO_MANY_REQUESTS, ErrorCode::RateLimited)
    );

    // Nine more addresses use up the server-wide limit of 100.
    for address in 2..=10 {
        for _ in 0..10 {
            assert_eq!(guess(peer(address)).await.error().1, ErrorCode::PairingFailed);
        }
    }
    let fresh_address = guess(peer(11)).await;
    assert_eq!(
        fresh_address.error(),
        (StatusCode::TOO_MANY_REQUESTS, ErrorCode::RateLimited)
    );

    harness.clock.advance(60 * 1000);
    assert_eq!(
        guess(peer(1)).await.error().1,
        ErrorCode::PairingFailed,
        "a new window forgets earlier guesses"
    );
}

#[tokio::test]
async fn an_operator_code_enrolls_a_device_over_http() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;

    let pairing = harness
        .server
        .issue_pairing(Uuid::from_bytes(home.space_id))
        .expect("the code is issued");
    let claimed = harness
        .post("/v1/pairings/claim")
        .body(&claim_request(&pairing.code, "Phone", nonce("operator")))
        .send::<PairingClaim>()
        .await
        .ok();

    assert_eq!(claimed.enrollment.space_id, home.space_id);
    assert_eq!(
        harness
            .server
            .issue_pairing(Uuid::new_v4())
            .expect_err("no such space")
            .code(),
        ErrorCode::UnknownSpace
    );
}

/// Fails unless the preview's counts and bytes are what a scan of the space's log finds.
async fn assert_preview_matches_the_log(harness: &Harness, home: &Enrolled, code: &str, step: &str) {
    let preview = harness
        .post("/v1/pairings/preview")
        .body(&PreviewPairing { code: code.to_string() })
        .send::<PairingPreview>()
        .await
        .ok();
    let log = Connection::open(
        harness
            .generation_dir()
            .join("spaces")
            .join(format!("{}.db", uuid(home.space_id))),
    )
    .expect("the space database opens");
    let counts: BTreeMap<String, u64> = log
        .prepare("SELECT kind, count(DISTINCT id) FROM heads WHERE grp <> '' GROUP BY kind")
        .expect("the count prepares")
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .expect("the count runs")
        .collect::<Result<_, _>>()
        .expect("the counts read");
    let bytes: u64 = log
        .query_row("SELECT coalesce(sum(length(bytes)), 0) FROM versions", [], |row| {
            row.get(0)
        })
        .expect("the bytes read");
    assert_eq!((preview.counts, preview.bytes), (counts, bytes), "{step}");
}

#[tokio::test]
async fn the_preview_counts_what_the_log_holds_after_every_kind_of_write() {
    const DECK: &str = "01920000-0000-7000-8000-0000000000d1";
    const OTHER_DECK: &str = "01920000-0000-7000-8000-0000000000d2";
    const TEMPLATE: &str = "01920000-0000-7000-8000-0000000000e1";
    const FIRST: &str = "01920000-0000-7000-8000-0000000000c1";
    const SECOND: &str = "01920000-0000-7000-8000-0000000000c2";
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let code = issue(&harness, &home, &home.token, None).await.code;

    let pushed = harness
        .push(
            &home,
            vec![
                (1, write(Kind::Templates, TEMPLATE, Group::Create, stamp(0, 0, 1))),
                (2, write(Kind::Decks, DECK, Group::Create, stamp(0, 1, 1))),
                (3, write(Kind::Decks, OTHER_DECK, Group::Create, stamp(0, 2, 1))),
                (4, card_create(FIRST, DECK, TEMPLATE, stamp(0, 3, 1))),
                (5, card_create(SECOND, DECK, TEMPLATE, stamp(0, 4, 1))),
                (6, child(Kind::Reviews, "r1", FIRST, Group::Row, stamp(1, 0, 1))),
                (7, child(Kind::Reviews, "r2", SECOND, Group::Row, stamp(1, 1, 1))),
                (8, write(Kind::Decks, DECK, Group::Title, stamp(2, 0, 1))),
                (9, write(Kind::Decks, DECK, Group::Title, stamp(2, 1, 1))),
            ],
        )
        .await
        .ok();
    assert!(outcomes(pushed)
        .iter()
        .all(|(_, outcome, _)| *outcome == Outcome::Applied));
    assert_preview_matches_the_log(&harness, &home, &code, "pushes, the second title compacting the first").await;

    let space = Uuid::from_bytes(home.space_id);
    let create = Connection::open(harness.generation_dir().join("spaces").join(format!("{space}.db")))
        .expect("the space database opens")
        .query_row(
            "SELECT seq FROM versions WHERE kind = 'cards' AND id = ?1 AND grp = 'create'",
            [FIRST],
            |row| row.get(0),
        )
        .expect("the card create is stored");
    let dropping = harness
        .server
        .describe_drop(space, Lane::Hot, create)
        .expect("the create is described");
    harness
        .server
        .drop_envelope(space, &dropping)
        .expect("the create is dropped");
    assert_preview_matches_the_log(&harness, &home, &code, "a dropped create and its server tombstone").await;

    harness
        .push(&home, vec![(10, tombstone(Kind::Decks, DECK, None, stamp(3, 0, 1)))])
        .await
        .ok();
    assert_preview_matches_the_log(&harness, &home, &code, "a delete that cascades to cards and reviews").await;

    let head = harness.pull(&home, "lane=hot&after=0").await.ok().scanned_through;
    harness.pull(&home, &format!("lane=hot&after={head}")).await.ok();
    harness.server.collect_garbage().expect("a collection pass");
    let tombstones: u64 = Connection::open(harness.generation_dir().join("spaces").join(format!("{space}.db")))
        .expect("the space database opens")
        .query_row("SELECT count(*) FROM heads WHERE grp = ''", [], |row| row.get(0))
        .expect("the tombstones count");
    assert_eq!(tombstones, 0, "the pass collected every tombstone");
    assert_preview_matches_the_log(&harness, &home, &code, "collected tombstones").await;
}
