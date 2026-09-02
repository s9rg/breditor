use std::fmt;

use crate::local_log::LocalLogStorageAttemptId;

use super::{
    LocalLogStorageSelectedBinding, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
    local_log_storage_issued_attempt::LocalLogStorageIssuedAttempt,
};

/// One exact plan after a host-attested physical transaction abort.
///
/// The abort rolled back only the associated physical transaction. It is not
/// plan-level noncommit evidence: an uncorrelated copied dispatch may still
/// commit. This attempt has consumed its one terminal event, so the state
/// accepts no further terminal attestation. Exact resubmission installs a
/// fresh ID; effects of any copied dispatch require storage resolution.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAttemptAborted>();
/// ```
///
/// This singular attempt has already consumed its terminal event:
///
/// ```compile_fail
/// fn second(
///     state: breditor_core::codec::LocalLogStorageAttemptAborted,
///     attestation: breditor_core::codec::LocalLogStorageAttemptTerminalAttestation,
/// ) {
///     let _ = state.observe_terminal_attestation(attestation);
/// }
/// ```
#[must_use = "a physically aborted storage plan is still unresolved at plan level"]
pub struct LocalLogStorageAttemptAborted {
    pub(super) retained: LocalLogStorageIssuedAttempt,
}

impl LocalLogStorageAttemptAborted {
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

impl fmt::Debug for LocalLogStorageAttemptAborted {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAttemptAborted")
            .field("attempt_id", self.attempt_id())
            .field("request_id", self.retained.request_id())
            .field("plan", self.retained.plan())
            .finish_non_exhaustive()
    }
}
