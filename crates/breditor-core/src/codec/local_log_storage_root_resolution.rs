use std::fmt;

use crate::local_log::{LocalLogStorageAttemptId, LocalLogStorageRootResolutionRequestId};

use super::{
    LocalLogStorageSelectedBinding, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
    local_log_storage_root_resolution_source::LocalLogStorageRootResolutionSource,
    local_log_storage_root_resolution_source_kind::LocalLogStorageRootResolutionSourceKind,
};

/// One exact root plan undergoing a request-correlated storage resolution.
///
/// The owner retains the complete original attempt state and exact candidate
/// bytes. It is process-local and non-`Clone`. Beginning resolution performs
/// no I/O and creates no evidence. The opaque resolver request identity is
/// created only when [`Self::adapter_request`] exposes the payload-bearing
/// request.
///
/// Resolution is observational only. This owner carries no storage
/// currentness, durability, transaction, writer, retry, or successor-owner
/// authority. In particular, its source kind does not settle whether a copied
/// dispatch of the same candidate published later.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRootResolution>();
/// ```
#[must_use = "a root storage resolution must be retained, requested, or resolved"]
pub struct LocalLogStorageRootResolution {
    pub(super) source: LocalLogStorageRootResolutionSource,
    pub(super) request_id: Option<LocalLogStorageRootResolutionRequestId>,
}

impl LocalLogStorageRootResolution {
    pub(super) const fn new(source: LocalLogStorageRootResolutionSource) -> Self {
        Self { source, request_id: None }
    }

    /// Returns the exact attempt-state case retained by this owner.
    #[must_use]
    pub const fn source_kind(&self) -> LocalLogStorageRootResolutionSourceKind {
        self.source.kind()
    }

    /// Returns the physical-attempt identity retained by the source state.
    #[must_use]
    pub const fn source_attempt_id(&self) -> &LocalLogStorageAttemptId {
        self.source.attempt_id()
    }

    /// Returns the candidate shape, which is always `Root` for this owner.
    #[must_use]
    pub const fn selection_kind(&self) -> LocalLogStorageSelectionKind {
        self.source.plan().selection_kind()
    }

    /// Returns the prospective candidate receipt; this is not a stored receipt.
    #[must_use]
    pub const fn candidate_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        self.source.plan().candidate_receipt()
    }

    /// Returns the complete prospective root binding.
    #[must_use]
    pub const fn candidate_binding(&self) -> &LocalLogStorageSelectedBinding {
        self.source.plan().candidate_binding()
    }

    /// Returns whether this resolution has emitted its one adapter request.
    #[must_use]
    pub const fn request_issued(&self) -> bool {
        self.request_id.is_some()
    }

    /// Returns the byte length of the exact canonical candidate JSON.
    #[must_use]
    pub fn candidate_json_bytes(&self) -> usize {
        self.source.plan().candidate_json_bytes()
    }

    /// Returns the checked total of all exact JSON bytes retained by the plan.
    #[must_use]
    pub fn retained_json_bytes(&self) -> Option<usize> {
        self.source.plan().retained_json_bytes()
    }
}

impl fmt::Debug for LocalLogStorageRootResolution {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootResolution")
            .field("source_kind", &self.source_kind())
            .field("source_attempt_id", self.source_attempt_id())
            .field("request_issued", &self.request_issued())
            .field("plan", self.source.plan())
            .finish_non_exhaustive()
    }
}
