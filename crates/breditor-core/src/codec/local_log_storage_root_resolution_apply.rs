use crate::local_log::LocalLogStorageHeadId;

use super::{
    LocalLogStorageRetiredTransactionBinding, LocalLogStorageRootResolution,
    LocalLogStorageRootResolutionCollisionReason, LocalLogStorageRootResolutionEvidence,
    LocalLogStorageRootResolutionFailure, LocalLogStorageRootResolutionOutcome,
    LocalLogStorageRootResolutionTransitionError, LocalLogStorageRootResolved,
    LocalLogStorageRootRetryEligibleAtResolution, LocalLogStorageSelectedRoot,
    LocalLogStorageSelectionKind,
    local_log_storage_attempt_plan::LocalLogStorageAttemptPlan,
    local_log_storage_root_resolution_observation::{
        LocalLogStorageRootDirectSuccessorObservationData,
        LocalLogStorageRootExpectedDatabaseUnavailableData,
        LocalLogStorageRootOtherScopeObservation, LocalLogStorageRootResolutionObservation,
        LocalLogStorageRootResolutionObservationData, LocalLogStorageRootRetiredObservation,
        LocalLogStorageRootSelectedObservation, LocalLogStorageRootSupersededObservation,
    },
    local_log_storage_root_resolution_source::LocalLogStorageRootResolutionSource,
    local_log_storage_root_retry_eligible_at_resolution::LocalLogStorageRootRetrySource,
};

impl LocalLogStorageRootResolution {
    /// Applies one exactly correlated terminal physical observation.
    ///
    /// Ordinary evidence is applicable only after the exact request's fixed-
    /// scope serialized resolver transaction emitted terminal `complete` after
    /// all reads and cursor scans. Physical database absence instead uses the
    /// correlated aborted-open boundary. The core first checks request egress
    /// and allocation identity, then validates the physical finding against the
    /// retained plan and applies source-dependent classification. Fact
    /// disagreement fails closed as `CollisionOrCorruption`; it is not a
    /// correlation rejection.
    ///
    /// # Errors
    ///
    /// Failure precedence is `RequestNotIssued` before `RequestIdMismatch`.
    /// The returned failure owns the complete unchanged resolver and unapplied
    /// evidence.
    pub fn apply_resolution_evidence(
        self,
        evidence: LocalLogStorageRootResolutionEvidence,
    ) -> Result<LocalLogStorageRootResolutionOutcome, LocalLogStorageRootResolutionFailure> {
        let Some(request_id) = self.request_id.as_ref() else {
            return Err(LocalLogStorageRootResolutionFailure::new(
                self,
                evidence,
                LocalLogStorageRootResolutionTransitionError::RequestNotIssued,
            ));
        };
        if request_id != evidence.request_id() {
            return Err(LocalLogStorageRootResolutionFailure::new(
                self,
                evidence,
                LocalLogStorageRootResolutionTransitionError::RequestIdMismatch,
            ));
        }

        let disposition = classify(&self.source, evidence.observation());
        let source = self.source;
        let observation = evidence.into_observation();

        Ok(match disposition {
            RootResolutionDisposition::CommittedSelected => {
                LocalLogStorageRootResolutionOutcome::CommittedSelectedAtResolution(
                    LocalLogStorageRootResolved::new(source, observation, None),
                )
            }
            RootResolutionDisposition::CommittedSuperseded => {
                LocalLogStorageRootResolutionOutcome::CommittedSuperseded(
                    LocalLogStorageRootResolved::new(source, observation, None),
                )
            }
            RootResolutionDisposition::Retired => {
                LocalLogStorageRootResolutionOutcome::ResolutionRetired(
                    LocalLogStorageRootResolved::new(source, observation, None),
                )
            }
            RootResolutionDisposition::RetryEligible => match source {
                LocalLogStorageRootResolutionSource::Uncertain(owner) => {
                    LocalLogStorageRootResolutionOutcome::RetryEligibleAtResolution(
                        LocalLogStorageRootRetryEligibleAtResolution::new(
                            LocalLogStorageRootRetrySource::Uncertain(owner),
                        ),
                    )
                }
                LocalLogStorageRootResolutionSource::AttemptAborted(owner) => {
                    LocalLogStorageRootResolutionOutcome::RetryEligibleAtResolution(
                        LocalLogStorageRootRetryEligibleAtResolution::new(
                            LocalLogStorageRootRetrySource::AttemptAborted(owner),
                        ),
                    )
                }
                LocalLogStorageRootResolutionSource::NotAttempted(owner) => {
                    LocalLogStorageRootResolutionOutcome::RetryEligibleAtResolution(
                        LocalLogStorageRootRetryEligibleAtResolution::new(
                            LocalLogStorageRootRetrySource::NotAttempted(owner),
                        ),
                    )
                }
                LocalLogStorageRootResolutionSource::HostAttestedCommitted(owner) => {
                    LocalLogStorageRootResolutionOutcome::StorageResetOrIndeterminate(
                        LocalLogStorageRootResolved::new(
                            LocalLogStorageRootResolutionSource::HostAttestedCommitted(owner),
                            observation,
                            None,
                        ),
                    )
                }
            },
            RootResolutionDisposition::ScopeAlreadyProvisioned => {
                LocalLogStorageRootResolutionOutcome::ScopeAlreadyProvisioned(
                    LocalLogStorageRootResolved::new(source, observation, None),
                )
            }
            RootResolutionDisposition::Collision(reason) => {
                LocalLogStorageRootResolutionOutcome::CollisionOrCorruption(
                    LocalLogStorageRootResolved::new(source, observation, Some(reason)),
                )
            }
            RootResolutionDisposition::ResetOrIndeterminate => {
                LocalLogStorageRootResolutionOutcome::StorageResetOrIndeterminate(
                    LocalLogStorageRootResolved::new(source, observation, None),
                )
            }
        })
    }
}

