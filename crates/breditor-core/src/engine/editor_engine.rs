use std::fmt;

use crate::{
    action::{
        ActionPreparation, ActionRegistry, ActionRegistryError,
        builtins::base_action_registry,
        routing::{IntentInvocation, IntentRouter},
    },
    profile::{CompiledEditorProfile, CompiledProfileDescriptor, CompiledProfileGeneration},
    selection::Selection,
    session::EditorSession,
    state::EditorState,
    transaction::{PendingFormatsUpdate, SelectionUpdate, Transaction},
};

use super::{
    EditorActionOutcome, EditorDisabledAction, EditorEngineError, EditorEngineEvent,
    EditorEngineObservation, EditorEngineProfileError, EditorIntentOutcome,
    instance_id::EditorEngineInstanceId,
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
    profile: Option<CompiledEditorProfile>,
}

impl EditorEngine {
    /// Clones the complete owner for a sealed pre-publication candidate.
    ///
    /// Both opaque identities are intentionally shared with the unchanged
    /// authoritative engine. The candidate must therefore remain private until
    /// it either replaces this engine after all admission work succeeds or is
    /// discarded without exposing a mutation result.
    pub(super) fn clone_for_prepublication(&self) -> Self {
        let Self { instance, session, action_registry, profile } = self;
        Self {
            instance: instance.clone(),
            session: session.clone_for_prepublication(),
            action_registry: action_registry.clone(),
            profile: profile.clone(),
        }
    }

    /// Creates an engine from one session and one frozen action registry.
    ///
    /// Every call creates a fresh private instance identity. Observations from
    /// an earlier engine cannot cross this construction boundary even when the
    /// supplied session and registry were recovered through [`Self::into_parts`].
    #[must_use]
    pub fn new(session: EditorSession, action_registry: ActionRegistry) -> Self {
        Self { instance: EditorEngineInstanceId::new(), session, action_registry, profile: None }
    }

    /// Creates an engine owning one exact compiled profile and matching session.
    ///
    /// Generation admission precedes schema-proof admission. This makes a
    /// cross-profile session distinguishable without disclosing either opaque
    /// identity. The profile's action registry and intent router become the
    /// sole execution authorities retained by the engine.
    ///
    /// # Errors
    ///
    /// Returns [`EditorEngineProfileError`] when the session is unprofiled,
    /// belongs to another generation, or lacks the profile's schema proof. No
    /// partially assembled engine is returned.
    pub fn try_with_compiled_profile(
        session: EditorSession,
        profile: CompiledEditorProfile,
    ) -> Result<Self, EditorEngineProfileError> {
        let context = session.state().context();
        let Some(generation) = context.profile_generation() else {
            return Err(EditorEngineProfileError::MissingGeneration);
        };
        if generation != profile.generation() {
            return Err(EditorEngineProfileError::GenerationMismatch);
        }
        if !profile.schema().shares_proof(context.schema().proof()) {
            return Err(EditorEngineProfileError::SchemaProofMismatch);
        }
        let action_registry = profile.action_registry().clone();
        Ok(Self {
            instance: EditorEngineInstanceId::new(),
            session,
            action_registry,
            profile: Some(profile),
        })
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

    /// Returns the profile-owned semantic intent router, when configured.
    #[must_use]
    pub fn intent_router(&self) -> Option<&IntentRouter> {
        self.profile.as_ref().map(CompiledEditorProfile::intent_router)
    }

    /// Returns the complete compiled-profile descriptor, when configured.
    #[must_use]
    pub fn compiled_profile_descriptor(&self) -> Option<&CompiledProfileDescriptor> {
        self.profile.as_ref().map(CompiledEditorProfile::descriptor)
    }

    /// Returns the engine's opaque compiled-profile generation, when configured.
    #[must_use]
    pub fn profile_generation(&self) -> Option<&CompiledProfileGeneration> {
        self.profile.as_ref().map(CompiledEditorProfile::generation)
    }

    /// Captures the exact engine, state, and history basis for a later command.
    #[must_use]
    pub fn observation(&self) -> EditorEngineObservation {
        EditorEngineObservation::new(
            self.profile_generation().cloned(),
            self.instance.clone(),
            self.state().snapshot().clone(),
            self.session.history_status(),
        )
    }

    /// Checks whether an observation is current without reserving future work.
    ///
    /// This is an admission hint for boundaries that should reject delayed
    /// commands before parsing their remaining untrusted input. A successful
    /// check is not a capability or lock: another command may publish before
    /// the caller acts, and every mutating method therefore repeats the same
    /// check immediately before command-specific work.
    ///
    /// # Errors
    ///
    /// Returns [`EditorEngineError::ProfileGenerationMismatch`],
    /// [`EditorEngineError::StaleEngine`],
    /// [`EditorEngineError::StaleSnapshot`], or
    /// [`EditorEngineError::StaleHistory`] using the same precedence as every
    /// guarded mutation. The engine is never changed.
    pub fn check_observation(
        &self,
        actual: &EditorEngineObservation,
    ) -> Result<(), EditorEngineError> {
        self.require_observation(actual)
    }

    /// Consumes the engine into an advanced unprofiled session and registry.
    ///
    /// Reassembling them with [`Self::new`] creates a new engine identity and
    /// deliberately invalidates every previously captured observation. Calling
    /// this on a profile-owned engine explicitly drops its profile descriptor,
    /// router, and generation authority; the returned session still carries
    /// its context generation and cannot be supplied to an unrelated profile.
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

    /// Routes and synchronously consumes one typed semantic intent.
    ///
    /// The observation guard runs before profile/router access and all input
    /// validation. Routing, action preparation, and publication complete in
    /// this call, so no executable prepared route can escape the engine.
    /// Blocked and unhandled results are successful unchanged outcomes.
    ///
    /// # Errors
    ///
    /// Returns [`EditorEngineError`] for a mismatched observation, an
    /// unprofiled engine, routing failure, or an unexpected exact-base failure.
    /// Every error leaves state and history unchanged.
    pub fn execute_intent(
        &mut self,
        expected: &EditorEngineObservation,
        invocation: &IntentInvocation,
    ) -> Result<EditorIntentOutcome, EditorEngineError> {
        self.require_observation(expected)?;
        let router = self
            .profile
            .as_ref()
            .map(CompiledEditorProfile::intent_router)
            .ok_or(EditorEngineError::ProfileUnavailable)?;
        let route = router.route(self.session.state(), invocation)?;
        let execution = self.session.execute_intent_route(route)?;
        Ok(EditorIntentOutcome::new(execution, self.observation()))
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
        if actual.profile_generation() != self.profile_generation() {
            return Err(EditorEngineError::ProfileGenerationMismatch);
        }
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
            .field("profile_generation", &self.profile_generation())
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        action::{
            ActionStateCatalog,
            builtins::base_action_registry,
            routing::{
                IntentDeclaration, IntentExecutionOutcome, IntentId, IntentInvocation, IntentRouter,
            },
        },
        codec::DocumentJsonCodec,
        extension::ExtensionSet,
        profile::CompiledEditorProfile,
        schema::{CompiledSchema, DocumentLimits},
        session::EditorSession,
        state::{EditorContext, EditorState, LineageId},
    };

    use super::{EditorEngine, EditorEngineProfileError};

    const EMPTY_DOCUMENT: &str = concat!(
        r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":["#,
        r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}"#,
        r#"]}}"#,
    );

