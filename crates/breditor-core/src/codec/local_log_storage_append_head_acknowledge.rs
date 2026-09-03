use super::{
    LocalLogStorageAppendHeadAcknowledged, LocalLogStorageAppendHeadAcknowledgementOutcome,
    LocalLogStorageAppendHeadPresent, LocalLogStorageAppendQueueDrained,
    local_log_storage_append_head_acknowledgement::LocalLogStorageAppendHeadAcknowledgement,
    local_log_storage_append_queue_advance_head::LocalLogStorageAppendQueueHeadAdvance,
};

impl LocalLogStorageAppendHeadPresent {
    /// Acknowledges and removes exactly the host-attested FIFO head.
    ///
    /// The positive owner already represents a matching append transaction's
    /// terminal completion. This consuming action cannot select a frame and
    /// never removes more than the structurally distinguished head. If a
    /// follower exists, its exact retained allocation becomes the new head; no
    /// successor is dispatched automatically. If no follower exists, the
    /// result retains the mutation token and final speculative cursor in an
    /// explicitly drained owner.
    ///
    /// Acknowledgement records historical completion only. It does not prove
    /// that the retained mutation token, binding, or cursor is still current,
    /// nor that browser storage durably flushed the bytes against eviction.
    #[must_use = "acknowledgement returns the remaining queue or its drained authority"]
    pub fn acknowledge_head(self) -> LocalLogStorageAppendHeadAcknowledgementOutcome {
        let (queue, request_id) = self.into_issued().into_parts();
        let acknowledgement = LocalLogStorageAppendHeadAcknowledgement::new(
            request_id,
            queue.head_chunk_start(),
            queue.head_frame_end(),
            queue.head_frame_bytes(),
            queue.head_observation_outcome(),
        );
        match queue.advance_exact_head() {
            LocalLogStorageAppendQueueHeadAdvance::Pending(queue) => {
                LocalLogStorageAppendHeadAcknowledgementOutcome::Pending(
                    LocalLogStorageAppendHeadAcknowledged::new(queue, acknowledgement),
                )
            }
            LocalLogStorageAppendQueueHeadAdvance::Drained { token, final_cursor, limits } => {
                LocalLogStorageAppendHeadAcknowledgementOutcome::Drained(
                    LocalLogStorageAppendQueueDrained::new(
                        token,
                        final_cursor,
                        limits,
                        acknowledgement,
                    ),
                )
            }
        }
    }
}
