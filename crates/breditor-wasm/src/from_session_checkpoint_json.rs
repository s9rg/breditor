use breditor_core::{
    codec::SessionCheckpointJsonCodec, engine::EditorEngine, state::EditorContext,
};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorEngine, BreditorEngineResult, BreditorError, error::BASE_ACTIONS_CODE};

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
        let context = EditorContext::default();
        let session = match SessionCheckpointJsonCodec::new(context).decode(checkpoint_json) {
            Ok(session) => session,
            Err(error) => {
                return BreditorEngineResult::from_error(BreditorError::codec(
                    error.code(),
                    "the session checkpoint was rejected",
                ));
            }
        };
        match EditorEngine::try_with_base_actions(session) {
            Ok(engine) => BreditorEngineResult::success(Self::new(engine)),
            Err(_) => BreditorEngineResult::from_error(BreditorError::new(
                BASE_ACTIONS_CODE,
                "the compiled base action registry is unavailable",
            )),
        }
    }
}
