//! Explicit all-or-nothing document/comment branch union, never source-role inference.
use super::{
    RichReplicaProbe, RichSharedObservation, error,
    native_branch_union_authorizations::Authorizations,
};
use crate::rich_replica::RetainedNativeBranchSource;
use breditor_core::rich_content::review::ReviewObservation;
use wasm_bindgen::prelude::*;
fn review_guard(value: &RichSharedObservation) -> Result<&ReviewObservation, JsValue> {
    value.review.as_ref().ok_or_else(|| error("native branch review observation absent"))
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Separate union capability. Existing document-only and exact paired gates are unchanged.
    #[allow(clippy::unused_self)]
    pub fn native_branch_union_version(&self) -> String {
        "1".into()
    }
    /// Combined unique original document bytes plus canonical incoming comment events.
    pub fn native_branch_union_input_bytes(
        &self,
        observed: &RichSharedObservation,
        source: &RichReplicaProbe,
        source_observed: &RichSharedObservation,
    ) -> Result<u32, JsValue> {
        let bytes = match (&self.review, &source.review) {
            (None, None) => self
                .inner
                .retained_branch_input_bytes_guarded(
                    &observed.inner,
                    &source.inner,
                    &source_observed.inner,
                )
                .map_err(error)?,
            (Some(review), Some(incoming)) => {
                self.inner
                    .retained_native_branch_input_bytes_guarded(
                        &observed.inner,
                        review,
                        review_guard(observed)?,
                        RetainedNativeBranchSource {
                            document: &source.inner,
                            document_observed: &source_observed.inner,
                            review: incoming,
                            review_observed: review_guard(source_observed)?,
                        },
                    )
                    .map_err(error)?
                    .total
            }
            _ => return Err(error("native branch review lanes differ")),
        };
        u32::try_from(bytes).map_err(|_| error("native branch incoming bytes"))
    }
    /// Pure native union coverage for BOTH lanes, with independent immutable-file rules.
    /// This is not the older exact paired-origin proof or any account/serving grant.
    pub fn verify_native_branch_union(
        &self,
        observed: &RichSharedObservation,
        source: &RichReplicaProbe,
        source_observed: &RichSharedObservation,
    ) -> Result<(), JsValue> {
        match (&self.review, &source.review) {
            (None, None) => self
                .inner
                .verify_retained_branch_guarded(
                    &observed.inner,
                    &source.inner,
                    &source_observed.inner,
                )
                .map_err(error),
            (Some(review), Some(incoming)) => self
                .inner
                .verify_retained_native_union_guarded(
                    &observed.inner,
                    review,
                    review_guard(observed)?,
                    RetainedNativeBranchSource {
                        document: &source.inner,
                        document_observed: &source_observed.inner,
                        review: incoming,
                        review_observed: review_guard(source_observed)?,
                    },
                )
                .map_err(error),
            _ => Err(error("native branch review lanes differ")),
        }
    }
    /// Validate both complete candidates before publishing either original owner.
    /// Historical grants are explicit, exact-prefix pinned host input. Role data in
    /// a checkpoint, matching accounts or local locks never substitutes for them.
    /// Returns bit1 for document publication and bit2 for independent review publication.
    pub fn reconcile_native_branch_union(
        &mut self,
        observed: &RichSharedObservation,
        source: &RichReplicaProbe,
        source_observed: &RichSharedObservation,
        input: &str,
        maximum_incoming_bytes: u32,
    ) -> Result<u8, JsValue> {
        let bytes = self.native_branch_union_input_bytes(observed, source, source_observed)?;
        if bytes > maximum_incoming_bytes {
            return Err(error("native branch incoming bytes"));
        }
        let authorizations = Authorizations::admit(input, source.review.as_ref())?;
        match (&mut self.review, &source.review) {
            (None, None) => self
                .inner
                .reconcile_retained_branch_guarded(
                    &observed.inner,
                    &source.inner,
                    &source_observed.inner,
                    maximum_incoming_bytes as usize,
                )
                .map(u8::from)
                .map_err(error),
            (Some(review), Some(incoming)) => {
                let changed = self
                    .inner
                    .reconcile_retained_native_branch_guarded(
                        &observed.inner,
                        review,
                        review_guard(observed)?,
                        RetainedNativeBranchSource {
                            document: &source.inner,
                            document_observed: &source_observed.inner,
                            review: incoming,
                            review_observed: review_guard(source_observed)?,
                        },
                        maximum_incoming_bytes as usize,
                        |id, principal| authorizations.event(id, principal),
                    )
                    .map_err(error)?;
                Ok(u8::from(changed.document_changed) | u8::from(changed.review_changed) << 1)
            }
            _ => Err(error("native branch review lanes differ")),
        }
    }
}
