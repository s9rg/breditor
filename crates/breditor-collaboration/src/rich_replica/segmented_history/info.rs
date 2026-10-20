//! Detached diagnostic metadata, not a writer, storage selection or activation capability.
use super::super::RichReplica;
use serde::Serialize;

/// Bounded native history generation counters and opaque identities. No document payload.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentedHistoryInfo {
    /// Original retained generation, whose exact old-family checkpoint remains embedded.
    pub root_generation: String,
    /// Current append-only segment. Identity is opaque, never a sortable clock.
    pub active_generation: String,
    /// Sealed generations including the original root, excluding the active segment.
    pub sealed_generations: usize,
    /// All retained replay entries, including remote imports and history operations.
    pub retained_entries: usize,
    /// Replay entries in the active generation under the unchanged per-segment bound.
    pub active_entries: usize,
    /// Current original native selective Undo items; rollover never resets them.
    pub undo_items: usize,
    /// Current original native selective Redo items; rollover never resets them.
    pub redo_items: usize,
}
impl RichReplica {
    /// Whether the separate segmented native recovery contract has been explicitly selected.
    #[must_use]
    pub const fn segmented_history_enabled(&self) -> bool {
        self.segmented.is_some()
    }

    /// Read detached native segment diagnostics. A result grants no lease or persistence proof.
    #[must_use]
    pub fn segmented_history_info(&self) -> Option<SegmentedHistoryInfo> {
        self.segmented.as_ref().map(|s| SegmentedHistoryInfo {
            root_generation: s.root.generation.clone(),
            active_generation: s.active_generation.clone(),
            sealed_generations: s.sealed.len() + 1,
            retained_entries: self.journal.entries.len(),
            active_entries: self.journal.entries.len() - s.start(),
            undo_items: self.undo_count(),
            redo_items: self.redo_count(),
        })
    }
}
