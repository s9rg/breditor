use crate::{
    local_log::{LocalLogCheckpointAnchor, LocalLogCheckpointBinding, LocalLogId},
    state::EditorContext,
};

use super::{
    LocalLogCheckpointJsonCodecV2, LocalLogStorageGenerationBinding,
    LocalLogStorageGenerationJsonCodecV2, LocalLogStorageGenerationLimits,
    LocalLogStorageRootBinding, LocalLogStorageRootJsonCodecV2, LocalLogStorageSelectedBindingV2,
    LocalLogStorageSelectedRootError, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
};

/// Strict trusted-binding normalizer for one currently selected Storage V2 value.
///
/// This codec accepts only V2-specific binding types and produces only opaque
/// V2 selected roots, so Frame V2 policy cannot escape through a legacy Frame
/// V1 projection. Successful normalization performs no storage I/O and grants
/// no writer or publication authority.
#[derive(Clone, Debug)]
pub struct LocalLogStorageSelectedJsonCodecV2 {
    context: EditorContext,
    binding: LocalLogStorageSelectedBindingV2,
    limits: LocalLogStorageGenerationLimits,
}

impl LocalLogStorageSelectedJsonCodecV2 {
    /// Creates a selected Storage V2 normalizer with conservative limits.
    #[must_use]
    pub fn new(context: EditorContext, binding: LocalLogStorageSelectedBindingV2) -> Self {
        Self { context, binding, limits: LocalLogStorageGenerationLimits::default() }
    }

    /// Replaces the independent selection-input and nested-checkpoint policy.
    #[must_use]
    pub const fn with_limits(mut self, limits: LocalLogStorageGenerationLimits) -> Self {
        self.limits = limits;
        self
    }

    /// Returns the trusted editor context used for checkpoint reconstruction.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Returns the complete independently trusted V2 selected association.
    #[must_use]
    pub const fn binding(&self) -> &LocalLogStorageSelectedBindingV2 {
        &self.binding
    }

    /// Returns the host-authoritative resource policy.
    #[must_use]
    pub const fn limits(&self) -> &LocalLogStorageGenerationLimits {
        &self.limits
    }

    pub(super) fn require_current_kind(
        &self,
        expected: LocalLogStorageSelectionKind,
    ) -> Result<(), LocalLogStorageSelectedRootError> {
        if self.binding.schema_binding() != &self.context.schema().durable_binding() {
            return Err(LocalLogStorageSelectedRootError::SchemaBindingMismatch);
        }
        let actual = self.binding.current_receipt().selection_kind();
        if actual == expected {
            Ok(())
        } else {
            Err(LocalLogStorageSelectedRootError::SelectionKindMismatch { expected, actual })
        }
    }

    pub(super) fn root_codec_for_v2(
        &self,
        receipt: &LocalLogStorageSelectionReceiptBinding,
    ) -> LocalLogStorageRootJsonCodecV2 {
        let binding = LocalLogStorageRootBinding::new(
            receipt.profile_id().clone(),
            receipt.profile_version(),
            receipt.scope_id().clone(),
            receipt.committed_head_id().clone(),
        );
        LocalLogStorageRootJsonCodecV2::new(self.context.clone(), binding).with_limits(self.limits)
    }

    pub(super) fn generation_codec_for_v2(
        &self,
        receipt: &LocalLogStorageSelectionReceiptBinding,
    ) -> Result<LocalLogStorageGenerationJsonCodecV2, LocalLogStorageSelectedRootError> {
        let expected_head_id =
            receipt.expected_head_id().ok_or(LocalLogStorageSelectedRootError::RuntimeInvariant)?;
        let binding = LocalLogStorageGenerationBinding::try_new(
            receipt.profile_id().clone(),
            receipt.profile_version(),
            receipt.scope_id().clone(),
            expected_head_id.clone(),
            receipt.committed_head_id().clone(),
        )
        .map_err(|_| LocalLogStorageSelectedRootError::RuntimeInvariant)?;
        Ok(LocalLogStorageGenerationJsonCodecV2::new(self.context.clone(), binding)
            .with_limits(self.limits))
    }

    pub(super) fn decode_checkpoint_anchor_v2(
        &self,
        session_id: &crate::local_log::LocalSessionId,
        checkpoint_log_id: &LocalLogId,
        active_log_id: &LocalLogId,
        checkpoint_json: &str,
    ) -> Result<LocalLogCheckpointAnchor, LocalLogStorageSelectedRootError> {
        let binding = LocalLogCheckpointBinding::try_new(
            session_id.clone(),
            checkpoint_log_id.clone(),
            active_log_id.clone(),
        )
        .map_err(|_| LocalLogStorageSelectedRootError::RuntimeInvariant)?;
        let anchor = LocalLogCheckpointJsonCodecV2::new(self.context.clone(), binding)
            .with_limits(self.limits.checkpoint())
            .decode(checkpoint_json)
            .map_err(|error| LocalLogStorageSelectedRootError::InvalidCheckpoint {
                code: error.code(),
            })?;
        if anchor.schema_binding() != *self.binding.schema_binding() {
            return Err(LocalLogStorageSelectedRootError::SchemaBindingMismatch);
        }
        Ok(anchor)
    }
}
