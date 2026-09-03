use crate::local_log::LocalLogStorageHeadId;

use super::{
    LocalLogStorageRetiredTransactionBinding, LocalLogStorageRotationResolution,
    LocalLogStorageRotationResolutionCollisionReason, LocalLogStorageRotationResolutionEvidence,
    LocalLogStorageRotationResolutionFailure, LocalLogStorageRotationResolutionOutcome,
    LocalLogStorageRotationResolutionTransitionError, LocalLogStorageRotationResolved,
    LocalLogStorageRotationRetryEligibleAtResolution, LocalLogStorageSelectedRoot,
    LocalLogStorageSelectionKind,
    local_log_storage_attempt_plan::{
        LocalLogStorageAttemptPlan, LocalLogStorageRotationAttemptContext,
    },
    local_log_storage_rotation_resolution_observation::{
        LocalLogStorageRotationDifferentCurrentObservation,
        LocalLogStorageRotationDirectSuccessorObservationData,
        LocalLogStorageRotationExpectedDatabaseUnavailableData,
        LocalLogStorageRotationExpectedScopeUnavailableData,
        LocalLogStorageRotationIndexedRetiredTransactionObservation,
        LocalLogStorageRotationPriorStillSelectedObservation,
        LocalLogStorageRotationResolutionObservation,
        LocalLogStorageRotationResolutionObservationData,
        LocalLogStorageRotationRetiredObservation, LocalLogStorageRotationSelectedObservation,
        LocalLogStorageRotationSupersededObservation,
    },
    local_log_storage_rotation_resolution_source::LocalLogStorageRotationResolutionSource,
    local_log_storage_rotation_retry_eligible_at_resolution::LocalLogStorageRotationRetrySource,
    local_log_storage_selected_binding_compare_later::checkpoint_generation_matches_later,
};

impl LocalLogStorageRotationResolution {
    /// Applies one exactly correlated terminal physical observation.
    ///
    /// Ordinary evidence is applicable only after the exact fixed-scope
    /// serialized resolver transaction emitted terminal `complete` after all
    /// reads and scans. Physical database absence instead uses the correlated
    /// aborted-open boundary. Plan disagreements classify fail-closed as
    /// collision/corruption; they are not correlation errors.
    ///
    /// # Errors
    ///
    /// Failure precedence is `RequestNotIssued` before `RequestIdMismatch`.
    /// A failure returns the complete unchanged resolver and unapplied evidence.
    pub fn apply_resolution_evidence(
        self,
        evidence: LocalLogStorageRotationResolutionEvidence,
    ) -> Result<LocalLogStorageRotationResolutionOutcome, LocalLogStorageRotationResolutionFailure>
    {
        let Some(request_id) = self.request_id.as_ref() else {
            return Err(LocalLogStorageRotationResolutionFailure::new(
                self,
                evidence,
                LocalLogStorageRotationResolutionTransitionError::RequestNotIssued,
            ));
        };
        if request_id != evidence.request_id() {
            return Err(LocalLogStorageRotationResolutionFailure::new(
                self,
                evidence,
                LocalLogStorageRotationResolutionTransitionError::RequestIdMismatch,
            ));
        }

        let disposition = classify(&self.source, evidence.observation());
        let source = self.source;
        let observation = evidence.into_observation();
        Ok(match disposition {
            RotationResolutionDisposition::CommittedSelected => {
                LocalLogStorageRotationResolutionOutcome::CommittedSelectedAtResolution(
                    LocalLogStorageRotationResolved::new(source, observation, None),
                )
            }
            RotationResolutionDisposition::CommittedSuperseded => {
                LocalLogStorageRotationResolutionOutcome::CommittedSuperseded(
                    LocalLogStorageRotationResolved::new(source, observation, None),
                )
            }
            RotationResolutionDisposition::Retired => {
                LocalLogStorageRotationResolutionOutcome::ResolutionRetired(
                    LocalLogStorageRotationResolved::new(source, observation, None),
                )
            }
            RotationResolutionDisposition::RetryEligible => match source {
                LocalLogStorageRotationResolutionSource::Uncertain(owner) => {
                    LocalLogStorageRotationResolutionOutcome::RetryEligibleAtResolution(
                        LocalLogStorageRotationRetryEligibleAtResolution::new(
                            LocalLogStorageRotationRetrySource::Uncertain(owner),
                        ),
                    )
                }
                LocalLogStorageRotationResolutionSource::AttemptAborted(owner) => {
                    LocalLogStorageRotationResolutionOutcome::RetryEligibleAtResolution(
                        LocalLogStorageRotationRetryEligibleAtResolution::new(
                            LocalLogStorageRotationRetrySource::AttemptAborted(owner),
                        ),
                    )
                }
                LocalLogStorageRotationResolutionSource::NotAttempted(owner) => {
                    LocalLogStorageRotationResolutionOutcome::RetryEligibleAtResolution(
                        LocalLogStorageRotationRetryEligibleAtResolution::new(
                            LocalLogStorageRotationRetrySource::NotAttempted(owner),
                        ),
                    )
                }
                LocalLogStorageRotationResolutionSource::HostAttestedCommitted(owner) => {
                    LocalLogStorageRotationResolutionOutcome::CollisionOrCorruption(
                        LocalLogStorageRotationResolved::new(
                            LocalLogStorageRotationResolutionSource::HostAttestedCommitted(owner),
                            observation,
                            Some(
                                LocalLogStorageRotationResolutionCollisionReason::HostAttestedCandidateMissing,
                            ),
                        ),
                    )
                }
            },
            RotationResolutionDisposition::Conflict => {
                LocalLogStorageRotationResolutionOutcome::DefinitelyNotCommittedConflict(
                    LocalLogStorageRotationResolved::new(source, observation, None),
                )
            }
            RotationResolutionDisposition::Collision(reason) => {
                LocalLogStorageRotationResolutionOutcome::CollisionOrCorruption(
                    LocalLogStorageRotationResolved::new(source, observation, Some(reason)),
                )
            }
            RotationResolutionDisposition::ResetOrIndeterminate => {
                LocalLogStorageRotationResolutionOutcome::StorageResetOrIndeterminate(
                    LocalLogStorageRotationResolved::new(source, observation, None),
                )
            }
        })
    }
}

