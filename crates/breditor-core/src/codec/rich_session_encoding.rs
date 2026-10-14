//! Borrowed deterministic checkpoint encoding with exact decimal revisions.

use super::{
    document_encoding::{DocumentEncodingV2, FormatSetEncoding, NodeEncoding},
    rich_selection_record::SelectionRecord,
    rich_session_json::{RICH_SESSION_FORMAT, RICH_SESSION_FORMAT_VERSION},
};
use crate::{
    record::DecimalU64Record,
    rich_content::local_session::durable::{Checkpoint, Entry, Metadata},
};
use serde::{
    Serialize,
    ser::{SerializeSeq, SerializeStruct},
};

pub(super) struct CheckpointEncoding<'a>(pub(super) &'a Checkpoint);
impl Serialize for CheckpointEncoding<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut record = serializer.serialize_struct("RichSessionV1", 8)?;
        record.serialize_field("format", RICH_SESSION_FORMAT)?;
        record.serialize_field("formatVersion", &RICH_SESSION_FORMAT_VERSION)?;
        record.serialize_field("baseDocument", &DocumentEncodingV2::new(self.0.base.document()))?;
        record.serialize_field("baseState", &MetadataEncoding(&self.0.base_metadata))?;
        record.serialize_field("entries", &EntriesEncoding(&self.0.entries))?;
        record.serialize_field("cursor", &self.0.cursor)?;
        record.serialize_field("historyCapacity", &self.0.capacity.get())?;
        record.serialize_field("currentState", &MetadataEncoding(&self.0.current))?;
        record.end()
    }
}
struct MetadataEncoding<'a>(&'a Metadata);
impl Serialize for MetadataEncoding<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut record = serializer.serialize_struct("RichStateMetadataV1", 3)?;
        record.serialize_field(
            "selection",
            &self.0.selection.as_ref().map(SelectionRecord::from_kind),
        )?;
        record
            .serialize_field("pendingFormats", &self.0.pending.as_ref().map(FormatSetEncoding))?;
        record.serialize_field("revision", &DecimalU64Record::new(self.0.revision.get()))?;
        record.end()
    }
}
struct EntriesEncoding<'a>(&'a [Entry]);
impl Serialize for EntriesEncoding<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut seq = serializer.serialize_seq(Some(self.0.len()))?;
        for entry in self.0 {
            seq.serialize_element(&EntryEncoding(entry))?;
        }
        seq.end()
    }
}
struct EntryEncoding<'a>(&'a Entry);
impl Serialize for EntryEncoding<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut record = serializer.serialize_struct("RichEntryV1", 5)?;
        record.serialize_field(
            "target",
            &self.0.recipe.target.as_ref().map(crate::rich_content::BlockId::as_str),
        )?;
        record.serialize_field("expected", &NodeEncoding(&self.0.recipe.expected))?;
        record.serialize_field("replacement", &NodeEncoding(&self.0.recipe.replacement))?;
        record.serialize_field("before", &MetadataEncoding(&self.0.before))?;
        record.serialize_field("after", &MetadataEncoding(&self.0.after))?;
        record.end()
    }
}
