use std::{fmt, sync::Arc};

use crate::local_log::{LocalLogStorageFenceId, LocalLogStorageWriterEpoch};

use super::{
    LocalLogStorageSelectedActiveGenerationBinding, LocalLogStorageSelectedBinding,
    LocalLogStorageSelectionReceiptBinding,
};

/// Exact non-authority envelope one storage mutation must compare atomically.
///
/// The binding snapshots the complete selected scalar binding, byte-exact
/// canonical current and optional predecessor selections, and the mutable
/// writer epoch/current writer fence. It therefore preserves exact-selection
/// substitution protection while allowing the separate comparison action to
/// recognize only the valid `Retired -> Reclaimed` checkpoint cleanup advance.
///
/// This value is clonable comparison data. Constructing, cloning, comparing,
/// or inspecting it proves no storage observation, currentness, acquisition,
/// durability, or writer authority. Structural equality is intentionally
/// stricter than directional later-observation comparison: bindings on the two
/// sides of a valid cleanup advance are structurally unequal.
#[derive(Clone, Eq, PartialEq)]
pub struct LocalLogStorageMutationFenceBinding {
    selected_binding: LocalLogStorageSelectedBinding,
    current_selection_json: Arc<str>,
    predecessor_selection_json: Option<Arc<str>>,
    writer_epoch: LocalLogStorageWriterEpoch,
    current_writer_fence_id: LocalLogStorageFenceId,
}

impl LocalLogStorageMutationFenceBinding {
    /// Creates one binding from an already-normalized selected envelope.
    pub(super) const fn from_parts(
        selected_binding: LocalLogStorageSelectedBinding,
        current_selection_json: Arc<str>,
        predecessor_selection_json: Option<Arc<str>>,
        writer_epoch: LocalLogStorageWriterEpoch,
        current_writer_fence_id: LocalLogStorageFenceId,
    ) -> Self {
        Self {
            selected_binding,
            current_selection_json,
            predecessor_selection_json,
            writer_epoch,
            current_writer_fence_id,
        }
    }

    /// Returns the complete selected-envelope scalar binding.
    #[must_use]
    pub const fn selected_binding(&self) -> &LocalLogStorageSelectedBinding {
        &self.selected_binding
    }

    /// Returns the selected envelope's retained durable schema binding.
    #[must_use]
    pub const fn schema_binding(&self) -> &crate::schema::DurableSchemaBinding {
        self.selected_binding.schema_binding()
    }

    /// Returns the exact selected current transaction receipt.
    #[must_use]
    pub const fn current_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        self.selected_binding.current_receipt()
    }

    /// Returns the exact immutable active-generation facts.
    #[must_use]
    pub const fn active_generation(&self) -> &LocalLogStorageSelectedActiveGenerationBinding {
        self.selected_binding.active_generation()
    }

    /// Returns the UTF-8 byte length of the exact current selection.
    #[must_use]
    pub fn current_selection_json_bytes(&self) -> usize {
        self.current_selection_json.len()
    }

    /// Returns the exact predecessor byte length, present for a rotation.
    #[must_use]
    pub fn predecessor_selection_json_bytes(&self) -> Option<usize> {
        self.predecessor_selection_json.as_ref().map(|json| json.len())
    }

    /// Returns the exact observed mutable writer epoch.
    #[must_use]
    pub const fn writer_epoch(&self) -> LocalLogStorageWriterEpoch {
        self.writer_epoch
    }

    /// Returns the exact observed mutable current writer-fence identity.
    #[must_use]
    pub const fn current_writer_fence_id(&self) -> &LocalLogStorageFenceId {
        &self.current_writer_fence_id
    }

    /// Returns the byte-exact current selection inside the core.
    pub(super) fn current_selection_json(&self) -> &str {
        &self.current_selection_json
    }

    /// Returns the byte-exact optional predecessor selection inside the core.
    pub(super) fn predecessor_selection_json(&self) -> Option<&str> {
        self.predecessor_selection_json.as_deref()
    }

    /// Consumes the mutable pair while preserving the exact selected envelope.
    pub(super) fn into_selected_envelope(
        self,
    ) -> (LocalLogStorageSelectedBinding, Arc<str>, Option<Arc<str>>) {
        let Self {
            selected_binding,
            current_selection_json,
            predecessor_selection_json,
            writer_epoch: _,
            current_writer_fence_id: _,
        } = self;
        (selected_binding, current_selection_json, predecessor_selection_json)
    }
}

impl fmt::Debug for LocalLogStorageMutationFenceBinding {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageMutationFenceBinding")
            .field("selected_binding", &self.selected_binding)
            .field("current_selection_json_bytes", &self.current_selection_json.len())
            .field(
                "predecessor_selection_json_bytes",
                &self.predecessor_selection_json.as_ref().map(|json| json.len()),
            )
            .field("writer_epoch", &self.writer_epoch)
            .field("current_writer_fence_id", &self.current_writer_fence_id)
            .finish_non_exhaustive()
    }
}
