use super::{
    LocalLogStorageRotationResolutionBrokenAssociation,
    LocalLogStorageRotationResolutionIdentityCollision,
};

/// Stable payload-free reason a rotation finding failed closed.
///
/// This diagnostic classification retains no selection JSON, storage record,
/// identifier, parser text, or host error. It is not itself storage evidence.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRotationResolutionCollisionReason {
    /// An unavailable-database observation named the exact expected incarnation.
    ExpectedDatabaseObservationMismatch,
    /// An unavailable-scope observation named the exact expected incarnation.
    ExpectedScopeObservationMismatch,
    /// The supposedly unchanged prior selection or its exact bytes disagreed.
    PriorSelectionMismatch,
    /// The exact candidate-selected binding or JSON envelope disagreed.
    CandidateSelectedMismatch,
    /// The candidate committed-head index did not map to its transaction.
    CandidateCommittedHeadIndexMismatch,
    /// The observed current committed-head index did not map to its transaction.
    CurrentCommittedHeadIndexMismatch,
    /// A later selection did not retain the exact candidate predecessor.
    CandidateImmediatePredecessorMismatch,
    /// The permanent checkpoint generation from the prior selection disagreed.
    PriorCheckpointGenerationMismatch,
    /// The candidate's permanent checkpoint-generation record disagreed.
    CandidateCheckpointGenerationMismatch,
    /// The candidate active generation was not its exact retirement record.
    CandidateActiveGenerationMismatch,
    /// One publication-required plan-history tombstone or index disagreed.
    RequiredRetiredTransactionMismatch,
    /// The retired candidate identity, stored length, or index disagreed.
    RetiredTransactionMismatch,
    /// The candidate's direct-successor identity or index disagreed.
    RetiredSuccessorMismatch,
    /// The current same-scope graph around a retired candidate disagreed.
    RetiredScopeMismatch,
    /// A purported direct competing rotation did not extend the exact prior selection.
    DifferentCurrentMismatch,
    /// The observed graph reused a transaction, head, generation, or fence
    /// identity retained by the prior selection or candidate plan.
    CurrentIdentityReuse,
    /// An intact scope omitted a candidate previously attested as committed.
    HostAttestedCandidateMissing,
    /// The adapter directly observed one conflicting permanent candidate identity.
    ObservedPlannedIdentityCollision {
        /// Conflicting key, identity, or reserved namespace.
        identity: LocalLogStorageRotationResolutionIdentityCollision,
    },
    /// The adapter directly observed a broken profile or scope association.
    ObservedBrokenProfileAssociation {
        /// Broken association category.
        association: LocalLogStorageRotationResolutionBrokenAssociation,
    },
}

impl LocalLogStorageRotationResolutionCollisionReason {
    /// Returns the stable namespaced diagnostic code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ExpectedDatabaseObservationMismatch => {
                "local_log_storage_rotation_resolution.expected_database_observation_mismatch"
            }
            Self::ExpectedScopeObservationMismatch => {
                "local_log_storage_rotation_resolution.expected_scope_observation_mismatch"
            }
            Self::PriorSelectionMismatch => {
                "local_log_storage_rotation_resolution.prior_selection_mismatch"
            }
            Self::CandidateSelectedMismatch => {
                "local_log_storage_rotation_resolution.candidate_selected_mismatch"
            }
            Self::CandidateCommittedHeadIndexMismatch => {
                "local_log_storage_rotation_resolution.candidate_committed_head_index_mismatch"
            }
            Self::CurrentCommittedHeadIndexMismatch => {
                "local_log_storage_rotation_resolution.current_committed_head_index_mismatch"
            }
            Self::CandidateImmediatePredecessorMismatch => {
                "local_log_storage_rotation_resolution.candidate_immediate_predecessor_mismatch"
            }
            Self::PriorCheckpointGenerationMismatch => {
                "local_log_storage_rotation_resolution.prior_checkpoint_generation_mismatch"
            }
            Self::CandidateCheckpointGenerationMismatch => {
                "local_log_storage_rotation_resolution.candidate_checkpoint_generation_mismatch"
            }
            Self::CandidateActiveGenerationMismatch => {
                "local_log_storage_rotation_resolution.candidate_active_generation_mismatch"
            }
            Self::RequiredRetiredTransactionMismatch => {
                "local_log_storage_rotation_resolution.required_retired_transaction_mismatch"
            }
            Self::RetiredTransactionMismatch => {
                "local_log_storage_rotation_resolution.retired_transaction_mismatch"
            }
            Self::RetiredSuccessorMismatch => {
                "local_log_storage_rotation_resolution.retired_successor_mismatch"
            }
            Self::RetiredScopeMismatch => {
                "local_log_storage_rotation_resolution.retired_scope_mismatch"
            }
            Self::DifferentCurrentMismatch => {
                "local_log_storage_rotation_resolution.different_current_mismatch"
            }
            Self::CurrentIdentityReuse => {
                "local_log_storage_rotation_resolution.current_identity_reuse"
            }
            Self::HostAttestedCandidateMissing => {
                "local_log_storage_rotation_resolution.host_attested_candidate_missing"
            }
            Self::ObservedPlannedIdentityCollision { .. } => {
                "local_log_storage_rotation_resolution.observed_planned_identity_collision"
            }
            Self::ObservedBrokenProfileAssociation { .. } => {
                "local_log_storage_rotation_resolution.observed_broken_profile_association"
            }
        }
    }
}
