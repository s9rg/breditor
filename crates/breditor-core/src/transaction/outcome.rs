use crate::transaction::Commit;

/// Result of applying a valid transaction request.
#[derive(Debug, Eq, PartialEq)]
pub enum TransactionOutcome {
    /// Content or explicit editor state changed and produced one commit.
    Committed(Box<Commit>),
    /// Content and explicit editor-state updates were unchanged; no revision was consumed.
    Unchanged,
}

impl TransactionOutcome {
    /// Returns the commit, when content changed.
    #[must_use]
    pub const fn commit(&self) -> Option<&Commit> {
        match self {
            Self::Committed(commit) => Some(commit),
            Self::Unchanged => None,
        }
    }

    /// Consumes the outcome and returns its commit, when present.
    #[must_use]
    pub fn into_commit(self) -> Option<Commit> {
        match self {
            Self::Committed(commit) => Some(*commit),
            Self::Unchanged => None,
        }
    }

    /// Returns whether no content or revision changed.
    #[must_use]
    pub const fn is_unchanged(&self) -> bool {
        matches!(self, Self::Unchanged)
    }
}
