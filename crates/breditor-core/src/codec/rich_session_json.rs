//! Separately versioned exact single-user rich checkpoint, not a sync protocol.

use super::{
    DocumentJsonCodecV2, JsonFailure, RichSessionCodecError,
    json_size::JsonByteCounter,
    rich_session_decode::{entries, metadata},
    rich_session_encoding::CheckpointEncoding,
};
use crate::{
    rich_content::{RichDocument, RichLocalSession, local_session::durable::Checkpoint},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde::Deserialize;
use serde_json::value::RawValue;

/// Exact format family for local rich restart history; never a collaboration update.
pub const RICH_SESSION_FORMAT: &str = "breditor/rich-local-session";
/// First additive local rich checkpoint version; existing V7 is unchanged.
pub const RICH_SESSION_FORMAT_VERSION: u32 = 1;

/// Strict, bounded, replay-proved local rich checkpoint codec bound to one host context.
///
/// It preserves retained undo/redo, selection, pending formats and exact revisions.
/// Decoding creates a new exclusive owner with fresh process-local observation tokens.
/// Assets remain semantic references: neither raster bytes nor upload status are embedded.
#[derive(Clone, Debug)]
pub struct RichSessionJsonCodec {
    pub(super) context: EditorContext,
    pub(super) max_json_bytes: usize,
    pub(super) max_entries: usize,
}
impl RichSessionJsonCodec {
    /// Bind a separate local rich codec with a 16 MiB and 1000 retained-entry budget.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        Self { context, max_json_bytes: 16 * 1024 * 1024, max_entries: 1000 }
    }
    /// Set an independent serialized checkpoint byte budget; document limits still apply.
    #[must_use]
    pub const fn with_max_json_bytes(mut self, maximum: usize) -> Self {
        self.max_json_bytes = maximum;
        self
    }
    /// Set a checked independent retained-entry limit; runtime capacity is preserved separately.
    #[must_use]
    pub fn with_max_history_entries(mut self, maximum: HistoryCapacity) -> Self {
        self.max_entries = maximum.as_usize();
        self
    }
    /// Encode a coherent local owner after replay and active-policy admission.
    ///
    /// # Errors
    /// Rejects incompatible schemas, tighter host limits, incoherent history or byte/entry limits.
    pub fn encode(&self, session: &RichLocalSession) -> Result<String, RichSessionCodecError> {
        let checkpoint = session.durable_checkpoint()?;
        if checkpoint.entries.len() > self.max_entries {
            return Err(RichSessionCodecError::Limit);
        }
        RichLocalSession::restore_checkpoint(self.context.clone(), checkpoint.clone())?;
        // The embedded base must fit its own Document V2 byte budget as well
        // as the outer checkpoint budget, so every emitted checkpoint decodes.
        DocumentJsonCodecV2::new(self.context.schema().clone())
            .with_limits(self.context.limits().clone())
            .encode(checkpoint.base.document())?;
        let encoding = CheckpointEncoding(&checkpoint);
        let mut counter = JsonByteCounter::new(self.max_json_bytes);
        let result = serde_json::to_writer(&mut counter, &encoding);
        if counter.exceeded() {
            return Err(RichSessionCodecError::Limit);
        }
        result.map_err(|error| JsonFailure::from_serde(&error))?;
        serde_json::to_string(&encoding).map_err(|error| JsonFailure::from_serde(&error).into())
    }
    /// Decode and replay every retained local entry before returning a fresh exclusive owner.
    ///
    /// # Errors
    /// Rejects unknown/duplicate fields, unsupported envelopes, invalid boundaries,
    /// stale branch guards, bad saved metadata or resource limits atomically.
    pub fn decode(&self, input: &str) -> Result<RichLocalSession, RichSessionCodecError> {
        if input.len() > self.max_json_bytes {
            return Err(RichSessionCodecError::Limit);
        }
        let record: Envelope<'_> =
            serde_json::from_str(input).map_err(|error| JsonFailure::from_serde(&error))?;
        if record.format != RICH_SESSION_FORMAT
            || record.format_version != RICH_SESSION_FORMAT_VERSION
        {
            return Err(RichSessionCodecError::Format);
        }
        let codec = DocumentJsonCodecV2::new(self.context.schema().clone())
            .with_limits(self.context.limits().clone());
        let base = RichDocument::try_admit(
            self.context.schema(),
            codec.decode(record.base_document.get())?,
            self.context.limits(),
        )?;
        let checkpoint = Checkpoint {
            base,
            base_metadata: metadata(self, record.base_state.get())?,
            entries: entries(self, record.entries.get())?,
            current: metadata(self, record.current_state.get())?,
            cursor: usize::try_from(record.cursor).map_err(|_| RichSessionCodecError::Value)?,
            capacity: HistoryCapacity::try_new(record.history_capacity)
                .map_err(|_| RichSessionCodecError::Value)?,
        };
        Ok(RichLocalSession::restore_checkpoint(self.context.clone(), checkpoint)?)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Envelope<'a> {
    format: String,
    format_version: u32,
    #[serde(borrow)]
    base_document: &'a RawValue,
    #[serde(borrow)]
    base_state: &'a RawValue,
    #[serde(borrow)]
    entries: &'a RawValue,
    cursor: u32,
    history_capacity: u32,
    #[serde(borrow)]
    current_state: &'a RawValue,
}
