use crate::session::{DEFAULT_HISTORY_CAPACITY, HistoryCapacity};

/// Default maximum `historyCapacity` accepted from a session checkpoint.
pub const DEFAULT_SESSION_CHECKPOINT_MAX_HISTORY_CAPACITY: u32 = DEFAULT_HISTORY_CAPACITY;

/// Default maximum number of forward operations retained by all history entries.
pub const DEFAULT_SESSION_CHECKPOINT_MAX_AGGREGATE_FORWARD_OPERATIONS: u64 = 16_384;

/// Default maximum logical node count summed over all retained history boundaries.
pub const DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_NODES: u64 = 1_000_000;

/// Default maximum logical text bytes summed over all retained history boundaries.
pub const DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_TEXT_BYTES: u64 = 64 * 1024 * 1024;

/// Default maximum property values summed over all retained history boundaries.
pub const DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_PROPERTY_VALUES: u64 = 100_000;

/// Default property-string bytes summed over all retained history boundaries.
pub const DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_PROPERTY_STRING_BYTES: u64 = 64 * 1024 * 1024;

/// Host-authoritative resource limits for durable session checkpoints.
///
/// These limits are deliberately separate from [`crate::schema::DocumentLimits`].
/// A document limit bounds one valid state, while a session checkpoint can retain
/// many valid state boundaries and operation recipes. The wire record selects none
/// of these ceilings.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[allow(clippy::struct_field_names)]
pub struct SessionCheckpointLimits {
    max_history_capacity: HistoryCapacity,
    max_aggregate_forward_operations: u64,
    max_retained_nodes: u64,
    max_retained_text_bytes: u64,
    max_retained_property_values: u64,
    max_retained_property_string_bytes: u64,
}

impl SessionCheckpointLimits {
    /// Creates a checkpoint policy using the original explicit ceilings.
    ///
    /// The retained property-string-byte ceiling uses
    /// [`DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_PROPERTY_STRING_BYTES`]. Use
    /// [`Self::new_with_property_string_bytes`] when every ceiling must be explicit.
    #[must_use]
    pub const fn new(
        max_history_capacity: HistoryCapacity,
        max_aggregate_forward_operations: u64,
        max_retained_nodes: u64,
        max_retained_text_bytes: u64,
        max_retained_property_values: u64,
    ) -> Self {
        Self {
            max_history_capacity,
            max_aggregate_forward_operations,
            max_retained_nodes,
            max_retained_text_bytes,
            max_retained_property_values,
            max_retained_property_string_bytes:
                DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_PROPERTY_STRING_BYTES,
        }
    }

    /// Creates a complete explicit checkpoint resource policy.
    #[must_use]
    pub const fn new_with_property_string_bytes(
        max_history_capacity: HistoryCapacity,
        max_aggregate_forward_operations: u64,
        max_retained_nodes: u64,
        max_retained_text_bytes: u64,
        max_retained_property_values: u64,
        max_retained_property_string_bytes: u64,
    ) -> Self {
        Self {
            max_history_capacity,
            max_aggregate_forward_operations,
            max_retained_nodes,
            max_retained_text_bytes,
            max_retained_property_values,
            max_retained_property_string_bytes,
        }
    }

    /// Returns the greatest history capacity a wire checkpoint may install.
    #[must_use]
    pub const fn max_history_capacity(&self) -> HistoryCapacity {
        self.max_history_capacity
    }

    /// Returns the aggregate forward-operation ceiling across all entries.
    #[must_use]
    pub const fn max_aggregate_forward_operations(&self) -> u64 {
        self.max_aggregate_forward_operations
    }

    /// Returns the aggregate logical retained-node ceiling.
    #[must_use]
    pub const fn max_retained_nodes(&self) -> u64 {
        self.max_retained_nodes
    }

    /// Returns the aggregate logical retained-text-byte ceiling.
    #[must_use]
    pub const fn max_retained_text_bytes(&self) -> u64 {
        self.max_retained_text_bytes
    }

