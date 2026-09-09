//! Guarded lossless document-content export.
//!
//! Legacy engines export Document V1 and compiled-profile engines export the
//! fingerprint-bearing Document V2 value.
//! Editor selection, pending typing formats, history, and process-local
//! observation identity remain outside the document envelope.

use breditor_core::codec::{DocumentJsonCodec, DocumentJsonCodecV2};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorEngine, BreditorError, BreditorObservation, BreditorStringResult};

#[wasm_bindgen]
impl BreditorEngine {
    /// Encodes the engine mode's canonical Document V1 or V2 value.
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
        match self.inner.session_checkpoint_format_version() {
            1 => match DocumentJsonCodec::new(state.context().schema().clone())
                .with_limits(state.context().limits().clone())
                .encode(state.document())
            {
                Ok(json) => BreditorStringResult::from_value(json),
                Err(error) => BreditorStringResult::from_error(BreditorError::codec(
                    error.code(),
                    "the current document could not be encoded",
                )),
            },
            2 | 3 => match DocumentJsonCodecV2::new(state.context().schema().clone())
                .with_limits(state.context().limits().clone())
                .encode(state.document())
            {
                Ok(json) => BreditorStringResult::from_value(json),
                Err(error) => BreditorStringResult::from_error(BreditorError::codec(
                    error.code(),
                    "the current document could not be encoded",
                )),
            },
            _ => BreditorStringResult::from_error(BreditorError::new(
                crate::error::UNSUPPORTED_CHECKPOINT_FORMAT_CODE,
                "the engine checkpoint format is unsupported",
            )),
        }
    }
}
