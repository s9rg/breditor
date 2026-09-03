use super::{
    LocalLogStorageMutationFenceBinding, LocalLogStorageMutationFenceBindingObservationError,
    LocalLogStorageSelectedBindingChange,
};

impl LocalLogStorageMutationFenceBinding {
    /// Compares a later observation with this exact expected envelope.
    ///
    /// Failure precedence is directional selected-binding comparison, exact
    /// current selection bytes, exact optional predecessor bytes, writer
    /// epoch, then current writer fence. The selected comparison keeps every
    /// immutable fact exact, accepts only checkpoint cleanup from `Retired` to
    /// `Reclaimed`, and rejects the reverse regression.
    ///
    /// This is a pure value comparison. Success does not prove that the later
    /// value came from storage, remains current, or grants authority. A storage
    /// adapter must apply the comparison to independently validated facts
    /// inside the same serialized transaction as the protected mutation.
    ///
    /// # Errors
    ///
    /// Returns a payload-free typed mismatch at the first differing boundary.
    pub fn compare_later_observation(
        &self,
        observed: &Self,
    ) -> Result<
        LocalLogStorageSelectedBindingChange,
        LocalLogStorageMutationFenceBindingObservationError,
    > {
        let change = self
            .selected_binding()
            .compare_later_observation(observed.selected_binding())
            .map_err(|error| {
                LocalLogStorageMutationFenceBindingObservationError::SelectedBindingMismatch {
                    code: error.code(),
                }
            })?;
        if self.current_selection_json() != observed.current_selection_json() {
            return Err(
                LocalLogStorageMutationFenceBindingObservationError::CurrentSelectionMismatch,
            );
        }
        if self.predecessor_selection_json() != observed.predecessor_selection_json() {
            return Err(
                LocalLogStorageMutationFenceBindingObservationError::PredecessorSelectionMismatch,
            );
        }
        if self.writer_epoch() != observed.writer_epoch() {
            return Err(LocalLogStorageMutationFenceBindingObservationError::WriterEpochMismatch);
        }
        if self.current_writer_fence_id() != observed.current_writer_fence_id() {
            return Err(
                LocalLogStorageMutationFenceBindingObservationError::CurrentWriterFenceMismatch,
            );
        }
        Ok(change)
    }
}
