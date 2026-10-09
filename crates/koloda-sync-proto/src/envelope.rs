//! Envelope frame and header codec (`PROTOCOL.md` §Envelope encoding). Payload codecs: `payload.rs`.

use std::fmt;

use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};

use crate::hlc::{DeviceId, Hlc, Stamp};
use crate::registry::{allow, Group, Kind, Op, RefName, RegistryError};

pub const MAX_HEADER_BYTES: usize = 16 * 1024;
pub const MAX_PAYLOAD_BYTES: usize = 512 * 1024;
// WHY: room for the frame's own map keys and length prefixes around the two byte strings.
const MAX_FRAME_OVERHEAD_BYTES: usize = 64;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Envelope {
    pub header: Header,
    pub payload: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Header {
    pub kind: Kind,
    pub id: String,
    pub parent: Option<String>,
    pub refs: Refs,
    pub group: Option<Group>,
    pub op: Op,
    pub stamp: Stamp,
    pub schema: u32,
    pub commit_id: [u8; 16],
}

/// `attachment_ids` must be sorted and unique so one logical header has one encoding.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Refs {
    pub algorithm_id: Option<String>,
    pub template_id: Option<String>,
    pub attachment_ids: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Digest(pub [u8; 32]);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Part {
    Envelope,
    Header,
    Payload,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EnvelopeError {
    TooLarge { part: Part, len: usize, max: usize },
    Malformed { part: Part, reason: String },
    UnknownKey { part: Part, key: String },
    Registry(RegistryError),
    MissingParent { kind: Kind },
    UnexpectedParent { kind: Kind },
    MissingRef { kind: Kind, name: RefName },
    RefNotAllowed { kind: Kind, name: RefName },
    NonCanonical { reason: &'static str },
    BadLength { field: &'static str, len: usize },
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct WireFrame {
    #[serde(with = "serde_bytes")]
    header: Vec<u8>,
    #[serde(with = "serde_bytes")]
    payload: Vec<u8>,
}

// INVARIANT: each list names every field of its wire struct. A missing name turns a malformed value of that field into
// an unknown key, which holds for an app update instead of reporting corruption.
const FRAME_KEYS: &[&str] = &["header", "payload"];
const HEADER_KEYS: &[&str] = &[
    "kind",
    "id",
    "parent",
    "refs",
    "group",
    "op",
    "hlc",
    "stamp_device",
    "schema",
    "commit_id",
];
const REFS_KEYS: &[&str] = &["algorithm_id", "template_id", "attachment_ids"];

// INVARIANT: field order is the encoding order. Reordering fields changes every digest and golden fixture.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct WireHeader {
    kind: String,
    id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    parent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    refs: Option<WireRefs>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    group: Option<String>,
    op: String,
    hlc: u64,
    #[serde(with = "serde_bytes")]
    stamp_device: Vec<u8>,
    schema: u32,
    #[serde(with = "serde_bytes")]
    commit_id: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct WireRefs {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    algorithm_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    template_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    attachment_ids: Vec<String>,
}

impl Envelope {
    pub fn encode(&self) -> Result<Vec<u8>, EnvelopeError> {
        let frame = WireFrame {
            header: self.header.encode()?,
            payload: self.payload.clone(),
        };
        encode_cbor(&frame, Part::Envelope)
    }

    pub fn decode(bytes: &[u8]) -> Result<Envelope, EnvelopeError> {
        check_len(
            Part::Envelope,
            bytes.len(),
            MAX_HEADER_BYTES + MAX_PAYLOAD_BYTES + MAX_FRAME_OVERHEAD_BYTES,
        )?;
        let frame: WireFrame = decode_map(bytes, Part::Envelope, FRAME_KEYS)?;
        check_len(Part::Payload, frame.payload.len(), MAX_PAYLOAD_BYTES)?;
        Ok(Envelope {
            header: Header::decode(&frame.header)?,
            payload: frame.payload,
        })
    }
}

impl Header {
    // INVARIANT: these bytes travel unchanged inside the envelope; E2EE uses them as AEAD associated data.
    pub fn encode(&self) -> Result<Vec<u8>, EnvelopeError> {
        self.validate()?;
        encode_cbor(&self.to_wire(), Part::Header)
    }

    pub fn decode(bytes: &[u8]) -> Result<Header, EnvelopeError> {
        check_len(Part::Header, bytes.len(), MAX_HEADER_BYTES)?;
        let wire: WireHeader = decode_map(bytes, Part::Header, HEADER_KEYS)?;
        let header = Header::from_wire(wire)?;
        header.validate()?;
        Ok(header)
    }

    pub fn validate(&self) -> Result<(), EnvelopeError> {
        let kind = self.kind;
        let group_spec = allow(kind, self.group, self.op).map_err(EnvelopeError::Registry)?;

        match (kind.spec().parent, &self.parent) {
            (Some(_), None) => return Err(EnvelopeError::MissingParent { kind }),
            (None, Some(_)) => return Err(EnvelopeError::UnexpectedParent { kind }),
            _ => {}
        }

        let allowed: &[RefName] = group_spec.map_or(&[], |spec| spec.refs);
        let present = [
            (RefName::AlgorithmId, self.refs.algorithm_id.is_some()),
            (RefName::TemplateId, self.refs.template_id.is_some()),
            (RefName::AttachmentIds, !self.refs.attachment_ids.is_empty()),
        ];
        for (name, is_present) in present {
            let is_allowed = allowed.contains(&name);
            if is_present && !is_allowed {
                return Err(EnvelopeError::RefNotAllowed { kind, name });
            }
            // WHY: hard refs are required on the groups that carry them; attachment refs may be empty.
            if is_allowed && !is_present && name.target().is_some() {
                return Err(EnvelopeError::MissingRef { kind, name });
            }
        }

        if !self
            .refs
            .attachment_ids
            .windows(2)
            .all(|pair| matches!(pair, [a, b] if a < b))
        {
            return Err(EnvelopeError::NonCanonical {
                reason: "attachment ids are not sorted and unique",
            });
        }
        Ok(())
    }

    fn to_wire(&self) -> WireHeader {
        let refs = &self.refs;
        let has_refs = refs.algorithm_id.is_some() || refs.template_id.is_some() || !refs.attachment_ids.is_empty();
        WireHeader {
            kind: self.kind.as_wire().to_string(),
            id: self.id.clone(),
            parent: self.parent.clone(),
            refs: has_refs.then(|| WireRefs {
                algorithm_id: refs.algorithm_id.clone(),
                template_id: refs.template_id.clone(),
                attachment_ids: refs.attachment_ids.clone(),
            }),
            group: self.group.map(|group| group.as_wire().to_string()),
            op: self.op.as_wire().to_string(),
            hlc: self.stamp.hlc.raw(),
            stamp_device: self.stamp.device.0.to_vec(),
            schema: self.schema,
            commit_id: self.commit_id.to_vec(),
        }
    }

    fn from_wire(wire: WireHeader) -> Result<Header, EnvelopeError> {
        let refs = match wire.refs {
            Some(refs)
                if refs.algorithm_id.is_none() && refs.template_id.is_none() && refs.attachment_ids.is_empty() =>
            {
                return Err(EnvelopeError::NonCanonical {
                    reason: "an empty refs map is encoded by omitting it",
                });
            }
            Some(refs) => refs,
            None => WireRefs {
                algorithm_id: None,
                template_id: None,
                attachment_ids: Vec::new(),
            },
        };
        Ok(Header {
            kind: Kind::from_wire(&wire.kind).map_err(EnvelopeError::Registry)?,
            id: wire.id,
            parent: wire.parent,
            refs: Refs {
                algorithm_id: refs.algorithm_id,
                template_id: refs.template_id,
                attachment_ids: refs.attachment_ids,
            },
            group: wire
                .group
                .as_deref()
                .map(Group::from_wire)
                .transpose()
                .map_err(EnvelopeError::Registry)?,
            op: Op::from_wire(&wire.op).map_err(EnvelopeError::Registry)?,
            stamp: Stamp {
                hlc: Hlc::from_raw(wire.hlc),
                device: DeviceId(fixed_bytes("stamp_device", &wire.stamp_device)?),
            },
            schema: wire.schema,
            commit_id: fixed_bytes("commit_id", &wire.commit_id)?,
        })
    }
}

/// Decodes a frame or header map. When that fails, a key this app does not know names the failure instead, so a
/// newer writer reads as one and not as damaged bytes.
fn decode_map<T: for<'de> Deserialize<'de>>(bytes: &[u8], part: Part, known: &[&str]) -> Result<T, EnvelopeError> {
    decode_cbor(bytes, part).map_err(|error| unknown_key(bytes, part, known).unwrap_or(error))
}

fn unknown_key(bytes: &[u8], part: Part, known: &[&str]) -> Option<EnvelopeError> {
    let entries = ciborium::from_reader::<ciborium::Value, _>(bytes)
        .ok()?
        .into_map()
        .ok()?;
    entries.into_iter().find_map(|(key, value)| {
        let key = key.into_text().ok()?;
        if !known.contains(&key.as_str()) {
            return Some(EnvelopeError::UnknownKey { part, key });
        }
        // WHY: `refs` is a map inside the header; a newer app may name a ref this one lacks.
        let refs = value
            .into_map()
            .ok()
            .filter(|_| part == Part::Header && key == "refs")?;
        refs.into_iter().find_map(|(key, _)| {
            let key = key.into_text().ok()?;
            (!REFS_KEYS.contains(&key.as_str())).then_some(EnvelopeError::UnknownKey { part, key })
        })
    })
}

pub fn digest(encoded: &[u8]) -> Digest {
    Digest(Sha256::digest(encoded).into())
}

fn fixed_bytes(field: &'static str, bytes: &[u8]) -> Result<[u8; 16], EnvelopeError> {
    match <[u8; 16]>::try_from(bytes) {
        Ok(fixed) => Ok(fixed),
        Err(_) => Err(EnvelopeError::BadLength {
            field,
            len: bytes.len(),
        }),
    }
}

fn check_len(part: Part, len: usize, max: usize) -> Result<(), EnvelopeError> {
    if len > max {
        Err(EnvelopeError::TooLarge { part, len, max })
    } else {
        Ok(())
    }
}

pub(crate) fn encode_cbor<T: Serialize>(value: &T, part: Part) -> Result<Vec<u8>, EnvelopeError> {
    let mut bytes = Vec::new();
    ciborium::into_writer(value, &mut bytes).map_err(|error| EnvelopeError::Malformed {
        part,
        reason: error.to_string(),
    })?;
    Ok(bytes)
}

// WHY: `from_reader` applies ciborium's default recursion limit, and every target type is fixed,
// so nesting depth is bounded without a separate depth check.
pub(crate) fn decode_cbor<T: for<'de> Deserialize<'de>>(bytes: &[u8], part: Part) -> Result<T, EnvelopeError> {
    ciborium::from_reader(bytes).map_err(|error| EnvelopeError::Malformed {
        part,
        reason: error.to_string(),
    })
}

impl fmt::Display for EnvelopeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EnvelopeError::TooLarge { part, len, max } => {
                write!(f, "{part:?} is {len} bytes, over the {max}-byte limit")
            }
            EnvelopeError::Malformed { part, reason } => write!(f, "malformed {part:?}: {reason}"),
            EnvelopeError::UnknownKey { part, key } => {
                write!(f, "{part:?} has key `{key}`, which this app does not know")
            }
            EnvelopeError::Registry(error) => write!(f, "{error}"),
            EnvelopeError::MissingParent { kind } => write!(f, "`{}` envelope has no parent", kind.as_wire()),
            EnvelopeError::UnexpectedParent { kind } => {
                write!(f, "`{}` envelope must not have a parent", kind.as_wire())
            }
            EnvelopeError::MissingRef { kind, name } => {
                write!(f, "`{}` envelope is missing ref `{}`", kind.as_wire(), name.as_wire())
            }
            EnvelopeError::RefNotAllowed { kind, name } => {
                write!(
                    f,
                    "`{}` envelope must not carry ref `{}`",
                    kind.as_wire(),
                    name.as_wire()
                )
            }
            EnvelopeError::NonCanonical { reason } => write!(f, "non-canonical header: {reason}"),
            EnvelopeError::BadLength { field, len } => write!(f, "`{field}` is {len} bytes, expected 16"),
        }
    }
}

impl std::error::Error for EnvelopeError {}
