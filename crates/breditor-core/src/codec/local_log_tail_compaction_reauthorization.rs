use crate::local_log::{LocalLogCompactionFailure, LocalLogCompactionLimits, LocalLogId};

use super::{LocalLogTailCompactionOutcome, LocalLogTailCursor};

impl LocalLogTailCursor {
    /// Compacts the active generation under an explicit replacement lifetime policy.
    ///
    /// This is the deliberate reauthorization path for the cumulative replay-
    /// tombstone ceiling. `limits` is a [`LocalLogCompactionLimits`] policy, not
    /// either the active generation's recovery policy or its frame payload
    /// policy. Success retains the old frame policy only as outcome metadata;
    /// the next successor must select both recovery and frame policies explicitly
    /// and starts at generation-relative byte offset zero. Invocation authorizes
    /// abandoning any suffix that this cursor has not accepted; it is not an EOF
    /// or storage-sealing operation.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogCompactionFailure`] with the complete unchanged cursor
    /// under the exact precedence of
    /// [`crate::local_log::ContinuedLocalLog::try_into_checkpoint_anchor_with_limits`].
    /// Allocation failure, panic, abort, and process failure are outside this
    /// typed ownership contract.
    pub fn try_into_checkpoint_anchor_with_compaction_limits(
        self,
        successor_log_id: LocalLogId,
        limits: LocalLogCompactionLimits,
    ) -> Result<LocalLogTailCompactionOutcome, LocalLogCompactionFailure<LocalLogTailCursor>> {
        let Self { owner, frame_codec, accepted_byte_offset } = self;
        let frame_limits = frame_codec.limits();
        match owner.try_into_checkpoint_anchor_with_limits(successor_log_id, limits) {
            Ok(anchor) => {
                Ok(LocalLogTailCompactionOutcome::new(anchor, accepted_byte_offset, frame_limits))
            }
            Err(failure) => {
                Err(failure.map_owner(|owner| Self { owner, frame_codec, accepted_byte_offset }))
            }
        }
    }
}
