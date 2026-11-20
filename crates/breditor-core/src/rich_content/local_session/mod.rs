//! Exclusive synchronous local rich owner, separate from collaboration and legacy codecs.
//!
//! One dispatch retains one explicit history record. Natural user-input grouping
//! is separately enabled and persisted; original checkpoints/defaults stay exact.

mod apply_markdown_input_rule;
mod change_selection_formats;
mod change_selection_layout;
mod check_observation;
mod close_typing_group;
mod collapse_document_selection;
mod commit_content;
mod delete_atom;
mod delete_typing_range;
mod details;
mod dispatch;
pub(crate) mod durable;
mod enable_typing_history;
mod error;
mod exit_code_block;
mod history_entry;
mod history_recipe;
mod insert_general_paragraph;
mod insert_hard_break;
mod insert_mention;
mod insert_paragraph_adjacent;
mod insert_plain_text;
mod insert_plain_text_with_markdown_rules;
mod insert_typing_text;
mod insert_typing_text_with_markdown_rules;
pub(crate) mod local_rewrite;
mod navigate_flow;
mod paste_document_clipboard;
mod paste_general_flow_clipboard;
mod paste_general_inline_clipboard;
mod plan_general_range_plain_text;
mod redo;
mod replace_atom_plain_text;
mod replace_atom_typing_text;
mod replace_document_plain_text;
mod replace_document_typing_text;
mod replace_general_range_plain_text;
mod replace_general_range_text;
mod replace_general_range_typing_text;
mod replace_general_selection_text;
mod replace_range_plain_text;
mod replace_search_all;
mod replace_search_one;
mod replace_search_plan;
mod replace_selection_plain_text;
mod replace_selection_text;
mod retained_asset_references;
mod select_document;
mod set_pending_formats;
mod set_read_only;
mod set_text_language;
mod snapshot;
mod state;
pub(crate) mod typing_history;
pub(crate) mod typing_state;
mod undo;
mod validate_observation;

pub use error::RichLocalSessionError;
pub use plan_general_range_plain_text::RichGeneralPlainRangePlan;
pub use snapshot::RichLocalSnapshot;
pub use state::RichLocalState;
pub use typing_history::{
    RICH_TYPING_GROUP_MAX_STEPS, RICH_TYPING_GROUP_WINDOW_MS, RichTypingDeleteDirection,
};

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
    // Host policy, never part of document/history/checkpoint permissions.
    read_only: bool,
    read_only_revision: Option<Revision>,
    typing_history: Option<typing_history::TypingHistory>,
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
        Ok(Self {
            context,
            state,
            entries: vec![],
            cursor: 0,
            capacity,
            token: Arc::new(()),
            read_only: false,
            read_only_revision: None,
            typing_history: None,
        })
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
        RichLocalSnapshot::new(
            self.token.clone(),
            self.state.clone(),
            self.read_only,
            self.read_only_revision,
        )
    }
    /// Maximum retained chronological entries, including undo and redo.
    #[must_use]
    pub const fn history_capacity(&self) -> HistoryCapacity {
        self.capacity
    }
    /// Currently undoable native units; defaults to one per explicit dispatch.
    #[must_use]
    pub fn undo_depth(&self) -> u32 {
        if let Some(history) = &self.typing_history {
            return history.undo_depth(self.cursor);
        }
        u32::try_from(self.cursor).unwrap_or(u32::MAX)
    }
    /// Currently redoable native units, including optional natural input bursts.
    #[must_use]
    pub fn redo_depth(&self) -> u32 {
        if let Some(history) = &self.typing_history {
            return u32::try_from(history.groups.len()).unwrap_or(u32::MAX)
                - history.undo_depth(self.cursor);
        }
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
        if let Some(history) = &mut self.typing_history {
            history.continuation = None;
        }
        self.state = state;
        self.token = Arc::new(());
    }
}
