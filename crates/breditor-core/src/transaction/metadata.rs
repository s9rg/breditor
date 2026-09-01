use crate::identity::QualifiedName;

/// How a successful commit participates in a history owner.
///
/// [`crate::session::EditorSession`] applies these intents only to commits with
/// non-empty applied forward operations. A selection/pending-format-only commit
/// adds no entry under any intent, preserves redo, updates adjacent cursor
/// boundaries, and closes merging. A net-zero operation batch still has applied
/// forward operations and therefore remains a content event.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub enum HistoryIntent {
    /// Record one independent entry for a content commit.
    #[default]
    Record,
    /// Offer a content commit for coalescing with an open adjacent entry of the same group.
    Merge {
        /// Stable action-defined group, such as `breditor/typing`.
        group: QualifiedName,
    },
    /// Exclude a commit from user-visible undo history.
    ///
    /// The linear session clears both branches for a content commit because it
    /// cannot yet map retained inverses through unrecorded content.
    Ignore,
}

/// Typed, deterministic metadata attached to one transaction and commit.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct TransactionMetadata {
    action: Option<QualifiedName>,
    history: HistoryIntent,
}

impl TransactionMetadata {
    /// Creates metadata for an optional action identity and history intent.
    #[must_use]
    pub const fn new(action: Option<QualifiedName>, history: HistoryIntent) -> Self {
        Self { action, history }
    }

    /// Returns the action that produced the transaction, when supplied.
    #[must_use]
    pub const fn action(&self) -> Option<&QualifiedName> {
        self.action.as_ref()
    }

    /// Returns the requested history behavior.
    #[must_use]
    pub const fn history(&self) -> &HistoryIntent {
        &self.history
    }
}
