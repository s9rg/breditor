use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorCompiledProfile, BreditorError};

/// One-shot owned result of strict profile bootstrap and compilation.
#[wasm_bindgen]
pub struct BreditorCompiledProfileResult {
    profile: Option<BreditorCompiledProfile>,
    error: Option<BreditorError>,
    succeeded: bool,
}

impl BreditorCompiledProfileResult {
    pub(crate) const fn success(profile: BreditorCompiledProfile) -> Self {
        Self { profile: Some(profile), error: None, succeeded: true }
    }

    pub(crate) const fn from_error(error: BreditorError) -> Self {
        Self { profile: None, error: Some(error), succeeded: false }
    }
}

#[wasm_bindgen]
impl BreditorCompiledProfileResult {
    /// Returns `profile`, `taken`, or `error`.
    #[must_use]
    #[wasm_bindgen(getter, unchecked_return_type = "BreditorCompiledProfileResultStatus")]
    pub fn status(&self) -> String {
        if self.profile.is_some() {
            "profile"
        } else if self.succeeded {
            "taken"
        } else {
            "error"
        }
        .to_owned()
    }

    /// Removes and returns the compiled profile exactly once.
    #[wasm_bindgen(js_name = takeProfile)]
    pub fn take_profile(&mut self) -> Option<BreditorCompiledProfile> {
        self.profile.take()
    }

    /// Returns an independently owned structured error, when present.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn error(&self) -> Option<BreditorError> {
        self.error.clone()
    }
}
