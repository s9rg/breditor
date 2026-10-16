//! First-key explicit general targets preserve actual pre-edit UI and start a new burst.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    typing_history::{Kind, separator},
};
use crate::rich_content::{BlockId, RichSelectionKind};
impl RichLocalSession {
    /// Replace an explicit target with user input, then allow following same-caret input to join.
    /// Empty input proves the target but neither deletes nor consumes floor identities.
    /// A target at the actual caret uses ordinary native typing; other targets never join prior input.
    /// # Errors
    /// Stale/read-only/disabled, invalid targets/IDs/input or final/history limits reject atomically.
    pub fn replace_general_range_typing_text(
        &mut self,
        snapshot: &RichLocalSnapshot,
        target: &RichSelectionKind,
        text: &str,
        empty: &[BlockId],
        clock_ms: u64,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        if !self.typing_history_enabled() {
            return Err(RichLocalSessionError::TypingHistoryDisabled);
        }
        let plan = self.plan_general_range_plain_text(snapshot, target, text)?;
        if text.is_empty() {
            return Ok(RichLocalOutcome::Unchanged);
        }
        if plan.collapsed && self.state.selection.as_ref().is_some_and(|s| s.kind() == target) {
            if !empty.is_empty() {
                return Err(crate::rich_content::actions::RichActionError::RangeFloorIds.into());
            }
            return self.insert_typing_text(snapshot, text, clock_ms);
        }
        let formats = plan.formats.clone();
        let outcome = self.publish_general_plain(snapshot, plan, empty)?;
        if outcome == RichLocalOutcome::ContentCommitted {
            self.typing_after(false, Kind::Insert, clock_ms, formats, separator(text));
        }
        Ok(outcome)
    }
}
