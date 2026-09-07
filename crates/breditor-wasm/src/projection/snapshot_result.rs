use wasm_bindgen::prelude::wasm_bindgen;

use breditor_core::profile::CompiledProfileGeneration;

use crate::{BreditorError, BreditorProfileGeneration};

use super::BreditorProjection;

/// Structured result of reading one non-JSON document projection.
///
/// A successful projection can be taken exactly once.
#[wasm_bindgen]
pub struct BreditorProjectionResult {
    generation: CompiledProfileGeneration,
    projection: Option<BreditorProjection>,
    error: Option<BreditorError>,
    succeeded: bool,
}

impl BreditorProjectionResult {
    pub(crate) const fn success(
        generation: CompiledProfileGeneration,
        projection: BreditorProjection,
    ) -> Self {
        Self { generation, projection: Some(projection), error: None, succeeded: true }
    }

    pub(crate) const fn from_error(
        generation: CompiledProfileGeneration,
        error: BreditorError,
    ) -> Self {
        Self { generation, projection: None, error: Some(error), succeeded: false }
    }
}

#[wasm_bindgen]
impl BreditorProjectionResult {
    /// Checks the result's opaque process-local profile identity.
    #[must_use]
    #[wasm_bindgen(js_name = matchesProfileGeneration)]
    pub fn matches_profile_generation(&self, generation: &BreditorProfileGeneration) -> bool {
        self.generation == generation.inner
    }

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
