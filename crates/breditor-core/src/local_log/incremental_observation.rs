use std::collections::{BTreeMap, btree_map::Entry};

use super::{
    ContinuedLocalLog, LocalLogCheckpointAnchor, LocalLogEntry, LocalLogObservationFailure,
    LocalLogObservationOutcome, LocalLogRecoveryCounter, LocalLogRecoveryError,
    LocalLogRecoveryLimits, LocalLogSequence, checkpoint_anchor::LocalLogCheckpointAnchorParts,
    continued::ContinuedLocalLogObservationParts,
};

type ObservationRejection =
    Box<(ContinuedLocalLogObservationParts, LocalLogEntry, LocalLogRecoveryError)>;

struct ObservationProgress {
    parts: ContinuedLocalLogObservationParts,
    entry: LocalLogEntry,
    delivery_index: u64,
    attempted_observations: u64,
}

enum ReplayClassification {
    FirstSeen(ObservationProgress),
    ExactDuplicate {
        progress: ObservationProgress,
        first_delivery_index: u64,
        sequence: LocalLogSequence,
        exact_duplicate_count: u64,
    },
}

struct FirstSeenAdmission {
    progress: ObservationProgress,
    unique_event_count: u64,
    applied_operation_count: u64,
}

impl LocalLogCheckpointAnchor {
    /// Begins bounded incremental admission for this anchor's successor.
    ///
    /// The returned [`ContinuedLocalLog`] owns the checkpoint session, replay
    /// tombstones, active-generation scope, and fixed cumulative `limits`.
    /// Starting performs no event application and charges no counters. A host
    /// can submit one physical observation at a time through
    /// [`ContinuedLocalLog::try_observe`] and later consume the owner through
    /// its checked compaction edge.
    #[must_use]
    pub fn begin_successor(self, limits: LocalLogRecoveryLimits) -> ContinuedLocalLog {
        self.begin_successor_with_capacity(limits, 0)
    }

    pub(super) fn begin_successor_with_capacity(
        self,
        limits: LocalLogRecoveryLimits,
        retained_capacity: usize,
    ) -> ContinuedLocalLog {
        let LocalLogCheckpointAnchorParts {
            session_id,
            checkpoint_log_id,
            successor_log_id,
            compaction_limits,
            session,
            compacted_replays,
            checkpoint_covered_through,
        } = self.into_parts();
        ContinuedLocalLog::new(
            session_id,
            checkpoint_log_id,
            successor_log_id,
            compaction_limits,
            limits,
            session,
            compacted_replays,
            Vec::with_capacity(retained_capacity),
            BTreeMap::new(),
            0,
            0,
            0,
            0,
            checkpoint_covered_through,
            checkpoint_covered_through,
        )
    }
}

impl ContinuedLocalLog {
    /// Atomically admits one physical observation into the active generation.
    ///
    /// Admission uses the cumulative recovery policy selected by
    /// [`LocalLogCheckpointAnchor::begin_successor`]. Exact duplicates consume
    /// an observation slot and increment the duplicate count, but do not charge
    /// unique-event or operation budgets and never reapply their event.
    /// Rejected attempts consume no counter, sequence, replay, session, or
    /// history state.
    /// [`LocalLogRecoveryError::ObservationLimit`] retains the historical batch
    /// shape and therefore has no embedded delivery index; the unchanged
    /// owner's [`Self::observation_count`] is the rejected slot.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogObservationFailure`] with this complete unchanged
    /// owner, the exact rejected entry, and a typed [`LocalLogRecoveryError`].
    /// Validation order is observation budget, membership, compacted replay,
    /// active replay, sequence, unique budget, operation budget, then event
    /// application. Allocation failure, panic, abort, and process failure are
    /// outside this typed atomicity contract.
    pub fn try_observe(
        self,
        entry: LocalLogEntry,
    ) -> Result<(Self, LocalLogObservationOutcome), LocalLogObservationFailure<Self>> {
        match observe(self.into_observation_parts(), entry) {
            Ok((parts, outcome)) => Ok((Self::from_observation_parts(parts), outcome)),
            Err(rejection) => {
                let (parts, rejected_entry, error) = *rejection;
                Err(LocalLogObservationFailure::new(
                    Self::from_observation_parts(parts),
                    rejected_entry,
                    error,
                ))
            }
        }
    }
}

