use breditor_core::{
    action::ActionStateCache,
    codec::SessionCheckpointLimits,
    engine::{CheckpointedEditorEngine, EditorEngine},
};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorError, action_state::base_action_state_catalog};

/// Exclusive JavaScript-visible owner of one guarded Breditor editor engine.
///
/// The generated TypeScript declaration has a private constructor; only
/// [`Self::from_document_json`] and [`Self::from_session_checkpoint_json`]
/// produce a usable handle. Its methods are synchronous and it cannot be
/// transferred between workers. Well-typed calls on live handles return domain
/// failures as result data; raw JavaScript type or lifecycle misuse can throw
/// in generated glue before Rust runs.
#[wasm_bindgen]
pub struct BreditorEngine {
    pub(crate) inner: CheckpointedEditorEngine,
    pub(crate) action_states: ActionStateCache,
}

impl BreditorEngine {
    pub(crate) fn try_new(inner: EditorEngine) -> Result<Self, BreditorError> {
        let action_states = base_action_state_catalog(inner.action_registry().clone())
            .map(ActionStateCache::new)
            .map_err(|_| BreditorError::action_state_catalog())?;
        let inner = CheckpointedEditorEngine::try_new(inner, SessionCheckpointLimits::default())
            .map_err(|error| BreditorError::checkpointed_engine(&error))?;
        Ok(Self { inner, action_states })
    }
}
