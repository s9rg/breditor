use crate::local_log::{LocalLogStorageAttemptId, LocalLogStorageAttemptRequestId};

use super::LocalLogStorageRootPublicationPlanV3;

/// Non-Clone owner of a possibly dispatched Root V3 publication.
///
/// No timeout, request-success, or cancellation API can clear uncertainty.
/// This owner performs no I/O and does not authorize concurrent dispatches.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRootPublicationAttemptV3>();
/// ```
#[derive(Debug)]
#[must_use = "retain uncertainty until an exact terminal attestation is available"]
pub struct LocalLogStorageRootPublicationAttemptV3 {
    pub(super) plan: LocalLogStorageRootPublicationPlanV3,
    pub(super) attempt_id: LocalLogStorageAttemptId,
    pub(super) request_id: Option<LocalLogStorageAttemptRequestId>,
}

impl LocalLogStorageRootPublicationAttemptV3 {
    /// Returns prospective facts only, without a payload or dispatch capability.
    #[must_use = "the borrowed plan contains prospective facts only"]
    pub const fn plan(&self) -> &LocalLogStorageRootPublicationPlanV3 {
        &self.plan
    }

    /// Returns allocation-identity correlation for this single invocation.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageAttemptId {
        &self.attempt_id
    }

    /// Reports whether the one-shot request view has been issued.
    #[must_use]
    pub const fn request_issued(&self) -> bool {
        self.request_id.is_some()
    }
}
