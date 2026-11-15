//! Unpublished rich clipboard proposal planning under the current native observation.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Exact capability for rich clipboard suggestion planning.
    #[must_use]
    #[allow(clippy::unused_self)]
    pub fn suggestion_clipboard_version(&self) -> String {
        "1".into()
    }

    /// Return a pure draft and the native asset binding relocations it requires.
    pub fn plan_suggestion_clipboard(
        &self,
        observed: &RichSharedObservation,
        selection_json: &str,
        clipboard_json: &str,
        prefix: &str,
    ) -> Result<String, JsValue> {
        let plan = self
            .inner
            .plan_suggestion_clipboard_guarded(
                &observed.inner,
                selection_json,
                clipboard_json,
                prefix,
            )
            .map_err(error)?;
        serde_json::to_string(&plan).map_err(error)
    }
}
