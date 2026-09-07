use std::cmp::Ordering;

use super::{
    LocalLogStorageAppendHeadPresentAtResolution, LocalLogStorageAppendQueue,
    LocalLogStorageAppendResolution, LocalLogStorageAppendResolutionCollisionReason,
    LocalLogStorageAppendResolutionCurrentObservation, LocalLogStorageAppendResolutionEvidence,
    LocalLogStorageAppendResolutionFailure,
    LocalLogStorageAppendResolutionHeadRecordFinalObservation,
    LocalLogStorageAppendResolutionLaterRecordObservation, LocalLogStorageAppendResolutionOutcome,
    LocalLogStorageAppendResolutionTransitionError, LocalLogStorageAppendResolved,
    LocalLogStorageAppendRetryEligibleAtResolution, LocalLogStorageMutationFenceBinding,
    LocalLogStorageSelectedBindingChange,
    local_log_storage_append_resolution_observation::{
        LocalLogStorageAppendExpectedDatabaseUnavailableData,
        LocalLogStorageAppendExpectedScopeUnavailableData,
        LocalLogStorageAppendResolutionLaterTargetObservationData,
        LocalLogStorageAppendResolutionObservation, LocalLogStorageAppendResolutionObservationData,
    },
    local_log_storage_append_resolution_source::LocalLogStorageAppendResolutionSource,
};

impl LocalLogStorageAppendResolution {
    /// Applies one exactly correlated terminal physical observation.
    ///
    /// Ordinary evidence is applicable only after the exact five-store
    /// `readonly` resolver transaction emitted terminal `complete` after all
    /// reads and full cursor scans. That transaction performs no writes and has
    /// no durability option. Physical database absence instead uses the
    /// correlated aborted non-creating open boundary.
    ///
    /// The core compares observed bindings, exact selection JSON, independent
    /// head-index lookup, tail boundaries, and owned target bytes with the
    /// private retained queue. An exact final target may remain positive after
    /// only the mutable writer epoch/fence advances; clean absence requires the
    /// complete writer pair to remain exact. Any later record prevents positive
    /// acknowledgement, including when the target itself is byte-identical.
    ///
    /// # Errors
    ///
    /// Failure precedence is `RequestNotIssued` before `RequestIdMismatch`.
    /// The returned failure owns the complete unchanged resolver and evidence.
    pub fn apply_resolution_evidence(
        mut self,
        evidence: LocalLogStorageAppendResolutionEvidence,
    ) -> Result<LocalLogStorageAppendResolutionOutcome, LocalLogStorageAppendResolutionFailure>
    {
        let Some(request_id) = self.request_id.as_ref() else {
            return Err(LocalLogStorageAppendResolutionFailure::new(
                self,
                evidence,
                LocalLogStorageAppendResolutionTransitionError::RequestNotIssued,
            ));
        };
        if request_id != evidence.request_id() {
            return Err(LocalLogStorageAppendResolutionFailure::new(
                self,
                evidence,
                LocalLogStorageAppendResolutionTransitionError::RequestIdMismatch,
            ));
        }

        let disposition = classify(&self.source, evidence.observation());
        let resolution_request_id = self
            .request_id
            .take()
            .unwrap_or_else(|| unreachable!("request egress was checked above"));
        let source = self.source;
        let observation = evidence.into_observation();

        Ok(match disposition {
            AppendResolutionDisposition::HeadPresent => {
                LocalLogStorageAppendResolutionOutcome::HeadPresentAtResolution(
                    LocalLogStorageAppendHeadPresentAtResolution::new(
                        source,
                        resolution_request_id,
                        observation,
                    ),
                )
            }
            AppendResolutionDisposition::RetryEligible => {
                LocalLogStorageAppendResolutionOutcome::RetryEligibleAtResolution(
                    LocalLogStorageAppendRetryEligibleAtResolution::new(
                        source,
                        resolution_request_id,
                    ),
                )
            }
            AppendResolutionDisposition::TailAdvancedOrIndeterminate => {
                LocalLogStorageAppendResolutionOutcome::TailAdvancedOrIndeterminate(
                    LocalLogStorageAppendResolved::new(
                        source,
                        resolution_request_id,
                        observation,
                        None,
                    ),
                )
            }
            AppendResolutionDisposition::Collision(reason) => {
                LocalLogStorageAppendResolutionOutcome::CollisionOrCorruption(
                    LocalLogStorageAppendResolved::new(
                        source,
                        resolution_request_id,
                        observation,
                        Some(reason),
                    ),
                )
            }
            AppendResolutionDisposition::StorageResetOrIndeterminate => {
                LocalLogStorageAppendResolutionOutcome::StorageResetOrIndeterminate(
                    LocalLogStorageAppendResolved::new(
                        source,
                        resolution_request_id,
                        observation,
                        None,
                    ),
                )
            }
        })
    }
}

