use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorEngine, BreditorObservation};

#[wasm_bindgen]
impl BreditorEngine {
    /// Captures the exact engine, state, and history observation required by a
    /// later command.
    #[must_use]
    pub fn observation(&self) -> BreditorObservation {
        BreditorObservation::new(self.inner.observation())
    }
}
