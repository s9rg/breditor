use std::fmt;

use crate::{local_log::LocalLogCheckpointAnchor, schema::DurableSchemaBinding};

use super::{LOCAL_LOG_FRAME_V3_FORMAT_VERSION, LocalLogFrameLimits};

/// Result of compacting one active Frame V3 tail into its next anchor.
///
/// The outcome keeps the semantic anchor coupled to the old generation's
/// accepted-prefix length, frame payload policy, exact durable schema binding,
/// and statically branded Frame V3 generation. It proves no storage EOF,
/// durability, sealing, or physical tail length.
///
/// V2 storage preparation cannot consume a V3 tail outcome:
///
/// ```compile_fail
/// use breditor_core::codec::{
///     LocalLogStorageRootJsonCodecV2, LocalLogStorageRootPreparationInputs,
///     LocalLogTailCompactionOutcomeV3,
/// };
/// fn cannot_prepare(
///     codec: &LocalLogStorageRootJsonCodecV2,
///     outcome: &LocalLogTailCompactionOutcomeV3,
///     inputs: &LocalLogStorageRootPreparationInputs,
/// ) {
///     let _ = codec.prepare_root(outcome, inputs);
/// }
/// ```
#[must_use = "the checkpoint anchor and Frame V3 metadata must be handled together"]
pub struct LocalLogTailCompactionOutcomeV3 {
    anchor: LocalLogCheckpointAnchor,
    accepted_prefix_bytes: u64,
    frame_limits: LocalLogFrameLimits,
    schema_binding: DurableSchemaBinding,
}

impl LocalLogTailCompactionOutcomeV3 {
    pub(super) const fn new(
        anchor: LocalLogCheckpointAnchor,
        accepted_prefix_bytes: u64,
        frame_limits: LocalLogFrameLimits,
        schema_binding: DurableSchemaBinding,
    ) -> Self {
        Self { anchor, accepted_prefix_bytes, frame_limits, schema_binding }
    }

    /// Returns the checkpoint anchor for the compacted generation.
    #[must_use]
    pub const fn anchor(&self) -> &LocalLogCheckpointAnchor {
        &self.anchor
    }

    /// Returns the old cursor's accepted-prefix length at compaction.
    #[must_use]
    pub const fn accepted_prefix_bytes(&self) -> u64 {
        self.accepted_prefix_bytes
    }

    /// Returns the frame payload policy used for the old generation.
    #[must_use]
    pub const fn frame_limits(&self) -> LocalLogFrameLimits {
        self.frame_limits
    }

    /// Returns the exact schema selector and fingerprint retained at compaction.
    #[must_use]
    pub const fn schema_binding(&self) -> &DurableSchemaBinding {
        &self.schema_binding
    }

    /// Returns the fixed binary frame generation represented by this outcome.
    #[must_use]
    pub const fn frame_format_version(&self) -> u16 {
        LOCAL_LOG_FRAME_V3_FORMAT_VERSION
    }

    /// Separates the anchor from the old Frame V3 generation's complete
    /// accepted-prefix metadata.
    #[must_use]
    pub fn into_parts(
        self,
    ) -> (LocalLogCheckpointAnchor, u64, LocalLogFrameLimits, DurableSchemaBinding) {
        (self.anchor, self.accepted_prefix_bytes, self.frame_limits, self.schema_binding)
    }
}

impl fmt::Debug for LocalLogTailCompactionOutcomeV3 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogTailCompactionOutcomeV3")
            .field("accepted_prefix_bytes", &self.accepted_prefix_bytes)
            .field("frame_limits", &self.frame_limits)
            .field("schema_binding", &self.schema_binding)
            .field("frame_format_version", &LOCAL_LOG_FRAME_V3_FORMAT_VERSION)
            .finish_non_exhaustive()
    }
}
