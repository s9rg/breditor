//! Opt-in return-side evidence. One fixed-size Rust record; no host call or
//! allocation in the getter, and no retained document text or engine reference.
use std::cell::Cell;
use wasm_bindgen::prelude::wasm_bindgen;

thread_local! {
    static LAST: Cell<Option<(u32, Option<u32>)>> = const { Cell::new(None) };
}

pub(super) fn record(index: u32, count: Option<u32>) {
    LAST.set(Some((index, count)));
}

/// Returns the most recent projection format-count result as scalar-only JSON.
/// Available only in explicitly instrumented local builds, never by default.
#[must_use]
#[wasm_bindgen(js_name = debugLastProjectionFormatCount)]
pub fn debug_last_projection_format_count() -> String {
    match LAST.get() {
        None => "null".to_owned(),
        Some((index, count)) => format!(
            "{{\"index\":{index},\"count\":{}}}",
            count.map_or_else(|| "null".to_owned(), |value| value.to_string())
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn distinguishes_zero_and_absence_without_reading_the_projection_again() {
        record(9, Some(0));
        assert_eq!(debug_last_projection_format_count(), "{\"index\":9,\"count\":0}");
        record(9, None);
        assert_eq!(debug_last_projection_format_count(), "{\"index\":9,\"count\":null}");
    }
}
