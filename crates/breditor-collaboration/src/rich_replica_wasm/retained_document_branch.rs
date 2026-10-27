//! Explicit document-only branch operation; attached comment lanes are never adopted or proved.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Separate document-only capability; original recovery-origin version stays unchanged.
    #[allow(clippy::unused_self)]
    pub fn retained_document_branch_version(&self) -> String {
        "2".into()
    }

    /// Version two accounts input bytes natively before a bounded branch import.
    pub fn retained_document_branch_input_bytes(
        &self,
        observed: &RichSharedObservation,
        source: &RichReplicaProbe,
        source_observed: &RichSharedObservation,
    ) -> Result<u32, JsValue> {
        let bytes = self
            .inner
            .retained_branch_input_bytes_guarded(
                &observed.inner,
                &source.inner,
                &source_observed.inner,
            )
            .map_err(error)?;
        u32::try_from(bytes).map_err(|_| error("retained branch incoming input bytes"))
    }

    /// Pure native document contribution/causal-input coverage, NOT paired comment coverage.
    pub fn verify_retained_document_branch(
        &self,
        observed: &RichSharedObservation,
        source: &RichReplicaProbe,
        source_observed: &RichSharedObservation,
    ) -> Result<(), JsValue> {
        self.inner
            .verify_retained_branch_guarded(&observed.inner, &source.inner, &source_observed.inner)
            .map_err(error)
    }

    /// Preserve current document Undo while retaining a compatible source's peer inputs.
    /// This touches neither attached review session, permissions nor any persistence store.
    pub fn reconcile_retained_document_branch(
        &mut self,
        observed: &RichSharedObservation,
        source: &RichReplicaProbe,
        source_observed: &RichSharedObservation,
        maximum_incoming_bytes: u32,
    ) -> Result<bool, JsValue> {
        self.inner
            .reconcile_retained_branch_guarded(
                &observed.inner,
                &source.inner,
                &source_observed.inner,
                maximum_incoming_bytes as usize,
            )
            .map_err(error)
    }
}
