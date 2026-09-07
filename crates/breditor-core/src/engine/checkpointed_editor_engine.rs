use std::fmt;

use crate::{
    action::{ActionInvocation, ActionRegistry, routing::IntentInvocation},
    codec::SessionCheckpointLimits,
    profile::{CompiledProfileDescriptor, CompiledProfileGeneration},
    selection::Selection,
    session::EditorSession,
    state::EditorState,
};

use super::{
    CheckpointedEditorEngineError, EditorActionOutcome, EditorEngine, EditorEngineEvent,
    EditorEngineObservation, EditorIntentOutcome, checkpoint_codec::CheckpointCodec,
};

/// Guarded editor owner whose every effective mutation remains checkpoint-representable.
///
/// Construction strictly encodes the initial session. Each mutation then runs
/// on a private candidate with the same opaque engine and history identities.
/// The complete candidate selected session-checkpoint version is encoded before one
/// infallible owner replacement publishes either the candidate or its event.
/// A failed command or encoding therefore leaves the state, history, cached
/// checkpoint, and caller observation exact and reusable.
///
/// This type deliberately exposes no mutable [`EditorEngine`] reference and
/// implements neither `DerefMut` nor `Clone`. That sealed surface ensures a new
/// mutation route must make an explicit checkpoint-admission decision.
pub struct CheckpointedEditorEngine {
    codec: CheckpointCodec,
    current: CheckpointedEditorEngineCurrent,
}

struct CheckpointedEditorEngineCurrent {
    engine: EditorEngine,
    checkpoint_json: String,
}

impl CheckpointedEditorEngine {
    /// Constrains an engine to legacy-compatible Session Checkpoint V1.
    ///
    /// The checkpoint codec always uses the engine's exact immutable context.
    /// Callers choose only the aggregate session limits; use
    /// [`Self::try_new_v2`] for the fingerprint-bearing profile boundary. The
    /// retained canonical JSON is regenerated after every effective mutation.
    ///
    /// # Errors
    ///
    /// Returns a payload-redacting session-checkpoint representation error when
    /// the supplied initial session cannot be encoded under `limits`. The
    /// engine is consumed and no partially constrained owner is returned.
    pub fn try_new(
        engine: EditorEngine,
        limits: SessionCheckpointLimits,
    ) -> Result<Self, CheckpointedEditorEngineError> {
        let codec = CheckpointCodec::v1(engine.state().context().clone(), limits);
        Self::try_new_with_codec(engine, codec)
    }

    /// Constrains an engine to fingerprint-bearing Session Checkpoint V2.
    ///
    /// This explicit construction path prevents a profile bootstrap from
    /// accidentally choosing legacy V1 merely because its schema currently
    /// equals the built-in base definition. Every later mutation retains this
    /// exact V2 admission policy.
    ///
    /// # Errors
    ///
    /// Returns a payload-redacting session-checkpoint representation error when
    /// the supplied initial session cannot be encoded under `limits`.
    pub fn try_new_v2(
        engine: EditorEngine,
        limits: SessionCheckpointLimits,
    ) -> Result<Self, CheckpointedEditorEngineError> {
        let codec = CheckpointCodec::v2(engine.state().context().clone(), limits);
        Self::try_new_with_codec(engine, codec)
    }

    fn try_new_with_codec(
        engine: EditorEngine,
        codec: CheckpointCodec,
    ) -> Result<Self, CheckpointedEditorEngineError> {
        let checkpoint_json =
            codec.encode(engine.session()).map_err(CheckpointedEditorEngineError::checkpoint)?;
        Ok(Self { codec, current: CheckpointedEditorEngineCurrent { engine, checkpoint_json } })
    }

    /// Returns the immutable authoritative session.
    #[must_use]
    pub const fn session(&self) -> &EditorSession {
        self.current.engine.session()
    }

    /// Returns the immutable authoritative current state.
    #[must_use]
    pub const fn state(&self) -> &EditorState {
        self.current.engine.state()
    }

    /// Returns the exact frozen action registry used for execution.
    #[must_use]
    pub const fn action_registry(&self) -> &ActionRegistry {
        self.current.engine.action_registry()
    }