#[derive(Clone, Copy)]
enum RootResolutionDisposition {
    CommittedSelected,
    CommittedSuperseded,
    Retired,
    RetryEligible,
    ScopeAlreadyProvisioned,
    Collision(LocalLogStorageRootResolutionCollisionReason),
    ResetOrIndeterminate,
}

fn classify(
    source: &LocalLogStorageRootResolutionSource,
    observation: &LocalLogStorageRootResolutionObservation,
) -> RootResolutionDisposition {
    let plan = source.plan();
    match observation.data() {
        LocalLogStorageRootResolutionObservationData::ExpectedDatabaseUnavailable(reason) => {
            match reason {
                LocalLogStorageRootExpectedDatabaseUnavailableData::IncarnationMismatch(
                    observed_database_incarnation_id,
                ) if observed_database_incarnation_id
                    == plan.candidate_receipt().database_incarnation_id() =>
                {
                RootResolutionDisposition::Collision(
                    LocalLogStorageRootResolutionCollisionReason::ExpectedDatabaseObservationMismatch,
                )
                }
                LocalLogStorageRootExpectedDatabaseUnavailableData::PhysicalDatabaseAbsent
                | LocalLogStorageRootExpectedDatabaseUnavailableData::EmptyWithoutProfileRecord
                | LocalLogStorageRootExpectedDatabaseUnavailableData::IncarnationMismatch(_) => {
                    RootResolutionDisposition::ResetOrIndeterminate
                }
            }
        }
        LocalLogStorageRootResolutionObservationData::PlannedScopeAbsent => {
            if matches!(source, LocalLogStorageRootResolutionSource::HostAttestedCommitted(_)) {
                // The planned scope incarnation disappeared after a historical
                // host-attested commit, so reset/eviction is indistinguishable.
                RootResolutionDisposition::ResetOrIndeterminate
            } else {
                RootResolutionDisposition::RetryEligible
            }
        }
        LocalLogStorageRootResolutionObservationData::CandidateSelected(observation) => {
            match validate_candidate_selected(plan, observation) {
                Ok(()) => RootResolutionDisposition::CommittedSelected,
                Err(reason) => RootResolutionDisposition::Collision(reason),
            }
        }
        LocalLogStorageRootResolutionObservationData::CandidateImmediatePredecessor(
            observation,
        ) => match validate_candidate_superseded(plan, observation) {
            Ok(()) => RootResolutionDisposition::CommittedSuperseded,
            Err(reason) => RootResolutionDisposition::Collision(reason),
        },
        LocalLogStorageRootResolutionObservationData::CandidateRetiredIdentity(observation) => {
            match validate_candidate_retired(plan, observation) {
                Ok(()) => RootResolutionDisposition::Retired,
                Err(reason) => RootResolutionDisposition::Collision(reason),
            }
        }
        LocalLogStorageRootResolutionObservationData::OtherValidScope(observation) => {
            match validate_other_scope(plan, observation) {
                Err(reason) => RootResolutionDisposition::Collision(reason),
                Ok(())
                    if matches!(
                        source,
                        LocalLogStorageRootResolutionSource::HostAttestedCommitted(_)
                    ) =>
                {
                    // A different scope incarnation replaced the host-attested
                    // lifetime, which is reset/eviction rather than provisioning.
                    RootResolutionDisposition::ResetOrIndeterminate
                }
                Ok(()) => RootResolutionDisposition::ScopeAlreadyProvisioned,
            }
        }
        LocalLogStorageRootResolutionObservationData::PlannedIdentityCollision { identity } => {
            RootResolutionDisposition::Collision(
                LocalLogStorageRootResolutionCollisionReason::ObservedPlannedIdentityCollision {
                    identity: *identity,
                },
            )
        }
        LocalLogStorageRootResolutionObservationData::BrokenProfileAssociation { association } => {
            RootResolutionDisposition::Collision(
                LocalLogStorageRootResolutionCollisionReason::ObservedBrokenProfileAssociation {
                    association: *association,
                },
            )
        }
    }
}

