//! Exclusive rich Wasm owner; command outcomes and read serialization are separate.

use super::{BreditorRichCommandResult, BreditorRichObservation, command, error};
use crate::BreditorStringResult;
use breditor_core::{codec::RichSessionJsonCodec, rich_content::RichLocalSession};
use wasm_bindgen::prelude::wasm_bindgen;

/// Opt-in rich single-user owner; replication and host assets remain separate coordinators.
#[wasm_bindgen]
pub struct BreditorRichEditor {
    pub(super) inner: RichLocalSession,
}
impl BreditorRichEditor {
    pub(super) const fn new(inner: RichLocalSession) -> Self {
        Self { inner }
    }
}
#[wasm_bindgen]
impl BreditorRichEditor {
    /// Additive live editing-policy capability; not a document or permission version.
    #[must_use]
    #[wasm_bindgen(js_name=readOnlyVersion)]
    pub fn read_only_version(&self) -> String {
        "1".to_owned()
    }
    /// Guard a policy change and invalidate queued work without a content/history entry.
    #[must_use]
    #[wasm_bindgen(js_name=setReadOnly)]
    pub fn set_read_only(
        &mut self,
        observation: &BreditorRichObservation,
        read_only: bool,
    ) -> BreditorStringResult {
        match self.inner.set_read_only(&observation.inner, read_only) {
            Ok(changed) => BreditorStringResult::from_value(changed.to_string()),
            Err(value) => BreditorStringResult::from_error(error::session(&value)),
        }
    }
    /// Additive UI capability, independent from the unchanged rich ABI revision.
    #[must_use]
    #[wasm_bindgen(js_name=inlineControlsVersion)]
    pub fn inline_controls_version(&self) -> String {
        "1".to_owned()
    }
    /// Separate additive capability; original standard-control version remains unchanged.
    #[must_use]
    #[wasm_bindgen(js_name=inlinePropertyPatchesVersion)]
    pub fn inline_property_patches_version(&self) -> String {
        "1".to_owned()
    }
    /// Capture one exact independently disposable rich observation.
    #[must_use]
    pub fn observe(&self) -> BreditorRichObservation {
        BreditorRichObservation {
            inner: self.inner.snapshot(),
            context: self.inner.context().clone(),
            undo_depth: self.inner.undo_depth(),
            redo_depth: self.inner.redo_depth(),
            capacity: self.inner.history_capacity().get(),
        }
    }
    /// Execute a closed JSON command against the exact observed publication.
    #[must_use]
    pub fn execute(
        &mut self,
        observation: &BreditorRichObservation,
        input: &str,
    ) -> BreditorRichCommandResult {
        match command::execute(&mut self.inner, &observation.inner, input) {
            Ok(outcome) => BreditorRichCommandResult::success(outcome, self.observe()),
            Err(error) => BreditorRichCommandResult::failure(error),
        }
    }
    /// Encode retained exact local history separately from command success.
    #[must_use]
    #[wasm_bindgen(js_name=checkpointJson)]
    pub fn checkpoint_json(&self) -> BreditorStringResult {
        match RichSessionJsonCodec::new(self.inner.context().clone()).encode(&self.inner) {
            Ok(value) => BreditorStringResult::from_value(value),
            Err(_) => {
                BreditorStringResult::from_error(error::rejected("breditor_rich.checkpoint_read"))
            }
        }
    }
}
