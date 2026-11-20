//! Shared rich V4 inline commands: text language, mentions and image links (one Undo step each).
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// "1" when this explicit shared V4 owner has the native inline commands (else "0").
    #[must_use]
    pub fn inline_commands_v4_version(&self) -> String {
        if self.inner.rich_language_version() == 4 { "1" } else { "0" }.into()
    }
    /// `{"language": tag|null}` over the current selection (a caret changes pending formats).
    pub fn set_text_language(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner.set_text_language_json_guarded(&observation.inner, input).map_err(error)
    }
    /// `{"selection":{"kind":"text",…},"mention":{kind,id,label}}`: replace the typed trigger.
    pub fn insert_mention(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner.insert_mention_json_guarded(&observation.inner, input).map_err(error)
    }
    /// `{"image": imageId, "href": url|null, "newWindow"?: bool}`: one paired link change.
    pub fn set_image_link(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner.set_image_link_json_guarded(&observation.inner, input).map_err(error)
    }
}
