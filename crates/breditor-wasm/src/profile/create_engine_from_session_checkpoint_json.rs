use breditor_core::{
    codec::SessionCheckpointJsonCodecV2, engine::EditorEngine, schema::DocumentLimits,
};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
    BreditorCompiledProfile, BreditorEngine, BreditorEngineResult, BreditorError,
    error::PROFILE_COMPILATION_CODE,
};

#[wasm_bindgen]
impl BreditorCompiledProfile {
    /// Restores an engine from strict fingerprint-bearing Session Checkpoint V2 JSON.
    ///
    /// Restoration replay-proves the checkpoint under this exact compiled
    /// schema. It creates fresh engine/history identities while retaining this
    /// profile's process-local generation.
    #[must_use]
    #[wasm_bindgen(js_name = createEngineFromSessionCheckpointJson)]
    pub fn create_engine_from_session_checkpoint_json(
        &self,
        checkpoint_json: &str,
    ) -> BreditorEngineResult {
        let profile = self.inner.clone();
        let context = profile.editor_context(DocumentLimits::default());
        let session = match SessionCheckpointJsonCodecV2::new(context).decode(checkpoint_json) {
            Ok(session) => session,
            Err(error) => {
                return BreditorEngineResult::from_error(BreditorError::codec(
                    error.code(),
                    "the profile session checkpoint was rejected",
                ));
            }
        };
        let action_states = profile.action_state_cache();
        let Ok(engine) = EditorEngine::try_with_compiled_profile(session, profile) else {
            return BreditorEngineResult::from_error(BreditorError::new(
                PROFILE_COMPILATION_CODE,
                "the compiled profile engine is unavailable",
            ));
        };
        match BreditorEngine::try_new_v2(engine, action_states) {
            Ok(engine) => BreditorEngineResult::success(engine),
            Err(error) => BreditorEngineResult::from_error(error),
        }
    }
}