#[derive(Clone, Copy)]
enum AppendResolutionDisposition {
    HeadPresent,
    RetryEligible,
    TailAdvancedOrIndeterminate,
    Collision(LocalLogStorageAppendResolutionCollisionReason),
    StorageResetOrIndeterminate,
}

fn classify(
    source: &LocalLogStorageAppendResolutionSource,
    observation: &LocalLogStorageAppendResolutionObservation,
) -> AppendResolutionDisposition {
    let queue = source.queue();
    match observation.data() {
        LocalLogStorageAppendResolutionObservationData::ExpectedDatabaseUnavailable(reason) => {
            match reason {
                LocalLogStorageAppendExpectedDatabaseUnavailableData::IncarnationMismatch(
                    observed,
                ) if observed
                    == queue.expected_binding().current_receipt().database_incarnation_id() =>
                {
                    AppendResolutionDisposition::Collision(
                        LocalLogStorageAppendResolutionCollisionReason::ExpectedDatabaseObservationMismatch,
                    )
                }
                LocalLogStorageAppendExpectedDatabaseUnavailableData::PhysicalDatabaseAbsent
                | LocalLogStorageAppendExpectedDatabaseUnavailableData::EmptyWithoutProfileRecord
                | LocalLogStorageAppendExpectedDatabaseUnavailableData::IncarnationMismatch(_) => {
                    AppendResolutionDisposition::StorageResetOrIndeterminate
                }
            }
        }
        LocalLogStorageAppendResolutionObservationData::ExpectedScopeUnavailableOrReplaced(
            reason,
        ) => match reason {
            LocalLogStorageAppendExpectedScopeUnavailableData::Absent => {
                AppendResolutionDisposition::StorageResetOrIndeterminate
            }
            LocalLogStorageAppendExpectedScopeUnavailableData::Replaced(current) => {
                match validate_replaced_scope(queue, current) {
                    Ok(()) => AppendResolutionDisposition::StorageResetOrIndeterminate,
                    Err(reason) => AppendResolutionDisposition::Collision(reason),
                }
            }
        },
        LocalLogStorageAppendResolutionObservationData::CurrentContextChanged(current) => {
            classify_current_context_changed(queue, current)
        }
        LocalLogStorageAppendResolutionObservationData::HeadAbsentAtTail(observation) => {
            classify_head_absent(queue, observation)
        }
        LocalLogStorageAppendResolutionObservationData::HeadRecordFinal(observation) => {
            classify_final_head(queue, observation)
        }
        LocalLogStorageAppendResolutionObservationData::LaterRecordObserved(observation) => {
            classify_later_record(queue, observation)
        }
        LocalLogStorageAppendResolutionObservationData::CollisionOrBrokenProfile { reason } => {
            AppendResolutionDisposition::Collision(
                LocalLogStorageAppendResolutionCollisionReason::ObservedCollisionOrBrokenProfile {
                    reason: *reason,
                },
            )
        }
    }
}

