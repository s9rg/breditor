use crate::local_log::{LocalLogStorageFenceId, LocalLogStorageWriterEpoch};

use super::{LocalLogStorageMutationFenceBinding, LocalLogStorageSelectedRoot};

impl LocalLogStorageMutationFenceBinding {
    /// Snapshots one exact non-authority mutation-fence binding from a selected root.
    ///
    /// `writer_epoch` and `current_writer_fence_id` must be independently
    /// observed from the same validated scope control as `selected`. This pure
    /// action cannot verify their provenance, atomic co-observation, or that
    /// the selected root remains current. The current writer fence may equal
    /// the active generation's immutable activation fence immediately after
    /// root or rotation publication.
    #[must_use]
    pub fn from_selected(
        selected: &LocalLogStorageSelectedRoot,
        writer_epoch: LocalLogStorageWriterEpoch,
        current_writer_fence_id: LocalLogStorageFenceId,
    ) -> Self {
        let (selected_binding, current_selection_json, predecessor_selection_json) =
            selected.snapshot_attempt_envelope();
        Self::from_parts(
            selected_binding,
            current_selection_json,
            predecessor_selection_json,
            writer_epoch,
            current_writer_fence_id,
        )
    }
}