    /// Returns the aggregate logical retained-property-value ceiling.
    #[must_use]
    pub const fn max_retained_property_values(&self) -> u64 {
        self.max_retained_property_values
    }

    /// Returns the aggregate logical retained-property-string-byte ceiling.
    #[must_use]
    pub const fn max_retained_property_string_bytes(&self) -> u64 {
        self.max_retained_property_string_bytes
    }

    /// Sets the greatest history capacity a wire checkpoint may install.
    #[must_use]
    pub const fn with_max_history_capacity(mut self, maximum: HistoryCapacity) -> Self {
        self.max_history_capacity = maximum;
        self
    }

    /// Sets the aggregate forward-operation ceiling across all entries.
    #[must_use]
    pub const fn with_max_aggregate_forward_operations(mut self, maximum: u64) -> Self {
        self.max_aggregate_forward_operations = maximum;
        self
    }

    /// Sets the aggregate logical retained-node ceiling.
    #[must_use]
    pub const fn with_max_retained_nodes(mut self, maximum: u64) -> Self {
        self.max_retained_nodes = maximum;
        self
    }

    /// Sets the aggregate logical retained-text-byte ceiling.
    #[must_use]
    pub const fn with_max_retained_text_bytes(mut self, maximum: u64) -> Self {
        self.max_retained_text_bytes = maximum;
        self
    }

    /// Sets the aggregate logical retained-property-value ceiling.
    #[must_use]
    pub const fn with_max_retained_property_values(mut self, maximum: u64) -> Self {
        self.max_retained_property_values = maximum;
        self
    }

    /// Sets the aggregate logical retained-property-string-byte ceiling.
    #[must_use]
    pub const fn with_max_retained_property_string_bytes(mut self, maximum: u64) -> Self {
        self.max_retained_property_string_bytes = maximum;
        self
    }
}

impl Default for SessionCheckpointLimits {
    fn default() -> Self {
        Self {
            max_history_capacity: HistoryCapacity::default(),
            max_aggregate_forward_operations:
                DEFAULT_SESSION_CHECKPOINT_MAX_AGGREGATE_FORWARD_OPERATIONS,
            max_retained_nodes: DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_NODES,
            max_retained_text_bytes: DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_TEXT_BYTES,
            max_retained_property_values: DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_PROPERTY_VALUES,
            max_retained_property_string_bytes:
                DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_PROPERTY_STRING_BYTES,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        DEFAULT_SESSION_CHECKPOINT_MAX_AGGREGATE_FORWARD_OPERATIONS,
        DEFAULT_SESSION_CHECKPOINT_MAX_HISTORY_CAPACITY,
        DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_NODES,
        DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_PROPERTY_STRING_BYTES,
        DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_PROPERTY_VALUES,
        DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_TEXT_BYTES, SessionCheckpointLimits,
    };

    #[test]
    fn defaults_are_conservative_and_fixed_width() {
        let limits = SessionCheckpointLimits::default();

        assert_eq!(limits.max_history_capacity().get(), 100);
        assert_eq!(
            u64::from(DEFAULT_SESSION_CHECKPOINT_MAX_HISTORY_CAPACITY),
            u64::from(limits.max_history_capacity().get())
        );
        assert_eq!(
            limits.max_aggregate_forward_operations(),
            DEFAULT_SESSION_CHECKPOINT_MAX_AGGREGATE_FORWARD_OPERATIONS
        );
        assert_eq!(limits.max_retained_nodes(), DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_NODES);
        assert_eq!(
            limits.max_retained_text_bytes(),
            DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_TEXT_BYTES
        );
        assert_eq!(
            limits.max_retained_property_values(),
            DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_PROPERTY_VALUES
        );
        assert_eq!(
            limits.max_retained_property_string_bytes(),
            DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_PROPERTY_STRING_BYTES
        );
    }
}
