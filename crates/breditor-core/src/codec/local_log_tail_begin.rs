use crate::local_log::{LocalLogCheckpointAnchor, LocalLogRecoveryLimits};

use super::{LocalLogFrameLimits, LocalLogTailCursor};

impl LocalLogCheckpointAnchor {
    /// Begins framed observation of this anchor's fresh successor tail.
    ///
    /// The transition consumes the anchor, begins one
    /// [`crate::local_log::ContinuedLocalLog`] under fixed semantic recovery
    /// limits, derives the frame context and trusted binding from that owner,
    /// and couples it to generation-relative byte offset zero. This is the
    /// primary proved cursor construction path.
    ///
    /// Starting reads no bytes, applies no event, and performs no storage I/O.
    #[must_use]
    pub fn begin_successor_tail(
        self,
        recovery_limits: LocalLogRecoveryLimits,
        frame_limits: LocalLogFrameLimits,
    ) -> LocalLogTailCursor {
        LocalLogTailCursor::from_fresh_owner(self.begin_successor(recovery_limits), frame_limits)
    }
}
