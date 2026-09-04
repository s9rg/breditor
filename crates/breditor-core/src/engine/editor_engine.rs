use std::fmt;

use crate::{
    action::{
        ActionPreparation, ActionRegistry, ActionRegistryError, builtins::base_action_registry,
    },
    selection::Selection,
    session::EditorSession,
    state::EditorState,
    transaction::{PendingFormatsUpdate, SelectionUpdate, Transaction},
};

use super::{
    EditorActionOutcome, EditorDisabledAction, EditorEngineError, EditorEngineEvent,
    EditorEngineObservation, instance_id::EditorEngineInstanceId,
};

/// Exclusive synchronous owner of one editor session and action generation.
///
/// Every mutating method first compares a caller-supplied engine, state, and
/// history observation with the authoritative owner. A token is meaningful
/// only for the live engine that emitted it; callers must still allocate unique
/// lineages for independent editors. Action preparation and publication happen inside
/// one call, so a future browser queue cannot retain a stale executable token.
///
/// The engine deliberately exposes no mutable session accessor:
///
/// ```compile_fail
/// use breditor_core::{engine::EditorEngine, session::EditorSession};
///
/// fn mutable_session_cannot_escape(engine: &mut EditorEngine) {
///     let _: &mut EditorSession = engine.session();
/// }
/// ```
pub struct EditorEngine {
    instance: EditorEngineInstanceId,
    session: EditorSession,
    action_registry: ActionRegistry,
}

impl EditorEngine {
    /// Creates an engine from one session and one frozen action registry.
    ///
    /// Every call creates a fresh private instance identity. Observations from
    /// an earlier engine cannot cross this construction boundary even when the
    /// supplied session and registry were recovered through [`Self::into_parts`].
    #[must_use]
    pub fn new(session: EditorSession, action_registry: ActionRegistry) -> Self {
        Self { instance: EditorEngineInstanceId::new(), session, action_registry }
    }

    /// Creates an engine containing the exact Breditor base action generation.
    ///
    /// # Errors
    ///
    /// Returns [`ActionRegistryError`] if the compiled-in registrations ever
    /// conflict or violate registry construction rules.
    pub fn try_with_base_actions(session: EditorSession) -> Result<Self, ActionRegistryError> {
        base_action_registry().map(|action_registry| Self::new(session, action_registry))
    }

    /// Returns the immutable authoritative session.
    ///
    /// This observation supports checkpoint codecs and independently composed
    /// action-state catalogs without allowing mutation outside the guarded
    /// engine entry points.
    #[must_use]
    pub const fn session(&self) -> &EditorSession {
        &self.session
    }

    /// Returns the immutable authoritative current state.
    #[must_use]
    pub const fn state(&self) -> &EditorState {
        self.session.state()
    }

    /// Returns the exact frozen action registry used for execution.
    #[must_use]
    pub const fn action_registry(&self) -> &ActionRegistry {
        &self.action_registry
    }

    /// Captures the exact engine, state, and history basis for a later command.
    #[must_use]
    pub fn observation(&self) -> EditorEngineObservation {
        EditorEngineObservation::new(
            self.instance.clone(),
            self.state().snapshot().clone(),
            self.session.history_status(),
        )
    }

    /// Consumes the engine and releases both owned components.
    ///
    /// Reassembling them with [`Self::new`] creates a new engine identity and
    /// deliberately invalidates every previously captured observation.
    #[must_use]
    pub fn into_parts(self) -> (EditorSession, ActionRegistry) {
        (self.session, self.action_registry)
    }

    /// Evaluates, preflights, and publishes one action synchronously.
    ///
    /// The observation guard runs before registry lookup, input decoding, or
    /// handler evaluation. Disabled actions return coherent reason and
    /// indicator data without publishing. Enabled preparations never escape
    /// this method.
    ///
    /// # Errors
    ///
    /// Returns [`EditorEngineError`] for an observation from another engine,
    /// stale state/history, an action preparation fault, or an unexpected
    /// prepared-publication failure. Every
    /// error leaves state and history unchanged.
    pub fn execute_action(
        &mut self,
        expected: &EditorEngineObservation,
        invocation: &crate::action::ActionInvocation,
    ) -> Result<EditorActionOutcome, EditorEngineError> {
        self.require_observation(expected)?;
        let preparation = self.action_registry.prepare(self.session.state(), invocation)?;
        match preparation {
            ActionPreparation::Disabled(disabled) => {
                let action = disabled.id().clone();
                let (_, reason, indicator) = disabled.into_parts();
                Ok(EditorActionOutcome::Disabled(EditorDisabledAction::new(
                    action,
                    reason,
                    indicator,
                    self.observation(),
                )))
            }
            ActionPreparation::Enabled(prepared) => {
                let commit =
                    self.session.execute_prepared_action(ActionPreparation::Enabled(prepared))?;
                let event = EditorEngineEvent::action(Box::new(commit), self.observation());
                Ok(EditorActionOutcome::Committed(event))
            }
        }
    }

