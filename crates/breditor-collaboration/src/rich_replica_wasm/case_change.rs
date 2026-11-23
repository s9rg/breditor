//! Shared native letter-case change (UPPER, lower, Title Case, cycle); one Undo step.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// "1": this owner has the native `change_selection_case` command.
    #[must_use]
    #[expect(clippy::unused_self, reason = "JavaScript probes capabilities on the owner instance")]
    pub fn case_change_version(&self) -> String {
        "1".into()
    }
    /// `{"change":"upper"|"lower"|"title"|"cycle","locale"?,"titleMinorWords"?}` over the
    /// current selection (a caret changes its whole block). False when nothing changes.
    pub fn change_selection_case(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner.change_selection_case_json_guarded(&observation.inner, input).map_err(error)
    }
}
