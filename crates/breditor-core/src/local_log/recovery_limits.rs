/// Default maximum physical local-log observations admitted by one phase.
pub const DEFAULT_LOCAL_LOG_RECOVERY_MAX_OBSERVATIONS: u64 = 10_000;

/// Default maximum first-seen logical events retained by one phase.
pub const DEFAULT_LOCAL_LOG_RECOVERY_MAX_UNIQUE_EVENTS: u64 = 10_000;

/// Default maximum operations applied across all first-seen events.
pub const DEFAULT_LOCAL_LOG_RECOVERY_MAX_APPLIED_OPERATIONS: u64 = 16_384;

/// Host-authoritative resource policy for one local-log admission phase.
///
/// Observations count every physical input, including exact retries. Unique
/// events count only the first occurrence of each replay ID. Applied operations
/// count an ordinary commit's durable forward recipe or an undo/redo event's
/// authoritative retained local recipe. Recovery charges history recipe size
/// before cloning or deriving it and separately requires the logged proof to
/// match. Control events contribute no operations. All limits may be zero.
/// Genesis recovery charges one complete batch. Checkpoint-linked successor
/// admission fixes one policy when the active owner begins and charges accepted
/// observations cumulatively across incremental calls; rejected attempts do
/// not consume it. Neither successor path recharges the already owned compacted
/// prefix.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalLogRecoveryLimits {
    observations: u64,
    unique_events: u64,
    applied_operations: u64,
}

impl LocalLogRecoveryLimits {
    /// Creates one complete explicit admission resource policy.
    #[must_use]
    pub const fn new(
        max_observations: u64,
        max_unique_events: u64,
        max_applied_operations: u64,
    ) -> Self {
        Self {
            observations: max_observations,
            unique_events: max_unique_events,
            applied_operations: max_applied_operations,
        }
    }

    /// Returns the maximum physical inputs, including exact duplicates.
    #[must_use]
    pub const fn max_observations(self) -> u64 {
        self.observations
    }

    /// Returns the maximum first-seen replay identities retained on success.
    #[must_use]
    pub const fn max_unique_events(self) -> u64 {
        self.unique_events
    }

    /// Returns the aggregate forward-operation ceiling for applied events.
    #[must_use]
    pub const fn max_applied_operations(self) -> u64 {
        self.applied_operations
    }

    /// Replaces the physical-observation ceiling.
    #[must_use]
    pub const fn with_max_observations(mut self, maximum: u64) -> Self {
        self.observations = maximum;
        self
    }

    /// Replaces the first-seen logical-event ceiling.
    #[must_use]
    pub const fn with_max_unique_events(mut self, maximum: u64) -> Self {
        self.unique_events = maximum;
        self
    }

    /// Replaces the aggregate applied-operation ceiling.
    #[must_use]
    pub const fn with_max_applied_operations(mut self, maximum: u64) -> Self {
        self.applied_operations = maximum;
        self
    }
}

impl Default for LocalLogRecoveryLimits {
    fn default() -> Self {
        Self {
            observations: DEFAULT_LOCAL_LOG_RECOVERY_MAX_OBSERVATIONS,
            unique_events: DEFAULT_LOCAL_LOG_RECOVERY_MAX_UNIQUE_EVENTS,
            applied_operations: DEFAULT_LOCAL_LOG_RECOVERY_MAX_APPLIED_OPERATIONS,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        DEFAULT_LOCAL_LOG_RECOVERY_MAX_APPLIED_OPERATIONS,
        DEFAULT_LOCAL_LOG_RECOVERY_MAX_OBSERVATIONS, DEFAULT_LOCAL_LOG_RECOVERY_MAX_UNIQUE_EVENTS,
        LocalLogRecoveryLimits,
    };

    #[test]
    fn defaults_are_fixed_width_and_each_limit_is_independent() {
        let defaults = LocalLogRecoveryLimits::default();
        assert_eq!(defaults.max_observations(), DEFAULT_LOCAL_LOG_RECOVERY_MAX_OBSERVATIONS);
        assert_eq!(defaults.max_unique_events(), DEFAULT_LOCAL_LOG_RECOVERY_MAX_UNIQUE_EVENTS);
        assert_eq!(
            defaults.max_applied_operations(),
            DEFAULT_LOCAL_LOG_RECOVERY_MAX_APPLIED_OPERATIONS
        );

        let disabled = LocalLogRecoveryLimits::new(0, 0, 0);
        assert_eq!(disabled.max_observations(), 0);
        assert_eq!(disabled.max_unique_events(), 0);
        assert_eq!(disabled.max_applied_operations(), 0);
    }
}
