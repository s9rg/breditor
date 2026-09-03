use std::fmt;

use crate::local_log::{LocalLogStorageAttemptId, LocalLogStorageRotationResolutionRequestId};

use super::{
    LocalLogStorageSelectedBinding, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
    local_log_storage_rotation_resolution_source::LocalLogStorageRotationResolutionSource,
    local_log_storage_rotation_resolution_source_kind::LocalLogStorageRotationResolutionSourceKind,
};

/// One exact rotation plan undergoing request-correlated storage resolution.
///
/// The non-`Clone` owner retains the original attempt state, candidate bytes,
/// and exact prior selected envelope. It carries no currentness, durability,
/// transaction, writer, retry, checkpoint-anchor, or successor-owner authority.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRotationResolution>();
/// ```
#[must_use = "a rotation storage resolution must be retained, requested, or resolved"]
pub struct LocalLogStorageRotationResolution {
    pub(super) source: LocalLogStorageRotationResolutionSource,
    pub(super) request_id: Option<LocalLogStorageRotationResolutionRequestId>,
}

impl LocalLogStorageRotationResolution {
    pub(super) const fn new(source: LocalLogStorageRotationResolutionSource) -> Self {
        Self { source, request_id: None }
    }

    /// Returns the exact attempt-state case retained by this owner.
    #[must_use]
    pub const fn source_kind(&self) -> LocalLogStorageRotationResolutionSourceKind {
        self.source.kind()
    }

    /// Returns the physical-attempt identity retained by the source state.
    #[must_use]
    pub const fn source_attempt_id(&self) -> &LocalLogStorageAttemptId {
        self.source.attempt_id()
    }

    /// Returns the candidate shape, always `Rotation` for this owner.
    #[must_use]
    pub const fn selection_kind(&self) -> LocalLogStorageSelectionKind {
        self.source.plan().selection_kind()
    }

    /// Returns the prospective candidate receipt; this is not a stored receipt.
    #[must_use]
    pub const fn candidate_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        self.source.plan().candidate_receipt()
    }

    /// Returns the complete prospective rotation binding.
    #[must_use]
    pub const fn candidate_binding(&self) -> &LocalLogStorageSelectedBinding {
        self.source.plan().candidate_binding()
    }

    /// Returns the complete exact prior selected binding.
    #[must_use]
    pub fn selected_binding(&self) -> &LocalLogStorageSelectedBinding {
        self.source.plan().validated_rotation_context().selected_binding()
    }

    /// Returns whether this resolution emitted its one adapter request.
    #[must_use]
    pub const fn request_issued(&self) -> bool {
        self.request_id.is_some()
    }

    /// Returns the byte length of the exact candidate JSON.
    #[must_use]
    pub fn candidate_json_bytes(&self) -> usize {
        self.source.plan().candidate_json_bytes()
    }

    /// Returns the byte length of the exact prior current JSON.
    #[must_use]
    pub fn selected_current_json_bytes(&self) -> usize {
        self.source.plan().validated_rotation_context().current_selection_json().len()
    }

    /// Returns the prior predecessor JSON byte length, when one was retained.
    #[must_use]
    pub fn selected_predecessor_json_bytes(&self) -> Option<usize> {
        self.source.plan().selected_predecessor_json_bytes()
    }

    /// Returns the checked total of all exact JSON retained by the plan.
    #[must_use]
    pub fn retained_json_bytes(&self) -> Option<usize> {
        self.source.plan().retained_json_bytes()
    }
}

impl fmt::Debug for LocalLogStorageRotationResolution {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationResolution")
            .field("source_kind", &self.source_kind())
            .field("source_attempt_id", self.source_attempt_id())
            .field("request_issued", &self.request_issued())
            .field("plan", self.source.plan())
            .finish_non_exhaustive()
    }
}
