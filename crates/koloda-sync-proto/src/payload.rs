//! Schema-1 payloads for every registry group, and sealing: building a header from a payload,
//! encoding, and round-tripping before the bytes leave the caller (`PROTOCOL.md` §Payloads).
//!
//! JSON columns (card content, template structure, algorithm parameters, revision actor, settings values)
//! travel as the JSON text the row stores. This crate never parses them, except to find attachment links.

use std::collections::BTreeMap;
use std::fmt;

use serde::{Deserialize, Serialize};

use crate::envelope::{decode_cbor, encode_cbor, Envelope, EnvelopeError, Header, Part, Refs};
use crate::hlc::Stamp;
use crate::registry::{Group, Kind, Op, RegistryError};

/// The only payload schema this crate writes and reads, for every kind.
pub const SCHEMA: u32 = 1;

const ATTACHMENT_LINK_PREFIX: &str = "attachment:";
const ATTACHMENT_ID_LEN: usize = 64;

/// Product timestamps of synthetic update groups, keyed by group wire name; an absent group means null.
pub type InitialProductTs = BTreeMap<String, i64>;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CardCreate {
    pub deck_id: String,
    pub template_id: String,
    pub content: String,
    pub scheduling: CardScheduling,
    pub created_at: i64,
    pub initial_product_ts: InitialProductTs,
    pub legacy_product_ts_floor: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CardContent {
    pub content: String,
    pub updated_at: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CardScheduling {
    pub state: i64,
    pub due_at: Option<i64>,
    pub stability: f64,
    pub difficulty: f64,
    pub scheduled_days: i64,
    pub learning_steps: i64,
    pub reps: i64,
    pub lapses: i64,
    pub last_reviewed_at: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CardReset {
    pub wall_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Review {
    pub card_id: String,
    pub rating: i64,
    pub state: i64,
    pub due_at: i64,
    pub stability: f64,
    pub difficulty: f64,
    pub scheduled_days: i64,
    pub learning_steps: i64,
    pub time: i64,
    pub is_ignored: bool,
    pub created_at: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeckCreate {
    pub title: String,
    pub notes: Option<String>,
    pub created_at: i64,
    pub initial_product_ts: InitialProductTs,
    pub legacy_product_ts_floor: Option<i64>,
}

/// Template and algorithm creates: `content` is the stored JSON text (structure or parameters).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DocumentCreate {
    pub title: String,
    pub notes: Option<String>,
    pub content: String,
    pub created_at: i64,
    pub initial_product_ts: InitialProductTs,
    pub legacy_product_ts_floor: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Title {
    pub title: String,
    pub updated_at: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Notes {
    pub notes: Option<String>,
    pub updated_at: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct JsonContent {
    pub content: String,
    pub updated_at: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeckAlgorithm {
    pub algorithm_id: String,
    pub updated_at: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeckTemplate {
    pub template_id: String,
    pub updated_at: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AlgorithmRevision {
    pub algorithm_id: String,
    pub content: String,
    pub actor: String,
    pub created_at: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DefaultAlgorithm {
    pub algorithm_id: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DefaultTemplate {
    pub template_id: String,
}

/// One learning-settings key: `value` is that key's JSON text.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SettingValue {
    pub value: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Delete {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub successor: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Payload {
    CardCreate(CardCreate),
    CardContent(CardContent),
    CardScheduling(CardScheduling),
    CardReset(CardReset),
    Review(Review),
    DeckCreate(DeckCreate),
    DeckTitle(Title),
    DeckNotes(Notes),
    DeckAlgorithm(DeckAlgorithm),
    DeckTemplate(DeckTemplate),
    TemplateCreate(DocumentCreate),
    TemplateTitle(Title),
    TemplateNotes(Notes),
    TemplateStructure(JsonContent),
    AlgorithmCreate(DocumentCreate),
    AlgorithmTitle(Title),
    AlgorithmNotes(Notes),
    AlgorithmContent(JsonContent),
    AlgorithmRevision(AlgorithmRevision),
    LearningDefaultAlgorithm(DefaultAlgorithm),
    LearningDefaultTemplate(DefaultTemplate),
    LearningDailyLimits(SettingValue),
    LearningDayStartsAt(SettingValue),
    LearningLearnAheadLimit(SettingValue),
    Delete { kind: Kind, delete: Delete },
}

/// Header fields the payload cannot supply. `parent` is required for card updates and deletes, whose
/// payloads do not carry the deck; for card creates and reviews it must be absent or equal the payload's.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Seal {
    pub id: String,
    pub parent: Option<String>,
    pub stamp: Stamp,
    pub commit_id: [u8; 16],
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Sealed {
    pub envelope: Envelope,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum PayloadError {
    Envelope(EnvelopeError),
    UnknownSchema {
        kind: Kind,
        schema: u32,
    },
    ParentMismatch {
        given: String,
        payload: String,
    },
    SuccessorNotAllowed {
        kind: Kind,
    },
    RoundTripMismatch {
        encoded: Box<Payload>,
        decoded: Box<Payload>,
    },
}

impl Payload {
    pub fn target(&self) -> (Kind, Option<Group>, Op) {
        let write = |kind, group| (kind, Some(group), Op::Write);
        match self {
            Payload::CardCreate(_) => write(Kind::Cards, Group::Create),
            Payload::CardContent(_) => write(Kind::Cards, Group::Content),
            Payload::CardScheduling(_) => write(Kind::Cards, Group::Scheduling),
            Payload::CardReset(_) => write(Kind::Cards, Group::Reset),
            Payload::Review(_) => write(Kind::Reviews, Group::Row),
            Payload::DeckCreate(_) => write(Kind::Decks, Group::Create),
            Payload::DeckTitle(_) => write(Kind::Decks, Group::Title),
            Payload::DeckNotes(_) => write(Kind::Decks, Group::Notes),
            Payload::DeckAlgorithm(_) => write(Kind::Decks, Group::Algorithm),
            Payload::DeckTemplate(_) => write(Kind::Decks, Group::Template),
            Payload::TemplateCreate(_) => write(Kind::Templates, Group::Create),
            Payload::TemplateTitle(_) => write(Kind::Templates, Group::Title),
            Payload::TemplateNotes(_) => write(Kind::Templates, Group::Notes),
            Payload::TemplateStructure(_) => write(Kind::Templates, Group::Structure),
            Payload::AlgorithmCreate(_) => write(Kind::Algorithms, Group::Create),
            Payload::AlgorithmTitle(_) => write(Kind::Algorithms, Group::Title),
            Payload::AlgorithmNotes(_) => write(Kind::Algorithms, Group::Notes),
            Payload::AlgorithmContent(_) => write(Kind::Algorithms, Group::Content),
            Payload::AlgorithmRevision(_) => write(Kind::AlgorithmRevisions, Group::Row),
            Payload::LearningDefaultAlgorithm(_) => write(Kind::SettingsLearning, Group::DefaultsAlgorithm),
            Payload::LearningDefaultTemplate(_) => write(Kind::SettingsLearning, Group::DefaultsTemplate),
            Payload::LearningDailyLimits(_) => write(Kind::SettingsLearning, Group::DailyLimits),
            Payload::LearningDayStartsAt(_) => write(Kind::SettingsLearning, Group::DayStartsAt),
            Payload::LearningLearnAheadLimit(_) => write(Kind::SettingsLearning, Group::LearnAheadLimit),
            Payload::Delete { kind, .. } => (*kind, None, Op::Delete),
        }
    }

    /// The parent foreign key this payload carries itself, if any.
    pub fn parent(&self) -> Option<&str> {
        match self {
            Payload::CardCreate(create) => Some(&create.deck_id),
            Payload::Review(review) => Some(&review.card_id),
            _ => None,
        }
    }

    pub fn refs(&self) -> Refs {
        let mut refs = Refs::default();
        match self {
            Payload::CardCreate(create) => {
                refs.template_id = Some(create.template_id.clone());
                refs.attachment_ids = attachment_ids_in(&create.content);
            }
            Payload::CardContent(content) => refs.attachment_ids = attachment_ids_in(&content.content),
            Payload::DeckAlgorithm(pointer) => refs.algorithm_id = Some(pointer.algorithm_id.clone()),
            Payload::DeckTemplate(pointer) => refs.template_id = Some(pointer.template_id.clone()),
            Payload::LearningDefaultAlgorithm(pointer) => refs.algorithm_id = Some(pointer.algorithm_id.clone()),
            Payload::LearningDefaultTemplate(pointer) => refs.template_id = Some(pointer.template_id.clone()),
            _ => {}
        }
        refs
    }

    pub fn encode(&self) -> Result<Vec<u8>, PayloadError> {
        let part = Part::Payload;
        match self {
            Payload::CardCreate(value) => encode_cbor(value, part),
            Payload::CardContent(value) => encode_cbor(value, part),
            Payload::CardScheduling(value) => encode_cbor(value, part),
            Payload::CardReset(value) => encode_cbor(value, part),
            Payload::Review(value) => encode_cbor(value, part),
            Payload::DeckCreate(value) => encode_cbor(value, part),
            Payload::DeckTitle(value) | Payload::TemplateTitle(value) | Payload::AlgorithmTitle(value) => {
                encode_cbor(value, part)
            }
            Payload::DeckNotes(value) | Payload::TemplateNotes(value) | Payload::AlgorithmNotes(value) => {
                encode_cbor(value, part)
            }
            Payload::DeckAlgorithm(value) => encode_cbor(value, part),
            Payload::DeckTemplate(value) => encode_cbor(value, part),
            Payload::TemplateCreate(value) | Payload::AlgorithmCreate(value) => encode_cbor(value, part),
            Payload::TemplateStructure(value) | Payload::AlgorithmContent(value) => encode_cbor(value, part),
            Payload::AlgorithmRevision(value) => encode_cbor(value, part),
            Payload::LearningDefaultAlgorithm(value) => encode_cbor(value, part),
            Payload::LearningDefaultTemplate(value) => encode_cbor(value, part),
            Payload::LearningDailyLimits(value)
            | Payload::LearningDayStartsAt(value)
            | Payload::LearningLearnAheadLimit(value) => encode_cbor(value, part),
            Payload::Delete { delete, .. } => encode_cbor(delete, part),
        }
        .map_err(PayloadError::Envelope)
    }

    pub fn decode(header: &Header, bytes: &[u8]) -> Result<Payload, PayloadError> {
        if header.schema != SCHEMA {
            return Err(PayloadError::UnknownSchema {
                kind: header.kind,
                schema: header.schema,
            });
        }
        let part = Part::Payload;
        let payload = match (header.kind, header.group) {
            (kind, None) => Payload::Delete {
                kind,
                delete: decode_cbor(bytes, part)?,
            },
            (Kind::Cards, Some(Group::Create)) => Payload::CardCreate(decode_cbor(bytes, part)?),
            (Kind::Cards, Some(Group::Content)) => Payload::CardContent(decode_cbor(bytes, part)?),
            (Kind::Cards, Some(Group::Scheduling)) => Payload::CardScheduling(decode_cbor(bytes, part)?),
            (Kind::Cards, Some(Group::Reset)) => Payload::CardReset(decode_cbor(bytes, part)?),
            (Kind::Reviews, Some(Group::Row)) => Payload::Review(decode_cbor(bytes, part)?),
            (Kind::Decks, Some(Group::Create)) => Payload::DeckCreate(decode_cbor(bytes, part)?),
            (Kind::Decks, Some(Group::Title)) => Payload::DeckTitle(decode_cbor(bytes, part)?),
            (Kind::Decks, Some(Group::Notes)) => Payload::DeckNotes(decode_cbor(bytes, part)?),
            (Kind::Decks, Some(Group::Algorithm)) => Payload::DeckAlgorithm(decode_cbor(bytes, part)?),
            (Kind::Decks, Some(Group::Template)) => Payload::DeckTemplate(decode_cbor(bytes, part)?),
            (Kind::Templates, Some(Group::Create)) => Payload::TemplateCreate(decode_cbor(bytes, part)?),
            (Kind::Templates, Some(Group::Title)) => Payload::TemplateTitle(decode_cbor(bytes, part)?),
            (Kind::Templates, Some(Group::Notes)) => Payload::TemplateNotes(decode_cbor(bytes, part)?),
            (Kind::Templates, Some(Group::Structure)) => Payload::TemplateStructure(decode_cbor(bytes, part)?),
            (Kind::Algorithms, Some(Group::Create)) => Payload::AlgorithmCreate(decode_cbor(bytes, part)?),
            (Kind::Algorithms, Some(Group::Title)) => Payload::AlgorithmTitle(decode_cbor(bytes, part)?),
            (Kind::Algorithms, Some(Group::Notes)) => Payload::AlgorithmNotes(decode_cbor(bytes, part)?),
            (Kind::Algorithms, Some(Group::Content)) => Payload::AlgorithmContent(decode_cbor(bytes, part)?),
            (Kind::AlgorithmRevisions, Some(Group::Row)) => Payload::AlgorithmRevision(decode_cbor(bytes, part)?),
            (Kind::SettingsLearning, Some(Group::DefaultsAlgorithm)) => {
                Payload::LearningDefaultAlgorithm(decode_cbor(bytes, part)?)
            }
            (Kind::SettingsLearning, Some(Group::DefaultsTemplate)) => {
                Payload::LearningDefaultTemplate(decode_cbor(bytes, part)?)
            }
            (Kind::SettingsLearning, Some(Group::DailyLimits)) => {
                Payload::LearningDailyLimits(decode_cbor(bytes, part)?)
            }
            (Kind::SettingsLearning, Some(Group::DayStartsAt)) => {
                Payload::LearningDayStartsAt(decode_cbor(bytes, part)?)
            }
            (Kind::SettingsLearning, Some(Group::LearnAheadLimit)) => {
                Payload::LearningLearnAheadLimit(decode_cbor(bytes, part)?)
            }
            (kind, Some(group)) => {
                return Err(PayloadError::Envelope(EnvelopeError::Registry(
                    RegistryError::GroupNotInKind { kind, group },
                )))
            }
        };
        Ok(payload)
    }
}

pub fn seal(seal: Seal, payload: &Payload) -> Result<Sealed, PayloadError> {
    let (kind, group, op) = payload.target();
    if let Payload::Delete { delete, .. } = payload {
        if delete.successor.is_some() && kind != Kind::Algorithms {
            return Err(PayloadError::SuccessorNotAllowed { kind });
        }
    }
    let parent = match (payload.parent(), seal.parent) {
        (Some(own), Some(given)) if own != given => {
            return Err(PayloadError::ParentMismatch {
                given,
                payload: own.to_string(),
            })
        }
        (Some(own), _) => Some(own.to_string()),
        (None, given) => given,
    };
    let envelope = Envelope {
        header: Header {
            kind,
            id: seal.id,
            parent,
            refs: payload.refs(),
            group,
            op,
            stamp: seal.stamp,
            schema: SCHEMA,
            commit_id: seal.commit_id,
        },
        payload: payload.encode()?,
    };
    let bytes = envelope.encode().map_err(PayloadError::Envelope)?;

    // INVARIANT: decode what was just encoded before returning bytes. A payload that does not survive the
    // round trip fails the caller's write instead of reaching the log (`PROTOCOL.md` §Payloads).
    let decoded_envelope = Envelope::decode(&bytes).map_err(PayloadError::Envelope)?;
    let decoded = Payload::decode(&decoded_envelope.header, &decoded_envelope.payload)?;
    if decoded_envelope != envelope || &decoded != payload {
        return Err(PayloadError::RoundTripMismatch {
            encoded: Box::new(payload.clone()),
            decoded: Box::new(decoded),
        });
    }
    Ok(Sealed { envelope, bytes })
}

pub fn attachment_ids_in(content: &str) -> Vec<String> {
    // WHY: a hex id cannot be hidden by JSON escaping, so scanning the stored text for
    // `attachment:<64 lowercase hex>` finds every link without parsing it, like the local attachment sweep.
    let mut ids: Vec<String> = content
        .match_indices(ATTACHMENT_LINK_PREFIX)
        .filter_map(|(start, prefix)| {
            let rest = content.get(start + prefix.len()..)?;
            let id = rest.get(..ATTACHMENT_ID_LEN)?;
            let is_hex = id.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'));
            let is_whole = !rest
                .as_bytes()
                .get(ATTACHMENT_ID_LEN)
                .is_some_and(|next| next.is_ascii_hexdigit());
            (is_hex && is_whole).then(|| id.to_string())
        })
        .collect();
    ids.sort();
    ids.dedup();
    ids
}

impl From<EnvelopeError> for PayloadError {
    fn from(error: EnvelopeError) -> Self {
        PayloadError::Envelope(error)
    }
}

impl fmt::Display for PayloadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PayloadError::Envelope(error) => write!(f, "{error}"),
            PayloadError::UnknownSchema { kind, schema } => {
                write!(f, "unknown schema {schema} for `{}`", kind.as_wire())
            }
            PayloadError::ParentMismatch { given, payload } => {
                write!(f, "given parent `{given}` differs from payload parent `{payload}`")
            }
            PayloadError::SuccessorNotAllowed { kind } => {
                write!(f, "only algorithm deletes carry a successor, not `{}`", kind.as_wire())
            }
            PayloadError::RoundTripMismatch { .. } => write!(f, "payload does not survive an encode-decode round trip"),
        }
    }
}

impl std::error::Error for PayloadError {}
