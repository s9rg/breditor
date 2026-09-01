use std::fmt;

use serde::{
    Deserialize, Deserializer, Serialize, Serializer,
    de::{self, Visitor},
};

use crate::record::{EmptyPropertyMapRecord, SchemaIdRecord};

/// Stable identifier for Breditor's atomic transaction-request envelope.
pub(crate) const TRANSACTION_REQUEST_FORMAT: &str = "breditor/transaction-request";

/// Transaction-request wire version implemented by the V1 record.
pub(crate) const TRANSACTION_REQUEST_FORMAT_VERSION: u32 = 1;

/// Owned V1 encoding record for one exact-base atomic transaction request.
///
/// This type intentionally does not implement `Deserialize`; untrusted
/// operation arrays must pass through the codec's borrowed streaming boundary.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct TransactionRequestRecordV1<Operations> {
    pub(crate) format: String,
    pub(crate) format_version: u32,
    pub(crate) schema: SchemaIdRecord,
    pub(crate) base_snapshot: SnapshotIdRecordV1,
    pub(crate) operations: Operations,
    pub(crate) selection_relocation: SelectionRelocationRecordV1,
    pub(crate) selection_update: SelectionUpdateRecordV1,
    pub(crate) pending_formats_update: PendingFormatsUpdateRecordV1,
    pub(crate) metadata: TransactionMetadataRecordV1,
}

/// Snapshot identity against which a transaction request was authored.
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

/// Endpoint-specific deleted-point choices for implicit selection relocation.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SelectionRelocationRecordV1 {
    pub(crate) anchor: DeletedPointPolicyRecordV1,
    pub(crate) focus: DeletedPointPolicyRecordV1,
}

/// Choice made when a relocated selection endpoint was deleted.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum DeletedPointPolicyRecordV1 {
    Reject,
    Before,
    After,
}

/// How the transaction request determines its result selection.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase", tag = "kind")]
pub(crate) enum SelectionUpdateRecordV1 {
    Relocate {},
    Set {
        #[serde(deserialize_with = "deserialize_required_option")]
        selection: Option<SelectionRecordV1>,
    },
}

/// One selection value supported by transaction-request V1.
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

/// How the transaction request determines its result pending formats.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase", tag = "kind")]
pub(crate) enum PendingFormatsUpdateRecordV1 {
    Preserve {},
    Set {
        #[serde(deserialize_with = "deserialize_required_option")]
        formats: Option<Vec<PendingFormatRecordV1>>,
    },
}

/// One property-free pending typing format in transaction-request V1.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PendingFormatRecordV1 {
    #[serde(rename = "type")]
    pub(crate) format_type: String,
    pub(crate) properties: EmptyPropertyMapRecord,
}

/// Typed action and history request metadata.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TransactionMetadataRecordV1 {
    #[serde(deserialize_with = "deserialize_required_option")]
    pub(crate) action: Option<String>,
    pub(crate) history: HistoryIntentRecordV1,
}

/// Requested interaction with a live session's history owner.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase", tag = "kind")]
pub(crate) enum HistoryIntentRecordV1 {
    Record {},
    Merge { group: String },
    Ignore {},
}

fn deserialize_required_option<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        DecimalU64Record, PendingFormatsUpdateRecordV1, SelectionRelocationRecordV1,
        SelectionUpdateRecordV1, TransactionMetadataRecordV1,
    };

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

    #[test]
    fn null_and_empty_transaction_state_updates_remain_distinct() -> Result<(), serde_json::Error> {
        let null_selection: SelectionUpdateRecordV1 =
            serde_json::from_value(json!({"kind": "set", "selection": null}))?;
        let null_formats: PendingFormatsUpdateRecordV1 =
            serde_json::from_value(json!({"kind": "set", "formats": null}))?;

        let explicit_selection: SelectionUpdateRecordV1 = serde_json::from_value(json!({
            "kind": "set",
            "selection": {
                "kind": "range",
                "anchor": {
                    "kind": "children",
                    "parentPath": [0],
                    "childIndex": 0,
                    "affinity": "before"
                },
                "focus": {
                    "kind": "text",
                    "textPath": [0, 0],
                    "utf16Offset": 0,
                    "affinity": "after"
                }
            }
        }))?;
        let empty_formats: PendingFormatsUpdateRecordV1 =
            serde_json::from_value(json!({"kind": "set", "formats": []}))?;

        assert_ne!(null_selection, explicit_selection);
        assert_ne!(null_formats, empty_formats);
        Ok(())
    }

    #[test]
    fn nullable_fields_are_required() {
        assert!(serde_json::from_value::<SelectionUpdateRecordV1>(json!({"kind": "set"})).is_err());
        assert!(
            serde_json::from_value::<PendingFormatsUpdateRecordV1>(json!({"kind": "set"})).is_err()
        );
        assert!(
            serde_json::from_value::<TransactionMetadataRecordV1>(
                json!({"history": {"kind": "record"}}),
            )
            .is_err()
        );
    }

    #[test]
    fn every_fixed_record_rejects_unknown_fields_and_nonempty_format_properties() {
        assert!(
            serde_json::from_value::<SelectionRelocationRecordV1>(json!({
                "anchor": "reject",
                "focus": "reject",
                "extra": true
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<PendingFormatsUpdateRecordV1>(json!({
                "kind": "set",
                "formats": [{"type": "breditor/strong", "properties": {"forged": true}}]
            }))
            .is_err()
        );
    }

    #[test]
    fn duplicate_fields_are_rejected() {
        let duplicate = r#"{"anchor":"reject","anchor":"before","focus":"reject"}"#;
        assert!(serde_json::from_str::<SelectionRelocationRecordV1>(duplicate).is_err());
    }
}
