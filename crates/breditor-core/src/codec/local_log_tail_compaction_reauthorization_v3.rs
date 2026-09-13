use crate::local_log::{LocalLogCompactionFailure, LocalLogCompactionLimits, LocalLogId};

use super::{LocalLogTailCompactionOutcomeV3, LocalLogTailCursorV3};

impl LocalLogTailCursorV3 {
    /// Compacts this Frame V3 generation under a replacement lifetime policy.
    ///
    /// This deliberate reauthorization changes only the replay-tombstone
    /// lifetime limit. It cannot change the Frame V3 generation, payload
    /// policy, or durable schema binding retained with the successful outcome.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogCompactionFailure`] with the complete unchanged V3
    /// cursor under the semantic owner's existing compaction precedence.
    pub fn try_into_checkpoint_anchor_with_compaction_limits(
        self,
        successor_log_id: LocalLogId,
        limits: LocalLogCompactionLimits,
    ) -> Result<LocalLogTailCompactionOutcomeV3, LocalLogCompactionFailure<LocalLogTailCursorV3>>
    {
        let Self { owner, frame_codec, accepted_byte_offset } = self;
        let frame_limits = frame_codec.limits();
        let schema_binding = frame_codec.schema_binding().clone();
        match owner.try_into_checkpoint_anchor_with_limits(successor_log_id, limits) {
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