#[derive(Clone, Copy)]
enum RotationResolutionDisposition {
    CommittedSelected,
    CommittedSuperseded,
    Retired,
    RetryEligible,
    Conflict,
    Collision(LocalLogStorageRotationResolutionCollisionReason),
    ResetOrIndeterminate,
}

fn classify(
    source: &LocalLogStorageRotationResolutionSource,
    observation: &LocalLogStorageRotationResolutionObservation,
) -> RotationResolutionDisposition {
    let plan = source.plan();
    match observation.data() {
        LocalLogStorageRotationResolutionObservationData::ExpectedDatabaseUnavailable(reason) => {
            match reason {
                LocalLogStorageRotationExpectedDatabaseUnavailableData::IncarnationMismatch(
                    observed,
                ) if observed == plan.candidate_receipt().database_incarnation_id() => {
                    RotationResolutionDisposition::Collision(
                        LocalLogStorageRotationResolutionCollisionReason::ExpectedDatabaseObservationMismatch,
                    )
                }
                LocalLogStorageRotationExpectedDatabaseUnavailableData::PhysicalDatabaseAbsent
                | LocalLogStorageRotationExpectedDatabaseUnavailableData::EmptyWithoutProfileRecord
                | LocalLogStorageRotationExpectedDatabaseUnavailableData::IncarnationMismatch(
                    _,
                ) => RotationResolutionDisposition::ResetOrIndeterminate,
            }
        }
        LocalLogStorageRotationResolutionObservationData::ExpectedScopeUnavailable(reason) => {
            match reason {
                LocalLogStorageRotationExpectedScopeUnavailableData::Absent => {
                    RotationResolutionDisposition::ResetOrIndeterminate
                }
                LocalLogStorageRotationExpectedScopeUnavailableData::IncarnationMismatch(
                    observation,
                ) => match validate_other_scope(plan, observation) {
                    Ok(()) => RotationResolutionDisposition::ResetOrIndeterminate,
                    Err(reason) => RotationResolutionDisposition::Collision(reason),
                },
            }
        }
        LocalLogStorageRotationResolutionObservationData::CandidateAbsentPriorStillSelected(
            observation,
        ) => match validate_prior_still_selected(plan, observation) {
            Err(reason) => RotationResolutionDisposition::Collision(reason),
            Ok(()) if is_host_attested(source) => RotationResolutionDisposition::Collision(
                LocalLogStorageRotationResolutionCollisionReason::HostAttestedCandidateMissing,
            ),
            Ok(()) => RotationResolutionDisposition::RetryEligible,
        },
        LocalLogStorageRotationResolutionObservationData::CandidateAbsentDifferentCurrent(
            observation,
        ) => match validate_different_current(plan, observation) {
            Err(reason) => RotationResolutionDisposition::Collision(reason),
            Ok(()) if is_host_attested(source) => RotationResolutionDisposition::Collision(
                LocalLogStorageRotationResolutionCollisionReason::HostAttestedCandidateMissing,
            ),
            Ok(()) => RotationResolutionDisposition::Conflict,
        },
        LocalLogStorageRotationResolutionObservationData::CandidateSelected(observation) => {
            match validate_candidate_selected(plan, observation) {
                Ok(()) => RotationResolutionDisposition::CommittedSelected,
                Err(reason) => RotationResolutionDisposition::Collision(reason),
            }
        }
        LocalLogStorageRotationResolutionObservationData::CandidateImmediatePredecessor(
            observation,
        ) => match validate_candidate_superseded(plan, observation) {
            Ok(()) => RotationResolutionDisposition::CommittedSuperseded,
            Err(reason) => RotationResolutionDisposition::Collision(reason),
        },
        LocalLogStorageRotationResolutionObservationData::CandidateRetiredIdentity(observation) => {
            match validate_candidate_retired(plan, observation) {
                Ok(()) => RotationResolutionDisposition::Retired,
                Err(reason) => RotationResolutionDisposition::Collision(reason),
            }
        }
        LocalLogStorageRotationResolutionObservationData::PlannedIdentityCollision { identity } => {
            RotationResolutionDisposition::Collision(
                LocalLogStorageRotationResolutionCollisionReason::ObservedPlannedIdentityCollision {
                    identity: *identity,
                },
            )
        }
        LocalLogStorageRotationResolutionObservationData::BrokenProfileAssociation {
            association,
        } => RotationResolutionDisposition::Collision(
            LocalLogStorageRotationResolutionCollisionReason::ObservedBrokenProfileAssociation {
                association: *association,
            },
        ),
    }
}

