use std::fmt;

use crate::local_log::LocalLogCheckpointAnchor;

use super::LocalLogFrameLimits;

/// Result of compacting one active framed tail into its next checkpoint anchor.
///
/// The outcome keeps the semantic anchor coupled to the old generation's
/// cursor-authoritative accepted-prefix length and frame payload policy at the
/// instant compaction was requested. These two values are runtime host metadata;
/// they are not fields of Local Log Checkpoint V1 and do not prove storage EOF,
/// durability, or physical tail length. If the cursor came from
/// [`super::LocalLogTailCursor::from_trusted_parts`], the retained prefix has
/// exactly that same host-asserted provenance and compaction does not upgrade
/// it.
#[must_use = "the checkpoint anchor and accepted-prefix metadata must be handled together"]
pub struct LocalLogTailCompactionOutcome {
    anchor: LocalLogCheckpointAnchor,
    accepted_prefix_bytes: u64,
    frame_limits: LocalLogFrameLimits,
}

impl LocalLogTailCompactionOutcome {
    pub(super) const fn new(
        anchor: LocalLogCheckpointAnchor,
        accepted_prefix_bytes: u64,
        frame_limits: LocalLogFrameLimits,
    ) -> Self {
        Self { anchor, accepted_prefix_bytes, frame_limits }
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
    ///
    /// This policy is retained as host metadata only. Starting the anchor's new
    /// successor requires an explicit frame policy and does not inherit this
    /// value automatically.
    #[must_use]
    pub const fn frame_limits(&self) -> LocalLogFrameLimits {
        self.frame_limits
    }

    /// Separates the anchor from the old generation's accepted-prefix metadata.
    #[must_use]
    pub fn into_parts(self) -> (LocalLogCheckpointAnchor, u64, LocalLogFrameLimits) {
        (self.anchor, self.accepted_prefix_bytes, self.frame_limits)
    }
}

impl fmt::Debug for LocalLogTailCompactionOutcome {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogTailCompactionOutcome")
            .field("accepted_prefix_bytes", &self.accepted_prefix_bytes)
            .field("frame_limits", &self.frame_limits)
            .finish_non_exhaustive()
    }
}
