use std::{collections::BTreeMap, fmt};

use serde::{
    Deserialize, Deserializer, Serialize, Serializer,
    de::{self, Error as _, MapAccess, SeqAccess, Visitor},
    ser::{SerializeMap, SerializeSeq},
};

use crate::document::{MAX_SAFE_INTEGER, MIN_SAFE_INTEGER};

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct PropertyMapRecord(pub(crate) BTreeMap<String, PropertyValueRecord>);

impl Serialize for PropertyMapRecord {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (key, value) in &self.0 {
            map.serialize_entry(key, value)?;
        }
        map.end()
    }
}

impl<'de> Deserialize<'de> for PropertyMapRecord {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_map(SortedMapVisitor::new("property"))
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum PropertyValueRecord {
    Null,
    Boolean(bool),
    Integer(i64),
    String(String),
    Array(Vec<Self>),
    Object(BTreeMap<String, Self>),
}

impl Serialize for PropertyValueRecord {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Null => serializer.serialize_unit(),
            Self::Boolean(value) => serializer.serialize_bool(*value),
            Self::Integer(value) => serializer.serialize_i64(*value),
            Self::String(value) => serializer.serialize_str(value),
            Self::Array(values) => {
                let mut sequence = serializer.serialize_seq(Some(values.len()))?;
                for value in values {
                    sequence.serialize_element(value)?;
                }
                sequence.end()
            }
            Self::Object(values) => {
                let mut map = serializer.serialize_map(Some(values.len()))?;
                for (key, value) in values {
                    map.serialize_entry(key, value)?;
                }
                map.end()
            }
        }
    }
}

impl<'de> Deserialize<'de> for PropertyValueRecord {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_any(PropertyValueVisitor)
    }
}

struct PropertyValueVisitor;

impl<'de> Visitor<'de> for PropertyValueVisitor {
    type Value = PropertyValueRecord;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a deterministic Breditor property value")
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Ok(PropertyValueRecord::Null)
    }

    fn visit_none<E>(self) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Ok(PropertyValueRecord::Null)
    }

    fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Ok(PropertyValueRecord::Boolean(value))
    }

    fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        if value < MIN_SAFE_INTEGER {
            return Err(E::custom(format_args!(
                "property integer {value} is below the minimum safe integer {MIN_SAFE_INTEGER}"
            )));
        }
        Ok(PropertyValueRecord::Integer(value))
    }

    fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        let integer = i64::try_from(value).map_err(|_| {
            E::custom(format_args!(
                "property integer {value} exceeds the maximum safe integer {MAX_SAFE_INTEGER}"
            ))
        })?;
        if integer > MAX_SAFE_INTEGER {
            return Err(E::custom(format_args!(
                "property integer {value} exceeds the maximum safe integer {MAX_SAFE_INTEGER}"
            )));
        }
        Ok(PropertyValueRecord::Integer(integer))
    }

    fn visit_f64<E>(self, _value: f64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Err(E::custom(
            "fractional property numbers are not supported; encode an exact decimal as a string",
        ))
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Ok(PropertyValueRecord::String(value.to_owned()))
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Ok(PropertyValueRecord::String(value))
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut values = Vec::with_capacity(sequence.size_hint().unwrap_or(0));
        while let Some(value) = sequence.next_element()? {
            values.push(value);
        }
        Ok(PropertyValueRecord::Array(values))
    }

    fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let PropertyMapRecord(values) = SortedMapVisitor::new("object key").visit_map(map)?;
        Ok(PropertyValueRecord::Object(values))
    }
}

struct SortedMapVisitor {
    key_description: &'static str,
}

impl SortedMapVisitor {
    const fn new(key_description: &'static str) -> Self {
        Self { key_description }
    }
}

impl<'de> Visitor<'de> for SortedMapVisitor {
    type Value = PropertyMapRecord;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "an object with sorted unique {} keys", self.key_description)
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut values = BTreeMap::new();
        let mut previous: Option<String> = None;
        while let Some(key) = map.next_key::<String>()? {
            if values.contains_key(&key) {
                return Err(A::Error::custom(format_args!(
                    "duplicate {} key `{key}`",
                    self.key_description
                )));
            }
            if previous.as_ref().is_some_and(|previous_key| previous_key > &key) {
                return Err(A::Error::custom(format_args!(
                    "{} keys are not in ascending order at `{key}`",
                    self.key_description
                )));
            }
            previous = Some(key.clone());
            let value = map.next_value()?;
            values.insert(key, value);
        }
        Ok(PropertyMapRecord(values))
    }
}
