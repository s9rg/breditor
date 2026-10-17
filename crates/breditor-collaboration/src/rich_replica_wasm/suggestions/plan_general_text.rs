//! Additive pure planner; no accepted dispatcher, new packet family or native constructor.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Complete separate protected-range namespace planner, independent of ordinary write policy.
    #[allow(clippy::unused_self)]
    pub fn suggestion_general_text_version(&self) -> String {
        "1".into()
    }

    /// Return an existing typed suggestion draft, preserving partial tables/captions and native
    /// floor identities. Accepted content, history, writer counters and selection stay unchanged.
    pub fn plan_suggestion_general_text(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        let draft = self
            .inner
            .plan_suggestion_general_text_namespace_json_guarded(&observed.inner, input)
            .map_err(error)?;
        serde_json::to_string(&draft).map_err(error)
    }
}
