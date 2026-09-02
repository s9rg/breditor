use crate::local_log::{LocalLogCompactionFailure, LocalLogId};

use super::{LocalLogTailCompactionOutcome, LocalLogTailCursor};

impl LocalLogTailCursor {
    /// Compacts the active generation under its inherited lifetime policy.
    ///
    /// Success returns the next checkpoint anchor together with this old
    /// generation's cursor-authoritative accepted-prefix length and frame
    /// payload policy. The
    /// old generation-bound codec is discarded; starting the anchor's successor
    /// derives a new codec and resets its generation-relative offset to zero.
    /// Calling this method is host authorization to stop admission at the
    /// cursor-authoritative prefix and can abandon an unobserved or incomplete
    /// suffix. This in-memory proof conversion neither observes storage EOF nor
    /// seals, persists, truncates, or acknowledges physical bytes.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogCompactionFailure`] with the complete unchanged cursor
    /// under the exact precedence of
    /// [`crate::local_log::ContinuedLocalLog::try_into_checkpoint_anchor`].
    /// Allocation failure, panic, abort, and process failure are outside this
    /// typed ownership contract.
    pub fn try_into_checkpoint_anchor(
        self,
        successor_log_id: LocalLogId,
    ) -> Result<LocalLogTailCompactionOutcome, LocalLogCompactionFailure<LocalLogTailCursor>> {
        let Self { owner, frame_codec, accepted_byte_offset } = self;
        let frame_limits = frame_codec.limits();
        match owner.try_into_checkpoint_anchor(successor_log_id) {
            Ok(anchor) => {
                Ok(LocalLogTailCompactionOutcome::new(anchor, accepted_byte_offset, frame_limits))
            }
            Err(failure) => {
                Err(failure.map_owner(|owner| Self { owner, frame_codec, accepted_byte_offset }))
            }
        }
    }
}
