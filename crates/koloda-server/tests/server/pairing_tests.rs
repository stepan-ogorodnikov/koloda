use std::net::SocketAddr;

use axum::http::StatusCode;
use koloda_sync_proto::transport::{
    DeviceInfo, Enrollment, ErrorCode, IssuePairing, Pairing, PairingClaim, PairingPreview, PreviewPairing,
    MAX_HINT_BYTES,
};

use crate::common::{claim_request, nonce, uuid, Harness, START_MS};

const CODE_TTL_MS: u64 = 10 * 60 * 1000;

async fn issue(harness: &Harness, space: &Enrollment, token: &str, hint: Option<Vec<u8>>) -> Pairing {
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
    assert_eq!(replayed, claimed, "the same nonce returns the same device and token");
    let joined = claimed.enrollment;
    assert_eq!((joined.space_id, joined.epoch), (home.space_id, home.epoch));
    assert_ne!(joined.device_id, home.device_id);
    let record = harness
        .get(format!(
            "/v1/spaces/{}/devices/{}",
            uuid(joined.space_id),
            uuid(joined.device_id)
        ))
        .token(&joined.token)
        .send::<DeviceInfo>()
        .await
        .ok();
    assert_eq!(record.name, "Phone");
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
