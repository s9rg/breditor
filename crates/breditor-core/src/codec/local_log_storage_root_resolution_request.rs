use std::fmt;

use crate::local_log::LocalLogStorageRootResolutionRequestId;

use super::{
    LocalLogStorageSelectedBinding, LocalLogStorageSelectionReceiptBinding,
    local_log_storage_attempt_plan::LocalLogStorageAttemptPlan,
};

/// Borrowed payload-bearing request for one root storage resolver invocation.
///
/// The raw JSON contains complete document-bearing checkpoint payloads. It is
/// persistence data, not secret capability material, but callers must avoid
/// diagnostics that print it. A host may copy and dispatch this request later
/// or more than once; the one-shot borrow is API hygiene, not single-dispatch
/// proof. Only exact correlation to a completed read or the narrowly defined
/// aborted database-open probe can close this invocation.
///
/// This request carries no adapter, writer token, storage evidence, retry
/// authority, durability promise, or successor owner.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRootResolutionRequest<'static>>();
/// ```
#[must_use = "a borrowed root-resolution request is intended for one adapter invocation"]
pub struct LocalLogStorageRootResolutionRequest<'a> {
    request_id: &'a LocalLogStorageRootResolutionRequestId,
    candidate_binding: &'a LocalLogStorageSelectedBinding,
    candidate_json: &'a str,
}

impl<'a> LocalLogStorageRootResolutionRequest<'a> {
    pub(super) fn from_plan(
        plan: &'a LocalLogStorageAttemptPlan,
        request_id: &'a LocalLogStorageRootResolutionRequestId,
    ) -> Self {
        Self {
            request_id,
            candidate_binding: plan.candidate_binding(),
            candidate_json: plan.candidate_json(),
        }
    }

    /// Returns the opaque process-local resolver-request identity.
    #[must_use]
    pub const fn request_id(&self) -> &'a LocalLogStorageRootResolutionRequestId {
        self.request_id
    }

    /// Returns the prospective candidate receipt; this is not a stored receipt.
    #[must_use]
    pub const fn candidate_receipt(&self) -> &'a LocalLogStorageSelectionReceiptBinding {
        self.candidate_binding.current_receipt()
    }

    /// Returns the complete prospective root binding.
    #[must_use]
    pub const fn candidate_binding(&self) -> &'a LocalLogStorageSelectedBinding {
        self.candidate_binding
    }

    /// Returns the exact canonical Storage Root V1 candidate JSON.
    #[must_use]
    pub const fn candidate_json(&self) -> &'a str {
        self.candidate_json
    }

    /// Returns the UTF-8 byte length of the exact candidate JSON.
    #[must_use]
    pub const fn candidate_json_bytes(&self) -> usize {
        self.candidate_json.len()
    }
}

impl fmt::Debug for LocalLogStorageRootResolutionRequest<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootResolutionRequest")
            .field("request_id", self.request_id)
            .field("candidate_binding", self.candidate_binding)
            .field("candidate_json_bytes", &self.candidate_json.len())
            .finish_non_exhaustive()
    }
}
