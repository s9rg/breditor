//! Explicit flat-list-aware engine factories for compiled profiles.

#[cfg(test)]
#[path = "compiled_profile_engine_v6_tests.rs"]
mod tests;

use breditor_core::{
    codec::{DocumentJsonCodecV2, SessionCheckpointJsonCodecV6},
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
    /// Creates a flat-list-aware Session V6 engine from Document V2 JSON.
    ///
    /// The document remains bound to this profile's exact schema fingerprint.
    /// Selection, pending formats, and history start empty. Every later
    /// mutation must be representable as a complete Session V6 checkpoint
    /// before it can become authoritative.
    #[must_use]
    #[wasm_bindgen(js_name = createEngineFromDocumentJsonV6)]
    pub fn create_engine_from_document_json_v6(
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
        self.finish_v6_engine(EditorSession::with_history_capacity(state, history_capacity))
    }

    /// Restores a flat-list-aware engine from strict Session V6 JSON.
    ///
    /// Restoration replay-proves current state and every retained history entry
    /// under this exact compiled schema. A failed decode consumes neither this
    /// profile nor any engine previously produced from it.
    #[must_use]
    #[wasm_bindgen(js_name = createEngineFromSessionCheckpointJsonV6)]
    pub fn create_engine_from_session_checkpoint_json_v6(
        &self,
        checkpoint_json: &str,
    ) -> BreditorEngineResult {
        let profile = self.inner.clone();
        let context = profile.editor_context(DocumentLimits::default());
        let session = match SessionCheckpointJsonCodecV6::new(context).decode(checkpoint_json) {
            Ok(session) => session,
            Err(error) => {
                return BreditorEngineResult::from_error(BreditorError::codec(
                    error.code(),
                    "the profile session checkpoint was rejected",
                ));
            }
        };
        self.finish_v6_engine(session)
    }

    fn finish_v6_engine(&self, session: EditorSession) -> BreditorEngineResult {
        let profile = self.inner.clone();
        let action_states = profile.action_state_cache();
        let Ok(engine) = EditorEngine::try_with_compiled_profile(session, profile) else {
            return BreditorEngineResult::from_error(BreditorError::new(
                PROFILE_COMPILATION_CODE,
                "the compiled profile engine is unavailable",
            ));
        };
        match BreditorEngine::try_new_v6(engine, action_states) {
            Ok(engine) => BreditorEngineResult::success(engine),
            Err(error) => BreditorEngineResult::from_error(error),
        }
    }
}