fn is_host_attested(source: &LocalLogStorageRotationResolutionSource) -> bool {
    matches!(source, LocalLogStorageRotationResolutionSource::HostAttestedCommitted(_))
}

fn rotation_context(plan: &LocalLogStorageAttemptPlan) -> &LocalLogStorageRotationAttemptContext {
    plan.rotation_context()
        .unwrap_or_else(|| unreachable!("rotation resolver retained a root plan"))
}

fn validate_prior_still_selected(
    plan: &LocalLogStorageAttemptPlan,
    observation: &LocalLogStorageRotationPriorStillSelectedObservation,
) -> Result<(), LocalLogStorageRotationResolutionCollisionReason> {
    let context = rotation_context(plan);
    let selected = observation.selected();
    if observation.current_head_index_transaction_id()
        != context.selected_binding().current_receipt().transaction_id()
    {
        return Err(
            LocalLogStorageRotationResolutionCollisionReason::CurrentCommittedHeadIndexMismatch,
        );
    }
    let (binding, current_json, predecessor_json) = selected.snapshot_attempt_envelope();
    if context.selected_binding().compare_later_observation(&binding).is_err()
        || current_json.as_bytes() != context.current_selection_json().as_bytes()
        || predecessor_json.as_deref().map(str::as_bytes)
            != context.predecessor_selection_json().map(str::as_bytes)
    {
        return Err(LocalLogStorageRotationResolutionCollisionReason::PriorSelectionMismatch);
    }
    Ok(())
}

fn validate_candidate_selected(
    plan: &LocalLogStorageAttemptPlan,
    observation: &LocalLogStorageRotationSelectedObservation,
) -> Result<(), LocalLogStorageRotationResolutionCollisionReason> {
    validate_candidate_index(plan, observation.candidate_head_index_transaction_id())?;
    let context = rotation_context(plan);
    let (binding, current_json, predecessor_json) =
        observation.selected().snapshot_attempt_envelope();
    if plan.candidate_binding().compare_later_observation(&binding).is_err()
        || current_json.as_bytes() != plan.candidate_json().as_bytes()
        || predecessor_json.as_deref().map(str::as_bytes)
            != Some(context.current_selection_json().as_bytes())
    {
        return Err(LocalLogStorageRotationResolutionCollisionReason::CandidateSelectedMismatch);
    }
    validate_prior_checkpoint(plan, observation.prior_checkpoint_generation())?;
    validate_prior_predecessor_retirement(plan, observation.prior_predecessor_retirement())
}

