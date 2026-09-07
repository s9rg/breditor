use breditor_core::{
    codec::SessionCheckpointJsonCodec, engine::EditorEngine, profile::CompiledEditorProfile,
    schema::DocumentLimits,
};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorEngine, BreditorEngineResult, BreditorError, error::PROFILE_COMPILATION_CODE};

#[wasm_bindgen]
impl BreditorEngine {
    /// Restores a base-schema engine from strict Session Checkpoint V1 JSON.
    ///
    /// Restoration preserves durable state and linear-history behavior but
    /// intentionally creates fresh process-local history and engine identities.
    /// Domain rejection is returned in the structured result after generated
    /// glue has admitted the argument.
    #[must_use]
    #[wasm_bindgen(js_name = fromSessionCheckpointJson)]
    pub fn from_session_checkpoint_json(checkpoint_json: &str) -> BreditorEngineResult {
        let Ok(profile) = CompiledEditorProfile::try_compile_breditor_base() else {
            return BreditorEngineResult::from_error(BreditorError::new(
                PROFILE_COMPILATION_CODE,
                "the compiled base profile is unavailable",
            ));
        };
        let context = profile.editor_context(DocumentLimits::default());
        let session = match SessionCheckpointJsonCodec::new(context).decode(checkpoint_json) {
            Ok(session) => session,
            Err(error) => {
                return BreditorEngineResult::from_error(BreditorError::codec(
                    error.code(),
                    "the session checkpoint was rejected",
                ));
            }
        };
        let action_states = profile.action_state_cache();
        let Ok(engine) = EditorEngine::try_with_compiled_profile(session, profile) else {
            return BreditorEngineResult::from_error(BreditorError::new(
                PROFILE_COMPILATION_CODE,
                "the compiled base profile is unavailable",
            ));
        };
        match Self::try_new_v1(engine, action_states) {
            Ok(engine) => BreditorEngineResult::success(engine),
            Err(error) => BreditorEngineResult::from_error(error),
        }
    }
}
