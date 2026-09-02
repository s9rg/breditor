use super::LocalLogCheckpointLimits;

/// Default maximum complete storage-generation manifest input bytes.
pub const DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_INPUT_BYTES: usize = 33_558_528;

/// Default maximum canonical storage-generation manifest output bytes.
pub const DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_OUTPUT_BYTES: usize = 33_558_528;

/// Default maximum decoded nested Checkpoint V1 JSON bytes.
pub const DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_CHECKPOINT_JSON_BYTES: usize = 16_777_216;

/// Host-authoritative resource policy for storage-generation manifests.
///
/// The whole-input, whole-output, and decoded nested-checkpoint ceilings are
/// independent. Nested semantic reconstruction additionally uses the complete
/// [`LocalLogCheckpointLimits`] policy and the codec's editor context.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalLogStorageGenerationLimits {
    max_input_bytes: usize,
    max_output_bytes: usize,
    max_checkpoint_json_bytes: usize,
    checkpoint: LocalLogCheckpointLimits,
}

impl LocalLogStorageGenerationLimits {
    /// Creates one complete explicit manifest admission policy.
    #[must_use]
    pub const fn new(
        max_input_bytes: usize,
        max_output_bytes: usize,
        max_checkpoint_json_bytes: usize,
        checkpoint: LocalLogCheckpointLimits,
    ) -> Self {
        Self { max_input_bytes, max_output_bytes, max_checkpoint_json_bytes, checkpoint }
    }

    /// Returns the maximum accepted complete input size.
    #[must_use]
    pub const fn max_input_bytes(self) -> usize {
        self.max_input_bytes
    }

    /// Returns the maximum produced canonical output size.
    #[must_use]
    pub const fn max_output_bytes(self) -> usize {
        self.max_output_bytes
    }

    /// Returns the maximum decoded UTF-8 size of `checkpointJson`.
    #[must_use]
    pub const fn max_checkpoint_json_bytes(self) -> usize {
        self.max_checkpoint_json_bytes
    }

    /// Returns the nested Local Log Checkpoint V1 policy.
    #[must_use]
    pub const fn checkpoint(self) -> LocalLogCheckpointLimits {
        self.checkpoint
    }

    /// Replaces the complete-input ceiling.
    #[must_use]
    pub const fn with_max_input_bytes(mut self, maximum: usize) -> Self {
        self.max_input_bytes = maximum;
        self
    }

    /// Replaces the canonical-output ceiling.
    #[must_use]
    pub const fn with_max_output_bytes(mut self, maximum: usize) -> Self {
        self.max_output_bytes = maximum;
        self
    }

    /// Replaces the decoded nested-checkpoint ceiling.
    #[must_use]
    pub const fn with_max_checkpoint_json_bytes(mut self, maximum: usize) -> Self {
        self.max_checkpoint_json_bytes = maximum;
        self
    }

    /// Replaces the nested Local Log Checkpoint V1 policy.
    #[must_use]
    pub const fn with_checkpoint(mut self, limits: LocalLogCheckpointLimits) -> Self {
        self.checkpoint = limits;
        self
    }
}

impl Default for LocalLogStorageGenerationLimits {
    fn default() -> Self {
        Self {
            max_input_bytes: DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_INPUT_BYTES,
            max_output_bytes: DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_OUTPUT_BYTES,
            max_checkpoint_json_bytes:
                DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_CHECKPOINT_JSON_BYTES,
            checkpoint: LocalLogCheckpointLimits::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_CHECKPOINT_JSON_BYTES,
        DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_INPUT_BYTES,
        DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_OUTPUT_BYTES, LocalLogStorageGenerationLimits,
    };

    #[test]
    fn independent_defaults_are_exact() {
        let limits = LocalLogStorageGenerationLimits::default();
        assert_eq!(limits.max_input_bytes(), DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_INPUT_BYTES);
        assert_eq!(
            limits.max_output_bytes(),
            DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_OUTPUT_BYTES
        );
        assert_eq!(
            limits.max_checkpoint_json_bytes(),
            DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_CHECKPOINT_JSON_BYTES
        );
    }
}