fn observe(
    parts: ContinuedLocalLogObservationParts,
    entry: LocalLogEntry,
) -> Result<(ContinuedLocalLogObservationParts, LocalLogObservationOutcome), ObservationRejection> {
    let progress = preflight_observation(parts, entry)?;
    match classify_replay(progress)? {
        ReplayClassification::FirstSeen(progress) => {
            apply_first_seen(preflight_first_seen(progress)?)
        }
        ReplayClassification::ExactDuplicate {
            mut progress,
            first_delivery_index,
            sequence,
            exact_duplicate_count,
        } => {
            progress.parts.observation_count = progress.attempted_observations;
            progress.parts.exact_duplicate_count = exact_duplicate_count;
            let outcome = LocalLogObservationOutcome::ExactDuplicate {
                delivery_index: progress.delivery_index,
                first_delivery_index,
                sequence,
            };
            Ok((progress.parts, outcome))
        }
    }
}

fn preflight_observation(
    parts: ContinuedLocalLogObservationParts,
    entry: LocalLogEntry,
) -> Result<ObservationProgress, ObservationRejection> {
    let delivery_index = parts.observation_count;
    let Some(attempted_observations) = parts.observation_count.checked_add(1) else {
        return Err(rejection(
            parts,
            entry,
            LocalLogRecoveryError::CounterOverflow {
                delivery_index: Some(delivery_index),
                counter: LocalLogRecoveryCounter::Observations,
            },
        ));
    };
    if attempted_observations > parts.recovery_limits.max_observations() {
        let maximum = parts.recovery_limits.max_observations();
        return Err(rejection(
            parts,
            entry,
            LocalLogRecoveryError::ObservationLimit { actual: attempted_observations, maximum },
        ));
    }
    if entry.session_id() != &parts.session_id {
        let error = LocalLogRecoveryError::SessionMismatch {
            delivery_index,
            expected: parts.session_id.clone(),
            actual: entry.session_id().clone(),
        };
        return Err(rejection(parts, entry, error));
    }
    if entry.log_id() != &parts.active_log_id {
        let error = LocalLogRecoveryError::ActiveLogMismatch {
            delivery_index,
            expected: parts.active_log_id.clone(),
            actual: entry.log_id().clone(),
        };
        return Err(rejection(parts, entry, error));
    }
    let expected_schema_binding = parts.session.state().context().schema().durable_binding();
    if entry.schema_binding() != &expected_schema_binding {
        let error = LocalLogRecoveryError::SchemaBindingMismatch {
            delivery_index,
            expected: Box::new(expected_schema_binding),
            actual: Box::new(entry.schema_binding().clone()),
        };
        return Err(rejection(parts, entry, error));
    }
    if let Some(checkpoint_sequence) = parts.compacted_replays.get(entry.replay_id()).copied() {
        let error = LocalLogRecoveryError::CompactedReplayId {
            delivery_index,
            replay_id: entry.replay_id().clone(),
            checkpoint_sequence,
        };
        return Err(rejection(parts, entry, error));
    }
    Ok(ObservationProgress { parts, entry, delivery_index, attempted_observations })
}

fn classify_replay(
    progress: ObservationProgress,
) -> Result<ReplayClassification, ObservationRejection> {
    let Some(&(first_delivery_index, entry_index)) =
        progress.parts.active_replay_index.get(progress.entry.replay_id())
    else {
        return Ok(ReplayClassification::FirstSeen(progress));
    };
    let Some(first_entry) = progress.parts.active_entries.get(entry_index) else {
        let delivery_index = progress.delivery_index;
        return Err(reject_progress(
            progress,
            LocalLogRecoveryError::CounterOverflow {
                delivery_index: Some(delivery_index),
                counter: LocalLogRecoveryCounter::UniqueEvents,
            },
        ));
    };
    let sequence = first_entry.sequence();
    if !first_entry.same_replay_binding(&progress.entry) {
        let error = LocalLogRecoveryError::ReplayConflict {
            first_delivery_index,
            delivery_index: progress.delivery_index,
            replay_id: progress.entry.replay_id().clone(),
        };
        return Err(reject_progress(progress, error));
    }
    let Some(exact_duplicate_count) = progress.parts.exact_duplicate_count.checked_add(1) else {
        let delivery_index = progress.delivery_index;
        return Err(reject_progress(
            progress,
            LocalLogRecoveryError::CounterOverflow {
                delivery_index: Some(delivery_index),
                counter: LocalLogRecoveryCounter::ExactDuplicates,
            },
        ));
    };
    Ok(ReplayClassification::ExactDuplicate {
        progress,
        first_delivery_index,
        sequence,
        exact_duplicate_count,
    })
}

