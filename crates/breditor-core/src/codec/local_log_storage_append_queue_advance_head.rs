use super::{
    LocalLogStorageAppendQueue, LocalLogStorageAppendQueueLimits, LocalLogStorageMutationToken,
    LocalLogTailCursor, local_log_storage_append_queue::LocalLogStorageAppendQueueParts,
};

/// Core-private result of removing exactly one acknowledged FIFO head.
pub(super) enum LocalLogStorageAppendQueueHeadAdvance {
    Pending(LocalLogStorageAppendQueue),
    Drained {
        token: LocalLogStorageMutationToken,
        final_cursor: LocalLogTailCursor,
        limits: LocalLogStorageAppendQueueLimits,
    },
}

impl LocalLogStorageAppendQueue {
    /// Removes exactly the structurally distinguished FIFO head.
    ///
    /// This is deliberately core-private. Only a positive, exactly correlated
    /// append-head state may call it. The action never skips, batches, or
    /// re-encodes a frame: the first follower allocation is moved unchanged
    /// into the head position and every later follower retains its order.
    pub(super) fn advance_exact_head(self) -> LocalLogStorageAppendQueueHeadAdvance {
        let LocalLogStorageAppendQueueParts {
            token,
            speculative_cursor,
            head,
            mut followers,
            pending_frames,
            pending_bytes,
            limits,
        } = self.into_parts();

        let Ok(head_frame_bytes) = u64::try_from(head.frame().len()) else {
            unreachable!("an admitted queue-head frame length must fit u64");
        };
        let Some(remaining_frames) = pending_frames.checked_sub(1) else {
            unreachable!("a structurally nonempty append queue must count its head");
        };
        let Some(remaining_bytes) = pending_bytes.checked_sub(head_frame_bytes) else {
            unreachable!("a queue's pending byte total must include its head");
        };

        let Some(next_head) = followers.pop_front() else {
            if remaining_frames != 0 || remaining_bytes != 0 {
                unreachable!("a queue without followers must drain to zero counts");
            }
            if speculative_cursor.accepted_byte_offset() != head.frame_end() {
                unreachable!("a drained queue's final cursor must end after its acknowledged head");
            }
            return LocalLogStorageAppendQueueHeadAdvance::Drained {
                token,
                final_cursor: speculative_cursor,
                limits,
            };
        };

        if remaining_frames == 0 || remaining_bytes == 0 {
            unreachable!("a promoted follower must remain represented by nonzero counts");
        }
        if next_head.chunk_start().get() != head.frame_end() {
            unreachable!("the first follower must begin at the acknowledged head's exact end");
        }

        LocalLogStorageAppendQueueHeadAdvance::Pending(LocalLogStorageAppendQueue::from_parts(
            LocalLogStorageAppendQueueParts {
                token,
                speculative_cursor,
                head: next_head,
                followers,
                pending_frames: remaining_frames,
                pending_bytes: remaining_bytes,
                limits,
            },
        ))
    }
}
