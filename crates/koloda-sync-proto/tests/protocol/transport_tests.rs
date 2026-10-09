use std::collections::BTreeMap;
use std::num::NonZeroU32;

use ciborium::Value;
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::{
    check_token, decode_schemas, encode_schemas, AttachmentBody, ClaimPairing, CreateSpace, Cutoff, DependencyAction,
    DeviceInfo, DeviceMeta, Empty, Enrollment, ErrorBody, ErrorCode, Heads, HeldReason, IssuePairing, KnownId,
    KnownState, LogEntry, Meta, Outcome, Platform, PullPage, Push, PushItem, PushOutcome, Reply, Restore, RestoreMode,
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
        is_over_quota: false,
    };
    let error = Reply::<Enrollment> {
        meta: meta(Some([3; 16]), Some(device_meta)),
        ok: None,
        error: Some(ErrorBody {
            code: ErrorCode::UnknownSpace,
            message: "no such space".to_string(),
            restore: None,
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
    assert_eq!(keys(field(&ok, "ok")), ["space_id", "device_id", "epoch"]);
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
            "last_sender_seq",
            "is_over_quota"
        ]
    );
    assert_eq!(
        keys(field(&error, "error")),
        ["code", "message"],
        "an absent restore is omitted"
    );
    assert_eq!(
        field(field(&error, "error"), "code"),
        &Value::Text("unknown_space".to_string())
    );
}

#[test]
fn an_epoch_changed_error_carries_the_restore_to_apply() {
    let error = Reply::<Enrollment> {
        meta: meta(Some([5; 16]), None),
        ok: None,
        error: Some(ErrorBody {
            code: ErrorCode::EpochChanged,
            message: "this space was restored".to_string(),
            restore: Some(Restore {
                epoch: [5; 16],
                mode: RestoreMode::Authoritative,
                head_hot: 40,
                head_cold: 9,
                cutoffs: vec![Cutoff {
                    sender: [6; 16],
                    last_seq: 12,
                }],
            }),
        }),
    };

    let error = cbor(&error);
    let body = field(&error, "error");

    assert_eq!(field(body, "code"), &Value::Text("epoch_changed".to_string()));
    let restore = field(body, "restore");
    assert_eq!(keys(restore), ["epoch", "mode", "head_hot", "head_cold", "cutoffs"]);
    assert_eq!(field(restore, "epoch"), &Value::Bytes(vec![5; 16]));
    assert_eq!(field(restore, "mode"), &Value::Text("authoritative".to_string()));
    let Value::Array(cutoffs) = field(restore, "cutoffs") else {
        panic!("cutoffs are an array");
    };
    assert_eq!(keys(&cutoffs[0]), ["sender", "last_seq"]);
    assert_eq!(field(&cutoffs[0], "sender"), &Value::Bytes(vec![6; 16]));
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
        (
            Outcome::Held {
                reason: HeldReason::Quota,
            },
            vec![("status", "held"), ("reason", "quota")],
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
                token: "ab".repeat(32),
            }),
            vec!["name", "device_name", "platform", "nonce", "token"],
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
                token: "ab".repeat(32),
            }),
            vec!["code", "name", "platform", "nonce", "token"],
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
                missing_attachments: Vec::new(),
            }),
            vec!["sender_seq", "outcome", "replayed"],
        ),
        (
            "push outcome with missing attachments",
            cbor(&PushOutcome {
                sender_seq: 1,
                outcome: Outcome::Stale,
                replayed: true,
                missing_attachments: vec!["a".repeat(64)],
            }),
            vec!["sender_seq", "outcome", "replayed", "missing_attachments"],
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
            "heads",
            cbor(&Heads {
                head_hot: 1,
                head_cold: 2,
            }),
            vec!["head_hot", "head_cold"],
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
        (
            "device record",
            cbor(&DeviceInfo {
                id: [1; 16],
                name: "Phone".to_string(),
                platform: Platform::Android,
                created_at: 1,
                last_seen: 2,
                last_sender_seq: 3,
                last_sender_digest: Some([4; 32]),
                cursor_hot: 5,
                cursor_cold: 6,
                revoked_at: Some(7),
                rebase_required: true,
            }),
            vec![
                "id",
                "name",
                "platform",
                "created_at",
                "last_seen",
                "last_sender_seq",
                "last_sender_digest",
                "cursor_hot",
                "cursor_cold",
                "revoked_at",
                "rebase_required",
            ],
        ),
        (
            "attachment",
            cbor(&AttachmentBody {
                mime: "image/png".to_string(),
                width: NonZeroU32::new(1),
                height: NonZeroU32::new(2),
                bytes: vec![1],
            }),
            vec!["mime", "width", "height", "bytes"],
        ),
        ("empty", cbor(&Empty {}), vec![]),
    ];
    for (name, encoded, expected) in cases {
        assert_eq!(keys(&encoded), expected, "{name}");
    }
}

#[test]
fn schemas_travel_as_kind_schema_pairs_in_registry_order() {
    let encoded = encode_schemas(|kind| if kind == Kind::Decks { 2 } else { 1 });
    assert_eq!(
        encoded, "cards=1,reviews=1,decks=2,templates=1,algorithms=1,algorithm_revisions=1,settings.learning=1",
        "every registry kind, in registry order"
    );
    let decoded = decode_schemas(&encoded).expect("an encoded value decodes");
    assert_eq!(decoded.len(), Kind::ALL.len());
    assert_eq!(decoded["decks"], 2);
    assert_eq!(decoded["settings.learning"], 1);

    let newer = decode_schemas("cards=3,future_kind=7").expect("a kind this build lacks is kept as text");
    assert_eq!(
        newer,
        BTreeMap::from([("cards".to_string(), 3), ("future_kind".to_string(), 7)])
    );

    let malformed = [
        ("empty", ""),
        ("no schema", "cards"),
        ("empty schema", "cards="),
        ("empty kind", "=1"),
        ("not a number", "cards=one"),
        ("negative", "cards=-1"),
        ("signed", "cards=+1"),
        ("past u32", "cards=4294967296"),
        ("two equals", "cards=1=2"),
        ("trailing comma", "cards=1,"),
        ("repeated kind", "cards=1,cards=2"),
        ("spaced", "cards=1, decks=1"),
    ];
    for (name, text) in malformed {
        assert!(decode_schemas(text).is_err(), "{name}: `{text}` is refused");
    }
}

#[test]
fn a_token_is_64_lowercase_hex_characters() {
    check_token(&"ab".repeat(32)).expect("64 lowercase hex is a token");
    for token in [
        String::new(),
        "ab".repeat(31),
        "ab".repeat(33),
        "AB".repeat(32),
        "zz".repeat(32),
    ] {
        assert!(check_token(&token).is_err(), "{token}");
    }
}
