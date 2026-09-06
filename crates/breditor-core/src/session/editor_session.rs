use std::fmt;

use crate::{
    action::{
        ActionExecutionError, ActionPreparation,
        routing::{IntentExecutionOutcome, IntentRouteBaseError, IntentRouteOutcome},
    },
    identity::QualifiedName,
    state::EditorState,
    transaction::{
        Commit, ReplayDirection, Transaction, TransactionApplyError, TransactionOutcome,
    },
};

use super::{
    PreparedHistoryReplay, PreparedHistoryReplayError,
    capacity::HistoryCapacity,
    error::{HistoryReplayError, SessionCommitError},
    history::{HistoryCheckpointInvariantError, LinearHistory, LinearHistoryCheckpointParts},
    history_entry::HistoryEntry,
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

/// Exhaustive borrowed view of one session's durable checkpoint state.
///
/// The process-local history stamp is deliberately excluded. The exhaustive
/// destructuring in [`EditorSession::checkpoint_parts`] still accounts for it,
/// so adding session state requires an explicit persistence decision.
pub(crate) struct EditorSessionCheckpointParts<'a> {
    pub(crate) state: &'a EditorState,
    pub(crate) history: LinearHistoryCheckpointParts<'a>,
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
    /// Clones the complete owner for an internal pre-publication candidate.
    ///
    /// This is deliberately crate-private instead of a public [`Clone`]
    /// implementation: two independently mutable sessions with the same
    /// process-local history identity would violate the observation contract.
    /// A candidate may only be used while its owning coordinator keeps the
    /// authoritative session unchanged, then either replaces it wholesale or
    /// drops the candidate.
    pub(crate) fn clone_for_prepublication(&self) -> Self {
        let Self { state, history, history_stamp } = self;
        Self {
            state: state.clone(),
            history: history.clone(),
            history_stamp: history_stamp.clone(),
        }
    }

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

    /// Returns all durable session fields while excluding process-local identity.
    pub(crate) fn checkpoint_parts(&self) -> EditorSessionCheckpointParts<'_> {
        let Self {
            state,
            history,
            // A restored session must begin with a fresh observation identity.
            history_stamp: _,
        } = self;
        EditorSessionCheckpointParts { state, history: history.checkpoint_parts() }
    }

    /// Restores a session from replay-proved chronological history entries.
    ///
    /// This constructor checks stack topology and replay-boundary continuity,
    /// aligns both cursor-adjacent boundaries to `state`, and always allocates a
    /// fresh process-local history observation stamp.
    pub(crate) fn try_from_checkpoint_parts(
        state: EditorState,
        history_capacity: HistoryCapacity,
        entries: Vec<HistoryEntry>,
        cursor: u32,
        open_merge_group: Option<QualifiedName>,
    ) -> Result<Self, HistoryCheckpointInvariantError> {
        let history = LinearHistory::try_from_chronological_entries(
            history_capacity,
            entries,
            cursor,
            open_merge_group,
            &state,
        )?;
        Ok(Self { state, history, history_stamp: HistoryStamp::new() })
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

    /// Returns whether recovery can treat this session as a history-free log genesis.
    pub(crate) fn has_genesis_empty_history(&self) -> bool {
        self.history.is_genesis_empty()
    }

    /// Returns the authoritative nearest replay recipe size without deriving it.
    pub(crate) fn replay_operation_count(&self, direction: ReplayDirection) -> Option<usize> {
        self.history.replay_operation_count(direction)
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
        let _ = self.close_history_group_if_effective();
    }

    /// Drops all retained undo and redo entries without changing editor state.
    pub fn clear_history(&mut self) {
        let _ = self.clear_history_if_effective();
    }

    /// Closes the current merge group and reports whether the boundary was effective.
    pub(crate) fn close_history_group_if_effective(&mut self) -> bool {
        let changed = self.history.close_merge_group();
        if changed {
            self.rotate_history_stamp();
        }
        changed
    }

    /// Clears retained history and reports whether any history state changed.
    pub(crate) fn clear_history_if_effective(&mut self) -> bool {
        let changed = self.history.clear();
        if changed {
            self.rotate_history_stamp();
        }
        changed
    }

    fn publish(&mut self, commit: &Commit) {
        self.history.observe_commit(commit, self.state.context().max_operations_per_transaction());
        self.state = commit.after().clone();
        self.rotate_history_stamp();
    }

    fn replay(&mut self, direction: ReplayDirection) -> Result<Option<Commit>, HistoryReplayError> {
        let Some(prepared) = self.preflight_replay(direction)? else {
            return Ok(None);
        };
        self.publish_prepared_replay(prepared)
            .map(Some)
            .map_err(|source| HistoryReplayError::ResultMismatch { direction: source.direction() })
    }

    /// Prepares and proves the currently authoritative replay without changing
    /// editor state, history stacks, merge boundaries, or history identity.
    pub(crate) fn preflight_replay(
        &self,
        direction: ReplayDirection,
    ) -> Result<Option<PreparedHistoryReplay>, HistoryReplayError> {
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
        Ok(Some(PreparedHistoryReplay::new(
            direction,
            Box::new(commit),
            self.history_stamp.clone(),
        )))
    }

    /// Publishes one replay prepared from this exact unchanged session observation.
    ///
    /// Both the opaque history stamp and the complete commit base state are
    /// rechecked before either history stack, current state, or history stamp
    /// changes. The token owns its direction so callers cannot finish it on the
    /// opposite branch.
    ///
    /// # Errors
    ///
    /// Returns [`PreparedHistoryReplayError`] without mutation if the session's
    /// history observation or complete current state changed after preparation.
    pub(crate) fn publish_prepared_replay(
        &mut self,
        prepared: PreparedHistoryReplay,
    ) -> Result<Commit, PreparedHistoryReplayError> {
        let (direction, commit, origin_stamp) = prepared.into_parts();
        if origin_stamp != self.history_stamp || commit.before() != &self.state {
            return Err(PreparedHistoryReplayError::new(direction));
        }

        let commit = *commit;
        let state = commit.after().clone();
        match direction {
            ReplayDirection::Undo => self.history.finish_undo(&state),
            ReplayDirection::Redo => self.history.finish_redo(&state),
        }
        self.state = state;
        self.rotate_history_stamp();
        Ok(commit)
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
        operation::{RelocationError, TextRange, TextSplice},
        position::{Affinity, NodePath, Point, TextOffset},
        session::{EditorSession, HistoryReplayError, SessionCommitError},
        state::{EditorContext, EditorState, LineageId, Revision, RevisionError, SnapshotId},
        transaction::{
            CommitReplayError, HistoryIntent, ReplayDirection, Transaction, TransactionApplyError,
            TransactionMetadata,
        },
    };

    fn state_with_text(
        context: &EditorContext,
        lineage: &str,
        text: &str,
    ) -> Result<EditorState, Box<dyn Error>> {
        let encoded = serde_json::json!({
            "format": "breditor/document",
            "formatVersion": 1,
            "schema": { "name": "breditor/base", "version": 1 },
            "root": {
                "kind": "element",
                "type": "breditor/document",
                "entityId": null,
                "properties": {},
                "children": [{
                    "kind": "element",
                    "type": "breditor/paragraph",
                    "entityId": null,
                    "properties": {},
                    "children": [{ "kind": "text", "text": text, "formats": [] }],
                }],
            },
        })
        .to_string();
        let document = DocumentJsonCodec::new(context.schema().clone())
            .with_limits(context.limits().clone())
            .decode(&encoded)?;
        EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
            .map_err(Into::into)
    }

    fn insert_at_start(
        state: &EditorState,
        text: &str,
        history: HistoryIntent,
    ) -> Result<Transaction, Box<dyn Error>> {
        let start = TextOffset::try_new(0)?;
        let range = TextRange::try_new(NodePath::try_from_indices(vec![0])?, start, start)?;
        let replacement: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
        let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
        Ok(Transaction::new(state, vec![splice.into()])
            .with_metadata(TransactionMetadata::new(None, history)))
    }

    fn session_with_insert(
        lineage: &str,
        history: HistoryIntent,
    ) -> Result<EditorSession, Box<dyn Error>> {
        let context = EditorContext::default();
        let state = state_with_text(&context, lineage, "private-prepared-history")?;
        let transaction = insert_at_start(&state, "x", history)?;
        let mut session = EditorSession::new(state);
        if session.apply_transaction(&transaction)?.into_commit().is_none() {
            return Err(io::Error::other("setup transaction was unexpectedly unchanged").into());
        }
        Ok(session)
    }

    #[test]
    fn transactions_commits_relocation_and_history_reject_equal_content_from_another_proof()
    -> Result<(), Box<dyn Error>> {
        let source_context = EditorContext::default();
        let foreign_context = EditorContext::default();
        let source = state_with_text(&source_context, "mixed-proof-runtime", "base")?;
        let foreign = state_with_text(&foreign_context, "mixed-proof-runtime", "base")?;
        assert_eq!(source.document(), foreign.document());
        assert_ne!(source.context(), foreign.context());

        let empty_transaction = Transaction::new(&source, Vec::new());
        assert_eq!(
            empty_transaction.apply(&foreign_context, &foreign),
            Err(TransactionApplyError::ContextConfigurationMismatch)
        );

        let source_transaction = insert_at_start(&source, "x", HistoryIntent::Record)?;
        let source_commit = source_transaction
            .apply(&source_context, &source)?
            .into_commit()
            .ok_or_else(|| io::Error::other("source transaction was unexpectedly unchanged"))?;
        let foreign_transaction = insert_at_start(&foreign, "x", HistoryIntent::Record)?;
        let foreign_commit =
            foreign_transaction.apply(&foreign_context, &foreign)?.into_commit().ok_or_else(
                || io::Error::other("foreign transaction was unexpectedly unchanged"),
            )?;
        assert_eq!(source_commit.after().document(), foreign_commit.after().document());
        assert!(!source_commit.same_checkpoint_proof(&foreign_commit));

        assert_eq!(
            source_commit.undo_transaction(foreign_commit.after()),
            Err(CommitReplayError::DocumentMismatch { direction: ReplayDirection::Undo })
        );
        assert_eq!(
            source_commit.redo_transaction(&foreign),
            Err(CommitReplayError::DocumentMismatch { direction: ReplayDirection::Redo })
        );

        let point = Point::Children {
            parent_path: NodePath::root(),
            child_index: 0,
            affinity: Affinity::Before,
        };
        assert_eq!(
            source_commit.relocation().relocate_point(&foreign, &point),
            Err(RelocationError::SourceDocumentMismatch)
        );

        let mut foreign_session = EditorSession::new(foreign.clone());
        assert_eq!(
            foreign_session.accept_commit(&source_commit),
            Err(SessionCommitError::BaseStateMismatch { snapshot: foreign.snapshot().clone() })
        );
        assert_eq!(foreign_session.state(), &foreign);

        let mut source_session = EditorSession::new(source);
        source_session.accept_commit(&source_commit)?;
        source_session.state = foreign_commit.after().clone();
        let foreign_after = source_session.state.clone();
        let history_before = source_session.history.clone();
        assert_eq!(
            source_session.undo(),
            Err(HistoryReplayError::Boundary(CommitReplayError::DocumentMismatch {
                direction: ReplayDirection::Undo,
            }))
        );
        assert_eq!(source_session.state, foreign_after);
        assert_eq!(source_session.history, history_before);
        Ok(())
    }

    #[test]
    fn prepared_replay_is_redacted_and_publishes_its_proved_direction() -> Result<(), Box<dyn Error>>
    {
        let mut session = session_with_insert("prepared-replay-success", HistoryIntent::Record)?;
        let status_before = session.history_status();
        let Some(prepared) = session.preflight_replay(ReplayDirection::Undo)? else {
            return Err(io::Error::other("undo preparation was unexpectedly unavailable").into());
        };

        assert_eq!(prepared.direction(), ReplayDirection::Undo);
        assert_eq!(prepared.commit().before(), session.state());
        let debug = format!("{prepared:?}");
        assert!(debug.contains("direction: Undo"));
        assert!(!debug.contains("private-prepared-history"));

        let commit = session.publish_prepared_replay(prepared)?;
        assert_eq!(session.state(), commit.after());
        assert_eq!(session.undo_depth(), 0);
        assert_eq!(session.redo_depth(), 1);
        assert_ne!(session.history_status().stamp(), status_before.stamp());
        Ok(())
    }

    #[test]
    fn effective_boundary_makes_prepared_replay_stale_without_partial_publication()
    -> Result<(), Box<dyn Error>> {
        let group = QualifiedName::try_new("test/prepared-stale-group")?;
        let mut session =
            session_with_insert("prepared-replay-stale-stamp", HistoryIntent::Merge { group })?;
        let Some(prepared) = session.preflight_replay(ReplayDirection::Undo)? else {
            return Err(io::Error::other("undo preparation was unexpectedly unavailable").into());
        };
        assert!(session.close_history_group_if_effective());
        let state_before = session.state.clone();
        let history_before = session.history.clone();
        let stamp_before = session.history_stamp.clone();

        let Err(error) = session.publish_prepared_replay(prepared) else {
            return Err(io::Error::other("stale preparation unexpectedly published").into());
        };
        assert_eq!(error.direction(), ReplayDirection::Undo);
        assert!(!error.to_string().contains("private-prepared-history"));
        assert_eq!(session.state, state_before);
        assert_eq!(session.history, history_before);
        assert_eq!(session.history_stamp, stamp_before);
        Ok(())
    }

    #[test]
    fn prepared_replay_checks_complete_before_state_even_with_matching_stamp()
    -> Result<(), Box<dyn Error>> {
        let mut session =
            session_with_insert("prepared-replay-state-check", HistoryIntent::Record)?;
        let Some(prepared) = session.preflight_replay(ReplayDirection::Undo)? else {
            return Err(io::Error::other("undo preparation was unexpectedly unavailable").into());
        };
        let context = session.state.context().clone();
        let different_document = DocumentJsonCodec::new(context.schema().clone())
            .with_limits(context.limits().clone())
            .decode(
                r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[{"kind":"text","text":"different-private-state","formats":[]}] }]}}"#,
            )?;
        session.state = EditorState::try_from_validated_parts(
            &context,
            session.state.snapshot().clone(),
            different_document,
            None,
            None,
        )?;
        let state_before = session.state.clone();
        let history_before = session.history.clone();
        let stamp_before = session.history_stamp.clone();

        let Err(error) = session.publish_prepared_replay(prepared) else {
            return Err(io::Error::other("mismatched base state unexpectedly published").into());
        };
        assert_eq!(error.direction(), ReplayDirection::Undo);
        assert_eq!(session.state, state_before);
        assert_eq!(session.history, history_before);
        assert_eq!(session.history_stamp, stamp_before);
        Ok(())
    }

    #[test]
    fn effective_history_wrappers_rotate_identity_only_when_they_change_history()
    -> Result<(), Box<dyn Error>> {
        let context = EditorContext::default();
        let mut empty = EditorSession::new(state_with_text(
            &context,
            "effective-history-empty",
            "private-empty-history",
        )?);
        let empty_stamp = empty.history_stamp.clone();
        assert!(!empty.close_history_group_if_effective());
        assert!(!empty.clear_history_if_effective());
        assert_eq!(empty.history_stamp, empty_stamp);

        let group = QualifiedName::try_new("test/effective-history-group")?;
        let mut session =
            session_with_insert("effective-history-nonempty", HistoryIntent::Merge { group })?;
        let published_stamp = session.history_stamp.clone();
        assert!(session.close_history_group_if_effective());
        assert_ne!(session.history_stamp, published_stamp);
        let closed_stamp = session.history_stamp.clone();
        assert!(!session.close_history_group_if_effective());
        assert_eq!(session.history_stamp, closed_stamp);

        assert!(session.clear_history_if_effective());
        assert_ne!(session.history_stamp, closed_stamp);
        let cleared_stamp = session.history_stamp.clone();
        assert!(!session.clear_history_if_effective());
        assert_eq!(session.history_stamp, cleared_stamp);
        Ok(())
    }

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
