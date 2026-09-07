use crate::local_log::{LocalLogCheckpointAnchor, LocalLogRecoveryLimits};

use super::{LocalLogFrameLimits, LocalLogTailCursorV2};

impl LocalLogCheckpointAnchor {
    /// Begins fingerprint-bound Frame V2 observation of this anchor's successor.
    ///
    /// The transition consumes the anchor, begins one semantic successor under
    /// fixed recovery limits, derives the schema/session/log bindings from that
    /// owner, and couples them to Frame V2 and byte offset zero. Starting reads
    /// no bytes, applies no event, and performs no storage I/O.
    #[must_use]
    pub fn begin_successor_tail_v2(
        self,
        recovery_limits: LocalLogRecoveryLimits,
        frame_limits: LocalLogFrameLimits,
    ) -> LocalLogTailCursorV2 {
        LocalLogTailCursorV2::from_fresh_owner(self.begin_successor(recovery_limits), frame_limits)
    }
}
