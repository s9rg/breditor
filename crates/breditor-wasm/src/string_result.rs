use wasm_bindgen::prelude::wasm_bindgen;

use crate::BreditorError;

enum StringResultValue {
    Value(String),
    Taken,
    Absent,
    Error(BreditorError),
}

/// Structured result of a fallible string-producing boundary operation.
///
/// `status` is exactly `value`, `taken`, `absent`, or `error`. `absent` is used by
/// [`crate::BreditorCommandResult::commit_json`] for effective history-only
/// events and non-committed outcomes.
#[wasm_bindgen]
pub struct BreditorStringResult {
    value: StringResultValue,
}

impl BreditorStringResult {
    pub(crate) const fn from_value(value: String) -> Self {
        Self { value: StringResultValue::Value(value) }
    }

    pub(crate) const fn absent() -> Self {
        Self { value: StringResultValue::Absent }
    }

    pub(crate) const fn from_error(error: BreditorError) -> Self {
        Self { value: StringResultValue::Error(error) }
    }
}

#[wasm_bindgen]
impl BreditorStringResult {
    /// Returns `value`, `taken`, `absent`, or `error`.
    #[must_use]
    #[wasm_bindgen(getter, unchecked_return_type = "BreditorStringResultStatus")]
    pub fn status(&self) -> String {
        match self.value {
            StringResultValue::Value(_) => "value",
            StringResultValue::Taken => "taken",
            StringResultValue::Absent => "absent",
            StringResultValue::Error(_) => "error",
        }
        .to_owned()
    }

    /// Returns a copy of the successful value, when present.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn value(&self) -> Option<String> {
        match &self.value {
            StringResultValue::Value(value) => Some(value.clone()),
            StringResultValue::Taken | StringResultValue::Absent | StringResultValue::Error(_) => {
                None
            }
        }
    }

    /// Removes and returns a successful string without cloning it.
    ///
    /// A successful take changes `status` from `value` to `taken`. All later
    /// calls return `None`.
    #[wasm_bindgen(js_name = takeValue)]
    pub fn take_value(&mut self) -> Option<String> {
        let previous = std::mem::replace(&mut self.value, StringResultValue::Taken);
        match previous {
            StringResultValue::Value(value) => Some(value),
            other => {
                self.value = other;
                None
            }
        }
    }

    /// Returns the structured error, when encoding failed.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn error(&self) -> Option<BreditorError> {
        match &self.value {
            StringResultValue::Error(error) => Some(error.clone()),
            StringResultValue::Value(_) | StringResultValue::Taken | StringResultValue::Absent => {
                None
            }
        }
    }
}
