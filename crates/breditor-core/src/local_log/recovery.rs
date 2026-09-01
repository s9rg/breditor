use std::collections::BTreeMap;

use crate::session::EditorSession;

use super::{
    LocalLogEntry, LocalLogId, LocalLogRecoveryCounter, LocalLogRecoveryError,
    LocalLogRecoveryLimits, LocalLogSequence, LocalSessionId, RecoveredLocalLog, ReplayId,
};

/// Deterministic, bounded recovery boundary for a local log from genesis.
///
/// One recovery owns the supplied session while it verifies and applies every
/// physical observation. It accepts only one session ID, one uncompacted log
/// generation, and a contiguous logical sequence beginning at one. Exact
/// semantic redeliveries are skipped; conflicting reuse of a replay ID fails.
/// No partially changed session is returned on any recoverable error.
///
/// The initial session must have empty history. Its exact current state,
/// context, and history capacity are the caller-authoritative genesis boundary.
/// “Genesis” refers to log sequence one, not editor revision zero. The recovery
/// authenticates none of these inputs and performs no storage I/O.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogRecovery {
    session_id: LocalSessionId,
    active_log_id: LocalLogId,
    limits: LocalLogRecoveryLimits,
}

struct RecoveryProgress {
    session: EditorSession,
    replay_index: BTreeMap<ReplayId, (u64, usize)>,
    entries: Vec<LocalLogEntry>,
    unique_event_count: u64,
    exact_duplicate_count: u64,
    applied_operation_count: u64,
    covered_through: Option<LocalLogSequence>,
    next_sequence: Option<LocalLogSequence>,
}

impl LocalLogRecovery {
    /// Creates a genesis recovery boundary with conservative aggregate limits.
    #[must_use]
    pub fn new(session_id: LocalSessionId, active_log_id: LocalLogId) -> Self {
        Self { session_id, active_log_id, limits: LocalLogRecoveryLimits::default() }
    }

    /// Replaces the host-authoritative aggregate recovery policy.
    #[must_use]
    pub const fn with_limits(mut self, limits: LocalLogRecoveryLimits) -> Self {
        self.limits = limits;
        self
    }

    /// Returns the durable session identity required on every entry.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        &self.session_id
    }

    /// Returns the one uncompacted append generation required on every entry.
    #[must_use]
    pub const fn active_log_id(&self) -> &LocalLogId {
        &self.active_log_id
    }

    /// Returns the complete host-authoritative aggregate resource policy.
    #[must_use]
    pub const fn limits(&self) -> LocalLogRecoveryLimits {
        self.limits
    }

    /// Verifies and applies a complete genesis-anchored batch atomically.
    ///
    /// `observations` may contain exact semantic retries. Every first-seen
    /// logical event must occupy the next sequence beginning at
    /// [`LocalLogSequence::FIRST`]. On success, the result retains all unique
    /// entries and their replay index. On failure, this method returns no
    /// session; the owned working session and any applied prefix are dropped.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogRecoveryError`] for resource-limit, nonempty initial
    /// history, membership, ordering, replay-conflict, or event-application
    /// failures.
    pub fn recover(
        &self,
        session: EditorSession,
        observations: Vec<LocalLogEntry>,
    ) -> Result<RecoveredLocalLog, LocalLogRecoveryError> {
        let observation_count = self.validate_batch(&session, &observations)?;
        let retained_capacity = match usize::try_from(self.limits.max_unique_events()) {
            Ok(limit) => observations.len().min(limit),
            Err(_) => observations.len(),
        };
        let mut progress = RecoveryProgress::new(session, retained_capacity);
        for (delivery_index, entry) in observations.into_iter().enumerate() {
            let delivery_index = u64::try_from(delivery_index).map_err(|_| {
                LocalLogRecoveryError::CounterOverflow {
                    delivery_index: None,
                    counter: LocalLogRecoveryCounter::Observations,
                }
            })?;
            progress.observe(self, delivery_index, entry)?;
        }
        Ok(progress.finish(self, observation_count))
    }

    fn validate_batch(
        &self,
        session: &EditorSession,
        observations: &[LocalLogEntry],
    ) -> Result<u64, LocalLogRecoveryError> {
        let observation_count = u64::try_from(observations.len()).map_err(|_| {
            LocalLogRecoveryError::CounterOverflow {
                delivery_index: None,
                counter: LocalLogRecoveryCounter::Observations,
            }
        })?;
        if observation_count > self.limits.max_observations() {
            return Err(LocalLogRecoveryError::ObservationLimit {
                actual: observation_count,
                maximum: self.limits.max_observations(),
            });
        }
        let undo_depth = session.undo_depth();
        let redo_depth = session.redo_depth();
        if !session.has_genesis_empty_history() {
            return Err(LocalLogRecoveryError::NonEmptyInitialHistory { undo_depth, redo_depth });
        }
        Ok(observation_count)
    }

    fn validate_membership(
        &self,
        delivery_index: u64,
        entry: &LocalLogEntry,
    ) -> Result<(), LocalLogRecoveryError> {
        if entry.session_id() != &self.session_id {
            return Err(LocalLogRecoveryError::SessionMismatch {
                delivery_index,
                expected: self.session_id.clone(),
                actual: entry.session_id().clone(),
            });
        }
        if entry.log_id() != &self.active_log_id {
            return Err(LocalLogRecoveryError::ActiveLogMismatch {
                delivery_index,
                expected: self.active_log_id.clone(),
                actual: entry.log_id().clone(),
            });
        }
        Ok(())
    }
}

