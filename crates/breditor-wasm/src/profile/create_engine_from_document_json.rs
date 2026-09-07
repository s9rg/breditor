use breditor_core::{
    codec::DocumentJsonCodecV2,
    engine::EditorEngine,
    schema::DocumentLimits,
    session::EditorSession,
    state::{EditorState, LineageId},
};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
    BreditorCompiledProfile, BreditorEngine, BreditorEngineResult, BreditorError,
    error::{
        INVALID_HISTORY_CAPACITY_CODE, INVALID_INITIAL_STATE_CODE, INVALID_LINEAGE_CODE,
        PROFILE_COMPILATION_CODE,
    },
    from_document_json::parse_history_capacity,
};

#[wasm_bindgen]
impl BreditorCompiledProfile {
    /// Creates a history-free engine from strict fingerprint-bearing Document V2 JSON.
    ///
    /// Construction borrows this profile. A failure consumes neither the
    /// profile nor any prior engine produced from it.
    #[must_use]
    #[wasm_bindgen(js_name = createEngineFromDocumentJson)]
    pub fn create_engine_from_document_json(
        &self,
        lineage: &str,
        document_json: &str,
        history_capacity: f64,
    ) -> BreditorEngineResult {
        let Ok(lineage) = LineageId::try_new(lineage) else {
            return BreditorEngineResult::from_error(BreditorError::new(
                INVALID_LINEAGE_CODE,
                "the editor lineage is invalid",
            ));
        };
        let Some(history_capacity) = parse_history_capacity(history_capacity) else {
            return BreditorEngineResult::from_error(BreditorError::new(
                INVALID_HISTORY_CAPACITY_CODE,
                "the history capacity is invalid",
            ));
        };
        let profile = self.inner.clone();
        let context = profile.editor_context(DocumentLimits::default());
        let codec = DocumentJsonCodecV2::new(profile.schema().clone())
            .with_limits(context.limits().clone());
        let document = match codec.decode(document_json) {
            Ok(document) => document,
            Err(error) => {
                return BreditorEngineResult::from_error(BreditorError::codec(
                    error.code(),
                    "the initial profile document was rejected",
                ));
            }
        };
        let Ok(state) = EditorState::try_new(&context, lineage, document, None, None) else {
            return BreditorEngineResult::from_error(BreditorError::new(
                INVALID_INITIAL_STATE_CODE,
                "the initial editor state was rejected",
            ));
        };
        let session = EditorSession::with_history_capacity(state, history_capacity);
        let action_states = profile.action_state_cache();
        let Ok(engine) = EditorEngine::try_with_compiled_profile(session, profile.clone()) else {
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
