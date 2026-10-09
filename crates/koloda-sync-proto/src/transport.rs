//! Endpoint bodies and the request limits the sync engine and the sync server share (`PROTOCOL.md` §Transport).
//!
//! Bodies are CBOR maps that reject unknown keys. Space, device, epoch, and nonce ids travel as 16 raw UUID bytes,
//! like `stamp_device`; URL paths carry them as hyphenated UUID text.

use std::collections::BTreeMap;
use std::fmt;
use std::num::NonZeroU32;

use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};

use crate::registry::Kind;

pub const MAX_BODY_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_EXPANSION_RATIO: usize = 32;
pub const MAX_NAME_CHARS: usize = 100;
/// A bearer token is 32 random bytes, written as lowercase hex (`PROTOCOL.md` §Devices).
pub const TOKEN_HEX_LEN: usize = 64;

/// Refuses a token that is not 64 lowercase hex characters.
pub fn check_token(token: &str) -> Result<(), &'static str> {
    let is_token = token.len() == TOKEN_HEX_LEN && token.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'));
    if is_token {
        Ok(())
    } else {
        Err("a token is 64 lowercase hex characters")
    }
}

/// The SHA-256 of a pairing code as people type it (`PROTOCOL.md` §Pairing). The server stores only this, and a device
/// keeps it for a claim it has not recorded.
pub fn code_hash(code: &str) -> [u8; 32] {
    // WHY: people type codes, so case, separators, and the letters Crockford base32 reads as digits do not matter.
    let normalized: String = code
        .chars()
        .filter(|letter| !letter.is_whitespace() && *letter != '-')
        .map(|letter| match letter.to_ascii_uppercase() {
            'O' => '0',
            'I' | 'L' => '1',
            other => other,
        })
        .collect();
    Sha256::digest(normalized.as_bytes()).into()
}

pub const MAX_HINT_BYTES: usize = 4 * 1024;
pub const MAX_PUSH_ITEMS: usize = 5_000;
pub const MAX_RECEIPT_RANGE: u64 = 5_000;
pub const MAX_KNOWN_IDS: usize = 1_000;
pub const MAX_MISSING_IDS: usize = 1_000;
pub const MAX_PAGE_ENTRIES: u64 = 5_000;
pub const MAX_PAGE_BYTES: usize = 8 * 1024 * 1024;
// INVARIANT: equal to `koloda`'s `ATTACHMENT_MAX_BYTES` and its accepted formats; a device stores no larger image.
pub const MAX_ATTACHMENT_BYTES: usize = 5 * 1024 * 1024;
pub const ATTACHMENT_MIMES: [&str; 5] = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"];
/// The request header that names the epoch a device last saw, as hyphenated UUID text, on every device-token call.
pub const EPOCH_HEADER: &str = "koloda-epoch";
/// The request header that names the highest payload schema this app writes, per kind, on every device-token call:
/// `kind=schema` pairs joined by `,` (`PROTOCOL.md` §Schema versions).
pub const SCHEMAS_HEADER: &str = "koloda-schemas";

/// Encodes `schema_of(kind)` for every registry kind, in registry order, as the `koloda-schemas` header value.
pub fn encode_schemas(schema_of: impl Fn(Kind) -> u32) -> String {
    Kind::ALL
        .into_iter()
        .map(|kind| format!("{}={}", kind.as_wire(), schema_of(kind)))
        .collect::<Vec<_>>()
        .join(",")
}

// WHY: kind names stay plain strings, so a server that predates a kind still accepts an app that writes it.
pub fn decode_schemas(text: &str) -> Result<BTreeMap<String, u32>, MalformedSchemas> {
    let malformed = || MalformedSchemas(text.to_string());
    let mut schemas = BTreeMap::new();
    for pair in text.split(',') {
        let (kind, schema) = pair.split_once('=').ok_or_else(malformed)?;
        let is_kind = !kind.is_empty() && kind.bytes().all(|byte| byte.is_ascii_graphic());
        if !is_kind || schema.is_empty() || !schema.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err(malformed());
        }
        let schema = schema.parse().map_err(|_overflow| malformed())?;
        if schemas.insert(kind.to_string(), schema).is_some() {
            return Err(malformed());
        }
    }
    Ok(schemas)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MalformedSchemas(pub String);

