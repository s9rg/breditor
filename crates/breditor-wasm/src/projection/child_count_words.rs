//! Private unsigned-word transport experiment. Not enabled by default.
use super::BreditorProjection;
use wasm_bindgen::prelude::wasm_bindgen;

pub(super) fn words(count: Option<u32>) -> Vec<u32> {
    match count {
        None => vec![0, 0],
        Some(value) => vec![1, value],
    }
}

#[wasm_bindgen]
impl BreditorProjection {
    /// Copies [presence, count] into an owned JS Uint32Array.
    /// Presence is 0 or 1; absence requires a zero payload. Some(0) is distinct
    /// from absence, and the full u32 domain is retained without a sentinel.
    /// Calls the same native calculation once. No retry or fallback count.
    #[must_use]
    #[wasm_bindgen(js_name = childCountWords)]
    pub fn child_count_words(&self, index: u32) -> Vec<u32> {
        words(self.child_count_value(index))
    }
}

#[cfg(test)]
mod tests {
    use super::words;
    #[test]
    fn preserves_presence_zero_and_full_width() {
        assert_eq!(words(None), vec![0, 0]);
        for value in [0, 1, u32::MAX] {
            assert_eq!(words(Some(value)), vec![1, value]);
        }
    }
}