fn validate_candidate_superseded(
    plan: &LocalLogStorageAttemptPlan,
    observation: &LocalLogStorageRotationSupersededObservation,
) -> Result<(), LocalLogStorageRotationResolutionCollisionReason> {
    validate_candidate_index(plan, observation.candidate_head_index_transaction_id())?;
    validate_current_index(
        observation.selected(),
        observation.current_head_index_transaction_id(),
    )?;
    let selected = observation.selected();
    if !same_scope_lifetime(plan, selected)
        || selected.selection_kind() != LocalLogStorageSelectionKind::Rotation
    {
        return Err(
            LocalLogStorageRotationResolutionCollisionReason::CandidateImmediatePredecessorMismatch,
        );
    }
    let (binding, _current_json, predecessor_json) = selected.snapshot_attempt_envelope();
    if binding.predecessor_receipt() != Some(plan.candidate_receipt())
        || predecessor_json.as_deref().map(str::as_bytes) != Some(plan.candidate_json().as_bytes())
    {
        return Err(
            LocalLogStorageRotationResolutionCollisionReason::CandidateImmediatePredecessorMismatch,
        );
    }
    if !checkpoint_generation_matches_later(
        plan.candidate_binding().checkpoint_generation(),
        observation.candidate_checkpoint_generation(),
    ) {
        return Err(
            LocalLogStorageRotationResolutionCollisionReason::CandidateCheckpointGenerationMismatch,
        );
    }
    validate_prior_checkpoint(plan, observation.prior_checkpoint_generation())?;
    if plan
        .candidate_binding()
        .active_generation()
        .validate_retired_checkpoint_observation(
            binding.checkpoint_generation(),
            binding.current_receipt().committed_head_id(),
        )
        .is_err()
    {
        return Err(
            LocalLogStorageRotationResolutionCollisionReason::CandidateActiveGenerationMismatch,
        );
    }
    validate_prior_current_retirement(plan, observation.prior_current_retirement())?;
    validate_prior_predecessor_retirement(plan, observation.prior_predecessor_retirement())?;
    if later_current_reuses_plan_identity(plan, selected) {
        return Err(LocalLogStorageRotationResolutionCollisionReason::CurrentIdentityReuse);
    }
    Ok(())
}

fn validate_different_current(
    plan: &LocalLogStorageAttemptPlan,
    observation: &LocalLogStorageRotationDifferentCurrentObservation,
) -> Result<(), LocalLogStorageRotationResolutionCollisionReason> {
    validate_current_index(
        observation.selected(),
        observation.current_head_index_transaction_id(),
    )?;
    let context = rotation_context(plan);
    let selected = observation.selected();
    if !same_scope_lifetime(plan, selected)
        || selected.selection_kind() != LocalLogStorageSelectionKind::Rotation
    {
        return Err(LocalLogStorageRotationResolutionCollisionReason::DifferentCurrentMismatch);
    }
    let (binding, _current_json, predecessor_json) = selected.snapshot_attempt_envelope();
    if binding.predecessor_receipt() != Some(context.selected_binding().current_receipt())
        || predecessor_json.as_deref().map(str::as_bytes)
            != Some(context.current_selection_json().as_bytes())
        || context
            .selected_binding()
            .active_generation()
            .validate_retired_checkpoint_observation(
                binding.checkpoint_generation(),
                binding.current_receipt().committed_head_id(),
            )
            .is_err()
    {
        return Err(LocalLogStorageRotationResolutionCollisionReason::DifferentCurrentMismatch);
    }
    validate_prior_checkpoint(plan, observation.prior_checkpoint_generation())?;
    validate_prior_predecessor_retirement(plan, observation.prior_predecessor_retirement())?;
    if competing_current_reuses_candidate_identity(plan, selected) {
        return Err(LocalLogStorageRotationResolutionCollisionReason::CurrentIdentityReuse);
    }
    Ok(())
}

