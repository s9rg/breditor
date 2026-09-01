use thiserror::Error;

use super::LocalLogId;

/// Stable category for one failed local-log checkpoint compaction.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogCompactionErrorCode {
    /// A checkpoint transition reused the generation it was sealing.
    GenerationNotAdvanced,
    /// A repeated transition reused the immediately preceding generation.
    KnownGenerationReuse,
    /// The cumulative replay-tombstone count could not fit in `u64`.
    ReplayTombstoneCountOverflow,
    /// The cumulative replay-tombstone count exceeds host policy.
    ReplayTombstoneLimit,
    /// An owned log violated an internal replay/sequence invariant.
    InvalidReplayTopology,
}

impl LocalLogCompactionErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::GenerationNotAdvanced => "local_log_compaction.generation_not_advanced",
            Self::KnownGenerationReuse => "local_log_compaction.known_generation_reuse",
            Self::ReplayTombstoneCountOverflow => {
                "local_log_compaction.replay_tombstone_count_overflow"
            }
            Self::ReplayTombstoneLimit => "local_log_compaction.replay_tombstone_limit",
            Self::InvalidReplayTopology => "local_log_compaction.invalid_replay_topology",
        }
    }
}

/// Why one consuming local-log compaction could not publish a checkpoint.
///
/// The error never contains a session, entry, event, replay identity, or
/// document content. [`super::LocalLogCompactionFailure`] carries this error
/// beside the unchanged log owner without formatting that owner.
#[non_exhaustive]
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum LocalLogCompactionError {
    /// A checkpoint tried to continue in the generation it had just sealed.
    #[error(
        "local-log checkpoint generation {checkpoint_log_id} must advance to a distinct successor; received {successor_log_id}"
    )]
    GenerationNotAdvanced {
        /// Active generation being sealed.
        checkpoint_log_id: LocalLogId,
        /// Rejected equal successor generation.
        successor_log_id: LocalLogId,
    },
    /// A repeated checkpoint tried to recycle the predecessor generation.
    ///
    /// Only the current and immediately preceding generation identities remain
    /// represented at this boundary. Lifetime uniqueness beyond those two IDs
    /// is a host/storage obligation.
    #[error("local-log successor generation reuses the immediately preceding generation")]
    KnownGenerationReuse,
    /// Fixed-width cumulative replay accounting overflowed.
    #[error("local-log replay tombstone count cannot be represented as u64")]
    ReplayTombstoneCountOverflow,
    /// The complete lifetime tombstone set would exceed host policy.
    #[error(
        "local-log compaction would retain {attempted} replay tombstones ({compacted} compacted plus {active} active); the maximum is {maximum}"
    )]
    ReplayTombstoneLimit {
        /// Replay tombstones retained from earlier generations.
        compacted: u64,
        /// First-seen events in the active generation.
        active: u64,
        /// Complete cumulative tombstone count after compaction.
        attempted: u64,
        /// Host-selected lifetime maximum.
        maximum: u64,
    },
    /// A privately owned log contradicted its replay/sequence topology.
    ///
    /// Public recovery and checkpoint decoding construct only valid owners, so
    /// this indicates an internal defect rather than malformed caller input.
    #[error("local-log compaction found an invalid owned replay topology")]
    InvalidReplayTopology,
}

impl LocalLogCompactionError {
    /// Returns the stable machine-readable error category.
    #[must_use]
    pub const fn code(&self) -> LocalLogCompactionErrorCode {
        match self {
            Self::GenerationNotAdvanced { .. } => {
                LocalLogCompactionErrorCode::GenerationNotAdvanced
            }
            Self::KnownGenerationReuse => LocalLogCompactionErrorCode::KnownGenerationReuse,
            Self::ReplayTombstoneCountOverflow => {
                LocalLogCompactionErrorCode::ReplayTombstoneCountOverflow
            }
            Self::ReplayTombstoneLimit { .. } => LocalLogCompactionErrorCode::ReplayTombstoneLimit,
            Self::InvalidReplayTopology => LocalLogCompactionErrorCode::InvalidReplayTopology,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::LocalLogCompactionErrorCode;

    #[test]
    fn compaction_error_codes_are_stable() {
        let cases = [
            (
                LocalLogCompactionErrorCode::GenerationNotAdvanced,
                "local_log_compaction.generation_not_advanced",
            ),
            (
                LocalLogCompactionErrorCode::ReplayTombstoneCountOverflow,
                "local_log_compaction.replay_tombstone_count_overflow",
            ),
            (
                LocalLogCompactionErrorCode::KnownGenerationReuse,
                "local_log_compaction.known_generation_reuse",
            ),
            (
                LocalLogCompactionErrorCode::ReplayTombstoneLimit,
                "local_log_compaction.replay_tombstone_limit",
            ),
            (
                LocalLogCompactionErrorCode::InvalidReplayTopology,
                "local_log_compaction.invalid_replay_topology",
            ),
        ];
        for (code, expected) in cases {
            assert_eq!(code.as_str(), expected);
        }
    }
}
