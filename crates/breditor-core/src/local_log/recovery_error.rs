use thiserror::Error;

use super::{
    LocalLogEventApplicationError, LocalLogId, LocalLogSequence, LocalSessionId, ReplayId,
};

/// Stable category for one failed genesis or checkpoint-linked local-log recovery.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogRecoveryErrorCode {
    /// Physical observations exceed the host admission limit.
    ObservationLimit,
    /// The supplied initial session has retained or behaviorally active history.
    NonEmptyInitialHistory,
    /// A fixed-width recovery counter cannot advance.
    CounterOverflow,
    /// One entry names another durable session.
    SessionMismatch,
    /// One entry names another append generation.
    ActiveLogMismatch,
    /// A checkpoint transition reused its sealed generation identity.
    GenerationNotAdvanced,
    /// A successor entry reused an identity whose full proof was compacted.
    CompactedReplayId,
    /// First-seen logical events exceed the host admission limit.
    UniqueEventLimit,
    /// Aggregate applied operations exceed the host admission limit.
    AppliedOperationLimit,
    /// A first-seen event is not at the exact next sequence.
    UnexpectedSequence,
    /// A new event follows sequence `u64::MAX`.
    SequenceExhausted,
    /// One replay ID is bound to two different logical entries.
    ReplayConflict,
    /// One structurally valid event cannot apply to the staged session.
    EventApplication,
}

impl LocalLogRecoveryErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ObservationLimit => "local_log_recovery.observation_limit",
            Self::NonEmptyInitialHistory => "local_log_recovery.non_empty_initial_history",
            Self::CounterOverflow => "local_log_recovery.counter_overflow",
            Self::SessionMismatch => "local_log_recovery.session_mismatch",
            Self::ActiveLogMismatch => "local_log_recovery.active_log_mismatch",
            Self::GenerationNotAdvanced => "local_log_recovery.generation_not_advanced",
            Self::CompactedReplayId => "local_log_recovery.compacted_replay_id",
            Self::UniqueEventLimit => "local_log_recovery.unique_event_limit",
            Self::AppliedOperationLimit => "local_log_recovery.applied_operation_limit",
            Self::UnexpectedSequence => "local_log_recovery.unexpected_sequence",
            Self::SequenceExhausted => "local_log_recovery.sequence_exhausted",
            Self::ReplayConflict => "local_log_recovery.replay_conflict",
            Self::EventApplication => "local_log_recovery.event_application",
        }
    }
}

/// Fixed-width recovery counter that could not advance.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogRecoveryCounter {
    /// Physical input position or count.
    Observations,
    /// First-seen logical event count.
    UniqueEvents,
    /// Aggregate applied forward-operation count.
    AppliedOperations,
    /// Exact duplicate count.
    ExactDuplicates,
}

impl LocalLogRecoveryCounter {
    /// Returns the stable lower-camel-case counter name.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Observations => "observations",
            Self::UniqueEvents => "uniqueEvents",
            Self::AppliedOperations => "appliedOperations",
            Self::ExactDuplicates => "exactDuplicates",
        }
    }
}