fn validate_candidate_retired(
    plan: &LocalLogStorageAttemptPlan,
    observation: &LocalLogStorageRotationRetiredObservation,
) -> Result<(), LocalLogStorageRotationResolutionCollisionReason> {
    validate_indexed_retired(
        plan.candidate_receipt(),
        plan.candidate_json_bytes(),
        observation.candidate_retirement(),
        LocalLogStorageRotationResolutionCollisionReason::RetiredTransactionMismatch,
    )?;
    validate_current_index(
        observation.current_selected(),
        observation.current_head_index_transaction_id(),
    )?;
    let current = observation.current_selected();
    if !same_scope_lifetime(plan, current)
        || current.selection_kind() != LocalLogStorageSelectionKind::Rotation
    {
        return Err(LocalLogStorageRotationResolutionCollisionReason::RetiredScopeMismatch);
    }
    if !checkpoint_generation_matches_later(
        plan.candidate_binding().checkpoint_generation(),
        observation.candidate_checkpoint_generation(),
    ) {
        return Err(
            LocalLogStorageRotationResolutionCollisionReason::CandidateCheckpointGenerationMismatch,
        );
    }
    validate_prior_checkpoint(plan, observation.prior_checkpoint_generation())?;
    validate_prior_current_retirement(plan, observation.prior_current_retirement())?;
    validate_prior_predecessor_retirement(plan, observation.prior_predecessor_retirement())?;
    let successor_head = validate_retired_direct_successor(plan, current, observation)?;
    if plan
        .candidate_binding()
        .active_generation()
        .validate_retired_checkpoint_observation(
            observation.candidate_active_generation(),
            successor_head,
        )
        .is_err()
    {
        return Err(
            LocalLogStorageRotationResolutionCollisionReason::CandidateActiveGenerationMismatch,
        );
    }
    let retired_successor_predecessor_reuse =
        matches!(
            observation.direct_successor().data(),
            LocalLogStorageRotationDirectSuccessorObservationData::Retired(_)
        ) && retired_current_predecessor_reuses_prior_head(plan, current);
    if retired_current_reuses_plan_identity(plan, current) || retired_successor_predecessor_reuse {
        return Err(LocalLogStorageRotationResolutionCollisionReason::CurrentIdentityReuse);
    }
    Ok(())
}

fn validate_retired_direct_successor<'a>(
    plan: &LocalLogStorageAttemptPlan,
    current: &LocalLogStorageSelectedRoot,
    observation: &'a LocalLogStorageRotationRetiredObservation,
) -> Result<&'a LocalLogStorageHeadId, LocalLogStorageRotationResolutionCollisionReason> {
    let candidate = plan.candidate_receipt();
    match observation.direct_successor().data() {
        LocalLogStorageRotationDirectSuccessorObservationData::Exact {
            receipt,
            committed_head_index_transaction_id,
        } => {
            if receipt.selection_kind() != LocalLogStorageSelectionKind::Rotation
                || receipt.profile_id() != candidate.profile_id()
                || receipt.profile_version() != candidate.profile_version()
                || receipt.database_incarnation_id() != candidate.database_incarnation_id()
                || receipt.scope_id() != candidate.scope_id()
                || receipt.scope_incarnation_id() != candidate.scope_incarnation_id()
                || receipt.session_id() != candidate.session_id()
                || receipt.expected_head_id() != Some(candidate.committed_head_id())
                || receipt.committed_head_id() == candidate.committed_head_id()
                || receipt.transaction_id() == candidate.transaction_id()
                || successor_reuses_prior_identity(
                    plan,
                    receipt.transaction_id(),
                    receipt.committed_head_id(),
                )
                || committed_head_index_transaction_id != receipt.transaction_id()
                || current.predecessor_receipt() != Some(receipt)
            {
                return Err(
                    LocalLogStorageRotationResolutionCollisionReason::RetiredSuccessorMismatch,
                );
            }
            let Some(sealed_generation) = current.predecessor_rotation_sealed_generation() else {
                return Err(
                    LocalLogStorageRotationResolutionCollisionReason::RetiredSuccessorMismatch,
                );
            };
            let active = plan.candidate_binding().active_generation();
            if sealed_generation.log_id() != active.log_id()
                || sealed_generation.frame() != active.frame()
            {
                return Err(
                    LocalLogStorageRotationResolutionCollisionReason::RetiredSuccessorMismatch,
                );
            }
            Ok(receipt.committed_head_id())
        }
        LocalLogStorageRotationDirectSuccessorObservationData::Retired(indexed) => {
            let transaction = indexed.retired_transaction();
            if transaction.selection_kind() != LocalLogStorageSelectionKind::Rotation
                || transaction.database_incarnation_id() != candidate.database_incarnation_id()
                || transaction.scope_id() != candidate.scope_id()
                || transaction.scope_incarnation_id() != candidate.scope_incarnation_id()
                || transaction.expected_head_id() != Some(candidate.committed_head_id())
                || transaction.committed_head_id() == candidate.committed_head_id()
                || transaction.transaction_id() == candidate.transaction_id()
                || successor_reuses_prior_identity(
                    plan,
                    transaction.transaction_id(),
                    transaction.committed_head_id(),
                )
                || indexed.committed_head_index_transaction_id() != transaction.transaction_id()
                || transaction.transaction_id() == current.transaction_id()
                || transaction.committed_head_id() == current.selected_head_id()
                || current.predecessor_receipt().is_some_and(|predecessor| {
                    transaction.transaction_id() == predecessor.transaction_id()
                        || transaction.committed_head_id() == predecessor.committed_head_id()
                })
            {
                return Err(
                    LocalLogStorageRotationResolutionCollisionReason::RetiredSuccessorMismatch,
                );
            }
            Ok(transaction.committed_head_id())
        }
    }
}