fn classify_current_context_changed(
    queue: &LocalLogStorageAppendQueue,
    current: &LocalLogStorageAppendResolutionCurrentObservation,
) -> AppendResolutionDisposition {
    if let Err(reason) = validate_current_head_index(current) {
        return AppendResolutionDisposition::Collision(reason);
    }
    match compare_context(queue.expected_binding(), current.binding()) {
        AppendResolutionContextRelation::Exact => AppendResolutionDisposition::Collision(
            LocalLogStorageAppendResolutionCollisionReason::CurrentContextReportedUnchanged,
        ),
        AppendResolutionContextRelation::CheckpointReclaimed
        | AppendResolutionContextRelation::WriterAdvanced
        | AppendResolutionContextRelation::SelectedContextDifferent => {
            AppendResolutionDisposition::TailAdvancedOrIndeterminate
        }
        AppendResolutionContextRelation::Collision(reason) => {
            AppendResolutionDisposition::Collision(reason)
        }
    }
}

fn classify_head_absent(
    queue: &LocalLogStorageAppendQueue,
    observation: &super::LocalLogStorageAppendResolutionHeadAbsentAtTailObservation,
) -> AppendResolutionDisposition {
    if let Err(reason) = validate_current_head_index(observation.current()) {
        return AppendResolutionDisposition::Collision(reason);
    }
    let context = compare_context(queue.expected_binding(), observation.current().binding());
    match context {
        AppendResolutionContextRelation::Exact
        | AppendResolutionContextRelation::CheckpointReclaimed
        | AppendResolutionContextRelation::WriterAdvanced => {}
        AppendResolutionContextRelation::SelectedContextDifferent => {
            return AppendResolutionDisposition::TailAdvancedOrIndeterminate;
        }
        AppendResolutionContextRelation::Collision(reason) => {
            return AppendResolutionDisposition::Collision(reason);
        }
    }
    if observation.valid_prefix_end() != queue.head_chunk_start().get() {
        return AppendResolutionDisposition::Collision(
            LocalLogStorageAppendResolutionCollisionReason::HeadAbsentPrefixEndMismatch,
        );
    }
    match context {
        AppendResolutionContextRelation::WriterAdvanced => {
            AppendResolutionDisposition::TailAdvancedOrIndeterminate
        }
        AppendResolutionContextRelation::Exact
        | AppendResolutionContextRelation::CheckpointReclaimed => {
            AppendResolutionDisposition::RetryEligible
        }
        AppendResolutionContextRelation::SelectedContextDifferent
        | AppendResolutionContextRelation::Collision(_) => {
            unreachable!("non-comparable contexts returned above")
        }
    }
}

fn classify_final_head(
    queue: &LocalLogStorageAppendQueue,
    observation: &LocalLogStorageAppendResolutionHeadRecordFinalObservation,
) -> AppendResolutionDisposition {
    if let Err(reason) = validate_current_head_index(observation.current()) {
        return AppendResolutionDisposition::Collision(reason);
    }
    match compare_context(queue.expected_binding(), observation.current().binding()) {
        AppendResolutionContextRelation::Exact
        | AppendResolutionContextRelation::CheckpointReclaimed
        | AppendResolutionContextRelation::WriterAdvanced => {}
        AppendResolutionContextRelation::SelectedContextDifferent => {
            return AppendResolutionDisposition::TailAdvancedOrIndeterminate;
        }
        AppendResolutionContextRelation::Collision(reason) => {
            return AppendResolutionDisposition::Collision(reason);
        }
    }
    match validate_final_head(queue, observation) {
        Ok(()) => AppendResolutionDisposition::HeadPresent,
        Err(reason) => AppendResolutionDisposition::Collision(reason),
    }
}

fn classify_later_record(
    queue: &LocalLogStorageAppendQueue,
    observation: &LocalLogStorageAppendResolutionLaterRecordObservation,
) -> AppendResolutionDisposition {
    if let Err(reason) = validate_current_head_index(observation.current()) {
        return AppendResolutionDisposition::Collision(reason);
    }
    match compare_context(queue.expected_binding(), observation.current().binding()) {
        AppendResolutionContextRelation::Exact
        | AppendResolutionContextRelation::CheckpointReclaimed
        | AppendResolutionContextRelation::WriterAdvanced => {}
        AppendResolutionContextRelation::SelectedContextDifferent => {
            return AppendResolutionDisposition::TailAdvancedOrIndeterminate;
        }
        AppendResolutionContextRelation::Collision(reason) => {
            return AppendResolutionDisposition::Collision(reason);
        }
    }
    match validate_later_record(queue, observation) {
        Ok(()) => AppendResolutionDisposition::TailAdvancedOrIndeterminate,
        Err(reason) => AppendResolutionDisposition::Collision(reason),
    }
}

