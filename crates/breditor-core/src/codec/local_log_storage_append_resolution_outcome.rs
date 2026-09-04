use std::fmt;

use super::{
    LocalLogStorageAppendHeadPresentAtResolution, LocalLogStorageAppendResolved,
    LocalLogStorageAppendRetryEligibleAtResolution,
};

/// Stable semantic result of one exactly correlated terminal append resolver.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendResolutionOutcomeKind {
    /// The exact queue head is the byte-identical valid final stored record.
    HeadPresentAtResolution,
    /// Clean exact-tail absence permits advisory exact resubmission.
    RetryEligibleAtResolution,
    /// Storage advanced or the retained attempt can no longer be classified.
    TailAdvancedOrIndeterminate,
    /// A supplied finding or physical profile invariant failed closed.
    CollisionOrCorruption,
    /// The expected database or scope lifetime disappeared or was replaced.
    StorageResetOrIndeterminate,
}

impl LocalLogStorageAppendResolutionOutcomeKind {
    /// Returns the stable profile-neutral spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::HeadPresentAtResolution => "head_present_at_resolution",
            Self::RetryEligibleAtResolution => "retry_eligible_at_resolution",
            Self::TailAdvancedOrIndeterminate => "tail_advanced_or_indeterminate",
            Self::CollisionOrCorruption => "collision_or_corruption",
            Self::StorageResetOrIndeterminate => "storage_reset_or_indeterminate",
        }
    }
}

/// Semantic classification produced by the Rust append resolver.
///
/// The host supplies physical observations only. Rust compares them with the
/// retained private binding and exact head bytes. Only
/// `HeadPresentAtResolution` can acknowledge one FIFO head, and only
/// `RetryEligibleAtResolution` can begin an exact resubmission. Every other
/// variant keeps the queue quarantined without either transition.
#[non_exhaustive]
#[must_use = "a terminal append-resolution outcome must be explicitly handled"]
pub enum LocalLogStorageAppendResolutionOutcome {
    /// Exact head bytes were the valid final record at completed observation.
    HeadPresentAtResolution(LocalLogStorageAppendHeadPresentAtResolution),
    /// Full binding and clean exact-tail absence permit advisory resubmission.
    RetryEligibleAtResolution(LocalLogStorageAppendRetryEligibleAtResolution),
    /// A later/current context prevents positive or negative classification.
    TailAdvancedOrIndeterminate(LocalLogStorageAppendResolved),
    /// A record, binding claim, range, or profile invariant failed closed.
    CollisionOrCorruption(LocalLogStorageAppendResolved),
    /// The expected physical database or logical scope lifetime is unavailable.
    StorageResetOrIndeterminate(LocalLogStorageAppendResolved),
}

impl LocalLogStorageAppendResolutionOutcome {
    /// Returns the semantic outcome category.
    #[must_use]
    pub const fn kind(&self) -> LocalLogStorageAppendResolutionOutcomeKind {
        match self {
            Self::HeadPresentAtResolution(_) => {
                LocalLogStorageAppendResolutionOutcomeKind::HeadPresentAtResolution
            }
            Self::RetryEligibleAtResolution(_) => {
                LocalLogStorageAppendResolutionOutcomeKind::RetryEligibleAtResolution
            }
            Self::TailAdvancedOrIndeterminate(_) => {
                LocalLogStorageAppendResolutionOutcomeKind::TailAdvancedOrIndeterminate
            }
            Self::CollisionOrCorruption(_) => {
                LocalLogStorageAppendResolutionOutcomeKind::CollisionOrCorruption
            }
            Self::StorageResetOrIndeterminate(_) => {
                LocalLogStorageAppendResolutionOutcomeKind::StorageResetOrIndeterminate
            }
        }
    }
}

impl fmt::Debug for LocalLogStorageAppendResolutionOutcome {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::HeadPresentAtResolution(value) => {
                formatter.debug_tuple("HeadPresentAtResolution").field(value).finish()
            }
            Self::RetryEligibleAtResolution(value) => {
                formatter.debug_tuple("RetryEligibleAtResolution").field(value).finish()
            }
            Self::TailAdvancedOrIndeterminate(value) => {
                formatter.debug_tuple("TailAdvancedOrIndeterminate").field(value).finish()
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
