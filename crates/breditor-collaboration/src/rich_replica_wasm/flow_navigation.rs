//! Additive guarded logical navigation and atom-adjacent paragraph capability.
use super::{RichReplicaProbe, RichSharedObservation, error};
use crate::Error;
use breditor_core::rich_content::FlowMove;
use wasm_bindgen::prelude::*;
fn direction(value: &str) -> Result<FlowMove, JsValue> {
    match value {
        "before" => Ok(FlowMove::Before),
        "after" => Ok(FlowMove::After),
        _ => Err(error(Error::Contract("shared flow direction"))),
    }
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 supports native logical movement and explicit paragraph creation beside atoms.
    #[allow(clippy::unused_self)]
    #[must_use]
    pub fn flow_navigation_version(&self) -> String {
        "1".to_owned()
    }
    /// Publish only local selection, retaining shared content and Redo even in read-only mode.
    pub fn navigate_flow(
        &mut self,
        observation: &RichSharedObservation,
        movement: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        self.inner.navigate_flow_guarded(&observation.inner, direction(movement)?).map_err(error)
    }
    /// Create one plain paragraph before/after the whole selected atom; no new saved command tag.
    pub fn insert_paragraph_adjacent(
        &mut self,
        observation: &RichSharedObservation,
        paragraph: &str,
        side: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        if self.inner.is_read_only() {
            return Err(error(Error::ReadOnly));
        }
        self.inner
            .insert_paragraph_adjacent_guarded(&observation.inner, paragraph, direction(side)?)
            .map_err(error)
    }
}
