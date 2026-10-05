use std::collections::BTreeMap;

use ciborium::Value;
use koloda_sync_proto::transport::{
    ClaimPairing, CreateSpace, DependencyAction, DeviceMeta, Empty, Enrollment, ErrorBody, ErrorCode, HeldReason,
    IssuePairing, KnownId, KnownState, LogEntry, Meta, Outcome, Platform, PullPage, Push, PushItem, PushOutcome, Reply,
    Snapshot, SnapshotPage,
};
use serde::Serialize;

fn cbor<T: Serialize>(value: &T) -> Value {
    let mut bytes = Vec::new();
    ciborium::into_writer(value, &mut bytes).expect("encode");
    ciborium::from_reader(bytes.as_slice()).expect("decode as a CBOR value")
}

fn keys(value: &Value) -> Vec<String> {
    value
        .as_map()
        .expect("a CBOR map")
        .iter()
        .map(|(key, _)| key.as_text().expect("text keys").to_string())
        .collect()
}

fn field<'a>(value: &'a Value, name: &str) -> &'a Value {
    value
        .as_map()
        .expect("a CBOR map")
        .iter()
        .find(|(key, _)| key.as_text() == Some(name))
        .map(|(_, value)| value)
        .expect("the key is present")
}

fn meta(epoch: Option<[u8; 16]>, device: Option<DeviceMeta>) -> Meta {
    Meta {
        server_time_ms: 1_727_000_000_000,
        epoch,
        device,
    }
}

#[test]
fn platforms_travel_as_their_wire_strings() {
    let cases = [
        (Platform::DesktopWin, "desktop-win"),
        (Platform::DesktopMac, "desktop-mac"),
        (Platform::DesktopLinux, "desktop-linux"),
        (Platform::Ios, "ios"),
        (Platform::Android, "android"),
    ];
    for (platform, wire) in cases {
        assert_eq!(cbor(&platform), Value::Text(wire.to_string()), "{platform:?}");
        assert_eq!(Platform::from_wire(wire), Ok(platform));
    }
    assert!(
        Platform::from_wire("windows").is_err(),
        "an unknown platform is refused"
    );
}

#[test]
fn replies_carry_meta_and_exactly_one_of_ok_and_error() {
    let enrollment = Enrollment {
        space_id: [1; 16],
        device_id: [2; 16],
        token: "token".to_string(),
        epoch: [3; 16],
    };
    let ok = Reply {
        meta: meta(None, None),
        ok: Some(enrollment),
        error: None,
    };
    let device_meta = DeviceMeta {
        head_hot: 4,
        head_cold: 2,
        gc_horizon_hot: 0,
        gc_horizon_cold: 0,
        write_schema: BTreeMap::from([("cards".to_string(), 1)]),
        last_sender_seq: 9,
    };
    let error = Reply::<Enrollment> {
        meta: meta(Some([3; 16]), Some(device_meta)),
        ok: None,
        error: Some(ErrorBody {
            code: ErrorCode::UnknownSpace,
            message: "no such space".to_string(),
        }),
    };

    let ok = cbor(&ok);
    let error = cbor(&error);

    assert_eq!(keys(&ok), ["meta", "ok"]);
    assert_eq!(
        keys(field(&ok, "meta")),
        ["server_time_ms"],
        "absent epoch and device are omitted"
    );
    assert_eq!(keys(field(&ok, "ok")), ["space_id", "device_id", "token", "epoch"]);
    assert_eq!(
        field(field(&ok, "ok"), "space_id"),
        &Value::Bytes(vec![1; 16]),
        "ids are 16 raw bytes"
    );
    assert_eq!(keys(&error), ["meta", "error"]);
    assert_eq!(keys(field(&error, "meta")), ["server_time_ms", "epoch", "device"]);
    assert_eq!(
        keys(field(field(&error, "meta"), "device")),
        [
            "head_hot",
            "head_cold",
            "gc_horizon_hot",
            "gc_horizon_cold",
            "write_schema",
            "last_sender_seq"
        ]
    );
    assert_eq!(
        field(field(&error, "error"), "code"),
        &Value::Text("unknown_space".to_string())
    );
}

