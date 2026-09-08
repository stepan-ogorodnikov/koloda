//! ISO-8601 ↔ epoch-ms serde helpers shared by domain DTOs.
//!
//! Deserialize: epoch-ms number (IPC `toWire`) and RFC3339 / ISO-8601 string (so
//! `serialize_timestamp` output round-trips). Serialize: RFC3339 string. SQLite: i64 epoch ms.
//! Do not accept `{value|timestamp|time}` objects (Tauri leftover; not on the NAPI wire).

use serde::{de::Visitor, Deserializer, Serializer};

pub fn default_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

pub fn serialize_optional_timestamp<S>(timestamp: &Option<i64>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    match timestamp {
        Some(ts) => {
            let datetime = chrono::DateTime::from_timestamp_millis(*ts)
                .ok_or_else(|| serde::ser::Error::custom("Invalid timestamp"))?;
            serializer.serialize_str(&datetime.to_rfc3339())
        }
        None => serializer.serialize_none(),
    }
}

pub fn serialize_timestamp<S>(timestamp: &i64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let datetime = chrono::DateTime::from_timestamp_millis(*timestamp)
        .ok_or_else(|| serde::ser::Error::custom("Invalid timestamp"))?;
    serializer.serialize_str(&datetime.to_rfc3339())
}

pub fn parse_iso_timestamp(value: &str) -> Result<i64, String> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(value) {
        return Ok(dt.timestamp_millis());
    }
    if let Ok(dt) = chrono::DateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.fZ") {
        return Ok(dt.timestamp_millis());
    }
    Err(format!("Invalid date string: {}", value))
}

fn parse_timestamp<E: serde::de::Error>(value: &str) -> Result<i64, E> {
    parse_iso_timestamp(value).map_err(serde::de::Error::custom)
}

pub fn deserialize_timestamp<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: Deserializer<'de>,
{
    struct TimestampVisitor;

    impl<'de> Visitor<'de> for TimestampVisitor {
        type Value = i64;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("an epoch-ms integer or ISO-8601 string")
        }

        fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E> {
            Ok(value)
        }

        fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E> {
            Ok(value as i64)
        }

        fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E> {
            Ok(value as i64)
        }

        fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            parse_timestamp(value)
        }
    }

    deserializer.deserialize_any(TimestampVisitor)
}

pub fn deserialize_optional_timestamp<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: Deserializer<'de>,
{
    struct OptionalTimestampVisitor;

    impl<'de> Visitor<'de> for OptionalTimestampVisitor {
        type Value = Option<i64>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("an epoch-ms integer or ISO-8601 string")
        }

        fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E> {
            Ok(Some(value))
        }

        fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E> {
            Ok(Some(value as i64))
        }

        fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E> {
            Ok(Some(value as i64))
        }

        fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            parse_timestamp(value).map(Some)
        }

        fn visit_none<E>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
        where
            D: Deserializer<'de>,
        {
            deserializer.deserialize_any(OptionalTimestampVisitor)
        }
    }

    deserializer.deserialize_option(OptionalTimestampVisitor)
}