impl fmt::Display for MalformedSchemas {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "`{SCHEMAS_HEADER}` is not `kind=schema` pairs joined by `,`: `{}`",
            self.0
        )
    }
}

impl std::error::Error for MalformedSchemas {}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Reply<T> {
    pub meta: Meta,
    // WHY: no `default` here; serde already reads a missing `Option` as `None`, and `default` would require
    // `T: Default`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ok: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorBody>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Meta {
    pub server_time_ms: u64,
    #[serde(default, with = "serde_bytes", skip_serializing_if = "Option::is_none")]
    pub epoch: Option<[u8; 16]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device: Option<DeviceMeta>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeviceMeta {
    pub head_hot: u64,
    pub head_cold: u64,
    pub gc_horizon_hot: u64,
    pub gc_horizon_cold: u64,
    pub write_schema: BTreeMap<String, u32>,
    pub last_sender_seq: u64,
    /// The space is over its quota, or the server is low on disk: growing writes come back `held { quota }`.
    pub is_over_quota: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ErrorBody {
    pub code: ErrorCode,
    pub message: String,
    /// With `epoch_changed`: the restore the caller must apply before anything else.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub restore: Option<Restore>,
}

/// Every restore point newer than the caller's epoch, applied as one (`PROTOCOL.md` §Server restore).
/// A sender `cutoffs` does not list counts as cutoff 0.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Restore {
    #[serde(with = "serde_bytes")]
    pub epoch: [u8; 16],
    pub mode: RestoreMode,
    pub head_hot: u64,
    pub head_cold: u64,
    pub cutoffs: Vec<Cutoff>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Cutoff {
    #[serde(with = "serde_bytes")]
    pub sender: [u8; 16],
    pub last_seq: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    BadRequest,
    TooLarge,
    Unauthorized,
    UnknownDevice,
    Revoked,
    UnknownSpace,
    NotFound,
    PairingFailed,
    RateLimited,
    StampAhead,
    SchemaReadOnly,
    CursorTooOld,
    EpochChanged,
    LeaseExpired,
    InsufficientStorage,
    Internal,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub enum Platform {
    DesktopWin,
    DesktopMac,
    DesktopLinux,
    Ios,
    Android,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UnknownPlatform(pub String);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateSpace {
    pub name: String,
    pub device_name: String,
    pub platform: Platform,
    #[serde(with = "serde_bytes")]
    pub nonce: [u8; 16],
    /// 32 random bytes as 64 lowercase hex characters, minted by the client.
    pub token: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Enrollment {
    #[serde(with = "serde_bytes")]
    pub space_id: [u8; 16],
    #[serde(with = "serde_bytes")]
    pub device_id: [u8; 16],
    #[serde(with = "serde_bytes")]
    pub epoch: [u8; 16],
}

/// The setup hint is opaque to the server: interface settings the inviting device attaches (`PROTOCOL.md` §Setup hint).
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IssuePairing {
    #[serde(default, with = "serde_bytes", skip_serializing_if = "Option::is_none")]
    pub hint: Option<Vec<u8>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Pairing {
    pub code: String,
    pub expires_at: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreviewPairing {
    pub code: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PairingPreview {
    #[serde(with = "serde_bytes")]
    pub space_id: [u8; 16],
    pub name: String,
    #[serde(with = "serde_bytes")]
    pub epoch: [u8; 16],
    pub counts: BTreeMap<String, u64>,
    pub bytes: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClaimPairing {
    pub code: String,
    pub name: String,
    pub platform: Platform,
    #[serde(with = "serde_bytes")]
    pub nonce: [u8; 16],
    /// 32 random bytes as 64 lowercase hex characters, minted by the client.
    pub token: String,
}

/// A fork request. The same nonce and token from the same device return the same new device
/// (`PROTOCOL.md` §Devices).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ForkDevice {
    #[serde(with = "serde_bytes")]
    pub nonce: [u8; 16],
    /// 32 random bytes as 64 lowercase hex characters, minted by the client.
    pub token: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PairingClaim {
    pub enrollment: Enrollment,
    #[serde(default, with = "serde_bytes", skip_serializing_if = "Option::is_none")]
    pub hint: Option<Vec<u8>>,
}

/// Items in strictly ascending `sender_seq`; `envelope` is the encoded envelope exactly as the outbox holds it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Push {
    pub items: Vec<PushItem>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PushItem {
    pub sender_seq: u64,
    #[serde(with = "serde_bytes")]
    pub envelope: Vec<u8>,
}

/// One outcome per item, in item order, ending early at `seq_reused`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PushReply {
    pub outcomes: Vec<PushOutcome>,
}

/// `missing_attachments` names, for a card `create` or `content` envelope, the linked ids the server holds no bytes
/// for. It is computed when the reply is built and never stored in the receipt, so a replay reports what is missing
/// now.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PushOutcome {
    pub sender_seq: u64,
    pub outcome: Outcome,
    pub replayed: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub missing_attachments: Vec<String>,
}

/// The sender, and the stamp device, of the writes the server authors itself: the tombstone that replaces a dropped
/// create or tombstone (`PROTOCOL.md` §Corrupt envelopes). No device id is nil.
pub const SERVER_SENDER: [u8; 16] = [0; 16];

/// Every outcome except `seq_reused` consumes its sequence (`PROTOCOL.md` §Push outcomes).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum Outcome {
    Applied,
    Stale,
    Fenced,
    Existence,
    DependencyFenced { action: DependencyAction },
    Held { reason: HeldReason },
    SeqReused,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DependencyAction {
    DropEntity,
    RepairPointer,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HeldReason {
    Schema,
    Dependency,
    Quota,
}

/// Attachment ids that live cards link and the space holds no bytes for, in id order (`PROTOCOL.md` §Attachments).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MissingAttachments {
    pub ids: Vec<String>,
}

/// How a server restore treats what devices hold: heal re-pushes it, authoritative discards it (`PROTOCOL.md`
/// §Server restore).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RestoreMode {
    Heal,
    Authoritative,
}

impl RestoreMode {
    pub fn as_wire(self) -> &'static str {
        match self {
            RestoreMode::Heal => "heal",
            RestoreMode::Authoritative => "authoritative",
        }
    }

    pub fn from_wire(value: &str) -> Option<RestoreMode> {
        [RestoreMode::Heal, RestoreMode::Authoritative]
            .into_iter()
            .find(|mode| mode.as_wire() == value)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Receipts {
    pub receipts: Vec<Receipt>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Receipt {
    pub sender_seq: u64,
    #[serde(with = "serde_bytes")]
    pub digest: [u8; 32],
    pub outcome: Outcome,
}

/// One entry of the log as pull and bootstrap return it: the envelope exactly as pushed, with server metadata.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LogEntry {
    pub seq: u64,
    #[serde(with = "serde_bytes")]
    pub sender: [u8; 16],
    pub sender_seq: u64,
    #[serde(with = "serde_bytes")]
    pub envelope: Vec<u8>,
}

/// `scanned_through` counts every seq examined, the caller's own entries and compacted holes included.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PullPage {
    pub entries: Vec<LogEntry>,
    pub scanned_through: u64,
    pub has_more: bool,
}

/// One message on the events socket: the space's lane heads, as a binary CBOR frame (`PROTOCOL.md` §Events).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Heads {
    pub head_hot: u64,
    pub head_cold: u64,
}

/// A bootstrap lease over the live heads at open (`PROTOCOL.md` §Bootstrap). Pages start at position 0.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Snapshot {
    #[serde(with = "serde_bytes")]
    pub snapshot_id: [u8; 16],
    pub counts: BTreeMap<String, u64>,
    pub bytes: u64,
    pub head_hot: u64,
    pub head_cold: u64,
    pub ttl_ms: u64,
    pub expires_at: u64,
    pub absolute_expiry: u64,
}

/// `next` is the position to ask for after this page; `done` once the lane has no entries left.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotPage {
    pub entries: Vec<LogEntry>,
    pub next: u64,
    pub done: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Lease {
    pub expires_at: u64,
    pub absolute_expiry: u64,
}

/// The `ok` of an endpoint that returns nothing: an empty map, so a reply always carries `ok` or `error`.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Empty {}

/// `kind` is the kind's wire string (`PROTOCOL.md` §Field groups and merge).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EntityId {
    pub kind: String,
    pub id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KnownIds {
    pub ids: Vec<EntityId>,
}

/// The asked ids the space holds, in the order asked; an id the space never held is left out.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Known {
    pub ids: Vec<KnownId>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KnownId {
    pub kind: String,
    pub id: String,
    pub state: KnownState,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnownState {
    Live,
    Fenced,
}

/// An attachment's bytes and the metadata the uploading device recorded (`PROTOCOL.md` §Attachments).
/// `PUT` sends it and `GET` returns it; the id is the lowercase hex SHA-256 of `bytes`, carried in the path.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AttachmentBody {
    pub mime: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<NonZeroU32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<NonZeroU32>,
    #[serde(with = "serde_bytes")]
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SpaceList {
    pub spaces: Vec<SpaceSummary>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SpaceSummary {
    #[serde(with = "serde_bytes")]
    pub id: [u8; 16],
    pub name: String,
    pub created_at: u64,
    pub device_count: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeviceInfo {
    #[serde(with = "serde_bytes")]
    pub id: [u8; 16],
    pub name: String,
    pub platform: Platform,
    pub created_at: u64,
    pub last_seen: u64,
    pub last_sender_seq: u64,
    #[serde(default, with = "serde_bytes", skip_serializing_if = "Option::is_none")]
    pub last_sender_digest: Option<[u8; 32]>,
    pub cursor_hot: u64,
    pub cursor_cold: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revoked_at: Option<u64>,
    pub rebase_required: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeviceList {
    pub devices: Vec<DeviceInfo>,
}

impl Platform {
    pub const ALL: [Platform; 5] = [
        Platform::DesktopWin,
        Platform::DesktopMac,
        Platform::DesktopLinux,
        Platform::Ios,
        Platform::Android,
    ];

    pub fn as_wire(self) -> &'static str {
        match self {
            Platform::DesktopWin => "desktop-win",
            Platform::DesktopMac => "desktop-mac",
            Platform::DesktopLinux => "desktop-linux",
            Platform::Ios => "ios",
            Platform::Android => "android",
        }
    }

    pub fn from_wire(value: &str) -> Result<Platform, UnknownPlatform> {
        Platform::ALL
            .into_iter()
            .find(|platform| platform.as_wire() == value)
            .ok_or_else(|| UnknownPlatform(value.to_string()))
    }
}

impl From<Platform> for String {
    fn from(platform: Platform) -> String {
        platform.as_wire().to_string()
    }
}

impl TryFrom<String> for Platform {
    type Error = UnknownPlatform;

    fn try_from(value: String) -> Result<Platform, UnknownPlatform> {
        Platform::from_wire(&value)
    }
}

impl fmt::Display for UnknownPlatform {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "unknown platform `{}`", self.0)
    }
}

impl std::error::Error for UnknownPlatform {}
