use super::local_log_storage_append_queue::LocalLogStorageQueuedAppend;
use super::{
    LocalLogStorageAppendPlan, LocalLogStorageAppendQueue, LocalLogStorageAppendQueueLimits,
    LocalLogStorageAppendQueueStartError, LocalLogStorageAppendQueueStartFailure,
};

impl LocalLogStorageAppendPlan {
    /// Consumes this checked plan into a bounded nonempty FIFO append queue.
    ///
    /// Validation checks the frame-count limit before the aggregate encoded-
    /// byte limit. Success preserves the exact token, speculative cursor, and
    /// frame allocation. It performs no I/O and creates no dispatch request.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageAppendQueueStartFailure`] containing this
    /// complete unchanged plan when either selected queue limit rejects it.
    pub fn try_into_queue(
        self,
        limits: LocalLogStorageAppendQueueLimits,
    ) -> Result<LocalLogStorageAppendQueue, LocalLogStorageAppendQueueStartFailure> {
        if limits.max_pending_frames() < 1 {
            return Err(LocalLogStorageAppendQueueStartFailure::new(
                self,
                LocalLogStorageAppendQueueStartError::PendingFrameLimit {
                    maximum: limits.max_pending_frames(),
                },
            ));
        }

        let frame_bytes = self.frame_end() - self.chunk_start().get();
        debug_assert_eq!(u64::try_from(self.frame().len()), Ok(frame_bytes));
        if frame_bytes > limits.max_pending_bytes() {
            return Err(LocalLogStorageAppendQueueStartFailure::new(
                self,
                LocalLogStorageAppendQueueStartError::PendingByteLimit {
                    actual: frame_bytes,
                    maximum: limits.max_pending_bytes(),
                },
            ));
        }

        let (token, speculative_cursor, frame, chunk_start, frame_end, observation) =
            self.into_parts();
        let head = LocalLogStorageQueuedAppend::new(frame, chunk_start, frame_end, observation);
        Ok(LocalLogStorageAppendQueue::new(token, speculative_cursor, head, frame_bytes, limits))
    }
}
