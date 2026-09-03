use crate::local_log::{LocalLogStorageFenceId, LocalLogStorageWriterEpoch};

use super::LocalLogStorageMutationFenceBinding;

impl LocalLogStorageMutationFenceBinding {
    /// Mechanically replaces only the mutable writer pair.
    ///
    /// This crate-private action preserves the complete selected binding and
    /// allocation-identical current and optional predecessor JSON. It performs
    /// no succession, fence-freshness, storage, currentness, or authority
    /// validation; callers must derive both replacement values from an already
    /// checked acquisition plan.
    pub(super) fn with_writer_fence(
        self,
        writer_epoch: LocalLogStorageWriterEpoch,
        current_writer_fence_id: LocalLogStorageFenceId,
    ) -> Self {
        let (selected_binding, current_selection_json, predecessor_selection_json) =
            self.into_selected_envelope();
        Self::from_parts(
            selected_binding,
            current_selection_json,
            predecessor_selection_json,
            writer_epoch,
            current_writer_fence_id,
        )
    }
}
