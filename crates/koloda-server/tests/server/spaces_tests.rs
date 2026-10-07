use axum::http::StatusCode;
use koloda_sync_proto::transport::{CreateSpace, DeviceInfo, Enrollment, ErrorCode, SpaceList};

use crate::common::{create_request, nonce, uuid, Harness};

#[tokio::test]
async fn space_creation_enrolls_the_creator_and_replays_by_nonce() {
    let harness = Harness::new();
    let request = create_request("Home", nonce("home"));

    let created = harness
        .post("/v1/spaces")
        .token(&harness.setup_token)
        .body(&request)
        .send::<Enrollment>()
        .await
        .ok();
    // A lost reply is retried with the same nonce.
    let replayed = harness
        .post("/v1/spaces")
        .token(&harness.setup_token)
        .body(&request)
        .send::<Enrollment>()
        .await
        .ok();
    harness.clock.advance(1);
    let other = harness
        .post("/v1/spaces")
        .token(&harness.setup_token)
        .body(&create_request("Home", nonce("other")))
        .send::<Enrollment>()
        .await
        .ok();

    assert_eq!(
        replayed, created,
        "the same nonce returns the same enrollment, token included"
    );
    assert_ne!(other.space_id, created.space_id, "a new nonce creates a second space");
    let creator = harness
        .get(format!(
            "/v1/spaces/{}/devices/{}",
            uuid(created.space_id),
            uuid(created.device_id)
        ))
        .token(&created.token)
        .send::<DeviceInfo>()
        .await
        .ok();
    assert_eq!(creator.name, "Home laptop", "the creator is enrolled with its token");
    let list = harness
        .get("/v1/spaces")
        .token(&harness.setup_token)
        .send::<SpaceList>()
        .await
        .ok();
    let listed: Vec<_> = list.spaces.iter().map(|space| (space.id, space.device_count)).collect();
    assert_eq!(listed, vec![(created.space_id, 1), (other.space_id, 1)]);
}

#[tokio::test]
async fn spaces_need_the_setup_token() {
    let harness = Harness::new();
    let enrollment = harness.create_space("Home").await;

    let cases = [
        ("no token", None),
        ("wrong token", Some("0".repeat(64))),
        ("a device token", Some(enrollment.token.clone())),
    ];
    for (name, token) in cases {
        let mut create = harness.post("/v1/spaces").body(&create_request("Other", nonce(name)));
        let mut list = harness.get("/v1/spaces");
        if let Some(token) = &token {
            create = create.token(token);
            list = list.token(token);
        }

        assert_eq!(
            create.send::<Enrollment>().await.error(),
            (StatusCode::UNAUTHORIZED, ErrorCode::Unauthorized),
            "create with {name}"
        );
        assert_eq!(
            list.send::<SpaceList>().await.error(),
            (StatusCode::UNAUTHORIZED, ErrorCode::Unauthorized),
            "list with {name}"
        );
    }
}

#[tokio::test]
async fn names_must_have_one_to_a_hundred_characters() {
    let harness = Harness::new();
    let cases = [
        ("empty", String::new(), true),
        ("blank", "   ".to_string(), true),
        ("at the limit", "é".repeat(100), false),
        ("one past", "é".repeat(101), true),
    ];
    for (name, space_name, is_rejected) in cases {
        let answer = harness
            .post("/v1/spaces")
            .token(&harness.setup_token)
            .body(&CreateSpace {
                name: space_name,
                ..create_request("unused", nonce(name))
            })
            .send::<Enrollment>()
            .await;

        let status = answer.status;
        assert_eq!(status == StatusCode::BAD_REQUEST, is_rejected, "{name}: {status}");
    }
}

#[tokio::test]
async fn the_operator_list_is_the_http_list() {
    let harness = Harness::new();
    harness.create_space("Home").await;
    harness.create_space("Work").await;

    let listed = harness
        .get("/v1/spaces")
        .token(&harness.setup_token)
        .send::<SpaceList>()
        .await
        .ok();

    assert_eq!(harness.server.spaces().expect("spaces list"), listed);
    assert_eq!(listed.spaces.len(), 2);
}
