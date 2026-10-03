use ciborium::Value;
use koloda_sync_proto::envelope::{
    digest, Envelope, EnvelopeError, Header, Part, Refs, MAX_HEADER_BYTES, MAX_PAYLOAD_BYTES,
};
use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use koloda_sync_proto::registry::{Group, Kind, Op, RefName, RegistryError};

fn stamp() -> Stamp {
    Stamp {
        hlc: Hlc::new(1_700_000_000_000, 3).expect("test stamp fits in 48 bits"),
        device: DeviceId([7; 16]),
    }
}

fn header(kind: Kind, id: &str, parent: Option<&str>, group: Option<Group>, op: Op, refs: Refs) -> Header {
    Header {
        kind,
        id: id.to_string(),
        parent: parent.map(str::to_string),
        refs,
        group,
        op,
        stamp: stamp(),
        schema: 1,
        commit_id: [9; 16],
    }
}

fn card_content() -> Header {
    header(
        Kind::Cards,
        "card-1",
        Some("deck-1"),
        Some(Group::Content),
        Op::Write,
        Refs {
            attachment_ids: vec!["aa".to_string(), "bb".to_string()],
            ..Refs::default()
        },
    )
}

/// Re-encodes `card_content()` after editing its CBOR header map, to reach states `Header` cannot build.
fn raw_card_content_header(edit: impl FnOnce(&mut Vec<(Value, Value)>)) -> Vec<u8> {
    let bytes = card_content().encode().expect("base header encodes");
    let value: Value = ciborium::from_reader(bytes.as_slice()).expect("base header is CBOR");
    let mut entries = value.into_map().expect("header must be a CBOR map");
    edit(&mut entries);
    let value = Value::Map(entries);
    let mut out = Vec::new();
    ciborium::into_writer(&value, &mut out).expect("edited header encodes");
    out
}

fn set(entries: &mut Vec<(Value, Value)>, key: &str, value: Value) {
    entries.retain(|(existing, _)| existing.as_text() != Some(key));
    entries.push((Value::Text(key.to_string()), value));
}

#[test]
fn round_trip_is_lossless_and_byte_stable() {
    let envelopes = [
        Envelope {
            header: card_content(),
            payload: vec![1, 2, 3],
        },
        Envelope {
            header: header(Kind::Decks, "deck-1", None, None, Op::Delete, Refs::default()),
            payload: Vec::new(),
        },
        Envelope {
            header: header(
                Kind::SettingsLearning,
                "learning",
                None,
                Some(Group::DefaultsTemplate),
                Op::Write,
                Refs {
                    template_id: Some("template-1".to_string()),
                    ..Refs::default()
                },
            ),
            payload: vec![0xff],
        },
        Envelope {
            header: header(
                Kind::Reviews,
                "review-1",
                Some("card-1"),
                Some(Group::Row),
                Op::Write,
                Refs::default(),
            ),
            payload: vec![4, 5],
        },
    ];

    for envelope in envelopes {
        let bytes = envelope.encode().unwrap();
        let decoded = Envelope::decode(&bytes).unwrap();
        assert_eq!(decoded, envelope);
        let reencoded = decoded.encode().unwrap();
        assert_eq!(reencoded, bytes, "{:?} must have one encoding", envelope.header.kind);
        assert_eq!(digest(&reencoded), digest(&bytes));
    }
}

#[test]
fn digest_is_sha256_of_the_encoded_bytes() {
    // Wire contract pin: SHA-256 of the empty input.
    let empty = digest(&[]);
    assert_eq!(empty.0[..4], [0xe3, 0xb0, 0xc4, 0x42]);
    assert_ne!(digest(&[0]), empty);
}

#[test]
fn decode_enforces_size_limits_at_the_limit_and_one_past() {
    let at_limit = Envelope {
        header: card_content(),
        payload: vec![0; MAX_PAYLOAD_BYTES],
    };
    assert_eq!(Envelope::decode(&at_limit.encode().unwrap()), Ok(at_limit));

    let past_limit = Envelope {
        header: card_content(),
        payload: vec![0; MAX_PAYLOAD_BYTES + 1],
    };
    assert_eq!(
        Envelope::decode(&past_limit.encode().unwrap()),
        Err(EnvelopeError::TooLarge {
            part: Part::Payload,
            len: MAX_PAYLOAD_BYTES + 1,
            max: MAX_PAYLOAD_BYTES,
        })
    );

    // Grow the id until the encoded header is exactly at the limit; the length prefix stays 3 bytes.
    let base_len = header_with_id_len(1_000).encode().unwrap().len();
    let fitting = header_with_id_len(1_000 + MAX_HEADER_BYTES - base_len);
    let fitting_bytes = fitting.encode().unwrap();
    assert_eq!(fitting_bytes.len(), MAX_HEADER_BYTES);
    assert_eq!(Header::decode(&fitting_bytes), Ok(fitting.clone()));

    let both_at_limit = Envelope {
        header: fitting,
        payload: vec![0; MAX_PAYLOAD_BYTES],
    };
    assert_eq!(
        Envelope::decode(&both_at_limit.encode().unwrap()),
        Ok(both_at_limit),
        "frame overhead must fit beside a full header and a full payload"
    );

    let oversized = header_with_id_len(1_001 + MAX_HEADER_BYTES - base_len)
        .encode()
        .unwrap();
    assert_eq!(
        Header::decode(&oversized),
        Err(EnvelopeError::TooLarge {
            part: Part::Header,
            len: MAX_HEADER_BYTES + 1,
            max: MAX_HEADER_BYTES,
        })
    );
}