#[test]
fn outcomes_are_maps_tagged_by_status() {
    let cases = [
        (Outcome::Applied, vec![("status", "applied")]),
        (Outcome::Stale, vec![("status", "stale")]),
        (Outcome::Fenced, vec![("status", "fenced")]),
        (Outcome::Existence, vec![("status", "existence")]),
        (
            Outcome::DependencyFenced {
                action: DependencyAction::DropEntity,
            },
            vec![("status", "dependency_fenced"), ("action", "drop_entity")],
        ),
        (
            Outcome::DependencyFenced {
                action: DependencyAction::RepairPointer,
            },
            vec![("status", "dependency_fenced"), ("action", "repair_pointer")],
        ),
        (
            Outcome::Held {
                reason: HeldReason::Schema,
            },
            vec![("status", "held"), ("reason", "schema")],
        ),
        (
            Outcome::Held {
                reason: HeldReason::Dependency,
            },
            vec![("status", "held"), ("reason", "dependency")],
        ),
        (Outcome::SeqReused, vec![("status", "seq_reused")]),
    ];
    for (outcome, expected) in cases {
        let encoded = cbor(&outcome);
        let fields: Vec<_> = encoded
            .as_map()
            .expect("a CBOR map")
            .iter()
            .map(|(key, value)| (key.as_text().expect("text key"), value.as_text().expect("text value")))
            .collect();

        assert_eq!(fields, expected, "{outcome:?}");
        let mut bytes = Vec::new();
        ciborium::into_writer(&outcome, &mut bytes).expect("encode");
        let decoded: Outcome = ciborium::from_reader(bytes.as_slice()).expect("decode");
        assert_eq!(decoded, outcome);
    }
}

#[test]
fn bodies_keep_their_wire_keys() {
    let entry = LogEntry {
        seq: 1,
        sender: [1; 16],
        sender_seq: 2,
        envelope: vec![3],
    };
    let cases = [
        (
            "create space",
            cbor(&CreateSpace {
                name: "Home".to_string(),
                device_name: "Laptop".to_string(),
                platform: Platform::DesktopLinux,
                nonce: [1; 16],
            }),
            vec!["name", "device_name", "platform", "nonce"],
        ),
        (
            "issue pairing",
            cbor(&IssuePairing { hint: Some(vec![1]) }),
            vec!["hint"],
        ),
        (
            "claim pairing",
            cbor(&ClaimPairing {
                code: "0".to_string(),
                name: "Phone".to_string(),
                platform: Platform::Ios,
                nonce: [1; 16],
            }),
            vec!["code", "name", "platform", "nonce"],
        ),
        (
            "push",
            cbor(&Push {
                items: vec![PushItem {
                    sender_seq: 1,
                    envelope: vec![1],
                }],
            }),
            vec!["items"],
        ),
        (
            "push outcome",
            cbor(&PushOutcome {
                sender_seq: 1,
                outcome: Outcome::Applied,
                replayed: false,
            }),
            vec!["sender_seq", "outcome", "replayed"],
        ),
        (
            "known id",
            cbor(&KnownId {
                kind: "decks".to_string(),
                id: "deck".to_string(),
                state: KnownState::Fenced,
            }),
            vec!["kind", "id", "state"],
        ),
        (
            "log entry",
            cbor(&entry),
            vec!["seq", "sender", "sender_seq", "envelope"],
        ),
        (
            "pull page",
            cbor(&PullPage {
                entries: vec![entry.clone()],
                scanned_through: 1,
                has_more: false,
            }),
            vec!["entries", "scanned_through", "has_more"],
        ),
        (
            "snapshot",
            cbor(&Snapshot {
                snapshot_id: [1; 16],
                counts: BTreeMap::new(),
                bytes: 0,
                head_hot: 0,
                head_cold: 0,
                ttl_ms: 0,
                expires_at: 0,
                absolute_expiry: 0,
            }),
            vec![
                "snapshot_id",
                "counts",
                "bytes",
                "head_hot",
                "head_cold",
                "ttl_ms",
                "expires_at",
                "absolute_expiry",
            ],
        ),
        (
            "snapshot page",
            cbor(&SnapshotPage {
                entries: vec![entry],
                next: 1,
                done: true,
            }),
            vec!["entries", "next", "done"],
        ),
        ("empty", cbor(&Empty {}), vec![]),
    ];
    for (name, encoded, expected) in cases {
        assert_eq!(keys(&encoded), expected, "{name}");
    }
}