    fn profile_with_unbound_intent() -> Result<CompiledEditorProfile, Box<dyn Error>> {
        let schema = CompiledSchema::breditor_base();
        let actions = base_action_registry()?;
        let intent = IntentId::try_new("test/unbound-intent")?;
        let router =
            IntentRouter::try_new(actions, vec![IntentDeclaration::new(intent)], Vec::new())?;
        let action_states = ActionStateCatalog::try_new_with_router(router.clone(), Vec::new())?;
        Ok(CompiledEditorProfile::from_compilation(
            ExtensionSet::empty(),
            schema,
            router,
            action_states,
        ))
    }

    fn session(context: &EditorContext, lineage: &str) -> Result<EditorSession, Box<dyn Error>> {
        let document = DocumentJsonCodec::new(context.schema().clone()).decode(EMPTY_DOCUMENT)?;
        let state =
            EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)?;
        Ok(EditorSession::new(state))
    }

    #[test]
    fn profile_constructor_rejects_matching_generation_with_wrong_schema_proof()
    -> Result<(), Box<dyn Error>> {
        let profile = profile_with_unbound_intent()?;
        let context = EditorContext::with_profile_generation(
            CompiledSchema::breditor_base(),
            DocumentLimits::default(),
            profile.generation().clone(),
        );
        let result = EditorEngine::try_with_compiled_profile(
            session(&context, "wrong-profile-schema-proof")?,
            profile,
        );

        assert!(matches!(result, Err(EditorEngineProfileError::SchemaProofMismatch)));
        Ok(())
    }

    #[test]
    fn declared_intent_without_bindings_returns_unhandled_successor() -> Result<(), Box<dyn Error>>
    {
        let profile = profile_with_unbound_intent()?;
        let context = profile.editor_context(DocumentLimits::default());
        let mut engine = EditorEngine::try_with_compiled_profile(
            session(&context, "profile-unhandled-intent")?,
            profile,
        )?;
        let expected = engine.observation();
        let outcome = engine.execute_intent(
            &expected,
            &IntentInvocation::without_input(IntentId::try_new("test/unbound-intent")?),
        )?;

        assert!(matches!(outcome.execution(), IntentExecutionOutcome::Unhandled { .. }));
        assert!(!outcome.is_committed());
        assert_eq!(outcome.observation(), &expected);
        assert_eq!(engine.observation(), expected);
        Ok(())
    }
}