/// Why one owned local-log recovery could not publish a session.
///
/// The error never returns the consumed session and never retains an entry,
/// event, commit, editor state, operation guard, or document-bearing session
/// error. A failed recovery therefore cannot expose its privately applied
/// prefix through this API.
#[non_exhaustive]
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum LocalLogRecoveryError {
    /// Physical inputs exceed the host-selected ceiling.
    #[error("local-log recovery has {actual} observations; the maximum is {maximum}")]
    ObservationLimit {
        /// Complete physical input count, including exact duplicates.
        actual: u64,
        /// Host-selected maximum.
        maximum: u64,
    },
    /// Genesis recovery was given a session with retained or active history.
    #[error(
        "genesis local-log recovery requires no retained or active history; found undo depth {undo_depth} and redo depth {redo_depth}"
    )]
    NonEmptyInitialHistory {
        /// Initially undoable entry count.
        undo_depth: u32,
        /// Initially redoable entry count.
        redo_depth: u32,
    },
    /// One fixed-width counter could not represent its successor.
    #[error("local-log recovery counter {counter:?} overflowed at observation {delivery_index:?}")]
    CounterOverflow {
        /// Physical zero-based input index when one exists.
        delivery_index: Option<u64>,
        /// Counter that could not advance.
        counter: LocalLogRecoveryCounter,
    },
    /// An entry belongs to another durable session.
    #[error(
        "local-log observation {delivery_index} belongs to session {actual}; expected {expected}"
    )]
    SessionMismatch {
        /// Physical zero-based input index.
        delivery_index: u64,
        /// Expected durable session identity.
        expected: LocalSessionId,
        /// Rejected durable session identity.
        actual: LocalSessionId,
    },
    /// An entry belongs to another append generation.
    #[error(
        "local-log observation {delivery_index} belongs to log {actual}; expected active log {expected}"
    )]
    ActiveLogMismatch {
        /// Physical zero-based input index.
        delivery_index: u64,
        /// Expected active append generation.
        expected: LocalLogId,
        /// Rejected append generation.
        actual: LocalLogId,
    },
    /// A checkpoint tried to continue in the generation it had just sealed.
    #[error(
        "local-log checkpoint generation {checkpoint_log_id} must advance to a distinct successor; received {successor_log_id}"
    )]
    GenerationNotAdvanced {
        /// Sealed checkpoint generation.
        checkpoint_log_id: LocalLogId,
        /// Rejected equal successor generation.
        successor_log_id: LocalLogId,
    },
    /// A successor entry reused a replay ID whose full event proof was compacted.
    #[error(
        "local-log observation {delivery_index} reuses compacted replay ID {replay_id} from sequence {original_sequence}"
    )]
    CompactedReplayId {
        /// Physical zero-based successor input index.
        delivery_index: u64,
        /// Reused session-scoped replay identity.
        replay_id: ReplayId,
        /// Original sequence retained by the checkpoint tombstone.
        original_sequence: LocalLogSequence,
    },
    /// First-seen events exceed the host-selected ceiling.
    #[error(
        "local-log observation {delivery_index} would raise unique events to {attempted}; the maximum is {maximum}"
    )]
    UniqueEventLimit {
        /// Physical zero-based input index.
        delivery_index: u64,
        /// First-seen event count after accepting this event.
        attempted: u64,
        /// Host-selected maximum.
        maximum: u64,
    },
    /// Aggregate applied operations exceed the host-selected ceiling.
    #[error(
        "local-log observation {delivery_index} would raise applied operations to {attempted}; the maximum is {maximum}"
    )]
    AppliedOperationLimit {
        /// Physical zero-based input index.
        delivery_index: u64,
        /// Aggregate operation count after accepting this event.
        attempted: u64,
        /// Host-selected maximum.
        maximum: u64,
    },
    /// A first-seen event is not at the exact next logical position.
    #[error("local-log observation {delivery_index} has sequence {actual}; expected {expected}")]
    UnexpectedSequence {
        /// Physical zero-based input index.
        delivery_index: u64,
        /// Exact next session-global sequence.
        expected: LocalLogSequence,
        /// Rejected sequence.
        actual: LocalLogSequence,
    },
    /// An unseen event follows the final representable logical sequence.
    ///
    /// Successor recovery uses this when a checkpoint has no next sequence. It
    /// is unreachable from genesis recovery because the complete physical
    /// observation count must first fit `u64`.
    #[error(
        "local-log observation {delivery_index} cannot follow exhausted sequence {covered_through}"
    )]
    SequenceExhausted {
        /// Physical zero-based input index.
        delivery_index: u64,
        /// Final representable accepted sequence.
        covered_through: LocalLogSequence,
    },
    /// One replay identity names a different logical entry.
    #[error(
        "local-log replay ID {replay_id} conflicts between observations {first_delivery_index} and {delivery_index}"
    )]
    ReplayConflict {
        /// First physical input carrying this replay identity.
        first_delivery_index: u64,
        /// Conflicting physical zero-based input index.
        delivery_index: u64,
        /// Conflicting session-scoped replay identity.
        replay_id: ReplayId,
    },
    /// One event could not apply to the privately owned working session.
    #[error("local-log observation {delivery_index} could not apply: {source}")]
    EventApplication {
        /// Physical zero-based input index.
        delivery_index: u64,
        /// Payload-free exact application failure.
        #[source]
        source: LocalLogEventApplicationError,
    },
}

