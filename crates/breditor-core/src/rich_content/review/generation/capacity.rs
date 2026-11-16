//! Capacity of the currently admitted review owner, with exact native byte charges.
use super::{
    super::{ReviewError, ReviewSession, event},
    checkpoint_budget,
    record::generation_limit,
};
use crate::rich_content::NativeHistoryUsage;

/// Independent native review limits and current same-actor history depths.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewHistoryCapacity {
    /// Events in the active generation or original checkpoint.
    pub active_events: NativeHistoryUsage,
    /// Events across this native owner, including the original root and every seal.
    pub retained_events: NativeHistoryUsage,
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
}

impl ReviewSession {
    /// Measure the current native review cut using admitted events and immutable file sizes.
    /// # Errors
    /// Invalid offsets or any selected checkpoint limit refuse the estimate.
    pub fn review_history_capacity(&self) -> Result<ReviewHistoryCapacity, ReviewError> {
        let (active_events, active_bytes, checkpoint_bytes, generation_files) =
            if let Some(state) = &self.generations {
                let active = self.encode_generation_active(state)?;
                let limit = state.archive_byte_limit();
                let used = checkpoint_budget::check_size(state, &active, limit)?;
                (
                    self.events.len() - state.active_start,
                    active.len(),
                    NativeHistoryUsage { used, limit },
                    Some(NativeHistoryUsage {
                        used: state.sealed.len() + 2,
                        limit: generation_limit(self.has_continued_history()),
                    }),
                )
            } else {
                let size = self.checkpoint_json()?.len();
                (
                    self.events.len(),
                    size,
                    NativeHistoryUsage { used: size, limit: event::MAX_BYTES },
                    None,
                )
            };
        Ok(ReviewHistoryCapacity {
            active_events: NativeHistoryUsage { used: active_events, limit: event::MAX_EVENTS },
            retained_events: NativeHistoryUsage {
                used: self.events.len(),
                limit: self.event_limit(),
            },
            active_bytes: NativeHistoryUsage { used: active_bytes, limit: event::MAX_BYTES },
            checkpoint_bytes,
            generation_files,
            undo_items: self.cursor,
            redo_items: self.history.len() - self.cursor,
        })
    }
}
