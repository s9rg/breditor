use std::fmt;

use crate::{
    action::{
        ActionExecutionError, ActionPreparation,
        routing::{IntentExecutionOutcome, IntentRouteBaseError, IntentRouteOutcome},
    },
    state::EditorState,
    transaction::{
        Commit, ReplayDirection, Transaction, TransactionApplyError, TransactionOutcome,
    },
};

use super::{
    capacity::HistoryCapacity,
    error::{HistoryReplayError, SessionCommitError},
    history::LinearHistory,
    history_stamp::HistoryStamp,
    history_status::SessionHistoryStatus,
};

/// Authoritative synchronous owner of one current state and linear history.
///
/// The exclusive `&mut self` publication methods are the Rust serialization
/// point. Hosts may queue work, but stale transactions or prepared actions are
/// rejected rather than rebased implicitly.
pub struct EditorSession {
    state: EditorState,
    history: LinearHistory,
    history_stamp: HistoryStamp,
}

impl fmt::Debug for EditorSession {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EditorSession")
            .field("revision", &self.state.snapshot().revision())
            .field("history_capacity", &self.history_capacity())
            .field("undo_depth", &self.undo_depth())
            .field("redo_depth", &self.redo_depth())
            .finish_non_exhaustive()
    }
}

impl EditorSession {
    /// Starts a session with [`HistoryCapacity::default`].
    #[must_use]
    pub fn new(initial_state: EditorState) -> Self {
        Self::with_history_capacity(initial_state, HistoryCapacity::default())
    }

    /// Starts a session with an explicit bounded history capacity.
    #[must_use]
    pub fn with_history_capacity(
        initial_state: EditorState,
        history_capacity: HistoryCapacity,
    ) -> Self {
        Self {
            state: initial_state,
            history: LinearHistory::new(history_capacity),
            history_stamp: HistoryStamp::new(),
        }
    }

    /// Returns the authoritative current immutable state.
    #[must_use]
    pub const fn state(&self) -> &EditorState {
        &self.state
    }

    /// Returns the maximum retained entries in the complete linear history.
    #[must_use]
    pub const fn history_capacity(&self) -> HistoryCapacity {
        self.history.capacity()
    }

    /// Returns the number of currently undoable entries.
    #[must_use]
    pub fn undo_depth(&self) -> u32 {
        self.history.undo_depth()
    }

    /// Returns the number of currently redoable entries.
    #[must_use]
    pub fn redo_depth(&self) -> u32 {
        self.history.redo_depth()
    }

    /// Returns whether one undo entry is available now.
    #[must_use]
    pub fn can_undo(&self) -> bool {
        self.undo_depth() != 0
    }

    /// Returns whether one redo entry is available now.
    #[must_use]
    pub fn can_redo(&self) -> bool {
        self.redo_depth() != 0
    }

    /// Returns an immutable exact observation of the current linear history.
    ///
    /// The status remains unchanged after failed work and history operations
    /// that have no effect. Its opaque stamp changes after every published
    /// commit, successful replay, or effective explicit history boundary.
    #[must_use]
    pub fn history_status(&self) -> SessionHistoryStatus {
        SessionHistoryStatus::new(
            self.history_stamp.clone(),
            self.history_capacity(),
            self.undo_depth(),
            self.redo_depth(),
        )
    }

    /// Accepts one already-proven commit only at its exact source state.
    ///
    /// # Errors
    ///
    /// Returns [`SessionCommitError`] without changing state or history when
    /// the commit source snapshot or complete source state is stale.
    pub fn accept_commit(&mut self, commit: &Commit) -> Result<(), SessionCommitError> {
        if commit.base_snapshot() != self.state.snapshot() {
            return Err(SessionCommitError::StaleSnapshot {
                expected: self.state.snapshot().clone(),
                actual: commit.base_snapshot().clone(),
            });
        }
        if commit.before() != &self.state {
            return Err(SessionCommitError::BaseStateMismatch {
                snapshot: self.state.snapshot().clone(),
            });
        }
        self.publish(commit);
        Ok(())
    }