    /// Returns the complete compiled-profile descriptor, when configured.
    #[must_use]
    pub fn compiled_profile_descriptor(&self) -> Option<&CompiledProfileDescriptor> {
        self.current.engine.compiled_profile_descriptor()
    }

    /// Returns the opaque compiled-profile generation, when configured.
    #[must_use]
    pub fn profile_generation(&self) -> Option<&CompiledProfileGeneration> {
        self.current.engine.profile_generation()
    }

    /// Returns the aggregate policy applied to construction and every mutation.
    #[must_use]
    pub const fn session_checkpoint_limits(&self) -> &SessionCheckpointLimits {
        self.codec.limits()
    }

    /// Returns the selected session-checkpoint wire format version.
    ///
    /// [`Self::try_new`] selects V1 and [`Self::try_new_v2`] selects V2. The
    /// selection is retained for every later candidate mutation.
    #[must_use]
    pub const fn session_checkpoint_format_version(&self) -> u32 {
        self.codec.format_version()
    }

    /// Returns the latest canonical selected-version session-checkpoint JSON.
    ///
    /// The borrowed value was fully encoded before the corresponding session
    /// became authoritative, so this read has no codec failure path and makes
    /// no allocation.
    #[must_use]
    pub fn session_checkpoint_json(&self) -> &str {
        &self.current.checkpoint_json
    }

    /// Captures the exact engine, state, and history basis for a later command.
    #[must_use]
    pub fn observation(&self) -> EditorEngineObservation {
        self.current.engine.observation()
    }

    /// Checks whether an observation is current without reserving future work.
    ///
    /// # Errors
    ///
    /// Returns the existing typed guarded-engine failure. The checkpointed
    /// owner and its cached JSON remain unchanged.
    pub fn check_observation(
        &self,
        actual: &EditorEngineObservation,
    ) -> Result<(), CheckpointedEditorEngineError> {
        self.current.engine.check_observation(actual).map_err(Into::into)
    }

    /// Evaluates and conditionally publishes one action under checkpoint admission.
    ///
    /// Disabled actions are returned without re-encoding because the session is
    /// unchanged. An enabled action becomes visible only after its complete
    /// candidate session has encoded successfully.
    ///
    /// # Errors
    ///
    /// Returns a guarded-engine error or a payload-redacting checkpoint
    /// representation error. Either failure preserves the exact old owner.
    pub fn execute_action(
        &mut self,
        expected: &EditorEngineObservation,
        invocation: &ActionInvocation,
    ) -> Result<EditorActionOutcome, CheckpointedEditorEngineError> {
        let mut candidate = self.candidate(expected)?;
        let outcome = candidate.execute_action(expected, invocation)?;
        self.finish_action_candidate(candidate, outcome)
    }

    /// Routes and conditionally publishes one semantic intent under checkpoint admission.
    ///
    /// Blocked and unhandled outcomes reuse the admitted checkpoint. A
    /// committed outcome becomes authoritative only after the complete
    /// candidate session encodes successfully.
    ///
    /// # Errors
    ///
    /// Returns a guarded-engine or checkpoint representation failure without
    /// changing the authoritative owner or cached checkpoint.
    pub fn execute_intent(
        &mut self,
        expected: &EditorEngineObservation,
        invocation: &IntentInvocation,
    ) -> Result<EditorIntentOutcome, CheckpointedEditorEngineError> {
        let mut candidate = self.candidate(expected)?;
        let outcome = candidate.execute_intent(expected, invocation)?;
        if outcome.is_committed() {
            self.publish_candidate(candidate, outcome)
        } else {
            Ok(outcome)
        }
    }

    /// Publishes one host-observed selection only when its candidate checkpoint encodes.
    ///
    /// An exact selection echo remains a no-op and reuses the already admitted
    /// cached checkpoint.
    ///
    /// # Errors
    ///
    /// Returns a guarded-engine error or a checkpoint representation error
    /// without changing the authoritative owner.
    pub fn set_selection(
        &mut self,
        expected: &EditorEngineObservation,
        selection: Option<Selection>,
    ) -> Result<Option<EditorEngineEvent>, CheckpointedEditorEngineError> {
        let mut candidate = self.candidate(expected)?;
        let event = candidate.set_selection(expected, selection)?;
        self.finish_event_candidate(candidate, event)
    }

