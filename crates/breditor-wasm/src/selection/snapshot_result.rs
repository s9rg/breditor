use wasm_bindgen::prelude::wasm_bindgen;

use breditor_core::profile::CompiledProfileGeneration;

use crate::{BreditorError, BreditorProfileGeneration};

use super::BreditorSelection;

/// Structured result of one guarded non-JSON selection read.
///
/// A successful selection can be taken exactly once.
#[wasm_bindgen]
pub struct BreditorSelectionResult {
    generation: CompiledProfileGeneration,
    selection: Option<BreditorSelection>,
    error: Option<BreditorError>,
    succeeded: bool,
}

impl BreditorSelectionResult {
    pub(crate) const fn success(
        generation: CompiledProfileGeneration,
        selection: BreditorSelection,
    ) -> Self {
        Self { generation, selection: Some(selection), error: None, succeeded: true }
    }

    pub(crate) const fn from_error(
        generation: CompiledProfileGeneration,
        error: BreditorError,
    ) -> Self {
        Self { generation, selection: None, error: Some(error), succeeded: false }
    }
}

#[wasm_bindgen]
impl BreditorSelectionResult {
    /// Checks the result's opaque process-local profile identity.
    #[must_use]
    #[wasm_bindgen(js_name = matchesProfileGeneration)]
    pub fn matches_profile_generation(&self, generation: &BreditorProfileGeneration) -> bool {
        self.generation == generation.inner
    }

    /// Returns `selection`, `taken`, or `error`.
    #[must_use]
    #[wasm_bindgen(getter, unchecked_return_type = "BreditorSelectionResultStatus")]
    pub fn status(&self) -> String {
        if self.selection.is_some() {
            "selection"
        } else if self.succeeded {
            "taken"
        } else {
            "error"
        }
        .to_owned()
    }

    /// Removes and returns the semantic selection exactly once.
    #[wasm_bindgen(js_name = takeSelection)]
    pub fn take_selection(&mut self) -> Option<BreditorSelection> {
        self.selection.take()
    }

    /// Returns the structured selection-read error, when present.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn error(&self) -> Option<BreditorError> {
        self.error.clone()
    }
}
