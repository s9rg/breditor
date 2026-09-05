use breditor_core::engine::EditorEngine;
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
    pub(crate) inner: EditorEngine,
}

impl BreditorEngine {
    pub(crate) const fn new(inner: EditorEngine) -> Self {
        Self { inner }
    }
}
