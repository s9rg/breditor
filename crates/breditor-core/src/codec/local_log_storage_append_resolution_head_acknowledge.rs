use super::{
    LocalLogStorageAppendHeadAcknowledgedAtResolution,
    LocalLogStorageAppendHeadPresentAtResolution, LocalLogStorageAppendQueueDrainedAtResolution,
    LocalLogStorageAppendResolutionHeadAcknowledgementOutcome,
    local_log_storage_append_queue_advance_head::LocalLogStorageAppendQueueHeadAdvance,
    local_log_storage_append_resolution_head_acknowledgement::LocalLogStorageAppendResolutionHeadAcknowledgement,
};

impl LocalLogStorageAppendHeadPresentAtResolution {
    /// Acknowledges and removes exactly the resolver-proven FIFO head.
    ///
    /// This invokes the same core-private structural head-advance primitive as
    /// direct terminal completion. The source's append request remains optional
    /// in the bounded acknowledgement record; no correlation is synthesized
    /// for a pre-egress `NotAttempted` source.
    #[must_use = "acknowledgement returns the remaining queue or drained authority"]
    pub fn acknowledge_head(self) -> LocalLogStorageAppendResolutionHeadAcknowledgementOutcome {
        let (source, resolution_request_id) = self.into_parts();
        let source_kind = source.kind();
        let source_attempt_id = source.attempt_id().clone();
        let source_append_request_id = source.append_request_id().cloned();
        let queue = source.into_queue();
        let acknowledgement = LocalLogStorageAppendResolutionHeadAcknowledgement::new(
            resolution_request_id,
            source_kind,
            source_attempt_id,
            source_append_request_id,
            queue.head_chunk_start(),
            queue.head_frame_end(),
            queue.head_frame_bytes(),
            queue.head_observation_outcome(),
        );

        match queue.advance_exact_head() {
            LocalLogStorageAppendQueueHeadAdvance::Pending(queue) => {
                LocalLogStorageAppendResolutionHeadAcknowledgementOutcome::Pending(
                    LocalLogStorageAppendHeadAcknowledgedAtResolution::new(queue, acknowledgement),
                )
            }
            LocalLogStorageAppendQueueHeadAdvance::Drained { token, final_cursor, limits } => {
                LocalLogStorageAppendResolutionHeadAcknowledgementOutcome::Drained(
                    LocalLogStorageAppendQueueDrainedAtResolution::new(
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
