use std::fmt;

use crate::local_log::LocalLogStorageAttemptId;

use super::{
    LocalLogStorageSelectedBinding, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
    local_log_storage_retained_attempt::LocalLogStorageRetainedAttempt,
};

/// One exact plan whose named adapter invocation created no publication transaction.
///
/// This host attestation closes one physical invocation, not every possible
/// dispatch of the plan. If its request was exposed, copied bytes may still be
/// used by an uncorrelated invocation. This attempt has consumed its one
/// terminal observation and accepts no later terminal attestation. Even when
/// no request was exposed, this state carries no writer authority and is
/// intentionally not named `DefinitelyNotCommitted`. It retains the exact
/// plan for serialized resolution or exact resubmission.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageNotAttempted>();
/// ```
///
/// This singular attempt has already consumed its terminal observation:
///
/// ```compile_fail
/// fn second(
///     state: breditor_core::codec::LocalLogStorageNotAttempted,
///     attestation: breditor_core::codec::LocalLogStorageAttemptTerminalAttestation,
/// ) {
///     let _ = state.observe_terminal_attestation(attestation);
/// }
/// ```
#[must_use = "a physically unattempted storage plan is not a plan-level resolution"]
pub struct LocalLogStorageNotAttempted {
    pub(super) retained: LocalLogStorageRetainedAttempt,
}

impl LocalLogStorageNotAttempted {
    pub(super) const fn new(retained: LocalLogStorageRetainedAttempt) -> Self {
        Self { retained }
    }

    /// Returns the correlated physical attempt identity.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageAttemptId {
        self.retained.attempt_id()
    }

    /// Returns whether the exact plan is a root or rotation.
    #[must_use]
    pub const fn selection_kind(&self) -> LocalLogStorageSelectionKind {
        self.retained.plan().selection_kind()
    }

    /// Returns the exact prospective receipt; this is not a stored receipt.
    #[must_use]
    pub const fn candidate_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        self.retained.plan().candidate_receipt()
    }

    /// Returns the complete prospective selected binding.
    #[must_use]
    pub const fn candidate_binding(&self) -> &LocalLogStorageSelectedBinding {
        self.retained.plan().candidate_binding()
    }

    /// Returns the prior selected binding retained for a rotation plan.
    #[must_use]
    pub fn selected_binding(&self) -> Option<&LocalLogStorageSelectedBinding> {
        self.retained.plan().selected_binding()
    }

    /// Returns whether this attempt yielded its adapter request.
    #[must_use]
    pub const fn request_issued(&self) -> bool {
        self.retained.request_issued()
    }

    /// Returns the exact canonical candidate JSON byte length.
    #[must_use]
    pub fn candidate_json_bytes(&self) -> usize {
        self.retained.plan().candidate_json_bytes()
    }

    /// Returns retained selected-current bytes for a rotation plan.
    #[must_use]
    pub fn selected_current_json_bytes(&self) -> Option<usize> {
        self.retained.plan().selected_current_json_bytes()
    }

    /// Returns retained selected-predecessor bytes when present.
    #[must_use]
    pub fn selected_predecessor_json_bytes(&self) -> Option<usize> {
        self.retained.plan().selected_predecessor_json_bytes()
    }

    /// Returns the checked total of all exact retained JSON bytes.
    #[must_use]
    pub fn retained_json_bytes(&self) -> Option<usize> {
        self.retained.plan().retained_json_bytes()
    }
}

impl fmt::Debug for LocalLogStorageNotAttempted {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageNotAttempted")
            .field("attempt_id", self.attempt_id())
            .field("request_issued", &self.request_issued())
            .field("plan", self.retained.plan())
            .finish_non_exhaustive()
    }
}