fn validate_candidate_selected(
    plan: &LocalLogStorageAttemptPlan,
    observation: &LocalLogStorageRootSelectedObservation,
) -> Result<(), LocalLogStorageRootResolutionCollisionReason> {
    if observation.committed_head_index_transaction_id()
        != plan.candidate_receipt().transaction_id()
    {
        return Err(
            LocalLogStorageRootResolutionCollisionReason::CandidateCommittedHeadIndexMismatch,
        );
    }

    let (observed_binding, current_json, predecessor_json) =
        observation.selected().snapshot_attempt_envelope();
    if plan.candidate_binding().compare_later_observation(&observed_binding).is_err()
        || predecessor_json.is_some()
        || plan.candidate_json().as_bytes() != current_json.as_bytes()
    {
        return Err(LocalLogStorageRootResolutionCollisionReason::CandidateSelectedMismatch);
    }
    Ok(())
}

fn validate_candidate_superseded(
    plan: &LocalLogStorageAttemptPlan,
    observation: &LocalLogStorageRootSupersededObservation,
) -> Result<(), LocalLogStorageRootResolutionCollisionReason> {
    if observation.candidate_head_index_transaction_id()
        != plan.candidate_receipt().transaction_id()
    {
        return Err(
            LocalLogStorageRootResolutionCollisionReason::CandidateCommittedHeadIndexMismatch,
        );
    }
    if observation.current_head_index_transaction_id()
        != observation.selected().current_receipt().transaction_id()
    {
        return Err(
            LocalLogStorageRootResolutionCollisionReason::CurrentCommittedHeadIndexMismatch,
        );
    }

    let (observed_binding, _current_json, predecessor_json) =
        observation.selected().snapshot_attempt_envelope();
    if observed_binding.predecessor_receipt() != Some(plan.candidate_receipt())
        || predecessor_json.as_deref().map(str::as_bytes) != Some(plan.candidate_json().as_bytes())
    {
        return Err(
            LocalLogStorageRootResolutionCollisionReason::CandidateImmediatePredecessorMismatch,
        );
    }
    if observation.planned_checkpoint_generation()
        != plan.candidate_binding().checkpoint_generation()
    {
        return Err(
            LocalLogStorageRootResolutionCollisionReason::PlannedCheckpointGenerationMismatch,
        );
    }
    if observed_binding.active_generation().log_id()
        == plan.candidate_binding().checkpoint_generation().log_id()
    {
        return Err(LocalLogStorageRootResolutionCollisionReason::CurrentIdentityReuse);
    }
    if plan
        .candidate_binding()
        .active_generation()
        .validate_retired_checkpoint_observation(
            observed_binding.checkpoint_generation(),
            observed_binding.current_receipt().committed_head_id(),
        )
        .is_err()
    {
        return Err(LocalLogStorageRootResolutionCollisionReason::PlannedActiveGenerationMismatch);
    }
    Ok(())
}

