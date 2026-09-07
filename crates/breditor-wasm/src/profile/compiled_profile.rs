use breditor_core::profile::CompiledEditorProfile;
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorCompiledProfileDescriptor, BreditorProfileGeneration};

/// Reusable immutable owner of one complete compiled semantic profile.
///
/// Engine factories borrow this value and clone the exact profile identity;
/// neither successful nor failed construction consumes it.
#[wasm_bindgen]
pub struct BreditorCompiledProfile {
    pub(crate) inner: CompiledEditorProfile,
}

impl BreditorCompiledProfile {
    pub(crate) const fn new(inner: CompiledEditorProfile) -> Self {
        Self { inner }
    }
}

#[wasm_bindgen]
impl BreditorCompiledProfile {
    /// Returns an independently disposable generation handle.
    #[must_use]
    pub fn generation(&self) -> BreditorProfileGeneration {
        BreditorProfileGeneration::new(self.inner.generation().clone())
    }

    /// Returns an independently disposable complete profile descriptor.
    #[must_use]
    pub fn descriptor(&self) -> BreditorCompiledProfileDescriptor {
        BreditorCompiledProfileDescriptor::new(self.inner.descriptor().clone())
    }

    /// Checks one opaque process-local profile generation.
    #[must_use]
    #[wasm_bindgen(js_name = matchesProfileGeneration)]
    pub fn matches_profile_generation(&self, generation: &BreditorProfileGeneration) -> bool {
        self.inner.generation() == &generation.inner
    }
}
