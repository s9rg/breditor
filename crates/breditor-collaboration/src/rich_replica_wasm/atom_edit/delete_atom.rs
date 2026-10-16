//! Rust owns deletion source, direction and caret recovery; guards precede parsing.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use crate::Error;
use breditor_core::rich_content::FlowMove;
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Delete the whole selected atom, supplying a fresh paragraph only if recovery needs one.
    pub fn delete_atom(
        &mut self,
        observation: &RichSharedObservation,
        paragraph: &str,
        movement: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        if self.inner.is_read_only() {
            return Err(error(Error::ReadOnly));
        }
        let direction = match movement {
            "before" => FlowMove::Before,
            "after" => FlowMove::After,
            _ => return Err(error(Error::Contract("atom deletion direction"))),
        };
        self.inner.delete_atom_guarded(&observation.inner, paragraph, direction).map_err(error)
    }
}
