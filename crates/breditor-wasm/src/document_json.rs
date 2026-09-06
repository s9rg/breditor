//! Guarded lossless document-content export.
//!
//! This boundary deliberately exports only the canonical Document V1 value.
//! Editor selection, pending typing formats, history, and process-local
//! observation identity remain outside the document envelope.

use breditor_core::codec::DocumentJsonCodec;
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorEngine, BreditorError, BreditorObservation, BreditorStringResult};

#[wasm_bindgen]
impl BreditorEngine {
    /// Encodes the canonical Document V1 value at one exact guarded observation.
    ///
    /// The complete engine, snapshot, and history observation is checked before
    /// encoding. The read is synchronous and non-mutating. Selection, pending
    /// formats, history, and editor identity are intentionally not included.
    /// A stale observation or representation failure is returned as a stable,
    /// payload-redacting [`BreditorError`] inside the one-shot string result.
    #[must_use]
    #[wasm_bindgen(js_name = documentJson)]
    pub fn document_json(&self, expected: &BreditorObservation) -> BreditorStringResult {
        if let Err(error) = self.inner.check_observation(expected.inner()) {
            return BreditorStringResult::from_error(BreditorError::checkpointed_engine(&error));
        }

        let state = self.inner.state();
        match DocumentJsonCodec::new(state.context().schema().clone())
            .with_limits(state.context().limits().clone())
            .encode(state.document())
        {
            Ok(json) => BreditorStringResult::from_value(json),
            Err(error) => BreditorStringResult::from_error(BreditorError::codec(
                error.code(),
                "the current document could not be encoded",
            )),
        }
    }
}
