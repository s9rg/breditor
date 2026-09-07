use crate::{
    local_log::{
        LocalLogCheckpointAnchor, LocalLogCheckpointBinding, LocalLogId,
        LocalLogStorageTransactionId, LocalSessionId,
    },
    state::EditorContext,
};

use super::{
    LocalLogCheckpointJsonCodec, LocalLogStorageGenerationBinding,
    LocalLogStorageGenerationJsonCodec, LocalLogStorageGenerationLimits,
    LocalLogStorageRootBinding, LocalLogStorageRootJsonCodec, LocalLogStorageSelectedBinding,
    LocalLogStorageSelectedRootError, LocalLogStorageSelectedRootReceiptField,
    LocalLogStorageSelectedRootValueRole, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
};

/// Strict trusted-binding normalizer for one currently selected storage root.
///
/// The codec routes only from receipt metadata in [`LocalLogStorageSelectedBinding`].
/// Candidate JSON cannot select its own format, binding, predecessor kind, or
/// authority. Successful normalization is inspection state only: this codec
/// performs no storage I/O and grants no writer or commit authority.
#[derive(Clone, Debug)]
pub struct LocalLogStorageSelectedJsonCodec {
    context: EditorContext,
    binding: LocalLogStorageSelectedBinding,
    limits: LocalLogStorageGenerationLimits,
}

impl LocalLogStorageSelectedJsonCodec {
    /// Creates a selected-root normalizer with conservative default limits.
    #[must_use]
    pub fn new(context: EditorContext, binding: LocalLogStorageSelectedBinding) -> Self {
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

    /// Returns the complete independently trusted selected association.
    #[must_use]
    pub const fn binding(&self) -> &LocalLogStorageSelectedBinding {
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

    pub(super) fn root_codec_for(
        &self,
        receipt: &LocalLogStorageSelectionReceiptBinding,
    ) -> LocalLogStorageRootJsonCodec {
        let binding = LocalLogStorageRootBinding::new(
            receipt.profile_id().clone(),
            receipt.profile_version(),
            receipt.scope_id().clone(),
            receipt.committed_head_id().clone(),
        );
        LocalLogStorageRootJsonCodec::new(self.context.clone(), binding).with_limits(self.limits)
    }

    pub(super) fn generation_codec_for(
        &self,
        receipt: &LocalLogStorageSelectionReceiptBinding,
    ) -> Result<LocalLogStorageGenerationJsonCodec, LocalLogStorageSelectedRootError> {
        let Some(expected_head_id) = receipt.expected_head_id() else {
            return Err(LocalLogStorageSelectedRootError::RuntimeInvariant);
        };
        let binding = LocalLogStorageGenerationBinding::try_new(
            receipt.profile_id().clone(),
            receipt.profile_version(),
            receipt.scope_id().clone(),
            expected_head_id.clone(),
            receipt.committed_head_id().clone(),
        )
        .map_err(|_| LocalLogStorageSelectedRootError::RuntimeInvariant)?;
        Ok(LocalLogStorageGenerationJsonCodec::new(self.context.clone(), binding)
            .with_limits(self.limits))
    }

    pub(super) fn decode_checkpoint_anchor(
        &self,
        session_id: &LocalSessionId,
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
        LocalLogCheckpointJsonCodec::new(self.context.clone(), binding)
            .with_limits(self.limits.checkpoint())
            .decode(checkpoint_json)
            .map_err(|error| LocalLogStorageSelectedRootError::InvalidCheckpoint {
                code: error.code(),
            })
    }
}

pub(super) fn validate_receipt_assertions(
    role: LocalLogStorageSelectedRootValueRole,
    receipt: &LocalLogStorageSelectionReceiptBinding,
    transaction_id: &LocalLogStorageTransactionId,
    session_id: &LocalSessionId,
) -> Result<(), LocalLogStorageSelectedRootError> {
    if transaction_id != receipt.transaction_id() {
        return Err(LocalLogStorageSelectedRootError::ReceiptMismatch {
            role,
            field: LocalLogStorageSelectedRootReceiptField::TransactionId,
        });
    }
    if session_id != receipt.session_id() {
        return Err(LocalLogStorageSelectedRootError::ReceiptMismatch {
            role,
            field: LocalLogStorageSelectedRootReceiptField::SessionId,
        });
    }
    Ok(())
}
