//! Explicit guarded line break over the existing text/format/history protocol.
use super::{RichReplica, SharedObservation};
use crate::Error;

impl RichReplica {
    /// Replace the current text selection with exactly one LF in one selective-history group.
    ///
    /// The ordinary guarded typing planner admits logical-start formats, advances
    /// the caret by one UTF-16 unit and retains peer edits. No new wire operation,
    /// block, identity or line-ending normalization is introduced.
    ///
    /// # Errors
    /// Stale/foreign observations, unsupported selections or active budgets reject atomically.
    pub fn insert_hard_break_guarded(
        &mut self,
        observation: &SharedObservation,
    ) -> Result<bool, Error> {
        self.insert_plain_text_guarded(observation, "\n")
    }
}