fn validate_candidate_retired(
    plan: &LocalLogStorageAttemptPlan,
    observation: &LocalLogStorageRootRetiredObservation,
) -> Result<(), LocalLogStorageRootResolutionCollisionReason> {
    if observation.candidate_head_index_transaction_id()
        != plan.candidate_receipt().transaction_id()
    {
        return Err(
            LocalLogStorageRootResolutionCollisionReason::CandidateCommittedHeadIndexMismatch,
        );
    }
    if observation.current_head_index_transaction_id()
        != observation.current_selected().current_receipt().transaction_id()
    {
        return Err(
            LocalLogStorageRootResolutionCollisionReason::CurrentCommittedHeadIndexMismatch,
        );
    }

    let Ok(selection_byte_length) = u64::try_from(plan.candidate_json_bytes()) else {
        return Err(LocalLogStorageRootResolutionCollisionReason::RetiredTransactionMismatch);
    };
    let receipt = plan.candidate_receipt();
    let Ok(expected_retired) = LocalLogStorageRetiredTransactionBinding::try_new(
        receipt.database_incarnation_id().clone(),
        receipt.scope_id().clone(),
        receipt.scope_incarnation_id().clone(),
        receipt.transaction_id().clone(),
        None,
        receipt.committed_head_id().clone(),
        LocalLogStorageSelectionKind::Root,
        selection_byte_length,
    ) else {
        return Err(LocalLogStorageRootResolutionCollisionReason::RetiredTransactionMismatch);
    };
    if observation.retired_transaction() != &expected_retired {
        return Err(LocalLogStorageRootResolutionCollisionReason::RetiredTransactionMismatch);
    }

    let current = observation.current_selected();
    if !same_scope_lifetime(plan, current)
        || current.selection_kind() != LocalLogStorageSelectionKind::Rotation
    {
        return Err(LocalLogStorageRootResolutionCollisionReason::RetiredScopeMismatch);
    }
    if current_reuses_candidate_identity(plan, current) {
        return Err(LocalLogStorageRootResolutionCollisionReason::CurrentIdentityReuse);
    }
    let direct_successor_head_id = validate_retired_direct_successor(plan, current, observation)?;
    if observation.planned_checkpoint_generation()
        != plan.candidate_binding().checkpoint_generation()
    {
        return Err(
            LocalLogStorageRootResolutionCollisionReason::PlannedCheckpointGenerationMismatch,
        );
    }
    if plan
        .candidate_binding()
        .active_generation()
        .validate_retired_checkpoint_observation(
            observation.planned_active_generation(),
            direct_successor_head_id,
        )
        .is_err()
    {
        return Err(LocalLogStorageRootResolutionCollisionReason::PlannedActiveGenerationMismatch);
    }
    Ok(())
}

fn validate_retired_direct_successor<'a>(
    plan: &LocalLogStorageAttemptPlan,
    current: &LocalLogStorageSelectedRoot,
    observation: &'a LocalLogStorageRootRetiredObservation,
) -> Result<&'a LocalLogStorageHeadId, LocalLogStorageRootResolutionCollisionReason> {
    let candidate = plan.candidate_receipt();
    let successor = observation.direct_successor();
    match successor.data() {
        LocalLogStorageRootDirectSuccessorObservationData::Exact(receipt) => {
            if receipt.selection_kind() != LocalLogStorageSelectionKind::Rotation
                || receipt.expected_head_id() != Some(candidate.committed_head_id())
                || receipt.committed_head_id() == candidate.committed_head_id()
                || receipt.transaction_id() == candidate.transaction_id()
                || successor.committed_head_index_transaction_id() != receipt.transaction_id()
                || current.predecessor_receipt() != Some(receipt)
            {
                return Err(LocalLogStorageRootResolutionCollisionReason::RetiredSuccessorMismatch);
            }
            let Some(sealed_generation) = current.predecessor_rotation_sealed_generation() else {
                return Err(LocalLogStorageRootResolutionCollisionReason::RetiredSuccessorMismatch);
            };
            let candidate_active = plan.candidate_binding().active_generation();
            if sealed_generation.log_id() != candidate_active.log_id()
                || sealed_generation.frame() != candidate_active.frame()
            {
                return Err(LocalLogStorageRootResolutionCollisionReason::RetiredSuccessorMismatch);
            }
            Ok(receipt.committed_head_id())
        }
        LocalLogStorageRootDirectSuccessorObservationData::Retired(transaction) => {
            let predecessor = current.predecessor_receipt();
            if transaction.selection_kind() != LocalLogStorageSelectionKind::Rotation
                || transaction.database_incarnation_id() != candidate.database_incarnation_id()
                || transaction.scope_id() != candidate.scope_id()
                || transaction.scope_incarnation_id() != candidate.scope_incarnation_id()
                || transaction.expected_head_id() != Some(candidate.committed_head_id())
                || transaction.committed_head_id() == candidate.committed_head_id()
                || transaction.transaction_id() == candidate.transaction_id()
                || successor.committed_head_index_transaction_id() != transaction.transaction_id()
                || transaction.transaction_id() == current.transaction_id()
                || transaction.committed_head_id() == current.selected_head_id()
                || predecessor.is_some_and(|predecessor| {
                    predecessor.expected_head_id() == Some(candidate.committed_head_id())
                        || transaction.transaction_id() == predecessor.transaction_id()
                        || transaction.committed_head_id() == predecessor.committed_head_id()
                })
            {
                return Err(LocalLogStorageRootResolutionCollisionReason::RetiredSuccessorMismatch);
            }
            Ok(transaction.committed_head_id())
        }
    }
}

