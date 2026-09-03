use crate::local_log::LocalLogEntry;

use super::local_log_storage_uncertain_append_attempt::LocalLogStorageUncertainAppendAttemptParts;
use super::{
    LocalLogStorageUncertainAppendAttempt, LocalLogStorageUncertainAppendEnqueueFailure,
    LocalLogStorageUncertainAppendEnqueueStep,
};

impl LocalLogStorageUncertainAppendAttempt {
    /// Atomically adds one borrowed entry behind the uncertain physical head.
    ///
    /// This is a logical enqueue only. The existing attempt identity, emitted
    /// request identity (when any), mutation token, and immutable FIFO head are
    /// preserved exactly. The underlying speculative cursor advances only when
    /// the entry is admitted; no core-issued request exposes or authorizes that
    /// follower.
    ///
    /// A live adapter-request borrow prevents this consuming action, so raw
    /// head egress and queue mutation cannot overlap through the safe API.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageUncertainAppendEnqueueFailure`] containing the
    /// complete unchanged uncertain attempt. `entry` is borrowed and remains
    /// caller-owned.
    pub fn try_enqueue(
        self,
        entry: &LocalLogEntry,
    ) -> Result<
        LocalLogStorageUncertainAppendEnqueueStep,
        LocalLogStorageUncertainAppendEnqueueFailure,
    > {
        let LocalLogStorageUncertainAppendAttemptParts { queue, attempt_id, request_id } =
            self.into_parts();

        match queue.try_enqueue(entry) {
            Ok(step) => {
                let (queue, chunk_start, frame_end, frame_bytes, observation) = step.into_parts();
                let owner = LocalLogStorageUncertainAppendAttempt::from_parts(
                    LocalLogStorageUncertainAppendAttemptParts { queue, attempt_id, request_id },
                );
                Ok(LocalLogStorageUncertainAppendEnqueueStep::new(
                    owner,
                    chunk_start,
                    frame_end,
                    frame_bytes,
                    observation,
                ))
            }
            Err(failure) => {
                let (queue, error) = failure.into_parts();
                let owner = LocalLogStorageUncertainAppendAttempt::from_parts(
                    LocalLogStorageUncertainAppendAttemptParts { queue, attempt_id, request_id },
                );
                Err(LocalLogStorageUncertainAppendEnqueueFailure::new(owner, error))
            }
        }
    }
}
