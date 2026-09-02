use std::fmt;

use super::{
    LocalLogStorageSelectedBinding, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
    local_log_storage_attempt_plan::LocalLogStorageAttemptPlan,
};

/// One closed exact storage plan that has not crossed the request boundary.
///
/// `Prepared` is private-constructor, non-`Clone`, process-local state. It does
/// not expose candidate or selected JSON. Consuming
/// [`Self::begin_attempt`](crate::codec::LocalLogStoragePreparedAttempt::begin_attempt)
/// creates a fresh opaque physical-attempt ID and conservatively moves to
/// `Uncertain` before a payload-bearing adapter request can be borrowed.
///
/// This type owns no adapter, I/O, writer authority, commit evidence, or
/// writable successor owner. Re-preparing from the original borrowed source
/// values can create an equivalent plan, so non-`Clone` is API hygiene rather
/// than authority.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStoragePreparedAttempt>();
/// ```
///
/// `Prepared` cannot expose a request before the consuming transition:
///
/// ```compile_fail
/// fn request(
///     prepared: &mut breditor_core::codec::LocalLogStoragePreparedAttempt,
/// ) {
///     let _request = prepared.adapter_request();
/// }
/// ```
#[must_use = "a prepared storage attempt must be begun or deliberately retained"]
pub struct LocalLogStoragePreparedAttempt {
    pub(super) plan: LocalLogStorageAttemptPlan,
}

impl LocalLogStoragePreparedAttempt {
    pub(super) const fn new(plan: LocalLogStorageAttemptPlan) -> Self {
        Self { plan }
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
    ///
    /// A root retains only its candidate. A rotation also retains selected
    /// current and optional predecessor JSON. `None` means the aggregate cannot
    /// be represented by `usize`; individual codec limits remain independent.
    #[must_use]
    pub fn retained_json_bytes(&self) -> Option<usize> {
        self.plan.retained_json_bytes()
    }
}

impl fmt::Debug for LocalLogStoragePreparedAttempt {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStoragePreparedAttempt")
            .field("plan", &self.plan)
            .finish_non_exhaustive()
    }
}
