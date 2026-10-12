//! Private consistent unsigned-word projection transport. Native semantics and
//! default exports are unchanged. Arrays are owned copies, not memory leases.
use super::{BreditorProjection, child_count_words::words};
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
impl BreditorProjection {
    /// Explicit private transport admission marker. Absent from default builds.
    #[must_use]
    #[wasm_bindgen(getter, js_name = projectionScalarWordsVersion)]
    pub fn projection_scalar_words_version(&self) -> u32 {
        1
    }

    /// Copies optional child index as [presence, value], preserving zero.
    #[must_use]
    #[wasm_bindgen(js_name = childAtWords)]
    pub fn child_at_words(&self, index: u32, ordinal: u32) -> Vec<u32> {
        words(self.child_at(index, ordinal))
    }

    /// Copies optional format count without floating-point return transport.
    #[must_use]
    #[wasm_bindgen(js_name = formatCountWords)]
    pub fn format_count_words(&self, index: u32) -> Vec<u32> {
        words(self.format_count(index))
    }

    /// Copies optional format-property count using the same native lookup.
    #[must_use]
    #[wasm_bindgen(js_name = formatPropertyCountWords)]
    pub fn format_property_count_words(&self, index: u32, ordinal: u32) -> Vec<u32> {
        words(self.format_property_count(index, ordinal))
    }

    /// Copies semantic heading rank; non-headings remain absent.
    #[must_use]
    #[wasm_bindgen(js_name = headingLevelWords)]
    pub fn heading_level_words(&self, index: u32) -> Vec<u32> {
        words(self.heading_level(index))
    }

    /// Copies explicit ordered-list start; other nodes remain absent.
    #[must_use]
    #[wasm_bindgen(js_name = orderedListStartWords)]
    pub fn ordered_list_start_words(&self, index: u32) -> Vec<u32> {
        words(self.ordered_list_start(index))
    }
}
