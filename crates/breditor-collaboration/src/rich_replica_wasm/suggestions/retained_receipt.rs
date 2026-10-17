//! Prove an authenticated server's descriptive V2 receipt against already retained native operations.
use super::super::{RichReplicaProbe, error};
use crate::{Error, rich_replica::WriterReceipt};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Exact retained range/prefix proof or Pending. This does not authenticate the server, import
    /// the effect, validate a semantic boundary or transfer its writer's Undo to the accepting user.
    pub fn retained_writer_receipt_v2(&self, input: &str) -> Result<String, JsValue> {
        if input.len() > 1024 {
            return Err(error(Error::Limit("retained writer receipt bytes")));
        }
        let receipt: WriterReceipt = serde_json::from_str(input).map_err(error)?;
        serde_json::to_string(&self.inner.retained_writer_receipt_v2(&receipt).map_err(error)?)
            .map_err(error)
    }
}
