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

/// Borrowed proof inputs used by the durable commit boundary.
pub(crate) struct CommitCheckpointParts<'a> {
    pub(crate) before: &'a EditorState,
    pub(crate) after: &'a EditorState,
    pub(crate) forward_operations: &'a [Operation],
    pub(crate) metadata: &'a TransactionMetadata,
}

impl Commit {
    /// Returns persisted proof inputs while exhaustively accounting for every field.
    ///
    /// The destructuring below intentionally names derived fields without
    /// returning them. Adding a new commit field therefore fails compilation
    /// until the durable boundary explicitly classifies it as persisted or
    /// derived.
    pub(crate) fn checkpoint_parts(&self) -> CommitCheckpointParts<'_> {
        let Self {
            before,
            after,
            forward_operations,
            // Commit V1 derives these from `before` plus the forward recipe.
            inverse_operations: _,
            relocation: _,
            changes: _,
            metadata,
        } = self;
        CommitCheckpointParts { before, after, forward_operations, metadata }
    }

    /// Compares exactly the fields represented by the durable Commit V1 proof.
    ///
    /// Inverse operations, relocation, changes, the result document, and the
    /// successor snapshot are replay-derived values. Excluding those caches
    /// keeps local-log retry identity tied to the durable proof even if a
    /// future implementation changes an internal derived representation.
    pub(crate) fn same_checkpoint_proof(&self, other: &Self) -> bool {
        let Self {
            before,
            after,
            forward_operations,
            inverse_operations: _,
            relocation: _,
            changes: _,
            metadata,
        } = self;
        let Self {
            before: other_before,
            after: other_after,
            forward_operations: other_forward_operations,
            inverse_operations: _,
            relocation: _,
            changes: _,
            metadata: other_metadata,
        } = other;
        before == other_before
            && forward_operations == other_forward_operations
            && after.selection() == other_after.selection()
            && after.pending_formats() == other_after.pending_formats()
            && metadata == other_metadata
    }

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
    /// [`crate::session::EditorSession`] users should call
    /// [`crate::session::EditorSession::undo`] instead. Publishing this
    /// low-level `HistoryIntent::Ignore` replay through the session's ordinary
    /// transaction/commit path conservatively clears its linear history.
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
    /// [`crate::session::EditorSession`] users should call
    /// [`crate::session::EditorSession::redo`] instead. Publishing this
    /// low-level `HistoryIntent::Ignore` replay through the session's ordinary
    /// transaction/commit path conservatively clears its linear history.
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
