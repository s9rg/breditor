use crate::local_log::{LocalLogCompactionFailure, LocalLogCompactionLimits, LocalLogId};

use super::{LocalLogTailCompactionOutcomeV2, LocalLogTailCursorV2};

impl LocalLogTailCursorV2 {
    /// Compacts this Frame V2 generation under a replacement lifetime policy.
    ///
    /// This deliberate reauthorization changes only the replay-tombstone
    /// lifetime limit. It cannot change the Frame V2 generation, payload
    /// policy, or durable schema binding retained with the successful outcome.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogCompactionFailure`] with the complete unchanged V2
    /// cursor under the semantic owner's existing compaction precedence.
    pub fn try_into_checkpoint_anchor_with_compaction_limits(
        self,
        successor_log_id: LocalLogId,
        limits: LocalLogCompactionLimits,
    ) -> Result<LocalLogTailCompactionOutcomeV2, LocalLogCompactionFailure<LocalLogTailCursorV2>>
    {
        let Self { owner, frame_codec, accepted_byte_offset } = self;
        let frame_limits = frame_codec.limits();
        let schema_binding = frame_codec.schema_binding().clone();
        match owner.try_into_checkpoint_anchor_with_limits(successor_log_id, limits) {
            Ok(anchor) => Ok(LocalLogTailCompactionOutcomeV2::new(
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
