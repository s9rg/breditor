use std::fmt;

use crate::local_log::LocalLogStorageAttemptId;

use super::{
    LocalLogStorageSelectedBinding, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
    local_log_storage_issued_attempt::LocalLogStorageIssuedAttempt,
};

/// One exact plan with a host-attested historical publication commit.
///
/// The host has asserted that the exact publication transaction associated
/// with this attempt was armed with the complete plan and emitted its terminal
/// `complete` event. The core validates process-local correlation and
/// typestate only; it cannot independently inspect or authenticate the browser
/// event. Historical commit does not prove that the candidate is still
/// selected, survives later reset/eviction, is durably flushed, or carries
/// writer authority. This state releases no checkpoint anchor or semantic
/// owner and deliberately cannot exact-resubmit.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageHostAttestedCommitted>();
/// ```
///
/// Historical commit evidence cannot exact-resubmit:
///
/// ```compile_fail
/// fn retry(state: breditor_core::codec::LocalLogStorageHostAttestedCommitted) {
///     let _ = state.begin_exact_resubmission();
/// }
/// ```
#[must_use = "historical storage commit evidence must be explicitly retained or resolved"]
pub struct LocalLogStorageHostAttestedCommitted {
    pub(super) retained: LocalLogStorageIssuedAttempt,
}

impl LocalLogStorageHostAttestedCommitted {
    pub(super) const fn new(retained: LocalLogStorageIssuedAttempt) -> Self {
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

    /// Returns the exact prospective receipt whose publication was attested.
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

impl fmt::Debug for LocalLogStorageHostAttestedCommitted {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageHostAttestedCommitted")
            .field("attempt_id", self.attempt_id())
            .field("request_id", self.retained.request_id())
            .field("plan", self.retained.plan())
            .finish_non_exhaustive()
    }
}
