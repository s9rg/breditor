use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorCompiledProfile, BreditorCompiledProfileResult};

use super::bootstrap_json_v1::decode_compiled_profile;

#[wasm_bindgen]
impl BreditorCompiledProfile {
    /// Strictly decodes and compiles one complete ABI-local profile request.
    ///
    /// The request is bootstrap configuration rather than durable editor data;
    /// canonical persisted compatibility is represented by the returned
    /// descriptor's schema fingerprint.
    #[must_use]
    #[wasm_bindgen(js_name = fromBootstrapJson)]
    pub fn from_bootstrap_json(json: &str) -> BreditorCompiledProfileResult {
        match decode_compiled_profile(json) {
            Ok(profile) => {
                BreditorCompiledProfileResult::success(BreditorCompiledProfile::new(profile))
            }
            Err(error) => BreditorCompiledProfileResult::from_error(error),
        }
    }
}
