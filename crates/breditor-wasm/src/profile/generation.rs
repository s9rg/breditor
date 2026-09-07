use breditor_core::profile::CompiledProfileGeneration;
use wasm_bindgen::prelude::wasm_bindgen;

/// Opaque process-local identity of one compiled semantic profile.
///
/// The handle is intentionally neither serializable nor convertible to a
/// scalar. Durable compatibility is represented by a schema fingerprint;
/// this value only correlates live owned Wasm objects.
#[wasm_bindgen]
pub struct BreditorProfileGeneration {
    pub(crate) inner: CompiledProfileGeneration,
}

impl BreditorProfileGeneration {
    pub(crate) const fn new(inner: CompiledProfileGeneration) -> Self {
        Self { inner }
    }
}

#[wasm_bindgen]
impl BreditorProfileGeneration {
    /// Returns whether both live handles name the same compiled profile.
    #[must_use]
    pub fn matches(&self, other: &BreditorProfileGeneration) -> bool {
        self.inner == other.inner
    }
}
