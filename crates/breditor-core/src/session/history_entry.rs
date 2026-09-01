use crate::{
    identity::QualifiedName,
    operation::Operation,
    state::EditorState,
    transaction::{
        Commit, CommitReplayError, HistoryIntent, PendingFormatsUpdate, ReplayDirection,
        SelectionUpdate, Transaction, TransactionMetadata,
    },
};

/// One atomic user-visible undo unit.
///
/// Snapshot identities inside the boundary states are historical metadata.
/// Replay always authors a fresh transaction from the session's current state,
/// while the stored documents and cursor values define the exact two sides.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct HistoryEntry {
    before: EditorState,
    after: EditorState,
    forward_operations: Vec<Operation>,
    inverse_operations: Vec<Operation>,
}

impl HistoryEntry {
    pub(crate) fn from_commit(commit: &Commit) -> Self {
        Self {
            before: commit.before().clone(),
            after: commit.after().clone(),
            forward_operations: commit.forward_operations().to_vec(),
            inverse_operations: commit.inverse_operations().to_vec(),
        }
    }

    pub(crate) fn try_merge(&mut self, commit: &Commit, maximum_operations: usize) -> bool {
        if self.after != *commit.before() {
            return false;
        }
        let Some(forward_count) =
            self.forward_operations.len().checked_add(commit.forward_operations().len())
        else {
            return false;
        };
        let Some(inverse_count) =
            self.inverse_operations.len().checked_add(commit.inverse_operations().len())
        else {
            return false;
        };
        if forward_count > maximum_operations || inverse_count > maximum_operations {
            return false;
        }

        self.forward_operations.extend_from_slice(commit.forward_operations());
        let previous_inverses = std::mem::take(&mut self.inverse_operations);
        self.inverse_operations = Vec::with_capacity(inverse_count);
        self.inverse_operations.extend_from_slice(commit.inverse_operations());
        self.inverse_operations.extend(previous_inverses);
        self.after = commit.after().clone();
        true
    }

    pub(crate) fn update_before_boundary(&mut self, state: &EditorState) {
        self.before = state.clone();
    }

    pub(crate) fn update_after_boundary(&mut self, state: &EditorState) {
        self.after = state.clone();
    }

    pub(crate) fn before_matches(&self, state: &EditorState) -> bool {
        same_replay_boundary(state, &self.before)
    }

    pub(crate) fn after_matches(&self, state: &EditorState) -> bool {
        same_replay_boundary(state, &self.after)
    }

    pub(crate) fn undo_result_matches(&self, state: &EditorState) -> bool {
        same_replay_result(state, &self.before)
    }

    pub(crate) fn redo_result_matches(&self, state: &EditorState) -> bool {
        same_replay_result(state, &self.after)
    }

    pub(crate) fn undo_transaction(
        &self,
        current: &EditorState,
    ) -> Result<Transaction, CommitReplayError> {
        validate_replay_boundary(current, &self.after, ReplayDirection::Undo)?;
        Ok(Transaction::new(current, self.inverse_operations.clone())
            .with_selection_update(SelectionUpdate::Set(self.before.selection().cloned()))
            .with_pending_formats_update(PendingFormatsUpdate::Set(
                self.before.pending_formats().cloned(),
            ))
            .with_metadata(replay_metadata(ReplayDirection::Undo)))
    }

    pub(crate) fn redo_transaction(
        &self,
        current: &EditorState,
    ) -> Result<Transaction, CommitReplayError> {
        validate_replay_boundary(current, &self.before, ReplayDirection::Redo)?;
        Ok(Transaction::new(current, self.forward_operations.clone())
            .with_selection_update(SelectionUpdate::Set(self.after.selection().cloned()))
            .with_pending_formats_update(PendingFormatsUpdate::Set(
                self.after.pending_formats().cloned(),
            ))
            .with_metadata(replay_metadata(ReplayDirection::Redo)))
    }
}

fn same_replay_boundary(current: &EditorState, expected: &EditorState) -> bool {
    current.snapshot().lineage() == expected.snapshot().lineage()
        && current.document() == expected.document()
}

fn same_replay_result(actual: &EditorState, expected: &EditorState) -> bool {
    same_replay_boundary(actual, expected)
        && actual.context() == expected.context()
        && actual.selection() == expected.selection()
        && actual.pending_formats() == expected.pending_formats()
}

fn validate_replay_boundary(
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

fn replay_metadata(direction: ReplayDirection) -> TransactionMetadata {
    let action = match direction {
        ReplayDirection::Undo => "breditor/undo",
        ReplayDirection::Redo => "breditor/redo",
    };
    TransactionMetadata::new(Some(QualifiedName::from_known_static(action)), HistoryIntent::Ignore)
}