impl LocalLogRecoveryError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogRecoveryErrorCode {
        match self {
            Self::ObservationLimit { .. } => LocalLogRecoveryErrorCode::ObservationLimit,
            Self::NonEmptyInitialHistory { .. } => {
                LocalLogRecoveryErrorCode::NonEmptyInitialHistory
            }
            Self::CounterOverflow { .. } => LocalLogRecoveryErrorCode::CounterOverflow,
            Self::SessionMismatch { .. } => LocalLogRecoveryErrorCode::SessionMismatch,
            Self::ActiveLogMismatch { .. } => LocalLogRecoveryErrorCode::ActiveLogMismatch,
            Self::GenerationNotAdvanced { .. } => LocalLogRecoveryErrorCode::GenerationNotAdvanced,
            Self::CompactedReplayId { .. } => LocalLogRecoveryErrorCode::CompactedReplayId,
            Self::UniqueEventLimit { .. } => LocalLogRecoveryErrorCode::UniqueEventLimit,
            Self::AppliedOperationLimit { .. } => LocalLogRecoveryErrorCode::AppliedOperationLimit,
            Self::UnexpectedSequence { .. } => LocalLogRecoveryErrorCode::UnexpectedSequence,
            Self::SequenceExhausted { .. } => LocalLogRecoveryErrorCode::SequenceExhausted,
            Self::ReplayConflict { .. } => LocalLogRecoveryErrorCode::ReplayConflict,
            Self::EventApplication { .. } => LocalLogRecoveryErrorCode::EventApplication,
        }
    }

    /// Returns the physical zero-based input index when the failure has one.
    #[must_use]
    pub const fn delivery_index(&self) -> Option<u64> {
        match self {
            Self::ObservationLimit { .. }
            | Self::NonEmptyInitialHistory { .. }
            | Self::GenerationNotAdvanced { .. } => None,
            Self::CounterOverflow { delivery_index, .. } => *delivery_index,
            Self::SessionMismatch { delivery_index, .. }
            | Self::ActiveLogMismatch { delivery_index, .. }
            | Self::CompactedReplayId { delivery_index, .. }
            | Self::UniqueEventLimit { delivery_index, .. }
            | Self::AppliedOperationLimit { delivery_index, .. }
            | Self::UnexpectedSequence { delivery_index, .. }
            | Self::SequenceExhausted { delivery_index, .. }
            | Self::ReplayConflict { delivery_index, .. }
            | Self::EventApplication { delivery_index, .. } => Some(*delivery_index),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{LocalLogRecoveryCounter, LocalLogRecoveryErrorCode};

    #[test]
    fn recovery_error_codes_are_stable() {
        let cases = [
            (LocalLogRecoveryErrorCode::ObservationLimit, "local_log_recovery.observation_limit"),
            (
                LocalLogRecoveryErrorCode::NonEmptyInitialHistory,
                "local_log_recovery.non_empty_initial_history",
            ),
            (LocalLogRecoveryErrorCode::CounterOverflow, "local_log_recovery.counter_overflow"),
            (LocalLogRecoveryErrorCode::SessionMismatch, "local_log_recovery.session_mismatch"),
            (
                LocalLogRecoveryErrorCode::ActiveLogMismatch,
                "local_log_recovery.active_log_mismatch",
            ),
            (
                LocalLogRecoveryErrorCode::GenerationNotAdvanced,
                "local_log_recovery.generation_not_advanced",
            ),
            (
                LocalLogRecoveryErrorCode::CompactedReplayId,
                "local_log_recovery.compacted_replay_id",
            ),
            (LocalLogRecoveryErrorCode::UniqueEventLimit, "local_log_recovery.unique_event_limit"),
            (
                LocalLogRecoveryErrorCode::AppliedOperationLimit,
                "local_log_recovery.applied_operation_limit",
            ),
            (
                LocalLogRecoveryErrorCode::UnexpectedSequence,
                "local_log_recovery.unexpected_sequence",
            ),
            (LocalLogRecoveryErrorCode::SequenceExhausted, "local_log_recovery.sequence_exhausted"),
            (LocalLogRecoveryErrorCode::ReplayConflict, "local_log_recovery.replay_conflict"),
            (LocalLogRecoveryErrorCode::EventApplication, "local_log_recovery.event_application"),
        ];
        for (code, expected) in cases {
            assert_eq!(code.as_str(), expected);
        }
    }

    #[test]
    fn recovery_counter_names_are_stable() {
        let cases = [
            (LocalLogRecoveryCounter::Observations, "observations"),
            (LocalLogRecoveryCounter::UniqueEvents, "uniqueEvents"),
            (LocalLogRecoveryCounter::AppliedOperations, "appliedOperations"),
            (LocalLogRecoveryCounter::ExactDuplicates, "exactDuplicates"),
        ];
        for (counter, expected) in cases {
            assert_eq!(counter.as_str(), expected);
        }
    }
}
