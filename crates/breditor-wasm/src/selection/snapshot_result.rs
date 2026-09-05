use wasm_bindgen::prelude::wasm_bindgen;

use crate::BreditorError;

use super::BreditorSelection;

/// Structured result of one guarded non-JSON selection read.
///
/// A successful selection can be taken exactly once.
#[wasm_bindgen]
pub struct BreditorSelectionResult {
    selection: Option<BreditorSelection>,
    error: Option<BreditorError>,
    succeeded: bool,
}

impl BreditorSelectionResult {
    pub(crate) const fn success(selection: BreditorSelection) -> Self {
        Self { selection: Some(selection), error: None, succeeded: true }
    }

    pub(crate) const fn from_error(error: BreditorError) -> Self {
        Self { selection: None, error: Some(error), succeeded: false }
    }
}

#[wasm_bindgen]
impl BreditorSelectionResult {
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
