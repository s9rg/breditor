//! Property-preserving editor-value records for the second payload generation.

use serde::{Deserialize, Serialize};

use crate::record::PropertyMapRecord;

/// One exact pending typing format with its complete canonical property map.
///
/// Selection and snapshot records remain byte-for-byte compatible with their
/// V1 shapes. This record is separate because V1 deliberately accepts only an
/// empty property object and must continue to fail closed for typed formats.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PendingFormatRecordV2 {
    #[serde(rename = "type")]
    pub(crate) format_type: String,
    pub(crate) properties: PropertyMapRecord,
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use crate::record::{PropertyMapRecord, PropertyValueRecord};

    use super::PendingFormatRecordV2;

    #[test]
    fn pending_format_v2_round_trips_every_strict_property_value() -> Result<(), serde_json::Error>
    {
        let properties = PropertyMapRecord(BTreeMap::from([
            ("example/enabled".to_owned(), PropertyValueRecord::Boolean(true)),
            ("example/priority".to_owned(), PropertyValueRecord::Integer(7)),
            (
                "example/value".to_owned(),
                PropertyValueRecord::Array(vec![
                    PropertyValueRecord::Null,
                    PropertyValueRecord::String("exact".to_owned()),
                    PropertyValueRecord::Object(BTreeMap::from([(
                        "nested-key".to_owned(),
                        PropertyValueRecord::Boolean(false),
                    )])),
                ]),
            ),
        ]));
        let record = PendingFormatRecordV2 { format_type: "example/link".to_owned(), properties };

        let json = serde_json::to_string(&record)?;
        assert_eq!(
            json,
            r#"{"type":"example/link","properties":{"example/enabled":true,"example/priority":7,"example/value":[null,"exact",{"nested-key":false}]}}"#
        );
        assert_eq!(serde_json::from_str::<PendingFormatRecordV2>(&json)?, record);
        Ok(())
    }

    #[test]
    fn pending_format_v2_requires_exact_fields() {
        for invalid in [
            r#"{"type":"example/link"}"#,
            r#"{"properties":{}}"#,
            r#"{"type":"example/link","properties":{},"extra":null}"#,
        ] {
            assert!(
                serde_json::from_str::<PendingFormatRecordV2>(invalid).is_err(),
                "unexpectedly decoded {invalid}"
            );
        }
    }
}
