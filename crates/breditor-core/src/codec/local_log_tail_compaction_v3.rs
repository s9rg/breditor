use crate::local_log::{LocalLogCompactionFailure, LocalLogId};

use super::{LocalLogTailCompactionOutcomeV3, LocalLogTailCursorV3};

impl LocalLogTailCursorV3 {
    /// Compacts this Frame V3 generation under its inherited lifetime policy.
    ///
    /// Success retains the old accepted prefix, frame payload policy, and
    /// durable schema binding with the next checkpoint anchor. The successor
    /// must be started explicitly through the Frame V3 begin edge and begins at
    /// byte offset zero. This is an in-memory proof conversion, not storage I/O.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogCompactionFailure`] with the complete unchanged V3
    /// cursor under the semantic owner's existing compaction precedence.
    pub fn try_into_checkpoint_anchor(
        self,
        successor_log_id: LocalLogId,
    ) -> Result<LocalLogTailCompactionOutcomeV3, LocalLogCompactionFailure<LocalLogTailCursorV3>>
    {
        let Self { owner, frame_codec, accepted_byte_offset } = self;
        let frame_limits = frame_codec.limits();
        let schema_binding = frame_codec.schema_binding().clone();
        match owner.try_into_checkpoint_anchor(successor_log_id) {
            Ok(anchor) => Ok(LocalLogTailCompactionOutcomeV3::new(
                anchor,
                accepted_byte_offset,
                frame_limits,
                schema_binding,
            )),
            Err(failure) => {
                Err(failure.map_owner(|owner| Self { owner, frame_codec, accepted_byte_offset }))
            }
        }
    }
}
