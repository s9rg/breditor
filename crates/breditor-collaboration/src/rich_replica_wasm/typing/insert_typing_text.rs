//! Strict same-caret user input, separate from programmatic plain insertion.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use crate::Error;
use serde::Deserialize;
use wasm_bindgen::prelude::*;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Input {
    text: String,
    #[serde(deserialize_with = "super::clock")]
    clock_ms: u64,
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Admit strict text/decimal-clock data after stale/read-only rejection.
    pub fn insert_typing_text(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        if self.inner.is_read_only() {
            return Err(error(Error::ReadOnly));
        }
        let value: Input = super::decode(input).map_err(error)?;
        self.inner
            .insert_typing_text_guarded(&observation.inner, &value.text, value.clock_ms)
            .map_err(error)
    }
}