fn validate_current_head_index(
    current: &LocalLogStorageAppendResolutionCurrentObservation,
) -> Result<(), LocalLogStorageAppendResolutionCollisionReason> {
    if current.current_head_index_transaction_id()
        != current.binding().current_receipt().transaction_id()
    {
        return Err(LocalLogStorageAppendResolutionCollisionReason::CurrentHeadIndexMismatch);
    }
    Ok(())
}

fn validate_replaced_scope(
    queue: &LocalLogStorageAppendQueue,
    current: &LocalLogStorageAppendResolutionCurrentObservation,
) -> Result<(), LocalLogStorageAppendResolutionCollisionReason> {
    validate_current_head_index(current)?;
    let expected = queue.expected_binding().current_receipt();
    let observed = current.binding().current_receipt();
    if expected.schema_binding() != observed.schema_binding()
        || expected.profile_id() != observed.profile_id()
        || expected.profile_version() != observed.profile_version()
        || expected.database_incarnation_id() != observed.database_incarnation_id()
        || expected.scope_id() != observed.scope_id()
        || expected.scope_incarnation_id() == observed.scope_incarnation_id()
    {
        return Err(
            LocalLogStorageAppendResolutionCollisionReason::ExpectedScopeObservationMismatch,
        );
    }
    Ok(())
}

#[derive(Clone, Copy)]
enum AppendResolutionContextRelation {
    Exact,
    CheckpointReclaimed,
    WriterAdvanced,
    SelectedContextDifferent,
    Collision(LocalLogStorageAppendResolutionCollisionReason),
}

fn compare_context(
    expected: &LocalLogStorageMutationFenceBinding,
    observed: &LocalLogStorageMutationFenceBinding,
) -> AppendResolutionContextRelation {
    if expected.current_receipt() != observed.current_receipt() {
        if !same_scope_lifetime(expected, observed) {
            return AppendResolutionContextRelation::Collision(
                LocalLogStorageAppendResolutionCollisionReason::CurrentContextLifetimeMismatch,
            );
        }
        return match observed.writer_epoch().cmp(&expected.writer_epoch()) {
            Ordering::Less => AppendResolutionContextRelation::Collision(
                LocalLogStorageAppendResolutionCollisionReason::WriterEpochRegression,
            ),
            Ordering::Equal => AppendResolutionContextRelation::Collision(
                LocalLogStorageAppendResolutionCollisionReason::SelectionChangedWithoutWriterAdvance,
            ),
            Ordering::Greater => AppendResolutionContextRelation::SelectedContextDifferent,
        };
    }

    let Ok(selected_change) =
        expected.selected_binding().compare_later_observation(observed.selected_binding())
    else {
        return AppendResolutionContextRelation::Collision(
            LocalLogStorageAppendResolutionCollisionReason::SelectedEnvelopeMismatch,
        );
    };
    if expected.current_selection_json() != observed.current_selection_json() {
        return AppendResolutionContextRelation::Collision(
            LocalLogStorageAppendResolutionCollisionReason::CurrentSelectionBytesMismatch,
        );
    }
    if expected.predecessor_selection_json() != observed.predecessor_selection_json() {
        return AppendResolutionContextRelation::Collision(
            LocalLogStorageAppendResolutionCollisionReason::PredecessorSelectionBytesMismatch,
        );
    }

    match observed.writer_epoch().cmp(&expected.writer_epoch()) {
        Ordering::Less => AppendResolutionContextRelation::Collision(
            LocalLogStorageAppendResolutionCollisionReason::WriterEpochRegression,
        ),
        Ordering::Greater => AppendResolutionContextRelation::WriterAdvanced,
        Ordering::Equal
            if observed.current_writer_fence_id() != expected.current_writer_fence_id() =>
        {
            AppendResolutionContextRelation::Collision(
                LocalLogStorageAppendResolutionCollisionReason::CurrentWriterFenceMismatch,
            )
        }
        Ordering::Equal => match selected_change {
            LocalLogStorageSelectedBindingChange::Unchanged => {
                AppendResolutionContextRelation::Exact
            }
            LocalLogStorageSelectedBindingChange::CheckpointReclaimed => {
                AppendResolutionContextRelation::CheckpointReclaimed
            }
        },
    }
}

