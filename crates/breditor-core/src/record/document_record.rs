use std::borrow::Cow;

use serde::{Deserialize, Deserializer, Serialize};

use crate::record::PropertyMapRecord;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DocumentEnvelopeHeader<'a> {
    #[serde(borrow)]
    pub(crate) format: Cow<'a, str>,
    pub(crate) format_version: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct DocumentRecordV1 {
    pub(crate) format: String,
    pub(crate) format_version: u32,
    pub(crate) schema: SchemaIdRecord,
    pub(crate) root: NodeRecordV1,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct DocumentRecordV2 {
    pub(crate) format: String,
    pub(crate) format_version: u32,
    pub(crate) schema: SchemaIdRecord,
    pub(crate) schema_fingerprint: String,
    pub(crate) root: NodeRecordV1,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SchemaIdRecord {
    pub(crate) name: String,
    pub(crate) version: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, tag = "kind", rename_all = "camelCase")]
pub(crate) enum NodeRecordV1 {
    Element {
        #[serde(rename = "type")]
        element_type: String,
        #[serde(rename = "entityId")]
        #[serde(deserialize_with = "deserialize_required_option")]
        entity_id: Option<String>,
        properties: PropertyMapRecord,
        children: Vec<Self>,
    },
    Text {
        text: String,
        formats: Vec<FormatRecordV1>,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct FormatRecordV1 {
    #[serde(rename = "type")]
    pub(crate) format_type: String,
    pub(crate) properties: PropertyMapRecord,
}

fn deserialize_required_option<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer)
}
