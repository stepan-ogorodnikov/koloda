use ciborium::Value;
use koloda_sync_proto::envelope::{
    digest, Envelope, EnvelopeError, Header, Part, Refs, MAX_HEADER_BYTES, MAX_PAYLOAD_BYTES,
};
use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use koloda_sync_proto::payload::SCHEMA;
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

fn raw_card_content_header(edit: impl FnOnce(&mut Vec<(Value, Value)>)) -> Vec<u8> {
    raw_header(&card_content(), edit)
}

/// Re-encodes `base` after editing its CBOR header map, to reach states `Header` cannot build.
fn raw_header(base: &Header, edit: impl FnOnce(&mut Vec<(Value, Value)>)) -> Vec<u8> {
    let bytes = base.encode().expect("base header encodes");
    let value: Value = ciborium::from_reader(bytes.as_slice()).expect("base header is CBOR");
    let mut entries = value.into_map().expect("header must be a CBOR map");
    edit(&mut entries);
    let value = Value::Map(entries);
    let mut out = Vec::new();
    ciborium::into_writer(&value, &mut out).expect("edited header encodes");
    out
}

/// Replaces `key` where it stands, so the edit does not also reorder the map, or appends it when absent.
fn set(entries: &mut Vec<(Value, Value)>, key: &str, value: Value) {
    match entries.iter_mut().find(|(existing, _)| existing.as_text() == Some(key)) {
        Some((_, existing)) => *existing = value,
        None => entries.push((Value::Text(key.to_string()), value)),
    }
}