fn validate_other_scope(
    plan: &LocalLogStorageAttemptPlan,
    observation: &LocalLogStorageRootOtherScopeObservation,
) -> Result<(), LocalLogStorageRootResolutionCollisionReason> {
    let selected = observation.selected();
    let candidate = plan.candidate_receipt();
    if observation.committed_head_index_transaction_id() != selected.transaction_id() {
        return Err(
            LocalLogStorageRootResolutionCollisionReason::CurrentCommittedHeadIndexMismatch,
        );
    }
    if selected.profile_id() != candidate.profile_id()
        || selected.profile_version() != candidate.profile_version()
        || selected.database_incarnation_id() != candidate.database_incarnation_id()
        || selected.scope_id() != candidate.scope_id()
        || selected.scope_incarnation_id() == candidate.scope_incarnation_id()
    {
        return Err(LocalLogStorageRootResolutionCollisionReason::OtherScopeMismatch);
    }
    Ok(())
}

fn same_scope_lifetime(
    plan: &LocalLogStorageAttemptPlan,
    selected: &LocalLogStorageSelectedRoot,
) -> bool {
    let candidate = plan.candidate_receipt();
    selected.profile_id() == candidate.profile_id()
        && selected.profile_version() == candidate.profile_version()
        && selected.database_incarnation_id() == candidate.database_incarnation_id()
        && selected.scope_id() == candidate.scope_id()
        && selected.scope_incarnation_id() == candidate.scope_incarnation_id()
        && selected.session_id() == candidate.session_id()
}

fn current_reuses_candidate_identity(
    plan: &LocalLogStorageAttemptPlan,
    current: &LocalLogStorageSelectedRoot,
) -> bool {
    let candidate = plan.candidate_binding();
    let candidate_receipt = candidate.current_receipt();
    let candidate_head_id = candidate_receipt.committed_head_id();
    let candidate_checkpoint_log_id = candidate.checkpoint_generation().log_id();
    let candidate_active_log_id = candidate.active_generation().log_id();
    let candidate_active_fence_id = candidate.active_generation().activated_fence_id();
    let current_binding = current.binding();

    current.transaction_id() == candidate_receipt.transaction_id()
        || current.predecessor_receipt().is_some_and(|predecessor| {
            predecessor.transaction_id() == candidate_receipt.transaction_id()
        })
        || current.selected_head_id() == candidate_head_id
        || current.previous_head_id() == Some(candidate_head_id)
        || current.checkpoint_log_id() == candidate_checkpoint_log_id
        || current.checkpoint_log_id() == candidate_active_log_id
        || current.active_log_id() == candidate_checkpoint_log_id
        || current.active_log_id() == candidate_active_log_id
        || current_binding.checkpoint_generation().activated_fence_id()
            == Some(candidate_active_fence_id)
        || current_binding.active_generation().activated_fence_id() == candidate_active_fence_id
}
