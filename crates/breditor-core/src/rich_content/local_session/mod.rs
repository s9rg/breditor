//! Exclusive synchronous local rich owner, separate from collaboration and legacy codecs.
//!
//! One dispatch is one explicit history unit. The separate opt-in local rich
//! checkpoint codec proves exact retained history replay before restoring an owner.

mod dispatch;
pub(crate) mod durable;
mod error;
mod history_entry;
mod history_recipe;
mod insert_plain_text;
pub(crate) mod local_rewrite;
mod redo;
mod set_pending_formats;
mod snapshot;
mod state;
mod typing_state;
mod undo;

pub use error::RichLocalSessionError;
pub use snapshot::RichLocalSnapshot;
pub use state::RichLocalState;

use super::{RichDocument, RichSelectionKind};
use crate::{
    session::HistoryCapacity,
    state::{EditorContext, Revision},
};
use history_entry::RichHistoryEntry;
use std::sync::Arc;

/// Explicit selection policy for one atomic rich dispatch.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RichSelectionUpdate {
    /// Map the current selection through this complete group, including text splices.
    Map,
    /// Validate these logical values against the complete resulting tree, or clear.
    Set(Option<RichSelectionKind>),
}

/// Explicit pending typing-format policy for a complete atomic rich dispatch.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RichPendingFormatsUpdate {
    /// Retain formats only through the mapped same-block/same-kind effective caret.
    Map,
    /// Validate and set these formats at the resulting caret, or clear derivation override.
    Set(Option<crate::document::FormatSet>),
}

/// Observable publication outcome; no-op work changes neither revision nor history.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichLocalOutcome {
    /// Nothing was published.
    Unchanged,
    /// Only selection changed; no undo entry was created or redo branch discarded.
    SelectionOnly,
    /// Only pending typing state changed; no content undo or redo branch was altered.
    TypingStateOnly,
    /// One complete content group and its exact selection/history values were published.
    ContentCommitted,
    /// One exact retained group was undone.
    UndoApplied,
    /// One exact retained group was redone.
    RedoApplied,
}

/// Authoritative single-user rich document, selection and bounded exact history.
///
/// Exclusive mutable methods serialize publication. There is intentionally no
/// public Clone: independently mutable owners must not share observation tokens.
/// The separate local codec restores retained history; this is not shared selective undo.
pub struct RichLocalSession {
    context: EditorContext,
    state: RichLocalState,
    entries: Vec<RichHistoryEntry>,
    cursor: usize,
    capacity: HistoryCapacity,
    token: Arc<()>,
}

impl std::fmt::Debug for RichLocalSession {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("RichLocalSession")
            .field("revision", &self.state.revision())
            .field("undo_depth", &self.undo_depth())
            .field("redo_depth", &self.redo_depth())
            .field("capacity", &self.capacity)
            .finish_non_exhaustive()
    }
}

impl RichLocalSession {
    /// Admit one local owner with explicit entry retention and optional logical selection.
    ///
    /// # Errors
    /// Rejects non-rich schemas, incompatible documents, host limits or invalid selections.
    pub fn try_new(
        context: EditorContext,
        document: RichDocument,
        selection: Option<RichSelectionKind>,
        capacity: HistoryCapacity,
    ) -> Result<Self, RichLocalSessionError> {
        let state = RichLocalState::try_new(&context, document, selection, None, Revision::ZERO)?;
        Ok(Self { context, state, entries: vec![], cursor: 0, capacity, token: Arc::new(()) })
    }
    /// Current admitted immutable document, selection and publication revision.
    #[must_use]
    pub const fn state(&self) -> &RichLocalState {
        &self.state
    }
    /// Active immutable schema and execution policy.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }
    /// Exact process-local observation; capture before planning/queuing a dispatch.
    #[must_use]
    pub fn snapshot(&self) -> RichLocalSnapshot {
        RichLocalSnapshot::new(self.token.clone(), self.state.clone())
    }
    /// Maximum retained chronological entries, including undo and redo.
    #[must_use]
    pub const fn history_capacity(&self) -> HistoryCapacity {
        self.capacity
    }
    /// Number of currently undoable explicit groups.
    #[must_use]
    pub fn undo_depth(&self) -> u32 {
        u32::try_from(self.cursor).unwrap_or(u32::MAX)
    }
    /// Number of currently redoable explicit groups.
    #[must_use]
    pub fn redo_depth(&self) -> u32 {
        u32::try_from(self.entries.len() - self.cursor).unwrap_or(u32::MAX)
    }
    /// Whether exact local undo is available.
    #[must_use]
    pub const fn can_undo(&self) -> bool {
        self.cursor != 0
    }
    /// Whether exact local redo is available.
    #[must_use]
    pub fn can_redo(&self) -> bool {
        self.cursor < self.entries.len()
    }

    fn check(&self, snapshot: &RichLocalSnapshot) -> Result<(), RichLocalSessionError> {
        if !snapshot.belongs_to(&self.token) {
            return Err(RichLocalSessionError::StaleSnapshot);
        }
        Ok(())
    }
    fn publish(&mut self, state: RichLocalState) {
        self.state = state;
        self.token = Arc::new(());
    }
}
