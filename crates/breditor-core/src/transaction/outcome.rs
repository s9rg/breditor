use crate::transaction::Commit;

/// Result of applying a valid transaction request.
#[derive(Debug, Eq, PartialEq)]
pub enum TransactionOutcome {
    /// At least one operation applied or explicit editor state changed.
    ///
    /// Applied operations remain an observable event even when a multi-operation
    /// batch returns to a document equal to its base: relocation, changes, and
    /// history intent are still retained by the commit.
    Committed(Box<Commit>),
    /// No operation applied and explicit editor-state updates were unchanged;
    /// no revision was consumed.
    Unchanged,
}

impl TransactionOutcome {
    /// Returns the commit when a revision was published.
    #[must_use]
    pub const fn commit(&self) -> Option<&Commit> {
        match self {
            Self::Committed(commit) => Some(commit),
            Self::Unchanged => None,
        }
    }

    /// Consumes the outcome and returns its commit when a revision was published.
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
