use std::fmt;

use serde::{
    Deserialize, Deserializer, Serialize, Serializer,
    de::{self, Visitor},
};

use crate::record::EmptyPropertyMapRecord;

/// Snapshot identity shared by state and exact-base transaction V1 records.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct SnapshotIdRecordV1 {
    pub(crate) lineage: String,
    pub(crate) revision: DecimalU64Record,
}

/// A `u64` serialized as one canonical unsigned decimal JSON string.
///
/// JSON numbers cannot losslessly carry every Rust `u64` through JavaScript.
/// The accepted grammar is exactly `0|[1-9][0-9]*` within the `u64` range.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub(crate) struct DecimalU64Record(u64);

impl DecimalU64Record {
    pub(crate) const fn new(value: u64) -> Self {
        Self(value)
    }

    pub(crate) const fn get(self) -> u64 {
        self.0
    }

    pub(crate) fn try_from_decimal(value: &str) -> Result<Self, DecimalU64RecordError> {
        parse_decimal_u64(value).map(Self)
    }
}

impl Serialize for DecimalU64Record {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.collect_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for DecimalU64Record {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_str(DecimalU64Visitor)
    }
}

struct DecimalU64Visitor;

impl Visitor<'_> for DecimalU64Visitor {
    type Value = DecimalU64Record;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a canonical unsigned decimal string in the u64 range")
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        DecimalU64Record::try_from_decimal(value).map_err(E::custom)
    }
}

fn parse_decimal_u64(value: &str) -> Result<u64, DecimalU64RecordError> {
    let bytes = value.as_bytes();
    let Some(first) = bytes.first() else {
        return Err(DecimalU64RecordError::InvalidGrammar);
    };
    if bytes.len() > 1 && *first == b'0' {
        return Err(DecimalU64RecordError::LeadingZero);
    }
    if !bytes.iter().all(u8::is_ascii_digit) {
        return Err(DecimalU64RecordError::InvalidGrammar);
    }

    let mut parsed = 0_u64;
    for digit in bytes.iter().map(|byte| u64::from(byte - b'0')) {
        parsed = parsed
            .checked_mul(10)
            .and_then(|value| value.checked_add(digit))
            .ok_or(DecimalU64RecordError::Overflow)?;
    }
    Ok(parsed)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DecimalU64RecordError {
    InvalidGrammar,
    LeadingZero,
    Overflow,
}

impl fmt::Display for DecimalU64RecordError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::InvalidGrammar => "revision must use unsigned decimal digits",
            Self::LeadingZero => "revision must not contain a leading zero",
            Self::Overflow => "revision exceeds the unsigned 64-bit maximum",
        })
    }
}

/// One selection value shared by transaction and editor-state V1 records.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase", tag = "kind")]
pub(crate) enum SelectionRecordV1 {
    Range { anchor: PointRecordV1, focus: PointRecordV1 },
}

/// One exact snapshot-local selection endpoint.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase", tag = "kind")]
pub(crate) enum PointRecordV1 {
    Text {
        #[serde(rename = "textPath")]
        text_path: Vec<u32>,
        #[serde(rename = "utf16Offset")]
        utf16_offset: u32,
        affinity: AffinityRecordV1,
    },
    Children {
        #[serde(rename = "parentPath")]
        parent_path: Vec<u32>,
        #[serde(rename = "childIndex")]
        child_index: u32,
        affinity: AffinityRecordV1,
    },
}

/// Boundary ownership for a serialized selection point.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AffinityRecordV1 {
    Before,
    After,
}

/// One property-free pending typing format shared by state-bearing V1 records.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PendingFormatRecordV1 {
    #[serde(rename = "type")]
    pub(crate) format_type: String,
    pub(crate) properties: EmptyPropertyMapRecord,
}

#[cfg(test)]
mod tests {
    use super::DecimalU64Record;

    #[test]
    fn decimal_u64_round_trips_exact_boundaries_as_strings() -> Result<(), serde_json::Error> {
        for value in [0, 1, 9_007_199_254_740_991, u64::MAX] {
            let record = DecimalU64Record::new(value);
            let encoded = serde_json::to_string(&record)?;
            assert_eq!(encoded, format!("\"{value}\""));
            let decoded: DecimalU64Record = serde_json::from_str(&encoded)?;
            assert_eq!(decoded.get(), value);
        }
        Ok(())
    }

    #[test]
    fn decimal_u64_rejects_noncanonical_or_unrepresentable_values() {
        for invalid in [
            r#"""#,
            r#""00""#,
            r#""01""#,
            r#""+1""#,
            r#""-1""#,
            r#""1.0""#,
            r#"" 1""#,
            r#""18446744073709551616""#,
            "0",
            "null",
        ] {
            assert!(
                serde_json::from_str::<DecimalU64Record>(invalid).is_err(),
                "unexpectedly decoded {invalid}"
            );
        }
    }
}
