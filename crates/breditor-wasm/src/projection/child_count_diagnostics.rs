//! Private return-side evidence; fixed-size scalars, no host calls or text.
use std::cell::Cell;
use wasm_bindgen::prelude::wasm_bindgen;

thread_local! {
    static LAST: Cell<Option<(usize, u32, Option<u32>)>> = const { Cell::new(None) };
}

pub(super) fn record(receiver: usize, index: u32, count: Option<u32>) {
    LAST.set(Some((receiver, index, count)));
}

/// Reads the last computed child count without rereading the projection.
/// Local diagnostic builds only; never enabled by default packaging.
#[must_use]
#[wasm_bindgen(js_name = debugLastProjectionChildCount)]
pub fn debug_last_projection_child_count() -> String {
    match LAST.get() {
        None => "null".to_owned(),
        Some((receiver, index, count)) => format!(
            "{{\"receiver\":{receiver},\"index\":{index},\"count\":{}}}",
            count.map_or_else(|| "null".to_owned(), |value| value.to_string())
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn distinguishes_zero_one_and_absence_and_preserves_receiver() {
        assert_eq!(debug_last_projection_child_count(), "null");
        for (count, expected) in [(Some(0), "0"), (Some(1), "1"), (None, "null")] {
            record(17, 488, count);
            assert_eq!(
                debug_last_projection_child_count(),
                format!("{{\"receiver\":17,\"index\":488,\"count\":{expected}}}")
            );
        }
    }
}
