//! Allocation-free token transport for selection admission.
//!
//! JavaScript's strict switch matches only primitive strings, without coercion
//! or property access. An integer, not an imported Boolean, crosses into Wasm.
//! Rust still admits only the codes appropriate to the requested field. These
//! private codes are not accepted by the public string-valued selection API.

use wasm_bindgen::prelude::{JsValue, wasm_bindgen};

pub(super) const TEXT: u32 = 1;
pub(super) const CHILDREN: u32 = 2;
pub(super) const BEFORE: u32 = 3;
pub(super) const AFTER: u32 = 4;

#[wasm_bindgen(inline_js = r#"
export function breditorSelectionTokenCode(value) {
    switch (value) {
        case "text": return 1;
        case "children": return 2;
        case "before": return 3;
        case "after": return 4;
        default: return 0;
    }
}
"#)]
extern "C" {
    #[wasm_bindgen(js_name = breditorSelectionTokenCode)]
    pub(super) fn read(value: &JsValue) -> u32;
}
