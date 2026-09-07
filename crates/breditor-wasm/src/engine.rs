use breditor_core::{
    action::ActionStateCache,
    codec::SessionCheckpointLimits,
    engine::{CheckpointedEditorEngine, EditorEngine},
    profile::{CompiledProfileDescriptor, CompiledProfileGeneration},
};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
    BreditorCompiledProfileDescriptor, BreditorError, BreditorProfileGeneration,
    error::PROFILE_COMPILATION_CODE,
};

/// Exclusive JavaScript-visible owner of one guarded Breditor editor engine.
///
/// The generated TypeScript declaration has a private constructor. The two
/// static legacy base factories and the factories on
/// [`crate::BreditorCompiledProfile`] are the only supported producers of a
/// usable handle. Its methods are synchronous and it cannot be transferred
/// between workers. Well-typed calls on live handles return domain failures as
/// result data; raw JavaScript type or lifecycle misuse can throw in generated
/// glue before Rust runs.
#[wasm_bindgen]
pub struct BreditorEngine {
    pub(crate) inner: CheckpointedEditorEngine,
    pub(crate) action_states: ActionStateCache,
    pub(crate) generation: CompiledProfileGeneration,
    descriptor: CompiledProfileDescriptor,
}

impl BreditorEngine {
    pub(crate) fn try_new_v1(
        inner: EditorEngine,
        action_states: ActionStateCache,
    ) -> Result<Self, BreditorError> {
        let (generation, descriptor) = profile_identity(&inner, &action_states)?;
        let inner = CheckpointedEditorEngine::try_new(inner, SessionCheckpointLimits::default())
            .map_err(|error| BreditorError::checkpointed_engine(&error))?;
        Ok(Self { inner, action_states, generation, descriptor })
    }

    pub(crate) fn try_new_v2(
        inner: EditorEngine,
        action_states: ActionStateCache,
    ) -> Result<Self, BreditorError> {
        let (generation, descriptor) = profile_identity(&inner, &action_states)?;
        let inner = CheckpointedEditorEngine::try_new_v2(inner, SessionCheckpointLimits::default())
            .map_err(|error| BreditorError::checkpointed_engine(&error))?;
        Ok(Self { inner, action_states, generation, descriptor })
    }
}

fn profile_identity(
    inner: &EditorEngine,
    action_states: &ActionStateCache,
) -> Result<(CompiledProfileGeneration, CompiledProfileDescriptor), BreditorError> {
    let Some(engine_generation) = inner.profile_generation() else {
        return Err(BreditorError::new(
            PROFILE_COMPILATION_CODE,
            "the editor has no compiled profile",
        ));
    };
    if action_states.profile_generation() != Some(engine_generation) {
        return Err(BreditorError::new(
            PROFILE_COMPILATION_CODE,
            "the editor and action-state profile do not match",
        ));
    }
    let Some(descriptor) = inner.compiled_profile_descriptor() else {
        return Err(BreditorError::new(
            PROFILE_COMPILATION_CODE,
            "the editor has no compiled profile descriptor",
        ));
    };
    if descriptor.generation() != engine_generation {
        return Err(BreditorError::new(
            PROFILE_COMPILATION_CODE,
            "the editor profile identity is inconsistent",
        ));
    }
    Ok((engine_generation.clone(), descriptor.clone()))
}

#[wasm_bindgen]
impl BreditorEngine {
    /// Returns an independently disposable profile-generation handle.
    #[must_use]
    #[wasm_bindgen(js_name = profileGeneration)]
    pub fn profile_generation(&self) -> BreditorProfileGeneration {
        BreditorProfileGeneration::new(self.generation.clone())
    }

    /// Returns an independently disposable complete compiled-profile descriptor.
    #[must_use]
    #[wasm_bindgen(js_name = profileDescriptor)]
    pub fn profile_descriptor(&self) -> BreditorCompiledProfileDescriptor {
        BreditorCompiledProfileDescriptor::new(self.descriptor.clone())
    }

    /// Checks one opaque process-local profile generation.
    #[must_use]
    #[wasm_bindgen(js_name = matchesProfileGeneration)]
    pub fn matches_profile_generation(&self, generation: &BreditorProfileGeneration) -> bool {
        self.generation == generation.inner
    }
}
