use super::{LocalLogStorageMutationFenceBinding, LocalLogStorageWriterFenceAcquisitionPlan};

impl LocalLogStorageWriterFenceAcquisitionPlan {
    /// Consumes this checked plan into its exact post-acquisition target binding.
    ///
    /// The selected binding and both exact JSON allocations remain unchanged;
    /// only the writer epoch and current fence become the checked next epoch
    /// and proposal. This is deterministic plan projection, not evidence that
    /// an acquisition transaction ran or committed.
    pub(super) fn into_target_binding(self) -> LocalLogStorageMutationFenceBinding {
        let (expected_binding, next_writer_epoch, proposed_writer_fence_id) = self.into_parts();
        expected_binding.with_writer_fence(next_writer_epoch, proposed_writer_fence_id)
    }
}
