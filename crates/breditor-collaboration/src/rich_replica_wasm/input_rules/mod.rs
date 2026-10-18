//! Complete optional native input-rule capability; no dispatch or recovery widening.
mod insert_plain_text;
mod insert_typing_text;
use super::{RichReplicaProbe, RichSharedObservation};
use crate::Error;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

impl RichReplicaProbe {
    fn decode_input_rule<'a, T: Deserialize<'a>>(
        &self,
        observed: &RichSharedObservation,
        input: &'a str,
    ) -> Result<T, Error> {
        self.inner.check(&observed.inner)?;
        if self.inner.is_read_only() {
            return Err(Error::ReadOnly);
        }
        if input.len() > 512 * 1024 {
            return Err(Error::Limit("shared input rule request bytes"));
        }
        serde_json::from_str(input).map_err(|_| Error::Contract("shared input rule request"))
    }
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 requires both exclusive typing calls and four-state outcome reads.
    #[allow(clippy::unused_self)]
    pub fn markdown_input_rules_version(&self) -> String {
        "1".into()
    }
}