fn preflight_first_seen(
    progress: ObservationProgress,
) -> Result<FirstSeenAdmission, ObservationRejection> {
    let Some(expected_sequence) = next_sequence(progress.parts.covered_through) else {
        let delivery_index = progress.delivery_index;
        return Err(reject_progress(
            progress,
            LocalLogRecoveryError::SequenceExhausted {
                delivery_index,
                covered_through: LocalLogSequence::MAX,
            },
        ));
    };
    if progress.entry.sequence() != expected_sequence {
        let error = LocalLogRecoveryError::UnexpectedSequence {
            delivery_index: progress.delivery_index,
            expected: expected_sequence,
            actual: progress.entry.sequence(),
        };
        return Err(reject_progress(progress, error));
    }
    let Some(unique_event_count) = progress.parts.unique_event_count.checked_add(1) else {
        let delivery_index = progress.delivery_index;
        return Err(reject_progress(
            progress,
            LocalLogRecoveryError::CounterOverflow {
                delivery_index: Some(delivery_index),
                counter: LocalLogRecoveryCounter::UniqueEvents,
            },
        ));
    };
    if unique_event_count > progress.parts.recovery_limits.max_unique_events() {
        let maximum = progress.parts.recovery_limits.max_unique_events();
        let error = LocalLogRecoveryError::UniqueEventLimit {
            delivery_index: progress.delivery_index,
            attempted: unique_event_count,
            maximum,
        };
        return Err(reject_progress(progress, error));
    }
    preflight_operations(progress, unique_event_count)
}

fn preflight_operations(
    progress: ObservationProgress,
    unique_event_count: u64,
) -> Result<FirstSeenAdmission, ObservationRejection> {
    let Ok(event_operations) = u64::try_from(
        progress.entry.event().authoritative_operation_count(&progress.parts.session),
    ) else {
        let delivery_index = progress.delivery_index;
        return Err(reject_progress(
            progress,
            LocalLogRecoveryError::CounterOverflow {
                delivery_index: Some(delivery_index),
                counter: LocalLogRecoveryCounter::AppliedOperations,
            },
        ));
    };
    let Some(applied_operation_count) =
        progress.parts.applied_operation_count.checked_add(event_operations)
    else {
        let delivery_index = progress.delivery_index;
        return Err(reject_progress(
            progress,
            LocalLogRecoveryError::CounterOverflow {
                delivery_index: Some(delivery_index),
                counter: LocalLogRecoveryCounter::AppliedOperations,
            },
        ));
    };
    if applied_operation_count > progress.parts.recovery_limits.max_applied_operations() {
        let maximum = progress.parts.recovery_limits.max_applied_operations();
        let error = LocalLogRecoveryError::AppliedOperationLimit {
            delivery_index: progress.delivery_index,
            attempted: applied_operation_count,
            maximum,
        };
        return Err(reject_progress(progress, error));
    }
    Ok(FirstSeenAdmission { progress, unique_event_count, applied_operation_count })
}

fn apply_first_seen(
    mut admission: FirstSeenAdmission,
) -> Result<(ContinuedLocalLogObservationParts, LocalLogObservationOutcome), ObservationRejection> {
    if let Err(source) =
        admission.progress.entry.event().apply_to_session(&mut admission.progress.parts.session)
    {
        let delivery_index = admission.progress.delivery_index;
        return Err(reject_progress(
            admission.progress,
            LocalLogRecoveryError::EventApplication { delivery_index, source },
        ));
    }

    let sequence = admission.progress.entry.sequence();
    let replay_id = admission.progress.entry.replay_id().clone();
    let entry_index = admission.progress.parts.active_entries.len();
    admission.progress.parts.active_entries.push(admission.progress.entry);
    match admission.progress.parts.active_replay_index.entry(replay_id) {
        Entry::Vacant(slot) => {
            slot.insert((admission.progress.delivery_index, entry_index));
        }
        Entry::Occupied(_) => {
            unreachable!("preflight proved active replay uniqueness")
        }
    }
    admission.progress.parts.observation_count = admission.progress.attempted_observations;
    admission.progress.parts.unique_event_count = admission.unique_event_count;
    admission.progress.parts.applied_operation_count = admission.applied_operation_count;
    admission.progress.parts.covered_through = Some(sequence);
    let outcome = LocalLogObservationOutcome::Applied {
        delivery_index: admission.progress.delivery_index,
        sequence,
    };
    Ok((admission.progress.parts, outcome))
}

const fn next_sequence(covered_through: Option<LocalLogSequence>) -> Option<LocalLogSequence> {
    match covered_through {
        None => Some(LocalLogSequence::FIRST),
        Some(sequence) => match sequence.successor() {
            Ok(successor) => Some(successor),
            Err(_) => None,
        },
    }
}

fn rejection(
    parts: ContinuedLocalLogObservationParts,
    entry: LocalLogEntry,
    error: LocalLogRecoveryError,
) -> ObservationRejection {
    Box::new((parts, entry, error))
}

fn reject_progress(
    progress: ObservationProgress,
    error: LocalLogRecoveryError,
) -> ObservationRejection {
    rejection(progress.parts, progress.entry, error)
}
