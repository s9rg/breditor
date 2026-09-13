use super::{
    LocalLogStorageAttemptTerminalAttestationKind, LocalLogStorageAttemptTransitionError,
    LocalLogStorageRootPublicationAttemptV3, LocalLogStorageRootPublicationAttestationV3,
    LocalLogStorageRootPublicationPlanV3,
};
use crate::local_log::{LocalLogStorageAttemptId, LocalLogStorageAttemptRequestId};

/// Accepted host terminal claim with its retained V3 plan and correlation.
///
/// No terminal category grants a writer, retry, current receipt, or durable-proof API.
/// `kind()` must be inspected: this owner is not unconditionally committed.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRootPublicationTerminalV3>();
/// ```
#[derive(Debug)]
#[must_use]
pub struct LocalLogStorageRootPublicationTerminalV3 {
    pub(super) owner: LocalLogStorageRootPublicationAttemptV3,
    pub(super) kind: LocalLogStorageAttemptTerminalAttestationKind,
}

impl LocalLogStorageRootPublicationTerminalV3 {
    /// Returns the accepted historical host claim, not an independently verified outcome.
    #[must_use]
    pub const fn kind(&self) -> LocalLogStorageAttemptTerminalAttestationKind {
        self.kind
    }

    /// Returns the unchanged candidate plan for inspection only.
    #[must_use = "the borrowed plan contains prospective facts only"]
    pub const fn plan(&self) -> &LocalLogStorageRootPublicationPlanV3 {
        &self.owner.plan
    }

    /// Returns correlation for the invocation whose claim was accepted.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageAttemptId {
        &self.owner.attempt_id
    }

    /// Returns retained issuance correlation, including for post-egress not-attempted claims.
    #[must_use]
    pub const fn request_id(&self) -> Option<&LocalLogStorageAttemptRequestId> {
        self.owner.request_id.as_ref()
    }
}

/// Recoverable rejection retaining the unchanged owner and unapplied V3 claim.
#[derive(Debug)]
#[must_use]
pub struct LocalLogStorageRootPublicationTerminalFailureV3 {
    pub(super) retained:
        Box<(LocalLogStorageRootPublicationAttemptV3, LocalLogStorageRootPublicationAttestationV3)>,
    pub(super) error: LocalLogStorageAttemptTransitionError,
}

impl LocalLogStorageRootPublicationTerminalFailureV3 {
    /// Returns the payload-free correlation failure.
    #[must_use]
    pub const fn error(&self) -> LocalLogStorageAttemptTransitionError {
        self.error
    }

    /// Recovers both unchanged inputs and the reason they were not applied.
    #[must_use = "the returned owner remains uncertain and the claim remains unapplied"]
    pub fn into_parts(
        self,
    ) -> (
        LocalLogStorageRootPublicationAttemptV3,
        LocalLogStorageRootPublicationAttestationV3,
        LocalLogStorageAttemptTransitionError,
    ) {
        let (owner, attestation) = *self.retained;
        (owner, attestation, self.error)
    }
}

impl std::fmt::Display for LocalLogStorageRootPublicationTerminalFailureV3 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.error.fmt(f)
    }
}

impl std::error::Error for LocalLogStorageRootPublicationTerminalFailureV3 {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.error)
    }
}
