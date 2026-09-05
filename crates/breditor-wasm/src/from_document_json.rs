use breditor_core::{
    codec::{DEFAULT_SESSION_CHECKPOINT_MAX_HISTORY_CAPACITY, DocumentJsonCodec},
    engine::EditorEngine,
    session::{EditorSession, HistoryCapacity},
    state::{EditorContext, EditorState, LineageId},
};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
    BreditorEngine, BreditorEngineResult, BreditorError,
    error::{
        BASE_ACTIONS_CODE, INVALID_HISTORY_CAPACITY_CODE, INVALID_INITIAL_STATE_CODE,
        INVALID_LINEAGE_CODE,
    },
};

#[wasm_bindgen]
impl BreditorEngine {
    /// Creates a history-free base-schema engine from strict Document V1 JSON.
    ///
    /// The host must provide a unique portable lineage for this independent
    /// editor history. Initial selection and pending formats are absent.
    /// `history_capacity` may be `0..=100`, matching the checkpoint admission
    /// policy used by export and restoration. Domain rejection is returned in
    /// the structured result after generated glue has admitted the arguments.
    #[must_use]
    #[wasm_bindgen(js_name = fromDocumentJson)]
    pub fn from_document_json(
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
        let context = EditorContext::default();
        let document_codec =
            DocumentJsonCodec::new(context.schema().clone()).with_limits(context.limits().clone());
        let document = match document_codec.decode(document_json) {
            Ok(document) => document,
            Err(error) => {
                return BreditorEngineResult::from_error(BreditorError::codec(
                    error.code(),
                    "the initial document was rejected",
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
        let Ok(engine) = EditorEngine::try_with_base_actions(session) else {
            return BreditorEngineResult::from_error(BreditorError::new(
                BASE_ACTIONS_CODE,
                "the compiled base action registry is unavailable",
            ));
        };
        match Self::try_new(engine) {
            Ok(engine) => BreditorEngineResult::success(engine),
            Err(error) => {
                BreditorEngineResult::from_error(BreditorError::checkpointed_engine(&error))
            }
        }
    }
}

fn parse_history_capacity(value: f64) -> Option<HistoryCapacity> {
    if !value.is_finite()
        || value < 0.0
        || value > f64::from(DEFAULT_SESSION_CHECKPOINT_MAX_HISTORY_CAPACITY)
        || value.fract() != 0.0
    {
        return None;
    }
    if value == 0.0 {
        return Some(HistoryCapacity::DISABLED);
    }
    let encoded = format!("{value:.0}");
    encoded.parse::<u32>().ok().and_then(|value| HistoryCapacity::try_new(value).ok())
}

#[cfg(test)]
mod tests {
    use breditor_core::session::HistoryCapacity;

    use super::parse_history_capacity;

    #[test]
    fn javascript_history_capacity_must_be_an_exact_supported_integer() {
        for invalid in [
            1.5,
            -1.0,
            f64::NAN,
            f64::INFINITY,
            f64::NEG_INFINITY,
            101.0,
            10_000.0,
            4_294_967_296.0,
        ] {
            assert!(parse_history_capacity(invalid).is_none());
        }
        assert_eq!(parse_history_capacity(0.0).map(HistoryCapacity::get), Some(0));
        assert_eq!(parse_history_capacity(100.0).map(HistoryCapacity::get), Some(100));
    }
}
