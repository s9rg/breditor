use std::fmt;

use crate::local_log::LocalLogStorageAttemptId;

use super::{
    LocalLogStorageSelectedBinding, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
    local_log_storage_attempt_plan::LocalLogStorageAttemptPlan,
};

/// One exact storage plan conservatively associated with a physical attempt.
///
/// The transition into this state occurs before request egress, so this type
/// deliberately cannot distinguish "never dispatched" from "possibly
/// committed". It remains `Uncertain` across request success, `commit()`
/// return, abort, cancellation, timeout, connection loss, or missing terminal
/// evidence. Exact resubmission preserves the closed plan, refreshes the
/// volatile attempt ID, and restores one-shot request eligibility.
///
/// This process-local, non-`Clone` value is neither terminal evidence nor
/// storage authority. v0.0.36 provides no transition out of uncertainty.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageUncertainAttempt>();
/// ```
///
/// A borrowed request cannot outlive its uncertain owner:
///
/// ```compile_fail
/// fn escape(
///     owner: &mut breditor_core::codec::LocalLogStorageUncertainAttempt,
/// ) -> breditor_core::codec::LocalLogStorageAttemptRequest<'static> {
///     match owner.adapter_request() {
///         Ok(request) => request,
///         Err(_) => loop {},
///     }
/// }
/// ```
///
/// A live request borrow prevents consuming the owner for resubmission:
///
/// ```compile_fail
/// fn conflict(mut owner: breditor_core::codec::LocalLogStorageUncertainAttempt) {
///     let Ok(request) = owner.adapter_request() else { return };
///     let _retry = owner.begin_exact_resubmission();
///     drop(request);
/// }
/// ```
#[must_use = "an uncertain storage attempt must be retained or exactly resubmitted"]
pub struct LocalLogStorageUncertainAttempt {
    pub(super) plan: LocalLogStorageAttemptPlan,
    pub(super) attempt_id: LocalLogStorageAttemptId,
    pub(super) request_issued: bool,
}

impl LocalLogStorageUncertainAttempt {
    pub(super) const fn new(
        plan: LocalLogStorageAttemptPlan,
        attempt_id: LocalLogStorageAttemptId,
    ) -> Self {
        Self { plan, attempt_id, request_issued: false }
    }

    /// Returns the current physical-attempt correlation identity.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageAttemptId {
        &self.attempt_id
    }

    /// Returns whether this exact candidate is a root or rotation.
    #[must_use]
    pub const fn selection_kind(&self) -> LocalLogStorageSelectionKind {
        self.plan.selection_kind()
    }

    /// Returns the prospective candidate transaction shape and incarnations.
    ///
    /// This is not evidence that a receipt exists.
    #[must_use]
    pub const fn candidate_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        self.plan.candidate_receipt()
    }

    /// Returns the complete strictly normalized prospective candidate binding.
    #[must_use]
    pub const fn candidate_binding(&self) -> &LocalLogStorageSelectedBinding {
        self.plan.candidate_binding()
    }

    /// Returns the complete prior selected binding for a rotation plan.
    #[must_use]
    pub fn selected_binding(&self) -> Option<&LocalLogStorageSelectedBinding> {
        self.plan.selected_binding()
    }

    /// Returns whether this attempt has already yielded its one request view.
    #[must_use]
    pub const fn request_issued(&self) -> bool {
        self.request_issued
    }

    /// Returns the byte length of the exact canonical candidate JSON.
    #[must_use]
    pub fn candidate_json_bytes(&self) -> usize {
        self.plan.candidate_json_bytes()
    }

    /// Returns selected-current JSON bytes retained only for a rotation.
    #[must_use]
    pub fn selected_current_json_bytes(&self) -> Option<usize> {
        self.plan.selected_current_json_bytes()
    }

    /// Returns selected-predecessor JSON bytes retained when the selected value
    /// was itself a rotation.
    #[must_use]
    pub fn selected_predecessor_json_bytes(&self) -> Option<usize> {
        self.plan.selected_predecessor_json_bytes()
    }

    /// Returns the checked sum of all retained exact JSON byte lengths.
    #[must_use]
    pub fn retained_json_bytes(&self) -> Option<usize> {
        self.plan.retained_json_bytes()
    }
}

impl fmt::Debug for LocalLogStorageUncertainAttempt {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageUncertainAttempt")
            .field("attempt_id", &self.attempt_id)
            .field("request_issued", &self.request_issued)
            .field("plan", &self.plan)
            .finish_non_exhaustive()
    }
}
