use std::sync::Arc;

use thiserror::Error;

use crate::{
    identity::QualifiedName,
    operation::{ChangeSet, Operation, RelocationMap},
    state::{EditorState, Revision, SnapshotId},
    transaction::{
        HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction, TransactionMetadata,
    },
};

/// One successfully proven immutable editor-state transition.
///
/// A commit is an in-memory notification artifact, not a serialized operation
/// record. It deliberately retains exact before/after selections so history
/// does not attempt to invert lossy deletion relocation.
#[derive(Debug, Eq, PartialEq)]
pub struct Commit {
    before: EditorState,
    after: EditorState,
    forward_operations: Arc<[Operation]>,
    inverse_operations: Arc<[Operation]>,
    relocation: RelocationMap,
    changes: ChangeSet,
    metadata: TransactionMetadata,
}

impl Commit {
    /// Returns the exact source snapshot.
    #[must_use]
    pub const fn base_snapshot(&self) -> &SnapshotId {
        self.before.snapshot()
    }

    /// Returns the exact result snapshot.
    #[must_use]
    pub const fn snapshot(&self) -> &SnapshotId {
        self.after.snapshot()
    }

    /// Returns the source revision.
    #[must_use]
    pub const fn base_revision(&self) -> Revision {
        self.before.snapshot().revision()
    }

    /// Returns the result revision.
    #[must_use]
    pub const fn revision(&self) -> Revision {
        self.after.snapshot().revision()
    }

    /// Returns the exact source editor state.
    #[must_use]
    pub const fn before(&self) -> &EditorState {
        &self.before
    }

    /// Returns the exact result editor state.
    #[must_use]
    pub const fn after(&self) -> &EditorState {
        &self.after
    }

    /// Returns applied operations in forward replay order.
    #[must_use]
    pub fn forward_operations(&self) -> &[Operation] {
        &self.forward_operations
    }

    /// Returns exact content inverses already arranged in undo application order.
    ///
    /// Use [`Self::undo_transaction`] to also restore selection and pending
    /// formats with a new monotonic revision.
    #[must_use]
    pub fn inverse_operations(&self) -> &[Operation] {
        &self.inverse_operations
    }

    /// Returns the composed source-to-result relocation.
    #[must_use]
    pub const fn relocation(&self) -> &RelocationMap {
        &self.relocation
    }

    /// Returns semantic content changes in forward operation order.
    #[must_use]
    pub const fn changes(&self) -> &ChangeSet {
        &self.changes
    }

    /// Returns typed action/history metadata.
    #[must_use]
    pub const fn metadata(&self) -> &TransactionMetadata {
        &self.metadata
    }

    /// Builds an atomic inverse request that restores exact prior editor state.
    ///
    /// Unlike replaying [`Self::inverse_operations`] alone, this also restores
    /// the prior selection and pending typing formats. The new request uses the
    /// current revision and therefore preserves monotonic snapshot numbering.
    ///
    /// # Errors
    ///
    /// Returns [`CommitReplayError`] when `current` is not in this commit's
    /// lineage or no longer has the commit's result document.
    pub fn undo_transaction(
        &self,
        current: &EditorState,
    ) -> Result<Transaction, CommitReplayError> {
        validate_replay_base(current, &self.after, ReplayDirection::Undo)?;
        Ok(Transaction::new(current, self.inverse_operations.to_vec())
            .with_selection_update(SelectionUpdate::Set(self.before.selection().cloned()))
            .with_pending_formats_update(PendingFormatsUpdate::Set(
                self.before.pending_formats().cloned(),
            ))
            .with_metadata(replay_metadata("breditor/undo")))
    }

    /// Builds a forward request that restores this commit's exact result state.
    ///
    /// # Errors
    ///
    /// Returns [`CommitReplayError`] when `current` is not in this commit's
    /// lineage or no longer has the commit's source document.
    pub fn redo_transaction(
        &self,
        current: &EditorState,
    ) -> Result<Transaction, CommitReplayError> {
        validate_replay_base(current, &self.before, ReplayDirection::Redo)?;
        Ok(Transaction::new(current, self.forward_operations.to_vec())
            .with_selection_update(SelectionUpdate::Set(self.after.selection().cloned()))
            .with_pending_formats_update(PendingFormatsUpdate::Set(
                self.after.pending_formats().cloned(),
            ))
            .with_metadata(replay_metadata("breditor/redo")))
    }

    /// Consumes the notification artifact and returns its result state.
    #[must_use]
    pub fn into_after(self) -> EditorState {
        self.after
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn new(
        before: EditorState,
        after: EditorState,
        forward_operations: Vec<Operation>,
        inverse_operations: Vec<Operation>,
        relocation: RelocationMap,
        changes: ChangeSet,
        metadata: TransactionMetadata,
    ) -> Self {
        Self {
            before,
            after,
            forward_operations: Arc::from(forward_operations),
            inverse_operations: Arc::from(inverse_operations),
            relocation,
            changes,
            metadata,
        }
    }
}

fn replay_metadata(action: &'static str) -> TransactionMetadata {
    TransactionMetadata::new(Some(QualifiedName::from_known_static(action)), HistoryIntent::Ignore)
}

fn validate_replay_base(
    current: &EditorState,
    expected: &EditorState,
    direction: ReplayDirection,
) -> Result<(), CommitReplayError> {
    if current.snapshot().lineage() != expected.snapshot().lineage() {
        return Err(CommitReplayError::LineageMismatch { direction });
    }
    if current.document() != expected.document() {
        return Err(CommitReplayError::DocumentMismatch { direction });
    }
    Ok(())
}

/// Direction of a commit-derived history replay request.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReplayDirection {
    /// Apply inverse operations and restore the before state.
    Undo,
    /// Apply forward operations and restore the after state.
    Redo,
}

/// Why a commit cannot generate an undo or redo request from the current state.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum CommitReplayError {
    /// History cannot cross editor lineages.
    #[error("{direction:?} state belongs to a different editor lineage")]
    LineageMismatch {
        /// Requested history direction.
        direction: ReplayDirection,
    },
    /// Current content no longer matches the expected side of the commit.
    #[error("{direction:?} state document no longer matches the commit")]
    DocumentMismatch {
        /// Requested history direction.
        direction: ReplayDirection,
    },
}