/// `bytes` with the one occurrence of `from` replaced by `to`.
fn spliced(bytes: &[u8], from: &[u8], to: &[u8]) -> Vec<u8> {
    let at = bytes
        .windows(from.len())
        .position(|window| window == from)
        .expect("the bytes hold the pattern");
    let before = bytes.get(..at).expect("the pattern starts inside the bytes");
    let after = bytes.get(at + from.len()..).expect("the pattern ends inside the bytes");
    [before, to, after].concat()
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
            header(
                Kind::Cards,
                "card-1",
                Some("deck-1"),
                Some(Group::Content),
                Op::Write,
                Refs {
                    attachment_ids: vec!["aa".to_string(), "aa".to_string()],
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
    let template_ref = || {
        Value::Map(vec![(
            Value::Text("template_id".to_string()),
            Value::Text("template-1".to_string()),
        )])
    };
    let newer_schema = || Value::Integer((SCHEMA + 1).into());
    let deck_algorithm = header(
        Kind::Decks,
        "deck-1",
        None,
        Some(Group::Algorithm),
        Op::Write,
        Refs {
            algorithm_id: Some("algorithm-1".to_string()),
            ..Refs::default()
        },
    );
    let not_canonical = EnvelopeError::NonCanonical {
        reason: "the header is not in its one encoding",
    };
    let canonical = card_content().encode().expect("header encodes");
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
        (
            raw_card_content_header(|entries| set(entries, "refs", template_ref())),
            EnvelopeError::RefNotAllowed {
                kind: Kind::Cards,
                name: RefName::TemplateId,
            },
        ),
        (
            raw_card_content_header(|entries| {
                set(entries, "refs", template_ref());
                set(entries, "schema", newer_schema());
            }),
            EnvelopeError::NewerSchema {
                kind: Kind::Cards,
                schema: SCHEMA + 1,
            },
        ),
        (
            raw_card_content_header(|entries| {
                entries.retain(|(key, _)| key.as_text() != Some("parent"));
                set(entries, "schema", newer_schema());
            }),
            EnvelopeError::NewerSchema {
                kind: Kind::Cards,
                schema: SCHEMA + 1,
            },
        ),
        (
            raw_card_content_header(|entries| entries.reverse()),
            not_canonical.clone(),
        ),
        ([canonical.clone(), vec![0, 0, 0]].concat(), not_canonical.clone()),
        (
            spliced(&canonical, b"\x66schema\x01", b"\x66schema\x1a\x00\x00\x00\x01"),
            not_canonical.clone(),
        ),
        (
            raw_card_content_header(|entries| {
                let refs = Value::Map(vec![
                    (Value::Text("algorithm_id".to_string()), Value::Null),
                    (
                        Value::Text("attachment_ids".to_string()),
                        Value::Array(vec![Value::Text("aa".to_string()), Value::Text("bb".to_string())]),
                    ),
                ]);
                set(entries, "refs", refs);
            }),
            not_canonical.clone(),
        ),
        (
            raw_header(&deck_algorithm, |entries| {
                let refs = Value::Map(vec![
                    (
                        Value::Text("algorithm_id".to_string()),
                        Value::Text("algorithm-1".to_string()),
                    ),
                    (Value::Text("attachment_ids".to_string()), Value::Array(Vec::new())),
                ]);
                set(entries, "refs", refs);
            }),
            not_canonical,
        ),
    ];
    for (bytes, expected) in cases {
        assert_eq!(Header::decode(&bytes), Err(expected.clone()), "{expected:?}");
    }
}

#[test]
fn decode_rejects_a_frame_in_a_second_encoding() {
    let canonical = Envelope {
        header: card_content(),
        payload: vec![1, 2, 3],
    }
    .encode()
    .expect("envelope encodes");
    let mut entries = ciborium::from_reader::<Value, _>(canonical.as_slice())
        .expect("the frame is CBOR")
        .into_map()
        .expect("the frame is a map");
    entries.reverse();
    let mut reversed = Vec::new();
    ciborium::into_writer(&Value::Map(entries), &mut reversed).expect("frame encodes");

    for bytes in [reversed, [canonical, vec![0]].concat()] {
        assert_eq!(
            Envelope::decode(&bytes),
            Err(EnvelopeError::NonCanonical {
                reason: "the frame is not in its one encoding",
            })
        );
    }
}

#[test]
fn a_key_this_app_does_not_know_is_named_as_a_newer_writers() {
    let refs_with = |key: &str| {
        Value::Map(vec![
            (
                Value::Text("attachment_ids".to_string()),
                Value::Array(vec![Value::Text("aa".to_string())]),
            ),
            (Value::Text(key.to_string()), Value::Text("deck-1".to_string())),
        ])
    };
    let header_cases = [
        (
            raw_card_content_header(|entries| set(entries, "key_id", Value::Bytes(vec![1; 16]))),
            "key_id",
        ),
        (
            raw_card_content_header(|entries| set(entries, "refs", refs_with("deck_id"))),
            "deck_id",
        ),
    ];
    for (bytes, key) in header_cases {
        assert_eq!(
            Header::decode(&bytes),
            Err(EnvelopeError::UnknownKey {
                part: Part::Header,
                key: key.to_string(),
            }),
            "{key}"
        );
    }

    let header = card_content().encode().expect("header encodes");
    let frame = Value::Map(vec![
        (Value::Text("header".to_string()), Value::Bytes(header)),
        (Value::Text("payload".to_string()), Value::Bytes(vec![1])),
        (Value::Text("nonce".to_string()), Value::Bytes(vec![2; 24])),
    ]);
    let mut bytes = Vec::new();
    ciborium::into_writer(&frame, &mut bytes).expect("frame encodes");
    assert_eq!(
        Envelope::decode(&bytes),
        Err(EnvelopeError::UnknownKey {
            part: Part::Envelope,
            key: "nonce".to_string(),
        })
    );
}

#[test]
fn a_known_key_with_a_wrong_type_stays_malformed() {
    // WHY: every header and `refs` key is present, so a name missing from the codec's lists would be reported as
    // unknown here.
    let every_ref = Value::Map(vec![
        (
            Value::Text("algorithm_id".to_string()),
            Value::Text("algorithm-1".to_string()),
        ),
        (
            Value::Text("template_id".to_string()),
            Value::Text("template-1".to_string()),
        ),
        (
            Value::Text("attachment_ids".to_string()),
            Value::Array(vec![Value::Text("aa".to_string())]),
        ),
    ]);
    let bytes = raw_card_content_header(|entries| {
        set(entries, "refs", every_ref);
        set(entries, "hlc", Value::Text("soon".to_string()));
    });

    assert!(
        matches!(
            Header::decode(&bytes),
            Err(EnvelopeError::Malformed { part: Part::Header, .. })
        ),
        "{:?}",
        Header::decode(&bytes)
    );
}
