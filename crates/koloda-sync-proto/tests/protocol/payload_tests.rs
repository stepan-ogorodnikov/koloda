use koloda_sync_proto::envelope::{Envelope, EnvelopeError, Refs};
use koloda_sync_proto::payload::{
    attachment_ids_in, seal, CardContent, CardScheduling, Delete, Payload, PayloadError, SCHEMA,
};
use koloda_sync_proto::registry::Kind;

use crate::samples::{
    card_content_text, samples, scheduling, seal_for, ATTACHMENT_A, ATTACHMENT_B, CARD_ID, DECK_ID, TEMPLATE_ID,
};

#[test]
fn every_sample_round_trips_through_a_sealed_envelope() {
    for sample in samples() {
        let sealed = seal(sample.seal, &sample.payload).unwrap_or_else(|error| panic!("{}: {error}", sample.name));
        let envelope = Envelope::decode(&sealed.bytes).unwrap();
        let (kind, group, op) = sample.payload.target();
        assert_eq!(
            (envelope.header.kind, envelope.header.group, envelope.header.op),
            (kind, group, op)
        );
        assert_eq!(envelope.header.schema, SCHEMA);
        assert_eq!(
            Payload::decode(&envelope.header, &envelope.payload),
            Ok(sample.payload),
            "{}",
            sample.name
        );
    }
}

#[test]
fn a_payload_that_does_not_survive_the_round_trip_fails_the_seal() {
    let lossy = Payload::CardScheduling(CardScheduling {
        stability: f64::NAN,
        ..scheduling()
    });
    assert!(matches!(
        seal(seal_for(CARD_ID, Some(DECK_ID)), &lossy),
        Err(PayloadError::RoundTripMismatch { .. })
    ));
}

#[test]
fn header_parent_and_refs_come_from_the_payload() {
    let create = samples()
        .into_iter()
        .find(|sample| sample.name == "cards.create")
        .unwrap();
    let header = seal(create.seal, &create.payload).unwrap().envelope.header;
    assert_eq!(header.parent.as_deref(), Some(DECK_ID));
    assert_eq!(
        header.refs,
        Refs {
            algorithm_id: None,
            template_id: Some(TEMPLATE_ID.to_string()),
            attachment_ids: vec![ATTACHMENT_B.to_string(), ATTACHMENT_A.to_string()],
        },
        "attachment ids are sorted, whatever order the content links them in"
    );

    let content = Payload::CardContent(CardContent {
        content: card_content_text(),
        updated_at: None,
    });
    let header = seal(seal_for(CARD_ID, Some(DECK_ID)), &content)
        .unwrap()
        .envelope
        .header;
    assert_eq!(
        header.parent.as_deref(),
        Some(DECK_ID),
        "card updates take the deck from the caller"
    );
    assert_eq!(
        seal(seal_for(CARD_ID, None), &content),
        Err(PayloadError::Envelope(EnvelopeError::MissingParent {
            kind: Kind::Cards
        }))
    );
}

#[test]
fn seal_rejects_a_parent_or_successor_the_payload_contradicts() {
    let review = samples()
        .into_iter()
        .find(|sample| sample.name == "reviews.row")
        .unwrap();
    assert_eq!(
        seal(
            seal_for("01920000-0000-7000-8000-000000000005", Some("other-card")),
            &review.payload
        ),
        Err(PayloadError::ParentMismatch {
            given: "other-card".to_string(),
            payload: CARD_ID.to_string(),
        })
    );

    let deck_delete_with_successor = Payload::Delete {
        kind: Kind::Decks,
        delete: Delete {
            successor: Some("deck-2".to_string()),
        },
    };
    assert_eq!(
        seal(seal_for(DECK_ID, None), &deck_delete_with_successor),
        Err(PayloadError::SuccessorNotAllowed { kind: Kind::Decks })
    );
}

#[test]
fn a_payload_of_an_unknown_schema_is_not_decoded() {
    let sample = samples()
        .into_iter()
        .find(|sample| sample.name == "decks.title")
        .unwrap();
    let mut envelope = seal(sample.seal, &sample.payload).unwrap().envelope;
    envelope.header.schema = SCHEMA + 1;
    assert_eq!(
        Payload::decode(&envelope.header, &envelope.payload),
        Err(PayloadError::UnknownSchema {
            kind: Kind::Decks,
            schema: SCHEMA + 1,
        })
    );
}

#[test]
fn attachment_links_are_found_only_as_whole_lowercase_ids() {
    let id = ATTACHMENT_A;
    let cases = [
        ("no links".to_string(), vec![]),
        (format!("![x](attachment:{id})"), vec![id]),
        (
            format!(r#"{{"f":{{"text":"![x](attachment:{id}) ![y](attachment:{id})"}}}}"#),
            vec![id],
        ),
        (format!("attachment:{}", "a".repeat(63)), vec![]),
        (format!("attachment:{id}a"), vec![]),
        (format!("attachment:{}", id.to_uppercase()), vec![]),
        (
            format!("attachment:{ATTACHMENT_B} attachment:{id}"),
            vec![ATTACHMENT_B, id],
        ),
    ];
    for (content, expected) in cases {
        assert_eq!(attachment_ids_in(&content), expected, "{content}");
    }
}