fn retired_current_predecessor_reuses_prior_head(
    plan: &LocalLogStorageAttemptPlan,
    current: &LocalLogStorageSelectedRoot,
) -> bool {
    let Some(expected_head_id) =
        current.predecessor_receipt().and_then(|receipt| receipt.expected_head_id())
    else {
        return false;
    };
    let context = rotation_context(plan);
    [
        Some(plan.candidate_receipt()),
        Some(context.selected_binding().current_receipt()),
        context.selected_binding().predecessor_receipt(),
    ]
    .into_iter()
    .flatten()
    .any(|known| {
        expected_head_id == known.committed_head_id()
            || known.expected_head_id() == Some(expected_head_id)
    })
}

fn successor_reuses_prior_identity(
    plan: &LocalLogStorageAttemptPlan,
    transaction_id: &crate::local_log::LocalLogStorageTransactionId,
    committed_head_id: &LocalLogStorageHeadId,
) -> bool {
    let context = rotation_context(plan);
    [
        Some(context.selected_binding().current_receipt()),
        context.selected_binding().predecessor_receipt(),
    ]
    .into_iter()
    .flatten()
    .any(|receipt| {
        transaction_id == receipt.transaction_id()
            || committed_head_id == receipt.committed_head_id()
            || receipt.expected_head_id() == Some(committed_head_id)
    })
}

fn validate_candidate_index(
    plan: &LocalLogStorageAttemptPlan,
    indexed_transaction_id: &crate::local_log::LocalLogStorageTransactionId,
) -> Result<(), LocalLogStorageRotationResolutionCollisionReason> {
    if indexed_transaction_id != plan.candidate_receipt().transaction_id() {
        return Err(
            LocalLogStorageRotationResolutionCollisionReason::CandidateCommittedHeadIndexMismatch,
        );
    }
    Ok(())
}

fn validate_other_scope(
    plan: &LocalLogStorageAttemptPlan,
    observation: &super::LocalLogStorageRotationOtherScopeObservation,
) -> Result<(), LocalLogStorageRotationResolutionCollisionReason> {
    let selected = observation.selected();
    let candidate = plan.candidate_receipt();
    if observation.current_head_index_transaction_id() != selected.transaction_id() {
        return Err(
            LocalLogStorageRotationResolutionCollisionReason::CurrentCommittedHeadIndexMismatch,
        );
    }
    if selected.profile_id() != candidate.profile_id()
        || selected.profile_version() != candidate.profile_version()
        || selected.database_incarnation_id() != candidate.database_incarnation_id()
        || selected.scope_id() != candidate.scope_id()
        || selected.scope_incarnation_id() == candidate.scope_incarnation_id()
    {
        return Err(
            LocalLogStorageRotationResolutionCollisionReason::ExpectedScopeObservationMismatch,
        );
    }
    Ok(())
}