fn header_with_id_len(len: usize) -> Header {
    Header {
        id: "x".repeat(len),
        ..card_content()
    }
}

#[test]
fn header_validation_follows_the_registry() {
    let no_refs = Refs::default;
    let cases = [
        (
            header(Kind::Cards, "card-1", None, Some(Group::Content), Op::Write, no_refs()),
            EnvelopeError::MissingParent { kind: Kind::Cards },
        ),
        (
            header(
                Kind::Decks,
                "deck-1",
                Some("deck-0"),
                Some(Group::Title),
                Op::Write,
                no_refs(),
            ),
            EnvelopeError::UnexpectedParent { kind: Kind::Decks },
        ),
        (
            header(
                Kind::Decks,
                "deck-1",
                None,
                Some(Group::Algorithm),
                Op::Write,
                no_refs(),
            ),
            EnvelopeError::MissingRef {
                kind: Kind::Decks,
                name: RefName::AlgorithmId,
            },
        ),
        (
            header(
                Kind::Cards,
                "card-1",
                Some("deck-1"),
                Some(Group::Content),
                Op::Write,
                Refs {
                    template_id: Some("template-1".to_string()),
                    ..Refs::default()
                },
            ),
            EnvelopeError::RefNotAllowed {
                kind: Kind::Cards,
                name: RefName::TemplateId,
            },
        ),
        (
            header(
                Kind::Decks,
                "deck-1",
                None,
                None,
                Op::Delete,
                Refs {
                    algorithm_id: Some("algorithm-1".to_string()),
                    ..Refs::default()
                },
            ),
            EnvelopeError::RefNotAllowed {
                kind: Kind::Decks,
                name: RefName::AlgorithmId,
            },
        ),
        (
            header(
                Kind::Cards,
                "card-1",
                Some("deck-1"),
                Some(Group::Content),
                Op::Write,
                Refs {
                    attachment_ids: vec!["bb".to_string(), "aa".to_string()],
                    ..Refs::default()
                },
            ),
            EnvelopeError::NonCanonical {
                reason: "attachment ids are not sorted and unique",
            },
        ),
        (
            header(Kind::Reviews, "review-1", Some("card-1"), None, Op::Delete, no_refs()),
            EnvelopeError::Registry(RegistryError::DeleteNotAllowed { kind: Kind::Reviews }),
        ),
    ];

    for (header, expected) in cases {
        assert_eq!(header.encode(), Err(expected.clone()), "{expected:?}");
    }
}

#[test]
fn decode_rejects_headers_that_do_not_parse_or_validate() {
    let cases = [
        (
            raw_card_content_header(|entries| set(entries, "kind", Value::Text("conversations".to_string()))),
            EnvelopeError::Registry(RegistryError::UnknownKind("conversations".to_string())),
        ),
        (
            raw_card_content_header(|entries| set(entries, "op", Value::Text("delete".to_string()))),
            EnvelopeError::Registry(RegistryError::DeleteWithGroup {
                kind: Kind::Cards,
                group: Group::Content,
            }),
        ),
        (
            raw_card_content_header(|entries| set(entries, "stamp_device", Value::Bytes(vec![7; 15]))),
            EnvelopeError::BadLength {
                field: "stamp_device",
                len: 15,
            },
        ),
        (
            raw_card_content_header(|entries| set(entries, "refs", Value::Map(Vec::new()))),
            EnvelopeError::NonCanonical {
                reason: "an empty refs map is encoded by omitting it",
            },
        ),
    ];
    for (bytes, expected) in cases {
        assert_eq!(Header::decode(&bytes), Err(expected.clone()), "{expected:?}");
    }

    let unknown_field = raw_card_content_header(|entries| set(entries, "extra", Value::Bool(true)));
    assert!(matches!(
        Header::decode(&unknown_field),
        Err(EnvelopeError::Malformed { part: Part::Header, .. })
    ));
}
