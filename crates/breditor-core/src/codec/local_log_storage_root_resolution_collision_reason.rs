use super::{
    LocalLogStorageRootResolutionBrokenAssociation, LocalLogStorageRootResolutionIdentityCollision,
};

/// Stable payload-free reason a root finding failed closed.
///
/// This reason is diagnostic classification only. It retains no storage record,
/// selection JSON, identifier, parser text, or source error.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRootResolutionCollisionReason {
    /// `ExpectedDatabaseUnavailable` reported the exact expected incarnation.
    ExpectedDatabaseObservationMismatch,
    /// The selected candidate binding or exact candidate bytes disagreed.
    CandidateSelectedMismatch,
    /// The candidate committed-head index did not map to its transaction.
    CandidateCommittedHeadIndexMismatch,
    /// A later selection did not retain the exact candidate predecessor.
    CandidateImmediatePredecessorMismatch,
    /// The later/current committed-head index did not map to its transaction.
    CurrentCommittedHeadIndexMismatch,
    /// A later current graph reused a permanent candidate identity.
    CurrentIdentityReuse,
    /// The permanent planned checkpoint-only generation disagreed.
    PlannedCheckpointGenerationMismatch,
    /// The planned active generation was not its exact retirement tombstone.
    PlannedActiveGenerationMismatch,
    /// Retired candidate identity or stored byte length disagreed.
    RetiredTransactionMismatch,
    /// The candidate's direct-successor edge or head-index mapping disagreed.
    RetiredSuccessorMismatch,
    /// The current scope graph around a retired candidate disagreed.
    RetiredScopeMismatch,
    /// A purported other valid scope was not the required distinct scope.
    OtherScopeMismatch,
    /// The adapter directly observed one conflicting permanent planned identity.
    ObservedPlannedIdentityCollision {
        /// Conflicting key or permanent identity category.
        identity: LocalLogStorageRootResolutionIdentityCollision,
    },
    /// The adapter directly observed a broken profile-database or scope association.
    ObservedBrokenProfileAssociation {
        /// Broken association category.
        association: LocalLogStorageRootResolutionBrokenAssociation,
    },
}

impl LocalLogStorageRootResolutionCollisionReason {
    /// Returns the stable namespaced diagnostic code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ExpectedDatabaseObservationMismatch => {
                "local_log_storage_root_resolution.expected_database_observation_mismatch"
            }
            Self::CandidateSelectedMismatch => {
                "local_log_storage_root_resolution.candidate_selected_mismatch"
            }
            Self::CandidateCommittedHeadIndexMismatch => {
                "local_log_storage_root_resolution.candidate_committed_head_index_mismatch"
            }
            Self::CandidateImmediatePredecessorMismatch => {
                "local_log_storage_root_resolution.candidate_immediate_predecessor_mismatch"
            }
            Self::CurrentCommittedHeadIndexMismatch => {
                "local_log_storage_root_resolution.current_committed_head_index_mismatch"
            }
            Self::CurrentIdentityReuse => {
                "local_log_storage_root_resolution.current_identity_reuse"
            }
            Self::PlannedCheckpointGenerationMismatch => {
                "local_log_storage_root_resolution.planned_checkpoint_generation_mismatch"
            }
            Self::PlannedActiveGenerationMismatch => {
                "local_log_storage_root_resolution.planned_active_generation_mismatch"
            }
            Self::RetiredTransactionMismatch => {
                "local_log_storage_root_resolution.retired_transaction_mismatch"
            }
            Self::RetiredSuccessorMismatch => {
                "local_log_storage_root_resolution.retired_successor_mismatch"
            }
            Self::RetiredScopeMismatch => {
                "local_log_storage_root_resolution.retired_scope_mismatch"
            }
            Self::OtherScopeMismatch => "local_log_storage_root_resolution.other_scope_mismatch",
            Self::ObservedPlannedIdentityCollision { .. } => {
                "local_log_storage_root_resolution.observed_planned_identity_collision"
            }
            Self::ObservedBrokenProfileAssociation { .. } => {
                "local_log_storage_root_resolution.observed_broken_profile_association"
            }
        }
    }
}
