use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorCompiledProfile, BreditorCompiledProfileResult};

use super::{
    bootstrap_json_v1::decode_compiled_profile,
    bootstrap_json_v2::decode_compiled_profile as decode_compiled_profile_v2,
};

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

    /// Strictly decodes and compiles one complete typed profile request.
    ///
    /// Version 2 adds closed inline-format property contracts and generated
    /// property-aware set action identities. It is selected explicitly so the
    /// original version-1 bootstrap contract remains unchanged.
    #[must_use]
    #[wasm_bindgen(js_name = fromBootstrapJsonV2)]
    pub fn from_bootstrap_json_v2(json: &str) -> BreditorCompiledProfileResult {
        match decode_compiled_profile_v2(json) {
            Ok(profile) => {
                BreditorCompiledProfileResult::success(BreditorCompiledProfile::new(profile))
            }
            Err(error) => BreditorCompiledProfileResult::from_error(error),
        }
    }
}
