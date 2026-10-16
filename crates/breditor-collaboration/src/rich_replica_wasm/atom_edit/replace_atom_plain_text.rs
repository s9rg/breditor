//! Explicit plain whole-atom replacement; no JavaScript source/action planning.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use crate::Error;
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Replace a whole selected atom with one fresh plain paragraph and final caret.
    pub fn replace_atom_plain_text(
        &mut self,
        observation: &RichSharedObservation,
        paragraph: &str,
        text: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        if self.inner.is_read_only() {
            return Err(error(Error::ReadOnly));
        }
        self.inner
            .replace_atom_plain_text_guarded(&observation.inner, paragraph, text)
            .map_err(error)
    }
}