fn same_scope_lifetime(
    expected: &LocalLogStorageMutationFenceBinding,
    observed: &LocalLogStorageMutationFenceBinding,
) -> bool {
    let expected = expected.current_receipt();
    let observed = observed.current_receipt();
    expected.profile_id() == observed.profile_id()
        && expected.profile_version() == observed.profile_version()
        && expected.database_incarnation_id() == observed.database_incarnation_id()
        && expected.scope_id() == observed.scope_id()
        && expected.scope_incarnation_id() == observed.scope_incarnation_id()
        && expected.session_id() == observed.session_id()
}

fn validate_final_head(
    queue: &LocalLogStorageAppendQueue,
    observation: &LocalLogStorageAppendResolutionHeadRecordFinalObservation,
) -> Result<(), LocalLogStorageAppendResolutionCollisionReason> {
    validate_present_target(
        queue,
        observation.observed_chunk_start(),
        observation.observed_frame(),
        observation.valid_prefix_before_target_end(),
    )
}

fn validate_later_record(
    queue: &LocalLogStorageAppendQueue,
    observation: &LocalLogStorageAppendResolutionLaterRecordObservation,
) -> Result<(), LocalLogStorageAppendResolutionCollisionReason> {
    match observation.target().data() {
        LocalLogStorageAppendResolutionLaterTargetObservationData::Absent { valid_prefix_end } => {
            if *valid_prefix_end != queue.head_chunk_start().get() {
                return Err(
                    LocalLogStorageAppendResolutionCollisionReason::HeadAbsentPrefixEndMismatch,
                );
            }
            if observation.first_later_chunk_start().get() <= queue.head_chunk_start().get() {
                return Err(
                    LocalLogStorageAppendResolutionCollisionReason::LaterRecordOrderMismatch,
                );
            }
            return Err(LocalLogStorageAppendResolutionCollisionReason::LaterRecordAfterAbsentHead);
        }
        LocalLogStorageAppendResolutionLaterTargetObservationData::Present {
            observed_chunk_start,
            observed_frame,
            valid_prefix_before_target_end,
        } => {
            validate_present_target(
                queue,
                *observed_chunk_start,
                observed_frame,
                *valid_prefix_before_target_end,
            )?;
            if observation.first_later_chunk_start().get() != queue.head_frame_end() {
                return Err(
                    LocalLogStorageAppendResolutionCollisionReason::LaterRecordBoundaryMismatch,
                );
            }
        }
    }
    Ok(())
}

fn validate_present_target(
    queue: &LocalLogStorageAppendQueue,
    observed_chunk_start: crate::local_log::LocalLogStorageChunkStart,
    observed_frame: &[u8],
    valid_prefix_before_target_end: u64,
) -> Result<(), LocalLogStorageAppendResolutionCollisionReason> {
    if observed_chunk_start != queue.head_chunk_start() {
        return Err(LocalLogStorageAppendResolutionCollisionReason::HeadChunkStartMismatch);
    }
    if valid_prefix_before_target_end != queue.head_chunk_start().get() {
        return Err(LocalLogStorageAppendResolutionCollisionReason::HeadPrefixBeforeTargetMismatch);
    }
    let observed_end = u64::try_from(observed_frame.len())
        .ok()
        .and_then(|frame_bytes| observed_chunk_start.get().checked_add(frame_bytes));
    if observed_end != Some(queue.head_frame_end()) {
        return Err(LocalLogStorageAppendResolutionCollisionReason::HeadFrameEndMismatch);
    }
    if observed_frame != queue.head_frame().as_ref() {
        return Err(LocalLogStorageAppendResolutionCollisionReason::HeadFrameBytesMismatch);
    }
    Ok(())
}
