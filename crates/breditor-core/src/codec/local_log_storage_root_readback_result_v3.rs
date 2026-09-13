use super::{
    LocalLogStorageRootReadbackEvidenceV3, LocalLogStorageRootReadbackV3,
    LocalLogStorageSelectedRootV3,
};

/// Exact candidate match at the host-attested read snapshot, not current authority.
///
/// Another transaction may immediately supersede the observed root. This value
/// offers no retry, writer, session-restore, or publication-success transition.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRootReadbackMatchV3>();
/// ```
#[derive(Debug)]
#[must_use]
pub struct LocalLogStorageRootReadbackMatchV3 {
    pub(super) owner: LocalLogStorageRootReadbackV3,
    pub(super) evidence: LocalLogStorageRootReadbackEvidenceV3,
}
impl LocalLogStorageRootReadbackMatchV3 {
    /// Returns preserved source provenance and prospective plan for inspection.
    pub const fn source(&self) -> &LocalLogStorageRootReadbackV3 {
        &self.owner
    }
    /// Returns the exact normalized selection from the attested snapshot.
    pub const fn selected(&self) -> &LocalLogStorageSelectedRootV3 {
        &self.evidence.selected
    }
}

/// Payload-free reason that exact-current readback could not be accepted.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
#[non_exhaustive]
pub enum LocalLogStorageRootReadbackErrorV3 {
    /// The probe never issued a request.
    #[error("V3 root readback request was not issued")]
    RequestNotIssued,
    /// Evidence named another probe.
    #[error("V3 root readback request correlation mismatch")]
    RequestIdMismatch,
    /// The committed-head index did not return the candidate transaction.
    #[error("V3 root readback committed-head index mismatch")]
    HeadIndexMismatch,
    /// Exact bytes or complete selected facts differ; this is not absence proof.
    #[error("V3 root readback is not the exact candidate selection")]
    CandidateMismatch,
}

/// Rejected readback, preserving the complete unchanged owner and evidence.
#[derive(Debug)]
#[must_use]
pub struct LocalLogStorageRootReadbackFailureV3 {
    pub(super) retained:
        Box<(LocalLogStorageRootReadbackV3, LocalLogStorageRootReadbackEvidenceV3)>,
    pub(super) error: LocalLogStorageRootReadbackErrorV3,
}
impl LocalLogStorageRootReadbackFailureV3 {
    /// Returns the rejected condition, never noncommit or retry evidence.
    #[must_use]
    pub const fn error(&self) -> LocalLogStorageRootReadbackErrorV3 {
        self.error
    }
    /// Recovers both unchanged inputs and the rejection reason.
    #[must_use = "retain the unchanged probe and unapplied evidence"]
    pub fn into_parts(
        self,
    ) -> (
        LocalLogStorageRootReadbackV3,
        LocalLogStorageRootReadbackEvidenceV3,
        LocalLogStorageRootReadbackErrorV3,
    ) {
        let (owner, evidence) = *self.retained;
        (owner, evidence, self.error)
    }
}
impl std::fmt::Display for LocalLogStorageRootReadbackFailureV3 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.error.fmt(f)
    }
}
impl std::error::Error for LocalLogStorageRootReadbackFailureV3 {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.error)
    }
}
