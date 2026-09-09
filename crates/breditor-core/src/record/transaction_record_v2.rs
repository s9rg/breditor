//! Property-preserving transaction state-update records.

use serde::{Deserialize, Deserializer, Serialize};

use crate::record::PendingFormatRecordV2;

/// How a V3 transaction request determines its result pending formats.
///
/// The tagged shape is unchanged from V1; only each contained pending-format
/// record advances to the property-preserving payload generation.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase", tag = "kind")]
pub(crate) enum PendingFormatsUpdateRecordV2 {
    Preserve {},
    Set {
        #[serde(deserialize_with = "deserialize_required_option")]
        formats: Option<Vec<PendingFormatRecordV2>>,
    },
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

    use super::PendingFormatsUpdateRecordV2;

    #[test]
    fn nullable_and_empty_pending_updates_are_distinct() -> Result<(), serde_json::Error> {
        let null: PendingFormatsUpdateRecordV2 =
            serde_json::from_value(json!({"kind": "set", "formats": null}))?;
        let empty: PendingFormatsUpdateRecordV2 =
            serde_json::from_value(json!({"kind": "set", "formats": []}))?;
        assert_ne!(null, empty);
        Ok(())
    }

    #[test]
    fn nullable_formats_field_is_required_and_shape_is_closed() {
        for invalid in [
            json!({"kind": "set"}),
            json!({"kind": "preserve", "formats": null}),
            json!({"kind": "set", "formats": [], "extra": null}),
        ] {
            assert!(serde_json::from_value::<PendingFormatsUpdateRecordV2>(invalid).is_err());
        }
    }
}
