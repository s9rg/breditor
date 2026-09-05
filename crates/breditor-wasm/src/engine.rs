use breditor_core::{
    codec::SessionCheckpointLimits,
    engine::{CheckpointedEditorEngine, CheckpointedEditorEngineError, EditorEngine},
};
use wasm_bindgen::prelude::wasm_bindgen;

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
}

impl BreditorEngine {
    pub(crate) fn try_new(inner: EditorEngine) -> Result<Self, CheckpointedEditorEngineError> {
        CheckpointedEditorEngine::try_new(inner, SessionCheckpointLimits::default())
            .map(|inner| Self { inner })
    }
}
