use super::SessionCheckpointLimits;
use crate::local_log::DEFAULT_LOCAL_LOG_COMPACTION_MAX_REPLAY_TOMBSTONES;

/// Default maximum complete replay tombstones retained by one checkpoint.
pub const DEFAULT_LOCAL_LOG_CHECKPOINT_MAX_REPLAY_TOMBSTONES: u64 =
    DEFAULT_LOCAL_LOG_COMPACTION_MAX_REPLAY_TOMBSTONES;

/// Host-authoritative resource limits for complete local-log checkpoints.
///
/// Tombstone retention is independent from session-history retention: control
/// events and history clearing can make those counts differ arbitrarily. The
/// wire record selects none of these ceilings. Decode also installs
/// `max_replay_tombstones` as the returned anchor's future runtime compaction
/// policy; it is host reauthorization, not a persisted ninth field.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalLogCheckpointLimits {
    max_replay_tombstones: u64,
    session_checkpoint: SessionCheckpointLimits,
}

impl LocalLogCheckpointLimits {
    /// Creates one complete explicit checkpoint admission policy.
    #[must_use]
    pub const fn new(
        max_replay_tombstones: u64,
        session_checkpoint: SessionCheckpointLimits,
    ) -> Self {
        Self { max_replay_tombstones, session_checkpoint }
    }

    /// Returns the greatest complete compacted replay set accepted and the
    /// runtime compaction ceiling installed by successful decode.
    #[must_use]
    pub const fn max_replay_tombstones(&self) -> u64 {
        self.max_replay_tombstones
    }

    /// Returns the nested bounded-session checkpoint policy.
    #[must_use]
    pub const fn session_checkpoint(&self) -> SessionCheckpointLimits {
        self.session_checkpoint
    }

    /// Sets the greatest complete compacted replay set accepted.
    #[must_use]
    pub const fn with_max_replay_tombstones(mut self, maximum: u64) -> Self {
        self.max_replay_tombstones = maximum;
        self
    }

    /// Sets the nested bounded-session checkpoint policy.
    #[must_use]
    pub const fn with_session_checkpoint(mut self, limits: SessionCheckpointLimits) -> Self {
        self.session_checkpoint = limits;
        self
    }
}

impl Default for LocalLogCheckpointLimits {
    fn default() -> Self {
        Self {
            max_replay_tombstones: DEFAULT_LOCAL_LOG_CHECKPOINT_MAX_REPLAY_TOMBSTONES,
            session_checkpoint: SessionCheckpointLimits::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        DEFAULT_LOCAL_LOG_CHECKPOINT_MAX_REPLAY_TOMBSTONES, LocalLogCheckpointLimits,
        SessionCheckpointLimits,
    };

    #[test]
    fn defaults_are_independent_and_conservative() {
        let limits = LocalLogCheckpointLimits::default();
        assert_eq!(
            limits.max_replay_tombstones(),
            DEFAULT_LOCAL_LOG_CHECKPOINT_MAX_REPLAY_TOMBSTONES
        );
        assert_eq!(limits.session_checkpoint(), SessionCheckpointLimits::default());
    }
}
