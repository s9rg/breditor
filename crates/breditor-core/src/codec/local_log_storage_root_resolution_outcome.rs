use std::fmt;

use super::{LocalLogStorageRootResolved, LocalLogStorageRootRetryEligibleAtResolution};

/// Stable semantic result of one exactly correlated terminal root resolver.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRootResolutionOutcomeKind {
    /// The exact candidate is selected by the completed observation.
    CommittedSelectedAtResolution,
    /// The exact candidate is one valid selection's immediate predecessor.
    CommittedSuperseded,
    /// Only the candidate's immutable retired identity remains.
    ResolutionRetired,
    /// Clean absence permits advisory exact resubmission.
    RetryEligibleAtResolution,
    /// Another valid scope incarnation already occupies the logical scope.
    ScopeAlreadyProvisioned,
    /// A planned identity, index, graph, or supplied finding failed closed.
    CollisionOrCorruption,
    /// The expected database/scope lifetime is missing or replaced.
    StorageResetOrIndeterminate,
}

impl LocalLogStorageRootResolutionOutcomeKind {
    /// Returns the stable profile-neutral spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CommittedSelectedAtResolution => "committed_selected_at_resolution",
            Self::CommittedSuperseded => "committed_superseded",
            Self::ResolutionRetired => "resolution_retired",
            Self::RetryEligibleAtResolution => "retry_eligible_at_resolution",
            Self::ScopeAlreadyProvisioned => "scope_already_provisioned",
            Self::CollisionOrCorruption => "collision_or_corruption",
            Self::StorageResetOrIndeterminate => "storage_reset_or_indeterminate",
        }
    }
}

/// Semantic classification produced by the Rust root resolver.
///
/// The host supplies a physical finding, never one of these outcomes. Rust
/// validates the finding against the retained exact plan and applies source-
/// dependent rules. Only `RetryEligibleAtResolution` contains a type with an
/// exact-resubmission transition. No variant releases a writer, checkpoint
/// anchor, or semantic owner.
#[non_exhaustive]
#[must_use = "a terminal root-resolution outcome must be explicitly handled"]
pub enum LocalLogStorageRootResolutionOutcome {
    /// Exact candidate bytes and binding were selected by the completed observation.
    CommittedSelectedAtResolution(LocalLogStorageRootResolved),
    /// Exact candidate bytes are the valid current value's immediate predecessor.
    CommittedSuperseded(LocalLogStorageRootResolved),
    /// The candidate is known only through retained retired identity facts.
    ResolutionRetired(LocalLogStorageRootResolved),
    /// A non-host-committed source may begin an advisory exact resubmission.
    RetryEligibleAtResolution(LocalLogStorageRootRetryEligibleAtResolution),
    /// Another complete valid scope lifetime occupies the logical scope.
    ScopeAlreadyProvisioned(LocalLogStorageRootResolved),
    /// The finding conflicts with permanent identity or profile associations.
    CollisionOrCorruption(LocalLogStorageRootResolved),
    /// Expected database/scope lifetime evidence is gone or different.
    StorageResetOrIndeterminate(LocalLogStorageRootResolved),
}

impl LocalLogStorageRootResolutionOutcome {
    /// Returns the semantic outcome category.
    #[must_use]
    pub const fn kind(&self) -> LocalLogStorageRootResolutionOutcomeKind {
        match self {
            Self::CommittedSelectedAtResolution(_) => {
                LocalLogStorageRootResolutionOutcomeKind::CommittedSelectedAtResolution
            }
            Self::CommittedSuperseded(_) => {
                LocalLogStorageRootResolutionOutcomeKind::CommittedSuperseded
            }
            Self::ResolutionRetired(_) => {
                LocalLogStorageRootResolutionOutcomeKind::ResolutionRetired
            }
            Self::RetryEligibleAtResolution(_) => {
                LocalLogStorageRootResolutionOutcomeKind::RetryEligibleAtResolution
            }
            Self::ScopeAlreadyProvisioned(_) => {
                LocalLogStorageRootResolutionOutcomeKind::ScopeAlreadyProvisioned
            }
            Self::CollisionOrCorruption(_) => {
                LocalLogStorageRootResolutionOutcomeKind::CollisionOrCorruption
            }
            Self::StorageResetOrIndeterminate(_) => {
                LocalLogStorageRootResolutionOutcomeKind::StorageResetOrIndeterminate
            }
        }
    }
}

impl fmt::Debug for LocalLogStorageRootResolutionOutcome {
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
            Self::ScopeAlreadyProvisioned(value) => {
                formatter.debug_tuple("ScopeAlreadyProvisioned").field(value).finish()
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
