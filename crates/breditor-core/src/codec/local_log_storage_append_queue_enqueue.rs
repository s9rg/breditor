use crate::local_log::{LocalLogEntry, LocalLogStorageChunkStart};

use super::local_log_storage_append_queue::{
    LocalLogStorageAppendQueueParts, LocalLogStorageQueuedAppend,
};
use super::{
    LocalLogStorageAppendQueue, LocalLogStorageAppendQueueEnqueueError,
    LocalLogStorageAppendQueueEnqueueFailure, LocalLogStorageAppendQueueEnqueueStep,
    LocalLogTailStatus,
};

impl LocalLogStorageAppendQueue {
    /// Atomically adds one borrowed entry to the speculative FIFO tail.
    ///
    /// Validation precedence is pending-frame count arithmetic and policy;
    /// deterministic Frame V1 encoding; fixed-width frame-length and aggregate-
    /// byte arithmetic; pending-byte policy; then the existing atomic semantic
    /// tail transition. The exact allocation admitted into the cursor becomes
    /// the new final FIFO frame. The distinguished head never changes. Success
    /// reports that frame's bounded metadata and semantic admission result in
    /// a [`LocalLogStorageAppendQueueEnqueueStep`].
    ///
    /// This action performs no storage I/O, dispatch, acknowledgement, or
    /// rotation. Queue capacity is backpressure information, not permission for
    /// the host to dispatch a follower, coalesce, or reorder entries. Dropping
    /// the queue is volatile loss rather than a typed cancellation.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageAppendQueueEnqueueFailure`] containing this
    /// complete unchanged queue. `entry` is borrowed and remains caller-owned.
    pub fn try_enqueue(
        self,
        entry: &LocalLogEntry,
    ) -> Result<LocalLogStorageAppendQueueEnqueueStep, LocalLogStorageAppendQueueEnqueueFailure>
    {
        let next_pending_frames = match checked_next_pending_frames(&self) {
            Ok(next_pending_frames) => next_pending_frames,
            Err(error) => {
                return Err(LocalLogStorageAppendQueueEnqueueFailure::new(self, error));
            }
        };

        let frame = match self.speculative_cursor().frame_codec.encode(entry) {
            Ok(frame) => frame,
            Err(error) => {
                return Err(LocalLogStorageAppendQueueEnqueueFailure::new(
                    self,
                    LocalLogStorageAppendQueueEnqueueError::FrameEncode(Box::new(error)),
                ));
            }
        };
        let Ok(frame_bytes) = u64::try_from(frame.len()) else {
            let exact_bytes = frame.len();
            return Err(LocalLogStorageAppendQueueEnqueueFailure::new(
                self,
                LocalLogStorageAppendQueueEnqueueError::FrameBytesOverflow {
                    frame_bytes: exact_bytes,
                },
            ));
        };
        let next_pending_bytes = match checked_next_pending_bytes(&self, frame_bytes) {
            Ok(next_pending_bytes) => next_pending_bytes,
            Err(error) => {
                return Err(LocalLogStorageAppendQueueEnqueueFailure::new(self, error));
            }
        };
        let frame: std::sync::Arc<[u8]> = frame.into();

        let LocalLogStorageAppendQueueParts {
            token,
            speculative_cursor: cursor,
            head,
            mut followers,
            pending_frames,
            pending_bytes,
            limits,
        } = self.into_parts();
        let frame_start = cursor.accepted_byte_offset();
        let step = match cursor.try_observe_frame(frame_start, &frame) {
            Ok(step) => step,
            Err(failure) => {
                let (cursor, rejected_entry, error) = failure.into_parts();
                drop(rejected_entry);
                let queue =
                    LocalLogStorageAppendQueue::from_parts(LocalLogStorageAppendQueueParts {
                        token,
                        speculative_cursor: cursor,
                        head,
                        followers,
                        pending_frames,
                        pending_bytes,
                        limits,
                    });
                return Err(LocalLogStorageAppendQueueEnqueueFailure::new(
                    queue,
                    LocalLogStorageAppendQueueEnqueueError::TailTransition(Box::new(error)),
                ));
            }
        };
        let (speculative_cursor, status) = step.into_parts();
        let LocalLogTailStatus::Accepted {
            observation,
            frame_start,
            frame_end,
            frame_bytes: accepted_frame_bytes,
        } = status
        else {
            unreachable!("a frame emitted by the same codec must scan as one complete frame");
        };
        debug_assert_eq!(accepted_frame_bytes, frame.len());
        debug_assert_eq!(frame_end, speculative_cursor.accepted_byte_offset());
        debug_assert_eq!(frame_end.checked_sub(frame_start), Some(frame_bytes));

        let chunk_start = LocalLogStorageChunkStart::new(frame_start);
        followers.push_back(LocalLogStorageQueuedAppend::new(
            frame,
            chunk_start,
            frame_end,
            observation,
        ));
        let queue = LocalLogStorageAppendQueue::from_parts(LocalLogStorageAppendQueueParts {
            token,
            speculative_cursor,
            head,
            followers,
            pending_frames: next_pending_frames,
            pending_bytes: next_pending_bytes,
            limits,
        });
        Ok(LocalLogStorageAppendQueueEnqueueStep::new(
            queue,
            chunk_start,
            frame_end,
            accepted_frame_bytes,
            observation,
        ))
    }
}

fn checked_next_pending_frames(
    queue: &LocalLogStorageAppendQueue,
) -> Result<u64, LocalLogStorageAppendQueueEnqueueError> {
    let next = queue
        .pending_frames()
        .checked_add(1)
        .ok_or(LocalLogStorageAppendQueueEnqueueError::PendingFrameCountOverflow)?;
    let maximum = queue.limits().max_pending_frames();
    if next > maximum {
        return Err(LocalLogStorageAppendQueueEnqueueError::PendingFrameLimit {
            attempted: next,
            maximum,
        });
    }
    Ok(next)
}

fn checked_next_pending_bytes(
    queue: &LocalLogStorageAppendQueue,
    frame_bytes: u64,
) -> Result<u64, LocalLogStorageAppendQueueEnqueueError> {
    let current = queue.pending_bytes();
    let next = current.checked_add(frame_bytes).ok_or(
        LocalLogStorageAppendQueueEnqueueError::PendingBytesOverflow {
            current,
            added: frame_bytes,
        },
    )?;
    let maximum = queue.limits().max_pending_bytes();
    if next > maximum {
        return Err(LocalLogStorageAppendQueueEnqueueError::PendingByteLimit {
            attempted: next,
            maximum,
        });
    }
    Ok(next)
}
