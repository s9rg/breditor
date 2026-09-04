use crate::local_log::LocalLogEntry;

use super::{
    LocalLogStorageAppendResolution, LocalLogStorageAppendResolutionEnqueueFailure,
    LocalLogStorageAppendResolutionEnqueueStep,
    local_log_storage_append_resolution_source::{
        LocalLogStorageAppendResolutionSource, LocalLogStorageAppendResolutionSourceParts,
    },
};

impl LocalLogStorageAppendResolution {
    /// Atomically adds one borrowed entry behind the unresolved physical head.
    ///
    /// This is a logical enqueue only. It preserves the immutable FIFO head,
    /// source attempt and optional append-request correlation, and the current
    /// resolver request identity when already emitted. Only the private final
    /// speculative cursor advances; no resolver or append request exposes or
    /// authorizes the follower.
    ///
    /// A live resolver-request borrow prevents this consuming action, so
    /// request inspection and queue mutation cannot overlap through the safe
    /// API. Copied request metadata may still outlive the borrow.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageAppendResolutionEnqueueFailure`] containing the
    /// complete unchanged resolver. `entry` is borrowed and remains owned by
    /// the caller.
    pub fn try_enqueue(
        self,
        entry: &LocalLogEntry,
    ) -> Result<
        LocalLogStorageAppendResolutionEnqueueStep,
        LocalLogStorageAppendResolutionEnqueueFailure,
    > {
        let Self { source, request_id } = self;
        let LocalLogStorageAppendResolutionSourceParts { queue, provenance } = source.into_parts();

        match queue.try_enqueue(entry) {
            Ok(step) => {
                let (queue, chunk_start, frame_end, frame_bytes, observation) = step.into_parts();
                let owner = Self {
                    source: LocalLogStorageAppendResolutionSource::from_parts(
                        LocalLogStorageAppendResolutionSourceParts { queue, provenance },
                    ),
                    request_id,
                };
                Ok(LocalLogStorageAppendResolutionEnqueueStep::new(
                    owner,
                    chunk_start,
                    frame_end,
                    frame_bytes,
                    observation,
                ))
            }
            Err(failure) => {
                let (queue, error) = failure.into_parts();
                let owner = Self {
                    source: LocalLogStorageAppendResolutionSource::from_parts(
                        LocalLogStorageAppendResolutionSourceParts { queue, provenance },
                    ),
                    request_id,
                };
                Err(LocalLogStorageAppendResolutionEnqueueFailure::new(owner, error))
            }
        }
    }
}
