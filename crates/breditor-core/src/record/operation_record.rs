use std::fmt;

use serde::{
    Deserialize, Deserializer, Serialize, Serializer,
    de::{Error as _, IgnoredAny, MapAccess, Visitor},
    ser::SerializeMap,
};

use crate::record::SchemaIdRecord;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OperationEnvelopeHeader {
    pub(crate) format: String,
    pub(crate) format_version: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct OperationRecordEnvelopeV1 {
    pub(crate) format: String,
    pub(crate) format_version: u32,
    pub(crate) schema: SchemaIdRecord,
    pub(crate) operation: OperationRecordV1,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase", tag = "kind")]
pub(crate) enum OperationRecordV1 {
    TextSplice {
        range: TextRangeRecordV1,
        #[serde(rename = "expectedRemoved")]
        expected_removed: TextFragmentRecordV1,
        replacement: TextFragmentRecordV1,
    },
    ParagraphSplit {
        #[serde(rename = "paragraphPath")]
        paragraph_path: Vec<u32>,
        offset: u64,
        expected: TextFragmentRecordV1,
    },
    ParagraphJoin {
        #[serde(rename = "leftPath")]
        left_path: Vec<u32>,
        #[serde(rename = "expectedLeft")]
        expected_left: TextFragmentRecordV1,
        #[serde(rename = "expectedRight")]
        expected_right: TextFragmentRecordV1,
    },
    RootTextReplace {
        range: RootTextRangeRecordV1,
        #[serde(rename = "expectedParagraphs")]
        expected_paragraphs: Vec<TextFragmentRecordV1>,
        #[serde(rename = "replacementParagraphs")]
        replacement_paragraphs: Vec<TextFragmentRecordV1>,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct TextRangeRecordV1 {
    pub(crate) container_path: Vec<u32>,
    pub(crate) start: u64,
    pub(crate) end: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct RootTextRangeRecordV1 {
    pub(crate) start: RootTextBoundaryRecordV1,
    pub(crate) end: RootTextBoundaryRecordV1,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct RootTextBoundaryRecordV1 {
    pub(crate) paragraph_path: Vec<u32>,
    pub(crate) offset: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TextFragmentRecordV1 {
    pub(crate) runs: Vec<TextRunRecordV1>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TextRunRecordV1 {
    pub(crate) text: String,
    pub(crate) formats: Vec<OperationFormatRecordV1>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct OperationFormatRecordV1 {
    #[serde(rename = "type")]
    pub(crate) format_type: String,
    pub(crate) properties: EmptyPropertyMapRecord,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct EmptyPropertyMapRecord;

impl Serialize for EmptyPropertyMapRecord {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_map(Some(0))?.end()
    }
}

impl<'de> Deserialize<'de> for EmptyPropertyMapRecord {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_map(EmptyPropertyMapVisitor)
    }
}

struct EmptyPropertyMapVisitor;

impl<'de> Visitor<'de> for EmptyPropertyMapVisitor {
    type Value = EmptyPropertyMapRecord;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("an empty operation-format properties object")
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        if map.next_key::<IgnoredAny>()?.is_some() {
            return Err(A::Error::custom("operation-format properties must be empty"));
        }
        Ok(EmptyPropertyMapRecord)
    }
}

#[cfg(test)]
mod tests {
    use std::{error::Error, io};

    use super::EmptyPropertyMapRecord;

    #[test]
    fn nonempty_property_error_does_not_repeat_the_untrusted_key() -> Result<(), Box<dyn Error>> {
        let secret_key = "do-not-copy-this-key";
        let json = format!(r#"{{"{secret_key}":true}}"#);
        let Err(error) = serde_json::from_str::<EmptyPropertyMapRecord>(&json) else {
            return Err(io::Error::other("nonempty property map unexpectedly decoded").into());
        };
        let message = error.to_string();

        assert!(message.contains("operation-format properties must be empty"));
        assert!(!message.contains(secret_key));
        Ok(())
    }
}