    /// Replays the nearest undo entry only when its candidate checkpoint encodes.
    ///
    /// # Errors
    ///
    /// Returns a guarded-engine error or a checkpoint representation error
    /// without moving either history branch.
    pub fn undo(
        &mut self,
        expected: &EditorEngineObservation,
    ) -> Result<Option<EditorEngineEvent>, CheckpointedEditorEngineError> {
        let mut candidate = self.candidate(expected)?;
        let event = candidate.undo(expected)?;
        self.finish_event_candidate(candidate, event)
    }

    /// Replays the nearest redo entry only when its candidate checkpoint encodes.
    ///
    /// # Errors
    ///
    /// Returns a guarded-engine error or a checkpoint representation error
    /// without moving either history branch.
    pub fn redo(
        &mut self,
        expected: &EditorEngineObservation,
    ) -> Result<Option<EditorEngineEvent>, CheckpointedEditorEngineError> {
        let mut candidate = self.candidate(expected)?;
        let event = candidate.redo(expected)?;
        self.finish_event_candidate(candidate, event)
    }

    /// Closes an open history merge group under the same checkpoint gate.
    ///
    /// A repeated close is a no-op and reuses the existing checkpoint bytes.
    ///
    /// # Errors
    ///
    /// Returns a guarded-engine error or a checkpoint representation error
    /// without changing history identity.
    pub fn close_history_group(
        &mut self,
        expected: &EditorEngineObservation,
    ) -> Result<Option<EditorEngineEvent>, CheckpointedEditorEngineError> {
        let mut candidate = self.candidate(expected)?;
        let event = candidate.close_history_group(expected)?;
        self.finish_event_candidate(candidate, event)
    }

    /// Clears retained undo and redo history under the same checkpoint gate.
    ///
    /// An already empty history is a no-op and reuses the existing checkpoint
    /// bytes. An effective clear is still encoded before publication so future
    /// durable fields cannot bypass this invariant.
    ///
    /// # Errors
    ///
    /// Returns a guarded-engine error or a checkpoint representation error
    /// without changing history identity.
    pub fn clear_history(
        &mut self,
        expected: &EditorEngineObservation,
    ) -> Result<Option<EditorEngineEvent>, CheckpointedEditorEngineError> {
        let mut candidate = self.candidate(expected)?;
        let event = candidate.clear_history(expected)?;
        self.finish_event_candidate(candidate, event)
    }

    fn candidate(
        &self,
        expected: &EditorEngineObservation,
    ) -> Result<EditorEngine, CheckpointedEditorEngineError> {
        self.current.engine.check_observation(expected)?;
        Ok(self.current.engine.clone_for_prepublication())
    }

    fn finish_action_candidate(
        &mut self,
        candidate: EditorEngine,
        outcome: EditorActionOutcome,
    ) -> Result<EditorActionOutcome, CheckpointedEditorEngineError> {
        match outcome {
            EditorActionOutcome::Committed(_) => self.publish_candidate(candidate, outcome),
            EditorActionOutcome::Disabled(_) => Ok(outcome),
        }
    }

    fn finish_event_candidate(
        &mut self,
        candidate: EditorEngine,
        event: Option<EditorEngineEvent>,
    ) -> Result<Option<EditorEngineEvent>, CheckpointedEditorEngineError> {
        match event {
            Some(_) => self.publish_candidate(candidate, event),
            None => Ok(None),
        }
    }

    fn publish_candidate<T>(
        &mut self,
        candidate: EditorEngine,
        outcome: T,
    ) -> Result<T, CheckpointedEditorEngineError> {
        let checkpoint_json = self
            .codec
            .encode(candidate.session())
            .map_err(CheckpointedEditorEngineError::checkpoint)?;
        self.current = CheckpointedEditorEngineCurrent { engine: candidate, checkpoint_json };
        Ok(outcome)
    }
}

impl fmt::Debug for CheckpointedEditorEngine {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("CheckpointedEditorEngine")
            .field("engine", &self.current.engine)
            .field("checkpoint_json_bytes", &self.current.checkpoint_json.len())
            .field("checkpoint_limits", &self.codec.limits())
            .finish_non_exhaustive()
    }
}
