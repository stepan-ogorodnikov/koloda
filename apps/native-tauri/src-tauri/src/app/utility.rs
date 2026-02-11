use serde::{de::Visitor, Deserializer, Serializer};

pub fn get_current_timestamp() -> anyhow::Result<i64> {
    Ok(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_millis() as i64)
}

pub fn default_now() -> i64 {
    get_current_timestamp().unwrap_or_default()
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

fn parse_timestamp<E: serde::de::Error>(value: &str) -> Result<i64, E> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(value) {
        return Ok(dt.timestamp_millis());
    }
    if let Ok(dt) = chrono::DateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.fZ") {
        return Ok(dt.timestamp_millis());
    }
    Err(serde::de::Error::custom(format!("Invalid date string: {}", value)))
}

fn visit_map_timestamp<'de, M>(mut map: M) -> Result<i64, M::Error>
where
    M: serde::de::MapAccess<'de>,
{
    while let Some(key) = map.next_key::<String>()? {
        if key == "value" || key == "timestamp" || key == "time" {
            return map.next_value::<i64>();
        } else {
            map.next_value::<serde_json::Value>()?;
        }
    }
    Err(serde::de::Error::custom("No timestamp field found in map"))
}

pub fn deserialize_timestamp<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: Deserializer<'de>,
{
    struct TimestampVisitor;

    impl<'de> Visitor<'de> for TimestampVisitor {
        type Value = i64;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a Date object, ISO 8601 string, or i64 timestamp")
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

        fn visit_map<M>(self, map: M) -> Result<Self::Value, M::Error>
        where
            M: serde::de::MapAccess<'de>,
        {
            visit_map_timestamp(map)
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
            formatter.write_str("a Date object, ISO 8601 string, or i64 timestamp")
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

        fn visit_map<M>(self, map: M) -> Result<Self::Value, M::Error>
        where
            M: serde::de::MapAccess<'de>,
        {
            match visit_map_timestamp(map) {
                Ok(ts) => Ok(Some(ts)),
                Err(e) => Err(e),
            }
        }
    }

    deserializer.deserialize_option(OptionalTimestampVisitor)
}
