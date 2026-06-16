use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::app::utility::{
    default_now, deserialize_optional_timestamp, deserialize_timestamp, serialize_optional_timestamp,
    serialize_timestamp,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
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
