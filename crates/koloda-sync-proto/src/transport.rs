//! Endpoint bodies and the request limits the sync engine and the sync server share (`PROTOCOL.md` §Transport).
//!
//! Bodies are CBOR maps that reject unknown keys. Space, device, epoch, and nonce ids travel as 16 raw UUID bytes,
//! like `stamp_device`; URL paths carry them as hyphenated UUID text.

use std::collections::BTreeMap;
use std::fmt;

use serde::{Deserialize, Serialize};

pub const MAX_BODY_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_EXPANSION_RATIO: usize = 32;
pub const MAX_NAME_CHARS: usize = 100;
pub const MAX_HINT_BYTES: usize = 4 * 1024;

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
    UnknownSpace,
    NotFound,
    PairingFailed,
    RateLimited,
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