impl RecoveryProgress {
    fn new(session: EditorSession, retained_capacity: usize) -> Self {
        Self {
            session,
            replay_index: BTreeMap::new(),
            entries: Vec::with_capacity(retained_capacity),
            unique_event_count: 0,
            exact_duplicate_count: 0,
            applied_operation_count: 0,
            covered_through: None,
            next_sequence: Some(LocalLogSequence::FIRST),
        }
    }

    fn observe(
        &mut self,
        recovery: &LocalLogRecovery,
        delivery_index: u64,
        entry: LocalLogEntry,
    ) -> Result<(), LocalLogRecoveryError> {
        recovery.validate_membership(delivery_index, &entry)?;
        if self.is_exact_duplicate(delivery_index, &entry)? {
            return Ok(());
        }
        self.validate_sequence(delivery_index, &entry)?;
        let attempted_unique = self.charge_unique(recovery, delivery_index)?;
        let attempted_operations = self.charge_operations(recovery, delivery_index, &entry)?;
        entry
            .event()
            .apply_to_session(&mut self.session)
            .map_err(|source| LocalLogRecoveryError::EventApplication { delivery_index, source })?;
        self.retain(delivery_index, entry, attempted_unique, attempted_operations);
        Ok(())
    }

    fn is_exact_duplicate(
        &mut self,
        delivery_index: u64,
        entry: &LocalLogEntry,
    ) -> Result<bool, LocalLogRecoveryError> {
        let Some((first_delivery_index, entry_index)) = self.replay_index.get(entry.replay_id())
        else {
            return Ok(false);
        };
        let Some(first_entry) = self.entries.get(*entry_index) else {
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
        recovery: &LocalLogRecovery,
        delivery_index: u64,
    ) -> Result<u64, LocalLogRecoveryError> {
        let attempted = self.unique_event_count.checked_add(1).ok_or(
            LocalLogRecoveryError::CounterOverflow {
                delivery_index: Some(delivery_index),
                counter: LocalLogRecoveryCounter::UniqueEvents,
            },
        )?;
        if attempted > recovery.limits.max_unique_events() {
            return Err(LocalLogRecoveryError::UniqueEventLimit {
                delivery_index,
                attempted,
                maximum: recovery.limits.max_unique_events(),
            });
        }
        Ok(attempted)
    }

    fn charge_operations(
        &self,
        recovery: &LocalLogRecovery,
        delivery_index: u64,
        entry: &LocalLogEntry,
    ) -> Result<u64, LocalLogRecoveryError> {
        let event_operations = u64::try_from(
            entry.event().authoritative_operation_count(&self.session),
        )
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
        if attempted > recovery.limits.max_applied_operations() {
            return Err(LocalLogRecoveryError::AppliedOperationLimit {
                delivery_index,
                attempted,
                maximum: recovery.limits.max_applied_operations(),
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
        let entry_index = self.entries.len();
        self.replay_index.insert(entry.replay_id().clone(), (delivery_index, entry_index));
        self.entries.push(entry);
        self.unique_event_count = unique_event_count;
        self.applied_operation_count = applied_operation_count;
        self.covered_through = Some(sequence);
        self.next_sequence = sequence.successor().ok();
    }

    fn finish(self, recovery: &LocalLogRecovery, observation_count: u64) -> RecoveredLocalLog {
        let retained_index = self
            .replay_index
            .into_iter()
            .map(|(replay_id, (_, entry_index))| (replay_id, entry_index))
            .collect();
        RecoveredLocalLog::new(
            recovery.session_id.clone(),
            recovery.active_log_id.clone(),
            self.session,
            self.entries.into_boxed_slice(),
            retained_index,
            observation_count,
            self.unique_event_count,
            self.exact_duplicate_count,
            self.applied_operation_count,
            self.covered_through,
            self.next_sequence,
        )
    }
}
