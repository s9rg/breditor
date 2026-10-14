//! Bounded history sequence and preflighted canonical branch/format admission.

use super::{
    JsonFailure, RichSessionCodecError, document_json::RecordBuilder,
    document_preflight::preflight_document_root, rich_selection_record::SelectionRecord,
    rich_session_json::RichSessionJsonCodec,
};
use crate::{
    document::NodeRef,
    record::{DecimalU64Record, FormatRecordV1, NodeRecordV1},
    rich_content::{
        BlockId,
        local_session::{
            durable::{Entry, Metadata},
            local_rewrite::LocalRewrite,
        },
    },
    state::Revision,
};
use serde::{
    Deserialize,
    de::{DeserializeSeed, Error as _, IgnoredAny, SeqAccess, Visitor},
};
use serde_json::value::RawValue;
use std::fmt;

pub(super) fn metadata(
    codec: &RichSessionJsonCodec,
    input: &str,
) -> Result<Metadata, RichSessionCodecError> {
    let record: StateRecord<'_> =
        serde_json::from_str(input).map_err(|error| json_failure(&error))?;
    let pending = if record.pending_formats.get() == "null" {
        None
    } else {
        // Use the existing canonical text-node grammar for formats, with a
        // nonempty sentinel solely for construction. Never admit it as content.
        let raw = format!(
            "{{\"kind\":\"text\",\"text\":\"\",\"formats\":{}}}",
            record.pending_formats.get()
        );
        preflight_document_root(&raw, codec.context.limits())
            .map_err(|error| json_failure(&error))?;
        let formats: Vec<FormatRecordV1> = serde_json::from_str(record.pending_formats.get())
            .map_err(|error| json_failure(&error))?;
        let node = RecordBuilder::new()
            .build_root(&NodeRecordV1::Text { text: "x".to_owned(), formats })?;
        Some(node.as_text().ok_or(RichSessionCodecError::Value)?.formats().clone())
    };
    Ok(Metadata {
        selection: record.selection.map(SelectionRecord::into_kind).transpose()?,
        pending,
        revision: Revision::new(record.revision.get()),
    })
}

fn json_failure(error: &serde_json::Error) -> RichSessionCodecError {
    JsonFailure::from_serde(error).into()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct StateRecord<'a> {
    #[serde(deserialize_with = "required_option")]
    selection: Option<SelectionRecord>,
    #[serde(borrow)]
    pending_formats: &'a RawValue,
    revision: DecimalU64Record,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EntryRecord<'a> {
    #[serde(deserialize_with = "required_option")]
    target: Option<String>,
    #[serde(borrow)]
    expected: &'a RawValue,
    #[serde(borrow)]
    replacement: &'a RawValue,
    #[serde(borrow)]
    before: &'a RawValue,
    #[serde(borrow)]
    after: &'a RawValue,
}
fn required_option<'de, D: serde::Deserializer<'de>, T: Deserialize<'de>>(
    deserializer: D,
) -> Result<Option<T>, D::Error> {
    Option::<T>::deserialize(deserializer)
}

fn node(codec: &RichSessionJsonCodec, raw: &RawValue) -> Result<NodeRef, RichSessionCodecError> {
    preflight_document_root(raw.get(), codec.context.limits())
        .map_err(|error| json_failure(&error))?;
    let record: NodeRecordV1 =
        serde_json::from_str(raw.get()).map_err(|error| json_failure(&error))?;
    Ok(RecordBuilder::new().build_root(&record)?)
}
impl EntryRecord<'_> {
    fn into_entry(self, codec: &RichSessionJsonCodec) -> Result<Entry, RichSessionCodecError> {
        Ok(Entry {
            before: metadata(codec, self.before.get())?,
            after: metadata(codec, self.after.get())?,
            recipe: LocalRewrite {
                target: self
                    .target
                    .map(|value| BlockId::try_new(value).map_err(|_| RichSessionCodecError::Value))
                    .transpose()?,
                expected: node(codec, self.expected)?,
                replacement: node(codec, self.replacement)?,
            },
        })
    }
}

pub(super) fn entries(
    codec: &RichSessionJsonCodec,
    input: &str,
) -> Result<Vec<Entry>, RichSessionCodecError> {
    let mut decoder = serde_json::Deserializer::from_str(input);
    let result =
        EntriesSeed(codec).deserialize(&mut decoder).map_err(|error| json_failure(&error))?;
    decoder.end().map_err(|error| json_failure(&error))?;
    Ok(result)
}
struct EntriesSeed<'a>(&'a RichSessionJsonCodec);
impl<'de> DeserializeSeed<'de> for EntriesSeed<'_> {
    type Value = Vec<Entry>;
    fn deserialize<D: serde::Deserializer<'de>>(self, decoder: D) -> Result<Self::Value, D::Error> {
        decoder.deserialize_seq(self)
    }
}
impl<'de> Visitor<'de> for EntriesSeed<'_> {
    type Value = Vec<Entry>;
    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded rich local history sequence")
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
        let mut result = Vec::new();
        while result.len() < self.0.max_entries {
            let Some(record) = seq.next_element::<EntryRecord<'de>>()? else { return Ok(result) };
            result.push(record.into_entry(self.0).map_err(A::Error::custom)?);
        }
        if seq.next_element::<IgnoredAny>()?.is_some() {
            return Err(A::Error::custom("rich local history entry budget exceeded"));
        }
        Ok(result)
    }
}
