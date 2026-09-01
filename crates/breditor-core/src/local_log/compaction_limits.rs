/// Default maximum replay tombstones retained across one local-log lifetime.
pub const DEFAULT_LOCAL_LOG_COMPACTION_MAX_REPLAY_TOMBSTONES: u64 = 10_000;

/// Host-authoritative lifetime policy for local-log checkpoint compaction.
///
/// The ceiling applies to the complete session-global replay tombstone set,
/// including every previously compacted generation and the active generation
/// being sealed. It is not a per-generation allowance. Hosts may choose a
/// different value at each transition, but a value below the already
/// represented lifetime count makes that transition fail closed. Ordinary
/// in-memory rotations inherit the selected value. A host can replace it only
/// through the explicitly named reauthorization transition; Local Log
/// Checkpoint V1 does not serialize it, and strict decode installs the codec
/// host's current replay-tombstone ceiling.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalLogCompactionLimits {
    replay_tombstones: u64,
}

impl LocalLogCompactionLimits {
    /// Creates one complete explicit compaction resource policy.
    #[must_use]
    pub const fn new(max_replay_tombstones: u64) -> Self {
        Self { replay_tombstones: max_replay_tombstones }
    }

    /// Returns the maximum cumulative replay tombstones after compaction.
    #[must_use]
    pub const fn max_replay_tombstones(self) -> u64 {
        self.replay_tombstones
    }

    /// Replaces the cumulative replay-tombstone ceiling.
    #[must_use]
    pub const fn with_max_replay_tombstones(mut self, maximum: u64) -> Self {
        self.replay_tombstones = maximum;
        self
    }
}

impl Default for LocalLogCompactionLimits {
    fn default() -> Self {
        Self::new(DEFAULT_LOCAL_LOG_COMPACTION_MAX_REPLAY_TOMBSTONES)
    }
}

#[cfg(test)]
mod tests {
    use super::{DEFAULT_LOCAL_LOG_COMPACTION_MAX_REPLAY_TOMBSTONES, LocalLogCompactionLimits};

    #[test]
    fn default_and_explicit_lifetime_limits_are_exact() {
        let defaults = LocalLogCompactionLimits::default();
        assert_eq!(
            defaults.max_replay_tombstones(),
            DEFAULT_LOCAL_LOG_COMPACTION_MAX_REPLAY_TOMBSTONES
        );
        assert_eq!(LocalLogCompactionLimits::new(0).max_replay_tombstones(), 0);
        assert_eq!(defaults.with_max_replay_tombstones(u64::MAX).max_replay_tombstones(), u64::MAX);
    }
}
