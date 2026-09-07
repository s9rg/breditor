use wasm_bindgen::prelude::wasm_bindgen;

/// Runtime generation of the JavaScript-visible Breditor Wasm ABI.
pub const BREDITOR_WASM_ABI_VERSION: &str = "3";

/// Returns the JavaScript-visible Wasm ABI generation.
#[must_use]
#[wasm_bindgen(js_name = breditorWasmAbiVersion)]
pub fn breditor_wasm_abi_version() -> String {
    BREDITOR_WASM_ABI_VERSION.to_owned()
}

/// Returns the Breditor crate release version embedded in this module.
#[must_use]
#[wasm_bindgen(js_name = breditorVersion)]
pub fn breditor_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

#[cfg(test)]
mod tests {
    use super::{BREDITOR_WASM_ABI_VERSION, breditor_version, breditor_wasm_abi_version};

    #[test]
    fn runtime_versions_are_explicit() {
        assert_eq!(breditor_wasm_abi_version(), BREDITOR_WASM_ABI_VERSION);
        assert_eq!(breditor_version(), env!("CARGO_PKG_VERSION"));
    }
}