fn validate_current_index(
    selected: &LocalLogStorageSelectedRoot,
    indexed_transaction_id: &crate::local_log::LocalLogStorageTransactionId,
) -> Result<(), LocalLogStorageRotationResolutionCollisionReason> {
    if indexed_transaction_id != selected.transaction_id() {
        return Err(
            LocalLogStorageRotationResolutionCollisionReason::CurrentCommittedHeadIndexMismatch,
        );
    }
    Ok(())
}

fn validate_prior_checkpoint(
    plan: &LocalLogStorageAttemptPlan,
    observed: &super::LocalLogStorageSelectedCheckpointGenerationBinding,
) -> Result<(), LocalLogStorageRotationResolutionCollisionReason> {
    let expected = rotation_context(plan).selected_binding().checkpoint_generation();
    if !checkpoint_generation_matches_later(expected, observed) {
        return Err(
            LocalLogStorageRotationResolutionCollisionReason::PriorCheckpointGenerationMismatch,
        );
    }
    Ok(())
}

fn validate_prior_current_retirement(
    plan: &LocalLogStorageAttemptPlan,
    observed: &LocalLogStorageRotationIndexedRetiredTransactionObservation,
) -> Result<(), LocalLogStorageRotationResolutionCollisionReason> {
    let context = rotation_context(plan);
    validate_indexed_retired(
        context.selected_binding().current_receipt(),
        context.current_selection_json().len(),
        observed,
        LocalLogStorageRotationResolutionCollisionReason::RequiredRetiredTransactionMismatch,
    )
}

fn validate_prior_predecessor_retirement(
    plan: &LocalLogStorageAttemptPlan,
    observed: Option<&LocalLogStorageRotationIndexedRetiredTransactionObservation>,
) -> Result<(), LocalLogStorageRotationResolutionCollisionReason> {
    let context = rotation_context(plan);
    match (
        context.selected_binding().predecessor_receipt(),
        context.predecessor_selection_json(),
        observed,
    ) {
        (None, None, None) => Ok(()),
        (Some(receipt), Some(json), Some(observation)) => validate_indexed_retired(
            receipt,
            json.len(),
            observation,
            LocalLogStorageRotationResolutionCollisionReason::RequiredRetiredTransactionMismatch,
        ),
        _ => Err(
            LocalLogStorageRotationResolutionCollisionReason::RequiredRetiredTransactionMismatch,
        ),
    }
}

