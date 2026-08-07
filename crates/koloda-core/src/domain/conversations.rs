//! Assistant chat rows — mirrors `@koloda/app` conversations API.
//!
//! `Conversation.state` is an opaque JSON blob owned by TS; do not interpret or reshape it here.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::domain::time::{
    default_now, deserialize_optional_timestamp, deserialize_timestamp, serialize_optional_timestamp,
    serialize_timestamp,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: Option<String>,
    // INVARIANT: `state` is an opaque assistant UI blob owned by TS
    // (`libs/srs-react/.../conversation-reducer`, persistence coerce/normalize).
    // Rust stores and returns it without interpreting shape.
    pub state: Value,
    #[serde(
        default = "default_now",
        serialize_with = "serialize_timestamp",
        deserialize_with = "deserialize_timestamp"
    )]
    pub created_at: i64,
    #[serde(
        default,
        serialize_with = "serialize_optional_timestamp",
        deserialize_with = "deserialize_optional_timestamp"
    )]
    pub updated_at: Option<i64>,
}
