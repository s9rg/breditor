//! Explicit whole-document selection recovery; original local/typing session families remain strict.
use super::{RichSessionCodecError, RichSessionJsonCodec, RichTypingSessionJsonCodec};
use crate::{rich_content::RichLocalSession, session::HistoryCapacity, state::EditorContext};
/// Separate exact explicit-history family admitting native whole-document selection metadata.
pub const RICH_DOCUMENT_SESSION_FORMAT: &str = "breditor/rich-document-session";
/// Separate exact natural-history family, including its document-selection-aware inner checkpoint.
pub const RICH_DOCUMENT_TYPING_SESSION_FORMAT: &str = "breditor/rich-document-typing-session";
/// First document-selection checkpoint revision; original session versions are not widened.
pub const RICH_DOCUMENT_SESSION_FORMAT_VERSION: u32 = 1;

/// Bounded replay-proved explicit history with document/text/node/grid selections.
#[derive(Clone, Debug)]
pub struct RichDocumentSessionJsonCodec {
    inner: RichSessionJsonCodec,
}
impl RichDocumentSessionJsonCodec {
    /// Explicitly select whole-document metadata with original 16 MiB/1000-step defaults.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        let mut inner = RichSessionJsonCodec::new(context);
        inner.document_selection = true;
        Self { inner }
    }
    /// Configure the independent envelope byte budget; document limits remain mandatory.
    #[must_use]
    pub const fn with_max_json_bytes(mut self, maximum: usize) -> Self {
        self.inner.max_json_bytes = maximum;
        self
    }
    /// Configure the retained original-step ceiling.
    #[must_use]
    pub fn with_max_history_entries(mut self, maximum: HistoryCapacity) -> Self {
        self.inner = self.inner.with_max_history_entries(maximum);
        self
    }
    /// Encode exact explicit history without silently dropping a whole-document selection.
    /// # Errors
    /// Rejects natural grouping, incompatible state, replay failures and active budgets.
    pub fn encode(&self, session: &RichLocalSession) -> Result<String, RichSessionCodecError> {
        self.inner.encode(session)
    }
    /// Restore only this explicit family, replaying every entry and its before/after UI.
    /// # Errors
    /// Rejects other families, unknown/duplicate fields, invalid metadata and replay/budget failures.
    pub fn decode(&self, input: &str) -> Result<RichLocalSession, RichSessionCodecError> {
        self.inner.decode(input)
    }
}
/// Bounded replay-proved natural history with the same explicit whole-document scope.
#[derive(Clone, Debug)]
pub struct RichDocumentTypingSessionJsonCodec {
    inner: RichTypingSessionJsonCodec,
}
impl RichDocumentTypingSessionJsonCodec {
    /// Select the separate natural family; future typing starts a fresh continuation after recovery.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        let mut inner = RichTypingSessionJsonCodec::new(context);
        inner.inner.document_selection = true;
        Self { inner }
    }
    /// Configure the byte budget for the complete wrapper and embedded checkpoint.
    #[must_use]
    pub const fn with_max_json_bytes(mut self, maximum: usize) -> Self {
        self.inner.inner.max_json_bytes = maximum;
        self
    }
    /// Bound retained original steps rather than only the smaller natural group count.
    #[must_use]
    pub fn with_max_history_entries(mut self, maximum: HistoryCapacity) -> Self {
        self.inner = self.inner.with_max_history_entries(maximum);
        self
    }
    /// Encode the exact native partition and document-selection-aware explicit records.
    /// # Errors
    /// Rejects disabled grouping, invalid partitions, replay failures and active budgets.
    pub fn encode(&self, session: &RichLocalSession) -> Result<String, RichSessionCodecError> {
        self.inner.encode(session)
    }
    /// Restore this natural family with exact future grouped Undo/Redo and selection metadata.
    /// # Errors
    /// Rejects other families, unknown/duplicate fields, invalid groups and replay/budget failures.
    pub fn decode(&self, input: &str) -> Result<RichLocalSession, RichSessionCodecError> {
        self.inner.decode(input)
    }
}
