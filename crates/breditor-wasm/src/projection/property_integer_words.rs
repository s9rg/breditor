//! Private signed integer-property transport. The low/high words encode the
//! exact two's-complement i64; projected values already obey the JS-safe domain.
//! Owned arrays are copies, not Wasm memory leases. Default APIs are unchanged.
use super::BreditorProjection;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
impl BreditorProjection {
    /// Admission marker for [presence, low-u32, high-u32] integer properties.
    #[must_use]
    #[wasm_bindgen(getter, js_name = projectionIntegerWordsVersion)]
    pub fn projection_integer_words_version(&self) -> u32 {
        1
    }

    /// Copies an integer exactly, preserving absence, zero and negative values.
    /// No conversion to f64 occurs before crossing the Wasm boundary.
    #[must_use]
    #[wasm_bindgen(js_name = formatPropertyIntegerWords)]
    pub fn format_property_integer_words(
        &self,
        index: u32,
        format_ordinal: u32,
        property_ordinal: u32,
    ) -> Vec<u32> {
        integer_words(
            self.format_property(index, format_ordinal, property_ordinal)
                .and_then(|(_, value)| value.as_integer())
                .map(|value| value.get()),
        )
    }
}

fn integer_words(value: Option<i64>) -> Vec<u32> {
    match value {
        None => vec![0, 0, 0],
        Some(value) => {
            let bytes = value.to_le_bytes();
            vec![
                1,
                u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]),
                u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]),
            ]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::integer_words;

    #[test]
    fn presence_and_every_js_safe_boundary_are_exact() {
        assert_eq!(integer_words(None), vec![0, 0, 0]);
        assert_eq!(integer_words(Some(0)), vec![1, 0, 0]);
        assert_eq!(integer_words(Some(1_193_046)), vec![1, 1_193_046, 0]);
        assert_eq!(integer_words(Some(-1)), vec![1, u32::MAX, u32::MAX]);
        for value in [
            -9_007_199_254_740_991,
            -4_294_967_296,
            -1,
            0,
            1,
            4_294_967_295,
            4_294_967_296,
            9_007_199_254_740_991,
        ] {
            let words = integer_words(Some(value));
            let low = words[1].to_le_bytes();
            let high = words[2].to_le_bytes();
            assert_eq!(
                i64::from_le_bytes([
                    low[0], low[1], low[2], low[3], high[0], high[1], high[2], high[3]
                ]),
                value
            );
        }
    }
}
