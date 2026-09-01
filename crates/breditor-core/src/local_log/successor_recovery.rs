use std::collections::BTreeMap;

use super::{
    ContinuedLocalLog, LocalLogCheckpointAnchor, LocalLogEntry, LocalLogRecoveryCounter,
    LocalLogRecoveryError, LocalLogRecoveryLimits, LocalLogSequence, ReplayId,
    checkpoint_anchor::LocalLogCheckpointAnchorParts,
};

struct SuccessorRecoveryProgress {
    parts: LocalLogCheckpointAnchorParts,
    active_replay_index: BTreeMap<ReplayId, (u64, usize)>,
    active_entries: Vec<LocalLogEntry>,
    unique_event_count: u64,
    exact_duplicate_count: u64,
    applied_operation_count: u64,
    covered_through: Option<LocalLogSequence>,
    next_sequence: Option<LocalLogSequence>,
}

impl LocalLogCheckpointAnchor {
    /// Atomically verifies and applies the complete bound-successor batch.
    ///
    /// Every entry must name this anchor's session and successor generation.
    /// Reuse of a checkpoint-represented replay ID fails closed. For a trusted
    /// complete checkpoint this prevents a second application, but the anchor
    /// has no old full event proof with which to establish provenance or
    /// distinguish an exact retry from conflicting reuse.
    /// Exact duplicates first seen within `observations` are still skipped.
    /// First-seen successor events continue at the session-global checkpoint
    /// frontier and preserve the exact checkpointed history behavior.
    ///
    /// `limits` apply only to this successor batch. The checkpoint prefix and
    /// tombstones are already owned; their admission policy depends on whether
    /// the anchor came from runtime compaction or durable decode. On any error,
    /// the consumed anchor and privately applied successor prefix are dropped;
    /// no partial session is returned.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogRecoveryError`] for successor resource, membership,
    /// compacted-replay, active-replay, ordering, or application failures.
    pub fn recover_successor(
        self,
        observations: Vec<LocalLogEntry>,
        limits: LocalLogRecoveryLimits,
    ) -> Result<ContinuedLocalLog, LocalLogRecoveryError> {
        let observation_count = validate_observation_count(&observations, limits)?;
        let retained_capacity = match usize::try_from(limits.max_unique_events()) {
            Ok(limit) => observations.len().min(limit),
            Err(_) => observations.len(),
        };
        let mut progress = SuccessorRecoveryProgress::new(self, retained_capacity);
        for (delivery_index, entry) in observations.into_iter().enumerate() {
            let delivery_index = u64::try_from(delivery_index).map_err(|_| {
                LocalLogRecoveryError::CounterOverflow {
                    delivery_index: None,
                    counter: LocalLogRecoveryCounter::Observations,
                }
            })?;
            progress.observe(delivery_index, entry, limits)?;
        }
        Ok(progress.finish(observation_count))
    }
}

impl SuccessorRecoveryProgress {
    fn new(anchor: LocalLogCheckpointAnchor, retained_capacity: usize) -> Self {
        let parts = anchor.into_parts();
        let covered_through = parts.checkpoint_covered_through;
        let next_sequence = match covered_through {
            None => Some(LocalLogSequence::FIRST),
            Some(sequence) => sequence.successor().ok(),
        };
        Self {
            parts,
            active_replay_index: BTreeMap::new(),
            active_entries: Vec::with_capacity(retained_capacity),
            unique_event_count: 0,
            exact_duplicate_count: 0,
            applied_operation_count: 0,
            covered_through,
            next_sequence,
        }
    }

    fn observe(
        &mut self,
        delivery_index: u64,
        entry: LocalLogEntry,
        limits: LocalLogRecoveryLimits,
    ) -> Result<(), LocalLogRecoveryError> {
        self.validate_membership(delivery_index, &entry)?;
        self.reject_compacted_replay(delivery_index, &entry)?;
        if self.is_exact_active_duplicate(delivery_index, &entry)? {
            return Ok(());
        }
        self.validate_sequence(delivery_index, &entry)?;
        let attempted_unique = self.charge_unique(delivery_index, limits)?;
        let attempted_operations = self.charge_operations(delivery_index, &entry, limits)?;
        entry
            .event()
            .apply_to_session(&mut self.parts.session)
            .map_err(|source| LocalLogRecoveryError::EventApplication { delivery_index, source })?;
        self.retain(delivery_index, entry, attempted_unique, attempted_operations);
        Ok(())
    }

    fn validate_membership(
        &self,
        delivery_index: u64,
        entry: &LocalLogEntry,
    ) -> Result<(), LocalLogRecoveryError> {
        if entry.session_id() != &self.parts.session_id {
            return Err(LocalLogRecoveryError::SessionMismatch {
                delivery_index,
                expected: self.parts.session_id.clone(),
                actual: entry.session_id().clone(),
            });
        }
        if entry.log_id() != &self.parts.successor_log_id {
            return Err(LocalLogRecoveryError::ActiveLogMismatch {
                delivery_index,
                expected: self.parts.successor_log_id.clone(),
                actual: entry.log_id().clone(),
            });
        }
        Ok(())
    }

    fn reject_compacted_replay(
        &self,
        delivery_index: u64,
        entry: &LocalLogEntry,
    ) -> Result<(), LocalLogRecoveryError> {
        let Some(checkpoint_sequence) = self.parts.compacted_replays.get(entry.replay_id()) else {
            return Ok(());
        };
        Err(LocalLogRecoveryError::CompactedReplayId {
            delivery_index,
            replay_id: entry.replay_id().clone(),
            checkpoint_sequence: *checkpoint_sequence,
        })
    }

