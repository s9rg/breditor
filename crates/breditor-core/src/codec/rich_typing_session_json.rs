//! Separately versioned history-group envelope over unchanged replay-proved explicit records.
//!
//! The partition is bounded declarative Undo metadata, not a claim that physical
//! keystrokes or past timestamps were authenticated. Original records retain
//! every actual revision and inverse. No group crosses the saved history cursor;
//! active typing continuation is deliberately not restored.

use super::{JsonFailure, RichSessionCodecError, RichSessionJsonCodec, json_size::JsonByteCounter};
use crate::{rich_content::RichLocalSession, session::HistoryCapacity, state::EditorContext};
use serde::{
    Deserialize, Serialize,
    de::{DeserializeSeed, Error as _, SeqAccess, Visitor},
};
use serde_json::value::RawValue;
use std::fmt;

/// Explicit family for native local typing-history partitions; not a sync protocol.
pub const RICH_TYPING_SESSION_FORMAT: &str = "breditor/rich-typing-session";
/// First envelope version; the embedded original rich-local-session stays version 1.
pub const RICH_TYPING_SESSION_FORMAT_VERSION: u32 = 1;

/// Strict exact local typing-history recovery bound to one existing editor context.
#[derive(Clone, Debug)]
pub struct RichTypingSessionJsonCodec {
    pub(super) inner: RichSessionJsonCodec,
}

impl RichTypingSessionJsonCodec {
    /// Use the original 16 MiB/1000-entry policy for the entire new envelope.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        Self { inner: RichSessionJsonCodec::new(context) }
    }
    /// Tighten or explicitly configure the entire serialized envelope's byte ceiling.
    #[must_use]
    pub const fn with_max_json_bytes(mut self, maximum: usize) -> Self {
        self.inner.max_json_bytes = maximum;
        self
    }
    /// Bound original retained steps, not the smaller number of natural groups.
    #[must_use]
    pub fn with_max_history_entries(mut self, maximum: HistoryCapacity) -> Self {
        self.inner = self.inner.with_max_history_entries(maximum);
        self
    }
    /// Encode exact original records and their native history partition.
    /// # Errors
    /// Rejects disabled grouping, incompatible/replay-invalid state or active resource limits.
    pub fn encode(&self, session: &RichLocalSession) -> Result<String, RichSessionCodecError> {
        let groups = session.typing_partition().ok_or(RichSessionCodecError::Format)?;
        session.validate_typing_partition(groups)?;
        let checkpoint = self.inner.encode_explicit_records(session)?;
        let checkpoint =
            RawValue::from_string(checkpoint).map_err(|error| JsonFailure::from_serde(&error))?;
        let value = Encoding {
            format: if self.inner.document_selection {
                super::rich_document_session_json::RICH_DOCUMENT_TYPING_SESSION_FORMAT
            } else {
                RICH_TYPING_SESSION_FORMAT
            },
            format_version: if self.inner.document_selection {
                super::rich_document_session_json::RICH_DOCUMENT_SESSION_FORMAT_VERSION
            } else {
                RICH_TYPING_SESSION_FORMAT_VERSION
            },
            checkpoint: &checkpoint,
            groups,
        };
        let mut counter = JsonByteCounter::new(self.inner.max_json_bytes);
        let encoding_result = serde_json::to_writer(&mut counter, &value);
        if counter.exceeded() {
            return Err(RichSessionCodecError::Limit);
        }
        encoding_result.map_err(|error| JsonFailure::from_serde(&error))?;
        serde_json::to_string(&value).map_err(|error| JsonFailure::from_serde(&error).into())
    }
    /// Replay-admit the original history and validate its complete partition before exposure.
    ///
    /// Restored history retains exact grouped Undo/Redo. The next user input starts
    /// a fresh group, and read-only policy still defaults to editable.
    /// # Errors
    /// Rejects unknown/duplicate fields, wrong families/versions, oversized/invalid
    /// groups, a cursor inside a group, invalid original replay or resource limits.
    pub fn decode(&self, input: &str) -> Result<RichLocalSession, RichSessionCodecError> {
        if input.len() > self.inner.max_json_bytes {
            return Err(RichSessionCodecError::Limit);
        }
        let value: Envelope<'_> =
            serde_json::from_str(input).map_err(|error| JsonFailure::from_serde(&error))?;
        let format = if self.inner.document_selection {
            super::rich_document_session_json::RICH_DOCUMENT_TYPING_SESSION_FORMAT
        } else {
            RICH_TYPING_SESSION_FORMAT
        };
        let version = if self.inner.document_selection {
            super::rich_document_session_json::RICH_DOCUMENT_SESSION_FORMAT_VERSION
        } else {
            RICH_TYPING_SESSION_FORMAT_VERSION
        };
        if value.format != format || value.format_version != version {
            return Err(RichSessionCodecError::Format);
        }
        let mut reader = serde_json::Deserializer::from_str(value.groups.get());
        let groups = Groups(self.inner.max_entries)
            .deserialize(&mut reader)
            .map_err(|error| JsonFailure::from_serde(&error))?;
        reader.end().map_err(|error| JsonFailure::from_serde(&error))?;
        let mut owner = self.inner.decode(value.checkpoint.get())?;
        owner.restore_typing_partition(groups)?;
        Ok(owner)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Encoding<'a> {
    format: &'static str,
    format_version: u32,
    checkpoint: &'a RawValue,
    groups: &'a [u32],
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Envelope<'a> {
    format: String,
    format_version: u32,
    #[serde(borrow)]
    checkpoint: &'a RawValue,
    #[serde(borrow)]
    groups: &'a RawValue,
}
struct Groups(usize);
impl<'de> DeserializeSeed<'de> for Groups {
    type Value = Vec<u32>;
    fn deserialize<D: serde::Deserializer<'de>>(self, reader: D) -> Result<Self::Value, D::Error> {
        reader.deserialize_seq(self)
    }
}
impl<'de> Visitor<'de> for Groups {
    type Value = Vec<u32>;
    fn expecting(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
        out.write_str("a bounded original-step history partition")
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
        let mut groups = Vec::new();
        while let Some(size) = seq.next_element::<u32>()? {
            if groups.len() >= self.0
                || size == 0
                || size > crate::rich_content::RICH_TYPING_GROUP_MAX_STEPS
            {
                return Err(A::Error::custom("invalid or oversized typing history partition"));
            }
            groups.push(size);
        }
        Ok(groups)
    }
}