fn validate_indexed_retired(
    receipt: &super::LocalLogStorageSelectionReceiptBinding,
    selection_json_bytes: usize,
    observed: &LocalLogStorageRotationIndexedRetiredTransactionObservation,
    mismatch: LocalLogStorageRotationResolutionCollisionReason,
) -> Result<(), LocalLogStorageRotationResolutionCollisionReason> {
    let Ok(selection_byte_length) = u64::try_from(selection_json_bytes) else {
        return Err(mismatch);
    };
    let Ok(expected) = LocalLogStorageRetiredTransactionBinding::try_new(
        receipt.database_incarnation_id().clone(),
        receipt.scope_id().clone(),
        receipt.scope_incarnation_id().clone(),
        receipt.transaction_id().clone(),
        receipt.expected_head_id().cloned(),
        receipt.committed_head_id().clone(),
        receipt.selection_kind(),
        selection_byte_length,
    ) else {
        return Err(mismatch);
    };
    if observed.retired_transaction() != &expected
        || observed.committed_head_index_transaction_id() != receipt.transaction_id()
    {
        return Err(mismatch);
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

fn later_current_reuses_plan_identity(
    plan: &LocalLogStorageAttemptPlan,
    current: &LocalLogStorageSelectedRoot,
) -> bool {
    let context = rotation_context(plan);
    let candidate = plan.candidate_binding();
    let current_binding = current.binding();
    let current_receipt = current_binding.current_receipt();
    let known_receipts = [
        Some(candidate.current_receipt()),
        Some(context.selected_binding().current_receipt()),
        context.selected_binding().predecessor_receipt(),
    ];
    known_receipts.into_iter().flatten().any(|known| {
        current_receipt.transaction_id() == known.transaction_id()
            || current_receipt.committed_head_id() == known.committed_head_id()
            || known.expected_head_id() == Some(current_receipt.committed_head_id())
    }) || current_binding.active_generation().log_id() == candidate.checkpoint_generation().log_id()
        || current_binding.active_generation().log_id() == candidate.active_generation().log_id()
        || current_binding.active_generation().log_id()
            == context.selected_binding().checkpoint_generation().log_id()
        || context
            .predecessor_checkpoint_log_id()
            .is_some_and(|known| current_binding.active_generation().log_id() == known)
        || current_binding.active_generation().activated_fence_id()
            == candidate.active_generation().activated_fence_id()
        || current_binding.active_generation().activated_fence_id()
            == context.selected_binding().active_generation().activated_fence_id()
        || context
            .selected_binding()
            .checkpoint_generation()
            .activated_fence_id()
            .is_some_and(|known| current_binding.active_generation().activated_fence_id() == known)
}

fn competing_current_reuses_candidate_identity(
    plan: &LocalLogStorageAttemptPlan,
    current: &LocalLogStorageSelectedRoot,
) -> bool {
    let candidate = plan.candidate_binding();
    let context = rotation_context(plan);
    let current_binding = current.binding();
    let current_receipt = current_binding.current_receipt();
    let known_receipts = [
        Some(candidate.current_receipt()),
        Some(context.selected_binding().current_receipt()),
        context.selected_binding().predecessor_receipt(),
    ];
    known_receipts.into_iter().flatten().any(|known| {
        current_receipt.transaction_id() == known.transaction_id()
            || current_receipt.committed_head_id() == known.committed_head_id()
            || known.expected_head_id() == Some(current_receipt.committed_head_id())
    }) || current_binding.active_generation().log_id() == candidate.active_generation().log_id()
        || current_binding.active_generation().activated_fence_id()
            == candidate.active_generation().activated_fence_id()
        || current_binding.active_generation().log_id()
            == context.selected_binding().checkpoint_generation().log_id()
        || current_binding.active_generation().log_id()
            == context.selected_binding().active_generation().log_id()
        || context
            .predecessor_checkpoint_log_id()
            .is_some_and(|known| current_binding.active_generation().log_id() == known)
        || current_binding.active_generation().activated_fence_id()
            == context.selected_binding().active_generation().activated_fence_id()
        || context
            .selected_binding()
            .checkpoint_generation()
            .activated_fence_id()
            .is_some_and(|known| current_binding.active_generation().activated_fence_id() == known)
}

fn retired_current_reuses_plan_identity(
    plan: &LocalLogStorageAttemptPlan,
    current: &LocalLogStorageSelectedRoot,
) -> bool {
    let context = rotation_context(plan);
    let candidate = plan.candidate_binding();
    let current_binding = current.binding();
    let receipts = [
        Some(candidate.current_receipt()),
        Some(context.selected_binding().current_receipt()),
        context.selected_binding().predecessor_receipt(),
    ];
    let receipt_reuse = receipts.into_iter().flatten().any(|known| {
        current.transaction_id() == known.transaction_id()
            || current.selected_head_id() == known.committed_head_id()
            || known.expected_head_id() == Some(current.selected_head_id())
            || current.predecessor_receipt().is_some_and(|predecessor| {
                predecessor.transaction_id() == known.transaction_id()
                    || predecessor.committed_head_id() == known.committed_head_id()
                    || known.expected_head_id() == Some(predecessor.committed_head_id())
            })
    });
    receipt_reuse
        || [
            candidate.checkpoint_generation().log_id(),
            candidate.active_generation().log_id(),
            context.selected_binding().checkpoint_generation().log_id(),
            context
                .predecessor_checkpoint_log_id()
                .unwrap_or(context.selected_binding().checkpoint_generation().log_id()),
        ]
        .into_iter()
        .any(|known| {
            current_binding.checkpoint_generation().log_id() == known
                || current_binding.active_generation().log_id() == known
        })
        || [
            Some(candidate.active_generation().activated_fence_id()),
            Some(context.selected_binding().active_generation().activated_fence_id()),
            candidate.checkpoint_generation().activated_fence_id(),
            context.selected_binding().checkpoint_generation().activated_fence_id(),
        ]
        .into_iter()
        .flatten()
        .any(|known| {
            current_binding.active_generation().activated_fence_id() == known
                || current_binding.checkpoint_generation().activated_fence_id() == Some(known)
        })
}
