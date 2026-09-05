use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorEngine, BreditorError};

/// Structured result of constructing a Wasm editor engine.
///
/// A successful engine can be taken exactly once with [`Self::take_engine`].
#[wasm_bindgen]
pub struct BreditorEngineResult {
    engine: Option<BreditorEngine>,
    error: Option<BreditorError>,
    succeeded: bool,
}

impl BreditorEngineResult {
    pub(crate) const fn success(engine: BreditorEngine) -> Self {
        Self { engine: Some(engine), error: None, succeeded: true }
    }

    pub(crate) const fn from_error(error: BreditorError) -> Self {
        Self { engine: None, error: Some(error), succeeded: false }
    }
}

#[wasm_bindgen]
impl BreditorEngineResult {
    /// Returns `engine`, `taken`, or `error`.
    #[must_use]
    #[wasm_bindgen(getter, unchecked_return_type = "BreditorEngineResultStatus")]
    pub fn status(&self) -> String {
        if self.engine.is_some() {
            "engine"
        } else if self.succeeded {
            "taken"
        } else {
            "error"
        }
        .to_owned()
    }

    /// Removes and returns the successful engine exactly once.
    #[wasm_bindgen(js_name = takeEngine)]
    pub fn take_engine(&mut self) -> Option<BreditorEngine> {
        self.engine.take()
    }

    /// Returns the structured construction error, when present.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn error(&self) -> Option<BreditorError> {
        self.error.clone()
    }
}
