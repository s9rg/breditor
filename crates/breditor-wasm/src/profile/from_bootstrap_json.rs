use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorCompiledProfile, BreditorCompiledProfileResult};

use super::{
    bootstrap_json_v1::decode_compiled_profile,
    bootstrap_json_v2::decode_compiled_profile as decode_compiled_profile_v2,
};

#[wasm_bindgen]
impl BreditorCompiledProfile {
    /// Compiles an opt-in flat-list profile from strict bootstrap V4 declarations.
    ///
    /// Only available in the experimental flat-list build. V1/V2 remain paragraph
    /// profiles and V3 remains heading-only. Use V6 engine factories for complete
    /// list edit history; this does not silently migrate any older checkpoint.
    #[cfg(feature = "experimental-flat-lists")]
    #[must_use]
    #[wasm_bindgen(js_name = fromBootstrapJsonV4)]
    pub fn from_bootstrap_json_v4(json: &str) -> BreditorCompiledProfileResult {
        match super::bootstrap_json_v2::decode_flat_list_profile(json) {
            Ok(profile) => BreditorCompiledProfileResult::success(Self::new(profile)),
            Err(error) => BreditorCompiledProfileResult::from_error(error),
        }
    }

    /// Compiles an opt-in heading profile from strict bootstrap V3 declarations.
    ///
    /// Available only in the experimental text-block build. V3 explicitly
    /// selects heading-capable commands; V1/V2 keep paragraph-only semantics.
    /// Use the V5 engine factories to retain complete heading edit history.
    #[cfg(feature = "experimental-text-blocks")]
    #[must_use]
    #[wasm_bindgen(js_name = fromBootstrapJsonV3)]
    pub fn from_bootstrap_json_v3(json: &str) -> BreditorCompiledProfileResult {
        match super::bootstrap_json_v2::decode_text_block_profile(json) {
            Ok(profile) => BreditorCompiledProfileResult::success(Self::new(profile)),
            Err(error) => BreditorCompiledProfileResult::from_error(error),
        }
    }

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
