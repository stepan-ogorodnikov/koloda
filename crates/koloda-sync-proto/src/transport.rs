//! Endpoint bodies and the request limits the sync engine and the sync server share (`PROTOCOL.md` §Transport).
//!
//! Bodies are CBOR maps that reject unknown keys. Space, device, epoch, and nonce ids travel as 16 raw UUID bytes,
//! like `stamp_device`; URL paths carry them as hyphenated UUID text.

use std::collections::BTreeMap;
use std::fmt;
use std::num::NonZeroU32;

use serde::{Deserialize, Serialize};

pub const MAX_BODY_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_EXPANSION_RATIO: usize = 32;
pub const MAX_NAME_CHARS: usize = 100;
pub const MAX_HINT_BYTES: usize = 4 * 1024;
pub const MAX_PUSH_ITEMS: usize = 5_000;
pub const MAX_RECEIPT_RANGE: u64 = 5_000;
pub const MAX_KNOWN_IDS: usize = 1_000;
pub const MAX_PAGE_ENTRIES: u64 = 5_000;
pub const MAX_PAGE_BYTES: usize = 8 * 1024 * 1024;
// INVARIANT: equal to `koloda`'s `ATTACHMENT_MAX_BYTES` and its accepted formats; a device stores no larger image.
pub const MAX_ATTACHMENT_BYTES: usize = 5 * 1024 * 1024;
pub const ATTACHMENT_MIMES: [&str; 5] = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"];

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
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ErrorBody {
    pub code: ErrorCode,
    pub message: String,
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
    LeaseExpired,
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
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Enrollment {
    #[serde(with = "serde_bytes")]
    pub space_id: [u8; 16],
    #[serde(with = "serde_bytes")]
    pub device_id: [u8; 16],
    pub token: String,
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
