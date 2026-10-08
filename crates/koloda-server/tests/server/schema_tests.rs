//! Advertised schemas and raising a kind's write schema (`crates/koloda-sync-proto/PROTOCOL.md` §Schema versions).

use std::collections::BTreeMap;

use axum::http::{Method, StatusCode};
use koloda_sync_proto::envelope::Header;
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{
    encode_schemas, DeviceInfo, DeviceList, Empty, Enrollment, ErrorCode, HeldReason, Outcome, SpaceList,
};
use uuid::Uuid;

use crate::common::{outcomes, stamp, uuid, write, Harness};

fn space(device: &Enrollment) -> Uuid {
    Uuid::from_bytes(device.space_id)
}

/// The `koloda-schemas` value of an app that writes `decks` schema `decks` and schema 1 of every other kind.
fn decks_at(decks: u32) -> String {
    encode_schemas(|kind| if kind == Kind::Decks { decks } else { 1 })
}

fn deck_at(schema: u32) -> Header {
    Header {
        schema,
        ..write(Kind::Decks, "deck", Group::Create, stamp(0, 0, 1))
    }
}

/// A device call that sends `schemas`, answered with the space's write schemas as its `meta` reports them.
async fn advertise(harness: &Harness, device: &Enrollment, schemas: &str) -> BTreeMap<String, u32> {
    harness
        .get(format!(
            "/v1/spaces/{}/devices/{}",
            uuid(device.space_id),
            uuid(device.device_id)
        ))
        .token(&device.token)
        .schemas(schemas)
        .send::<DeviceInfo>()
        .await
        .reply
        .meta
        .device
        .expect("a device call carries device meta")
        .write_schema
}

fn raise(harness: &Harness, device: &Enrollment, schema: u32) -> Result<(), ErrorCode> {
    harness
        .server
        .raise_write_schema(space(device), Kind::Decks, schema)
        .map_err(|error| error.code())
}

#[tokio::test]
async fn a_raise_waits_for_every_active_device_to_advertise_the_schema() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;

    let early = harness.push(&home, vec![(1, deck_at(2))]).await;
    assert_eq!(
        early.error(),
        (StatusCode::CONFLICT, ErrorCode::SchemaReadOnly),
        "a schema the space has not raised to is read-only"
    );

    assert_eq!(
        raise(&harness, &home, 2),
        Err(ErrorCode::BadRequest),
        "the phone never advertised"
    );
    advertise(&harness, &home, &decks_at(2)).await;
    advertise(&harness, &phone, &decks_at(1)).await;
    assert_eq!(
        raise(&harness, &home, 2),
        Err(ErrorCode::BadRequest),
        "the phone advertised schema 1"
    );
    advertise(&harness, &phone, &decks_at(2)).await;
    advertise(&harness, &home, &decks_at(1)).await;
    assert_eq!(
        raise(&harness, &home, 2),
        Err(ErrorCode::BadRequest),
        "the latest advertisement counts, so an app that went back to schema 1 blocks the raise"
    );
    advertise(&harness, &home, &decks_at(2)).await;

    assert_eq!(raise(&harness, &home, 2), Ok(()));
    let write_schema = advertise(&harness, &home, &decks_at(2)).await;
    assert_eq!(write_schema["decks"], 2);
    assert_eq!(write_schema["cards"], 1, "only the named kind is raised");

    let older = harness.push(&home, vec![(1, deck_at(1))]).await;
    assert_eq!(
        outcomes(older.ok()),
        vec![(
            1,
            Outcome::Held {
                reason: HeldReason::Schema
            },
            false
        )],
        "a write at the old schema is held once the raise lands"
    );
    let newer = harness.push(&home, vec![(2, deck_at(2))]).await;
    assert_eq!(outcomes(newer.ok()), vec![(2, Outcome::Applied, false)]);
}

#[tokio::test]
async fn a_raise_goes_up_by_exactly_one_version() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    advertise(&harness, &home, &decks_at(3)).await;

    for (name, schema) in [("equal", 1), ("lowering", 0), ("jump by two", 3)] {
        assert_eq!(raise(&harness, &home, schema), Err(ErrorCode::BadRequest), "{name}");
    }
    assert_eq!(raise(&harness, &home, 2), Ok(()));
    for (name, schema) in [("equal", 2), ("lowering", 1), ("jump by two", 4)] {
        assert_eq!(raise(&harness, &home, schema), Err(ErrorCode::BadRequest), "{name}");
    }
    assert_eq!(raise(&harness, &home, 3), Ok(()));

    let unknown = harness
        .server
        .raise_write_schema(Uuid::new_v4(), Kind::Decks, 2)
        .map_err(|error| error.code());
    assert_eq!(unknown, Err(ErrorCode::UnknownSpace));
}

#[tokio::test]
async fn revoked_and_stale_devices_do_not_hold_a_raise_back() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    harness.pair(&home, "Tablet").await;
    advertise(&harness, &home, &decks_at(2)).await;
    advertise(&harness, &phone, &decks_at(1)).await;
    assert_eq!(
        raise(&harness, &home, 2),
        Err(ErrorCode::BadRequest),
        "the phone writes schema 1 and the tablet never advertised"
    );

    harness
        .call(
            Method::DELETE,
            format!("/v1/spaces/{}/devices/{}", uuid(home.space_id), uuid(phone.device_id)),
        )
        .token(&home.token)
        .schemas(&decks_at(2))
        .send::<Empty>()
        .await
        .ok();
    assert_eq!(
        raise(&harness, &home, 2),
        Err(ErrorCode::BadRequest),
        "the tablet is still active"
    );

    // The tablet stays idle 100 days; the home device calls in between, so it never goes stale.
    harness.clock.advance(60 * 24 * 60 * 60 * 1000);
    advertise(&harness, &home, &decks_at(2)).await;
    harness.clock.advance(40 * 24 * 60 * 60 * 1000);
    assert_eq!(raise(&harness, &home, 2), Ok(()));
}

#[tokio::test]
async fn a_device_call_must_carry_a_well_formed_schemas_header() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let path = format!("/v1/spaces/{}/devices", uuid(home.space_id));

    let missing = harness.get(&path).token(&home.token).without_schemas();
    assert_eq!(
        missing.send::<DeviceList>().await.error(),
        (StatusCode::BAD_REQUEST, ErrorCode::BadRequest)
    );
    for malformed in ["", "cards", "cards=", "cards=one", "cards=1,cards=2", "cards=1,"] {
        let call = harness.get(&path).token(&home.token).schemas(malformed);
        assert_eq!(
            call.send::<DeviceList>().await.error(),
            (StatusCode::BAD_REQUEST, ErrorCode::BadRequest),
            "`{malformed}`"
        );
    }

    let newer = harness
        .get(&path)
        .token(&home.token)
        .schemas("cards=1,future_kind=9")
        .send::<DeviceList>()
        .await;
    assert_eq!(newer.status, StatusCode::OK, "a kind this server lacks is accepted");
    let setup = harness
        .get("/v1/spaces")
        .token(&harness.setup_token)
        .without_schemas()
        .send::<SpaceList>()
        .await;
    assert_eq!(setup.status, StatusCode::OK, "only device-token calls advertise");
}
