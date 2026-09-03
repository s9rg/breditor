use super::{
    LocalLogStorageMutationFenceBinding, LocalLogStorageWriterFenceAcquisitionPlan,
    LocalLogStorageWriterFenceAcquisitionPreparationError,
    LocalLogStorageWriterFenceAcquisitionPreparationFailure,
};
use crate::local_log::LocalLogStorageFenceId;

impl LocalLogStorageMutationFenceBinding {
    /// Consumes this exact binding into one checked acquisition plan.
    ///
    /// The next epoch is computed with checked nonwrapping succession. The
    /// proposed fence must differ from the current writer fence, but this local
    /// inequality does not prove lifetime or scope-wide freshness. Epoch
    /// exhaustion has precedence when both inputs are invalid.
    ///
    /// Success performs no I/O and grants no writer authority. A storage
    /// adapter must atomically compare the expected binding and store both
    /// proposed values in one serialized transaction.
    ///
    /// # Errors
    ///
    /// Returns a recoverable failure containing this complete unchanged
    /// binding and the unchanged proposed fence when the epoch is exhausted or
    /// the proposal reuses the current fence.
    pub fn try_prepare_writer_fence_acquisition(
        self,
        proposed_writer_fence_id: LocalLogStorageFenceId,
    ) -> Result<
        LocalLogStorageWriterFenceAcquisitionPlan,
        LocalLogStorageWriterFenceAcquisitionPreparationFailure,
    > {
        let Ok(next_writer_epoch) = self.writer_epoch().successor() else {
            return Err(LocalLogStorageWriterFenceAcquisitionPreparationFailure::new(
                self,
                proposed_writer_fence_id,
                LocalLogStorageWriterFenceAcquisitionPreparationError::EpochExhausted,
            ));
        };
        if &proposed_writer_fence_id == self.current_writer_fence_id() {
            return Err(LocalLogStorageWriterFenceAcquisitionPreparationFailure::new(
                self,
                proposed_writer_fence_id,
                LocalLogStorageWriterFenceAcquisitionPreparationError::CurrentWriterFenceReused,
            ));
        }

        Ok(LocalLogStorageWriterFenceAcquisitionPlan::new(
            self,
            next_writer_epoch,
            proposed_writer_fence_id,
        ))
    }
}
