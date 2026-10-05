use axum::http::StatusCode;
use koloda_sync_proto::transport::{Enrollment, ErrorCode, MAX_BODY_BYTES};

use crate::common::{create_request, nonce, Harness};

#[tokio::test]
async fn a_body_at_the_size_cap_is_read_and_one_byte_more_is_refused() {
    let harness = Harness::new();

    // WHY: zero bytes decode as CBOR integers, so a body at the cap gets past the size check and fails as CBOR.
    let at_cap = harness
        .post("/v1/spaces")
        .token(&harness.setup_token)
        .raw(vec![0; MAX_BODY_BYTES], None)
        .send::<Enrollment>()
        .await;
    let past_cap = harness
        .post("/v1/spaces")
        .token(&harness.setup_token)
        .raw(vec![0; MAX_BODY_BYTES + 1], None)
        .send::<Enrollment>()
        .await;

    assert_eq!(at_cap.error(), (StatusCode::BAD_REQUEST, ErrorCode::BadRequest));
    assert_eq!(past_cap.error(), (StatusCode::PAYLOAD_TOO_LARGE, ErrorCode::TooLarge));
}

#[tokio::test]
async fn zstd_bodies_decode_within_the_expansion_cap() {
    let harness = Harness::new();
    let mut body = Vec::new();
    ciborium::into_writer(&create_request("Home", nonce("zstd")), &mut body).expect("encode");
    let compressed = zstd::encode_all(body.as_slice(), 3).expect("compress");
    let bomb = zstd::encode_all(vec![0; 1024 * 1024].as_slice(), 3).expect("compress a bomb");

    let accepted = harness
        .post("/v1/spaces")
        .token(&harness.setup_token)
        .raw(compressed, Some("zstd"))
        .accept_zstd()
        .send::<Enrollment>()
        .await;
    let refused = harness
        .post("/v1/spaces")
        .token(&harness.setup_token)
        .raw(bomb, Some("zstd"))
        .send::<Enrollment>()
        .await;

    assert_eq!(
        accepted.content_encoding.as_deref(),
        Some("zstd"),
        "a caller that accepts zstd gets it"
    );
    accepted.ok();
    assert_eq!(refused.error(), (StatusCode::PAYLOAD_TOO_LARGE, ErrorCode::TooLarge));
}

#[tokio::test]
async fn malformed_bodies_are_bad_requests() {
    let harness = Harness::new();
    let mut trailing = Vec::new();
    ciborium::into_writer(&create_request("Home", nonce("trailing")), &mut trailing).expect("encode");
    trailing.push(0);
    let cases = [
        ("not CBOR", vec![0xff, 0x00], None),
        ("bytes after the body", trailing, None),
        ("unknown encoding", vec![0], Some("br")),
    ];
    for (name, bytes, encoding) in cases {
        let answer = harness
            .post("/v1/spaces")
            .token(&harness.setup_token)
            .raw(bytes, encoding)
            .send::<Enrollment>()
            .await;

        assert_eq!(
            answer.error(),
            (StatusCode::BAD_REQUEST, ErrorCode::BadRequest),
            "{name}"
        );
    }
}

#[tokio::test]
async fn an_unknown_endpoint_is_a_not_found_reply() {
    let harness = Harness::new();

    let answer = harness.get("/v1/nothing").send::<()>().await;

    assert_eq!(answer.error(), (StatusCode::NOT_FOUND, ErrorCode::NotFound));
}
