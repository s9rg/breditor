//! Exclusive owner diagnostics for the selected native document replay family.
use super::{
    super::{
        RichReplica,
        session::{MAX_ENTRIES, MAX_JOURNAL_BYTES},
    },
    archive,
    binding::Family,
    encoding::encode,
};
use crate::{Error, NativeHistoryUsage};

/// Measured history usage for one actual native document owner.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentHistoryCapacity {
    /// Replay entries in the active generation or original journal.
    pub active_entries: NativeHistoryUsage,
    /// All retained replay entries, including remote imports and history operations.
    pub retained_entries: usize,
    /// Unescaped canonical JSON bytes of the active file or original checkpoint.
    pub active_bytes: NativeHistoryUsage,
    /// Canonical bytes of the complete native checkpoint in the selected family.
    pub checkpoint_bytes: NativeHistoryUsage,
    /// Root, sealed and active files in a generation archive.
    pub generation_files: Option<NativeHistoryUsage>,
    /// Currently available local Undo steps.
    pub undo_items: usize,
    /// Currently available local Redo steps.
    pub redo_items: usize,
    /// Selected native history depth ceiling. Original history can evict older steps.
    pub undo_item_limit: usize,
    /// Retained accepted-effect markers when reviewed local history is selected.
    pub reviewed_effects: Option<NativeHistoryUsage>,
}

impl RichReplica {
    /// Measure capacity at the admitted document cut using its selected replay family.
    /// Segmented capacity encodes the active file and reuses the saved charges of sealed files.
    /// # Errors
    /// A broken active offset, checkpoint representation or byte limit refuses the estimate.
    pub fn document_history_capacity(&self) -> Result<DocumentHistoryCapacity, Error> {
        let retained_entries = self.journal.entries.len();
        let (active_entries, active_bytes, checkpoint_bytes, generation_files) =
            if let Some(state) = &self.segmented {
                let record = state.active_record(self)?;
                let active = encode(&record, MAX_JOURNAL_BYTES)?;
                let limit = state.max_archive_bytes();
                let used = archive::check_size(state, &active, limit)?;
                (
                    record.entries.len(),
                    active.len(),
                    NativeHistoryUsage { used, limit },
                    Some(NativeHistoryUsage {
                        used: state.sealed.len() + 2,
                        limit: state.max_generations(),
                    }),
                )
            } else {
                let size = Family::of(self).checkpoint(self)?.len();
                (
                    retained_entries,
                    size,
                    NativeHistoryUsage { used: size, limit: MAX_JOURNAL_BYTES },
                    None,
                )
            };
        Ok(DocumentHistoryCapacity {
            active_entries: NativeHistoryUsage { used: active_entries, limit: MAX_ENTRIES },
            retained_entries,
            active_bytes: NativeHistoryUsage { used: active_bytes, limit: MAX_JOURNAL_BYTES },
            checkpoint_bytes,
            generation_files,
            undo_items: self.undo_count(),
            redo_items: self.redo_count(),
            undo_item_limit: self.undo_limit,
            reviewed_effects: self.reviewed_history.as_ref().map(|history| NativeHistoryUsage {
                used: history.adopted.len(),
                limit: self.undo_limit,
            }),
        })
    }
}