    fn is_exact_active_duplicate(
        &mut self,
        delivery_index: u64,
        entry: &LocalLogEntry,
    ) -> Result<bool, LocalLogRecoveryError> {
        let Some((first_delivery_index, entry_index)) =
            self.active_replay_index.get(entry.replay_id())
        else {
            return Ok(false);
        };
        let Some(first_entry) = self.active_entries.get(*entry_index) else {
            return Err(LocalLogRecoveryError::CounterOverflow {
                delivery_index: Some(delivery_index),
                counter: LocalLogRecoveryCounter::UniqueEvents,
            });
        };
        if !first_entry.same_replay_binding(entry) {
            return Err(LocalLogRecoveryError::ReplayConflict {
                first_delivery_index: *first_delivery_index,
                delivery_index,
                replay_id: entry.replay_id().clone(),
            });
        }
        self.exact_duplicate_count = self.exact_duplicate_count.checked_add(1).ok_or(
            LocalLogRecoveryError::CounterOverflow {
                delivery_index: Some(delivery_index),
                counter: LocalLogRecoveryCounter::ExactDuplicates,
            },
        )?;
        Ok(true)
    }

    fn validate_sequence(
        &self,
        delivery_index: u64,
        entry: &LocalLogEntry,
    ) -> Result<(), LocalLogRecoveryError> {
        let expected = self.next_sequence.ok_or(LocalLogRecoveryError::SequenceExhausted {
            delivery_index,
            covered_through: LocalLogSequence::MAX,
        })?;
        if entry.sequence() != expected {
            return Err(LocalLogRecoveryError::UnexpectedSequence {
                delivery_index,
                expected,
                actual: entry.sequence(),
            });
        }
        Ok(())
    }

    fn charge_unique(
        &self,
        delivery_index: u64,
        limits: LocalLogRecoveryLimits,
    ) -> Result<u64, LocalLogRecoveryError> {
        let attempted = self.unique_event_count.checked_add(1).ok_or(
            LocalLogRecoveryError::CounterOverflow {
                delivery_index: Some(delivery_index),
                counter: LocalLogRecoveryCounter::UniqueEvents,
            },
        )?;
        if attempted > limits.max_unique_events() {
            return Err(LocalLogRecoveryError::UniqueEventLimit {
                delivery_index,
                attempted,
                maximum: limits.max_unique_events(),
            });
        }
        Ok(attempted)
    }

    fn charge_operations(
        &self,
        delivery_index: u64,
        entry: &LocalLogEntry,
        limits: LocalLogRecoveryLimits,
    ) -> Result<u64, LocalLogRecoveryError> {
        let event_operations =
            u64::try_from(entry.event().authoritative_operation_count(&self.parts.session))
                .map_err(|_| LocalLogRecoveryError::CounterOverflow {
                    delivery_index: Some(delivery_index),
                    counter: LocalLogRecoveryCounter::AppliedOperations,
                })?;
        let attempted = self.applied_operation_count.checked_add(event_operations).ok_or(
            LocalLogRecoveryError::CounterOverflow {
                delivery_index: Some(delivery_index),
                counter: LocalLogRecoveryCounter::AppliedOperations,
            },
        )?;
        if attempted > limits.max_applied_operations() {
            return Err(LocalLogRecoveryError::AppliedOperationLimit {
                delivery_index,
                attempted,
                maximum: limits.max_applied_operations(),
            });
        }
        Ok(attempted)
    }

    fn retain(
        &mut self,
        delivery_index: u64,
        entry: LocalLogEntry,
        unique_event_count: u64,
        applied_operation_count: u64,
    ) {
        let sequence = entry.sequence();
        let entry_index = self.active_entries.len();
        self.active_replay_index.insert(entry.replay_id().clone(), (delivery_index, entry_index));
        self.active_entries.push(entry);
        self.unique_event_count = unique_event_count;
        self.applied_operation_count = applied_operation_count;
        self.covered_through = Some(sequence);
        self.next_sequence = sequence.successor().ok();
    }

    fn finish(self, observation_count: u64) -> ContinuedLocalLog {
        let retained_index = self
            .active_replay_index
            .into_iter()
            .map(|(replay_id, (_, entry_index))| (replay_id, entry_index))
            .collect();
        ContinuedLocalLog::new(
            self.parts.session_id,
            self.parts.checkpoint_log_id,
            self.parts.successor_log_id,
            self.parts.session,
            self.parts.compacted_replays,
            self.active_entries.into_boxed_slice(),
            retained_index,
            observation_count,
            self.unique_event_count,
            self.exact_duplicate_count,
            self.applied_operation_count,
            self.parts.checkpoint_covered_through,
            self.covered_through,
            self.next_sequence,
        )
    }
}

fn validate_observation_count(
    observations: &[LocalLogEntry],
    limits: LocalLogRecoveryLimits,
) -> Result<u64, LocalLogRecoveryError> {
    let observation_count =
        u64::try_from(observations.len()).map_err(|_| LocalLogRecoveryError::CounterOverflow {
            delivery_index: None,
            counter: LocalLogRecoveryCounter::Observations,
        })?;
    if observation_count > limits.max_observations() {
        return Err(LocalLogRecoveryError::ObservationLimit {
            actual: observation_count,
            maximum: limits.max_observations(),
        });
    }
    Ok(observation_count)
}
