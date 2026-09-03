use std::fmt;

use super::{LocalLogStorageRotationResolved, LocalLogStorageRotationRetryEligibleAtResolution};

/// Stable semantic result of one correlated terminal rotation resolver.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRotationResolutionOutcomeKind {
    /// The exact candidate is selected by the completed observation.
    CommittedSelectedAtResolution,
    /// The exact candidate is one valid selection's immediate predecessor.
    CommittedSuperseded,
    /// Only the candidate's immutable retired identity remains.
    ResolutionRetired,
    /// Exact prior state and candidate absence permit advisory resubmission.
    RetryEligibleAtResolution,
    /// Another same-lifetime head makes this immutable plan ineligible.
    DefinitelyNotCommittedConflict,
    /// A planned identity, index, graph, or finding failed closed.
    CollisionOrCorruption,
    /// The expected database or scope lifetime is missing or replaced.
    StorageResetOrIndeterminate,
}

impl LocalLogStorageRotationResolutionOutcomeKind {
    /// Returns the stable profile-neutral spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CommittedSelectedAtResolution => "committed_selected_at_resolution",
            Self::CommittedSuperseded => "committed_superseded",
            Self::ResolutionRetired => "resolution_retired",
            Self::RetryEligibleAtResolution => "retry_eligible_at_resolution",
            Self::DefinitelyNotCommittedConflict => "definitely_not_committed_conflict",
            Self::CollisionOrCorruption => "collision_or_corruption",
            Self::StorageResetOrIndeterminate => "storage_reset_or_indeterminate",
        }
    }
}

/// Semantic classification produced by the Rust rotation resolver.
///
/// Only `RetryEligibleAtResolution` contains an exact-resubmission transition.
/// No variant releases a writer, checkpoint anchor, or semantic owner.
#[non_exhaustive]
#[must_use = "a terminal rotation-resolution outcome must be explicitly handled"]
pub enum LocalLogStorageRotationResolutionOutcome {
    /// Exact candidate bytes and binding are selected by this observation.
    CommittedSelectedAtResolution(LocalLogStorageRotationResolved),
    /// Exact candidate bytes are the valid current value's immediate predecessor.
    CommittedSuperseded(LocalLogStorageRotationResolved),
    /// Candidate identity remains only as a transaction tombstone.
    ResolutionRetired(LocalLogStorageRotationResolved),
    /// A non-host-committed source may begin advisory exact resubmission.
    RetryEligibleAtResolution(LocalLogStorageRotationRetryEligibleAtResolution),
    /// A different same-lifetime head prevents this exact old plan from publishing.
    DefinitelyNotCommittedConflict(LocalLogStorageRotationResolved),
    /// The finding conflicts with permanent identity or profile associations.
    CollisionOrCorruption(LocalLogStorageRotationResolved),
    /// Expected database/scope lifetime evidence is gone or different.
    StorageResetOrIndeterminate(LocalLogStorageRotationResolved),
}

impl LocalLogStorageRotationResolutionOutcome {
    /// Returns the semantic outcome category.
    #[must_use]
    pub const fn kind(&self) -> LocalLogStorageRotationResolutionOutcomeKind {
        match self {
            Self::CommittedSelectedAtResolution(_) => {
                LocalLogStorageRotationResolutionOutcomeKind::CommittedSelectedAtResolution
            }
            Self::CommittedSuperseded(_) => {
                LocalLogStorageRotationResolutionOutcomeKind::CommittedSuperseded
            }
            Self::ResolutionRetired(_) => {
                LocalLogStorageRotationResolutionOutcomeKind::ResolutionRetired
            }
            Self::RetryEligibleAtResolution(_) => {
                LocalLogStorageRotationResolutionOutcomeKind::RetryEligibleAtResolution
            }
            Self::DefinitelyNotCommittedConflict(_) => {
                LocalLogStorageRotationResolutionOutcomeKind::DefinitelyNotCommittedConflict
            }
            Self::CollisionOrCorruption(_) => {
                LocalLogStorageRotationResolutionOutcomeKind::CollisionOrCorruption
            }
            Self::StorageResetOrIndeterminate(_) => {
                LocalLogStorageRotationResolutionOutcomeKind::StorageResetOrIndeterminate
            }
        }
    }
}

impl fmt::Debug for LocalLogStorageRotationResolutionOutcome {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::CommittedSelectedAtResolution(value) => {
                formatter.debug_tuple("CommittedSelectedAtResolution").field(value).finish()
            }
            Self::CommittedSuperseded(value) => {
                formatter.debug_tuple("CommittedSuperseded").field(value).finish()
            }
            Self::ResolutionRetired(value) => {
                formatter.debug_tuple("ResolutionRetired").field(value).finish()
            }
            Self::RetryEligibleAtResolution(value) => {
                formatter.debug_tuple("RetryEligibleAtResolution").field(value).finish()
            }
            Self::DefinitelyNotCommittedConflict(value) => {
                formatter.debug_tuple("DefinitelyNotCommittedConflict").field(value).finish()
            }
            Self::CollisionOrCorruption(value) => {
                formatter.debug_tuple("CollisionOrCorruption").field(value).finish()
            }
            Self::StorageResetOrIndeterminate(value) => {
                formatter.debug_tuple("StorageResetOrIndeterminate").field(value).finish()
            }
        }
    }
}