    /// Applies and publishes one transaction against the authoritative state.
    ///
    /// An unchanged transaction leaves history grouping untouched because no
    /// revision or editor state was published.
    ///
    /// Callers applying decoded untrusted requests must authorize or sanitize
    /// metadata first. `HistoryIntent::Ignore` can clear both history branches
    /// after a content commit, while `HistoryIntent::Merge` changes grouping.
    ///
    /// # Errors
    ///
    /// Returns [`TransactionApplyError`] without changing session state or
    /// history when the transaction is stale or any atomic proof fails.
    pub fn apply_transaction(
        &mut self,
        transaction: &Transaction,
    ) -> Result<TransactionOutcome, TransactionApplyError> {
        let outcome = transaction.apply(self.state.context(), &self.state)?;
        let TransactionOutcome::Committed(commit) = outcome else {
            return Ok(TransactionOutcome::Unchanged);
        };
        let commit = *commit;
        self.publish(&commit);
        Ok(TransactionOutcome::Committed(Box::new(commit)))
    }

    /// Executes and publishes one cached action preparation against current state.
    ///
    /// # Errors
    ///
    /// Returns [`ActionExecutionError`] when the action is disabled or its
    /// prepared base is stale. No session state changes on failure.
    pub fn execute_prepared_action(
        &mut self,
        preparation: ActionPreparation,
    ) -> Result<Commit, ActionExecutionError> {
        let commit = preparation.execute(&self.state)?;
        self.publish(&commit);
        Ok(commit)
    }

    /// Consumes one cached semantic route into a publication receipt.
    ///
    /// A committed receipt publishes its already-preflighted commit. Blocked and
    /// unhandled receipts leave both state and history unchanged. Every route
    /// validates its complete exact base before either effect.
    ///
    /// # Errors
    ///
    /// Returns [`IntentRouteBaseError`] only when the route base is stale or
    /// unequal. No session state or history changes on failure.
    pub fn execute_intent_route(
        &mut self,
        route: IntentRouteOutcome,
    ) -> Result<IntentExecutionOutcome, IntentRouteBaseError> {
        let outcome = route.execute(&self.state)?;
        if let Some(commit) = outcome.commit() {
            self.publish(commit);
        }
        Ok(outcome)
    }

    /// Replays the nearest undo entry as one atomic transaction.
    ///
    /// Returns `Ok(None)` when undo is unavailable. A successful replay returns
    /// its commit for renderer invalidation and moves the entry to redo.
    ///
    /// # Errors
    ///
    /// Returns [`HistoryReplayError`] without mutating current state or either
    /// stack when boundary validation or the complete transaction fails.
    pub fn undo(&mut self) -> Result<Option<Commit>, HistoryReplayError> {
        self.replay(ReplayDirection::Undo)
    }

    /// Replays the nearest redo entry as one atomic transaction.
    ///
    /// Returns `Ok(None)` when redo is unavailable. A successful replay returns
    /// its commit for renderer invalidation and moves the entry to undo.
    ///
    /// # Errors
    ///
    /// Returns [`HistoryReplayError`] without mutating current state or either
    /// stack when boundary validation or the complete transaction fails.
    pub fn redo(&mut self) -> Result<Option<Commit>, HistoryReplayError> {
        self.replay(ReplayDirection::Redo)
    }

    /// Closes the current merge group without changing editor state.
    ///
    /// A host can call this at a recorded IME, paste, focus, or timer boundary;
    /// the Rust core never reads a wall clock itself.
    pub fn close_history_group(&mut self) {
        if self.history.close_merge_group() {
            self.rotate_history_stamp();
        }
    }

    /// Drops all retained undo and redo entries without changing editor state.
    pub fn clear_history(&mut self) {
        if self.history.clear() {
            self.rotate_history_stamp();
        }
    }

    fn publish(&mut self, commit: &Commit) {
        self.history.observe_commit(commit, self.state.context().max_operations_per_transaction());
        self.state = commit.after().clone();
        self.rotate_history_stamp();
    }

    fn replay(&mut self, direction: ReplayDirection) -> Result<Option<Commit>, HistoryReplayError> {
        let Some(commit) = self.preflight_replay(direction)? else {
            return Ok(None);
        };
        let state = commit.after().clone();
        match direction {
            ReplayDirection::Undo => self.history.finish_undo(&state),
            ReplayDirection::Redo => self.history.finish_redo(&state),
        }
        self.state = state;
        self.rotate_history_stamp();
        Ok(Some(*commit))
    }

