use crate::identity::QualifiedName;

/// How a successful commit participates in a future undo history.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub enum HistoryIntent {
    /// Record one independent undo entry.
    #[default]
    Record,
    /// Offer the commit for coalescing with an adjacent entry of the same group.
    Merge {
        /// Stable action-defined group, such as `breditor/typing`.
        group: QualifiedName,
    },
    /// Do not add the commit to user-visible undo history.
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
