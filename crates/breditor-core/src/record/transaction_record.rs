use serde::{Deserialize, Deserializer, Serialize};

use crate::record::{PendingFormatRecordV1, SchemaIdRecord, SelectionRecordV1, SnapshotIdRecordV1};

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
        PendingFormatsUpdateRecordV1, SelectionRelocationRecordV1, SelectionUpdateRecordV1,
        TransactionMetadataRecordV1,
    };

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
