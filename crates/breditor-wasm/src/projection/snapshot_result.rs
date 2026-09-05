use wasm_bindgen::prelude::wasm_bindgen;

use crate::BreditorError;

use super::BreditorProjection;

/// Structured result of reading one non-JSON document projection.
///
/// A successful projection can be taken exactly once.
#[wasm_bindgen]
pub struct BreditorProjectionResult {
    projection: Option<BreditorProjection>,
    error: Option<BreditorError>,
    succeeded: bool,
}

impl BreditorProjectionResult {
    pub(crate) const fn success(projection: BreditorProjection) -> Self {
        Self { projection: Some(projection), error: None, succeeded: true }
    }

    pub(crate) const fn from_error(error: BreditorError) -> Self {
        Self { projection: None, error: Some(error), succeeded: false }
    }
}

#[wasm_bindgen]
impl BreditorProjectionResult {
    /// Returns `projection`, `taken`, or `error`.
    #[must_use]
    #[wasm_bindgen(getter, unchecked_return_type = "BreditorProjectionResultStatus")]
    pub fn status(&self) -> String {
        if self.projection.is_some() {
            "projection"
        } else if self.succeeded {
            "taken"
        } else {
            "error"
        }
        .to_owned()
    }

    /// Removes and returns the successful projection exactly once.
    #[wasm_bindgen(js_name = takeProjection)]
    pub fn take_projection(&mut self) -> Option<BreditorProjection> {
        self.projection.take()
    }

    /// Returns the structured projection-read error, when present.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn error(&self) -> Option<BreditorError> {
        self.error.clone()
    }
}
