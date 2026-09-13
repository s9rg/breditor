use super::{
    LocalLogStorageAttemptTerminalAttestationKind, LocalLogStorageRootPublicationAttemptV3,
    LocalLogStorageRootPublicationPlanV3,
};
use crate::local_log::{LocalLogStorageAttemptId, LocalLogStorageRootResolutionRequestId};

/// One observational V3 probe retaining its exact publication provenance.
///
/// This non-Clone owner does not clear publication uncertainty, perform I/O,
/// or grant retries/writer authority. Only exact-current readback is supported.
/// Missing, superseded, retired, and damaged storage require future protocols.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRootReadbackV3>();
/// ```
#[derive(Debug)]
#[must_use = "retain readback provenance until its exact observation is handled"]
pub struct LocalLogStorageRootReadbackV3 {
    pub(super) source: LocalLogStorageRootPublicationAttemptV3,
    pub(super) source_terminal_kind: Option<LocalLogStorageAttemptTerminalAttestationKind>,
    pub(super) request_id: Option<LocalLogStorageRootResolutionRequestId>,
}

impl LocalLogStorageRootReadbackV3 {
    /// Returns the original prospective plan, not a committed receipt.
    #[must_use = "the plan remains prospective"]
    pub const fn plan(&self) -> &LocalLogStorageRootPublicationPlanV3 {
        &self.source.plan
    }

    /// Returns the original publication invocation, not the probe identity.
    #[must_use]
    pub const fn source_attempt_id(&self) -> &LocalLogStorageAttemptId {
        &self.source.attempt_id
    }

    /// Returns the historical terminal claim, or None for an uncertain source.
    #[must_use]
    pub const fn source_terminal_kind(
        &self,
    ) -> Option<LocalLogStorageAttemptTerminalAttestationKind> {
        self.source_terminal_kind
    }

    /// Reports whether the original publication request had left its owner.
    #[must_use]
    pub const fn source_request_issued(&self) -> bool {
        self.source.request_id.is_some()
    }

    /// Reports whether this probe has issued its one request.
    #[must_use]
    pub const fn request_issued(&self) -> bool {
        self.request_id.is_some()
    }
}
