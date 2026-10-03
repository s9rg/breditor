//! Bounded primitive-string transport for the opt-in selection token candidate.
//!
//! Keep closed-token matching in Rust without copying arbitrary-size strings.
//! Eight UTF-16 code units cover the longest token (`children`). The host checks
//! only primitive type and size; it never coerces objects or classifies tokens.
//! At most 24 UTF-8 bytes can reach `as_string`. Public inputs remain `JsValue`.

use wasm_bindgen::prelude::{JsValue, wasm_bindgen};

#[wasm_bindgen(inline_js = r#"
export function breditorBoundedSelectionToken(value) {
    if (typeof value !== "string" || value.length > 8) return undefined;
    return value;
}
"#)]
extern "C" {
    #[wasm_bindgen(js_name = breditorBoundedSelectionToken)]
    fn bounded_selection_token(value: &JsValue) -> JsValue;
}

pub(super) fn read(value: &JsValue) -> Option<String> {
    bounded_selection_token(value).as_string()
}
