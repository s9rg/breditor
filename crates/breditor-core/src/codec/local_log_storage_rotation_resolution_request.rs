use std::fmt;

use crate::local_log::LocalLogStorageRotationResolutionRequestId;

use super::{
    LocalLogStorageSelectedBinding, LocalLogStorageSelectionReceiptBinding,
    local_log_storage_attempt_plan::LocalLogStorageAttemptPlan,
};

/// Borrowed payload-bearing request for one rotation resolver invocation.
///
/// Candidate and selected-envelope JSON may contain document payloads and are
/// deliberately omitted from diagnostics. The host can copy or dispatch these
/// bytes more than once; the one-shot borrow is hygiene, not dispatch proof.
/// Only exact correlation to a completed read or the narrowly defined aborted
/// database-open probe can close this invocation. The request carries no
/// adapter, writer token, storage evidence, retry authority, currentness, or
/// durability promise.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRotationResolutionRequest<'static>>();
/// ```
#[must_use = "a borrowed rotation-resolution request is intended for one adapter invocation"]
pub struct LocalLogStorageRotationResolutionRequest<'a> {
    request_id: &'a LocalLogStorageRotationResolutionRequestId,
    candidate_binding: &'a LocalLogStorageSelectedBinding,
    candidate_json: &'a str,
    selected_binding: &'a LocalLogStorageSelectedBinding,
    selected_current_json: &'a str,
    selected_predecessor_json: Option<&'a str>,
}

impl<'a> LocalLogStorageRotationResolutionRequest<'a> {
    pub(super) fn from_plan(
        plan: &'a LocalLogStorageAttemptPlan,
        request_id: &'a LocalLogStorageRotationResolutionRequestId,
    ) -> Self {
        let context = plan.validated_rotation_context();
        Self {
            request_id,
            candidate_binding: plan.candidate_binding(),
            candidate_json: plan.candidate_json(),
            selected_binding: context.selected_binding(),
            selected_current_json: context.current_selection_json(),
            selected_predecessor_json: context.predecessor_selection_json(),
        }
    }

    /// Returns the opaque process-local resolver-request identity.
    #[must_use]
    pub const fn request_id(&self) -> &'a LocalLogStorageRotationResolutionRequestId {
        self.request_id
    }

    /// Returns the prospective candidate receipt; this is not a stored receipt.
    #[must_use]
    pub const fn candidate_receipt(&self) -> &'a LocalLogStorageSelectionReceiptBinding {
        self.candidate_binding.current_receipt()
    }

    /// Returns the complete prospective rotation binding.
    #[must_use]
    pub const fn candidate_binding(&self) -> &'a LocalLogStorageSelectedBinding {
        self.candidate_binding
    }

    /// Returns the exact canonical candidate JSON.
    #[must_use]
    pub const fn candidate_json(&self) -> &'a str {
        self.candidate_json
    }

    /// Returns the candidate JSON UTF-8 byte length.
    #[must_use]
    pub const fn candidate_json_bytes(&self) -> usize {
        self.candidate_json.len()
    }

    /// Returns the complete exact prior selected scalar binding.
    #[must_use]
    pub const fn selected_binding(&self) -> &'a LocalLogStorageSelectedBinding {
        self.selected_binding
    }

    /// Returns the exact canonical prior current-selection JSON.
    #[must_use]
    pub const fn selected_current_json(&self) -> &'a str {
        self.selected_current_json
    }

    /// Returns exact prior predecessor JSON when the prior selection was a rotation.
    #[must_use]
    pub const fn selected_predecessor_json(&self) -> Option<&'a str> {
        self.selected_predecessor_json
    }
}

impl fmt::Debug for LocalLogStorageRotationResolutionRequest<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationResolutionRequest")
            .field("request_id", self.request_id)
            .field("candidate_binding", self.candidate_binding)
            .field("candidate_json_bytes", &self.candidate_json.len())
            .field("selected_binding", self.selected_binding)
            .field("selected_current_json_bytes", &self.selected_current_json.len())
            .field("selected_predecessor_json_bytes", &self.selected_predecessor_json.map(str::len))
            .finish_non_exhaustive()
    }
}