    /// Prepares and proves the currently authoritative replay without changing
    /// editor state, history stacks, merge boundaries, or history identity.
    pub(crate) fn preflight_replay(
        &self,
        direction: ReplayDirection,
    ) -> Result<Option<Box<Commit>>, HistoryReplayError> {
        let transaction = match direction {
            ReplayDirection::Undo => self
                .history
                .undo_entry()
                .map(|entry| entry.undo_transaction(&self.state))
                .transpose()?,
            ReplayDirection::Redo => self
                .history
                .redo_entry()
                .map(|entry| entry.redo_transaction(&self.state))
                .transpose()?,
        };
        let Some(transaction) = transaction else {
            return Ok(None);
        };
        let outcome = transaction.apply(self.state.context(), &self.state).map_err(|source| {
            HistoryReplayError::Transaction { direction, source: Box::new(source) }
        })?;
        let Some(commit) = outcome.into_commit() else {
            return Err(HistoryReplayError::UnexpectedUnchanged { direction });
        };
        let state = commit.after().clone();
        let result_matches = match direction {
            ReplayDirection::Undo => {
                self.history.undo_entry().is_some_and(|entry| entry.undo_result_matches(&state))
            }
            ReplayDirection::Redo => {
                self.history.redo_entry().is_some_and(|entry| entry.redo_result_matches(&state))
            }
        };
        if !result_matches {
            return Err(HistoryReplayError::ResultMismatch { direction });
        }
        Ok(Some(Box::new(commit)))
    }

    fn rotate_history_stamp(&mut self) {
        self.history_stamp = HistoryStamp::new();
    }
}

#[cfg(test)]
mod tests {
    use std::{error::Error, io};

    use crate::{
        codec::DocumentJsonCodec,
        document::{FormatSet, TextFragment, TextRun},
        identity::QualifiedName,
        operation::{TextRange, TextSplice},
        position::{NodePath, TextOffset},
        session::{EditorSession, HistoryReplayError},
        state::{EditorContext, EditorState, LineageId, Revision, RevisionError, SnapshotId},
        transaction::{
            HistoryIntent, ReplayDirection, Transaction, TransactionApplyError, TransactionMetadata,
        },
    };

    #[test]
    fn revision_overflow_leaves_state_history_and_merge_group_unchanged()
    -> Result<(), Box<dyn Error>> {
        let context = EditorContext::default();
        let document = DocumentJsonCodec::new(context.schema().clone())
            .with_limits(context.limits().clone())
            .decode(
                r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[{"kind":"text","text":"a","formats":[]}]}]}}"#,
            )?;
        let lineage = LineageId::try_new("session-revision-overflow")?;
        let state = EditorState::try_from_validated_parts(
            &context,
            SnapshotId::new(lineage, Revision::new(u64::MAX - 1)),
            document,
            None,
            None,
        )?;
        let end = TextOffset::try_new(1)?;
        let range = TextRange::try_new(NodePath::try_from_indices(vec![0])?, end, end)?;
        let replacement: TextFragment = TextRun::try_new("b", FormatSet::default())?.into();
        let splice = TextSplice::capture(&context, state.document(), range, replacement)?;
        let transaction =
            Transaction::new(&state, vec![splice.into()]).with_metadata(TransactionMetadata::new(
                None,
                HistoryIntent::Merge {
                    group: QualifiedName::from_known_static("test/overflow-group"),
                },
            ));
        let mut session = EditorSession::new(state);
        if session.apply_transaction(&transaction)?.into_commit().is_none() {
            return Err(io::Error::other("setup transaction was unexpectedly unchanged").into());
        }
        assert_eq!(session.state().snapshot().revision(), Revision::new(u64::MAX));
        assert_eq!(session.undo_depth(), 1);
        let state_before = session.state.clone();
        let history_before = session.history.clone();
        let stamp_before = session.history_stamp.clone();

        let Err(preflight_error) = session.preflight_replay(ReplayDirection::Undo) else {
            return Err(
                io::Error::other("overflowing undo preflight unexpectedly succeeded").into()
            );
        };
        assert_eq!(
            preflight_error,
            HistoryReplayError::Transaction {
                direction: ReplayDirection::Undo,
                source: Box::new(TransactionApplyError::Revision(RevisionError::Overflow)),
            }
        );
        assert_eq!(session.state, state_before);
        assert_eq!(session.history, history_before);
        assert_eq!(session.history_stamp, stamp_before);

        let Err(error) = session.undo() else {
            return Err(io::Error::other("overflowing undo unexpectedly succeeded").into());
        };
        assert_eq!(
            error,
            HistoryReplayError::Transaction {
                direction: ReplayDirection::Undo,
                source: Box::new(TransactionApplyError::Revision(RevisionError::Overflow)),
            }
        );
        assert_eq!(session.state, state_before);
        assert_eq!(session.history, history_before);
        assert_eq!(session.history_stamp, stamp_before);
        Ok(())
    }
}