    /// Publishes one host-observed selection against an exact engine observation.
    ///
    /// An exact selection echo is ignored and preserves both the revision and
    /// any explicit pending typing formats. A real selection change clears the
    /// pending-format override, advances the revision through a state-only
    /// transaction, updates adjacent undo/redo boundaries, and closes an open
    /// merge group without creating a history entry.
    ///
    /// # Errors
    ///
    /// Returns [`EditorEngineError`] before mutation when the observation comes
    /// from another engine, its state/history is stale, or the selection is
    /// invalid for the current document.
    pub fn set_selection(
        &mut self,
        expected: &EditorEngineObservation,
        selection: Option<Selection>,
    ) -> Result<Option<EditorEngineEvent>, EditorEngineError> {
        self.require_observation(expected)?;
        if selection.as_ref() == self.session.state().selection() {
            return Ok(None);
        }

        let transaction = Transaction::new(self.session.state(), Vec::new())
            .with_selection_update(SelectionUpdate::Set(selection))
            .with_pending_formats_update(PendingFormatsUpdate::Set(None));
        let commit = self
            .session
            .apply_transaction(&transaction)
            .map(crate::transaction::TransactionOutcome::into_commit)
            .map_err(EditorEngineError::from)?;
        Ok(commit.map(|commit| EditorEngineEvent::selection(Box::new(commit), self.observation())))
    }

    /// Atomically replays the nearest undo entry after checking the observation.
    ///
    /// Returns `Ok(None)` when no undo entry is available.
    ///
    /// # Errors
    ///
    /// Returns [`EditorEngineError`] without mutation when the observation comes
    /// from another engine, its state/history is stale, or an available entry
    /// cannot replay exactly.
    pub fn undo(
        &mut self,
        expected: &EditorEngineObservation,
    ) -> Result<Option<EditorEngineEvent>, EditorEngineError> {
        self.require_observation(expected)?;
        let commit = self.session.undo()?;
        Ok(commit.map(|commit| EditorEngineEvent::undo(Box::new(commit), self.observation())))
    }

    /// Atomically replays the nearest redo entry after checking the observation.
    ///
    /// Returns `Ok(None)` when no redo entry is available.
    ///
    /// # Errors
    ///
    /// Returns [`EditorEngineError`] without mutation when the observation comes
    /// from another engine, its state/history is stale, or an available entry
    /// cannot replay exactly.
    pub fn redo(
        &mut self,
        expected: &EditorEngineObservation,
    ) -> Result<Option<EditorEngineEvent>, EditorEngineError> {
        self.require_observation(expected)?;
        let commit = self.session.redo()?;
        Ok(commit.map(|commit| EditorEngineEvent::redo(Box::new(commit), self.observation())))
    }

    /// Closes an open history merge group after checking the observation.
    ///
    /// Returns a sealed history-boundary event when effective. A repeated close
    /// returns `None` and does not rotate the history stamp.
    ///
    /// # Errors
    ///
    /// Returns a stale-engine, stale-snapshot, or stale-history
    /// [`EditorEngineError`] without changing history when the caller's
    /// observation is no longer current.
    pub fn close_history_group(
        &mut self,
        expected: &EditorEngineObservation,
    ) -> Result<Option<EditorEngineEvent>, EditorEngineError> {
        self.require_observation(expected)?;
        Ok(self
            .session
            .close_history_group_if_effective()
            .then(|| EditorEngineEvent::close_history_group(self.observation())))
    }

    /// Clears both retained history branches after checking the observation.
    ///
    /// Returns a sealed clear-history event when effective. An already empty
    /// history returns `None` and does not rotate the history stamp.
    ///
    /// # Errors
    ///
    /// Returns a stale-engine, stale-snapshot, or stale-history
    /// [`EditorEngineError`] without changing history when the caller's
    /// observation is no longer current.
    pub fn clear_history(
        &mut self,
        expected: &EditorEngineObservation,
    ) -> Result<Option<EditorEngineEvent>, EditorEngineError> {
        self.require_observation(expected)?;
        Ok(self
            .session
            .clear_history_if_effective()
            .then(|| EditorEngineEvent::clear_history(self.observation())))
    }

    fn require_observation(
        &self,
        actual: &EditorEngineObservation,
    ) -> Result<(), EditorEngineError> {
        if actual.instance() != &self.instance {
            return Err(EditorEngineError::StaleEngine);
        }
        let expected_snapshot = self.session.state().snapshot();
        if actual.snapshot() != expected_snapshot {
            return Err(EditorEngineError::StaleSnapshot {
                expected: expected_snapshot.clone(),
                actual: actual.snapshot().clone(),
            });
        }
        if actual.history_status() != &self.session.history_status() {
            return Err(EditorEngineError::StaleHistory);
        }
        Ok(())
    }
}

impl fmt::Debug for EditorEngine {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EditorEngine")
            .field("snapshot", self.state().snapshot())
            .field("history", &self.session.history_status())
            .field("action_count", &self.action_registry.len())
            .finish_non_exhaustive()
    }
}
