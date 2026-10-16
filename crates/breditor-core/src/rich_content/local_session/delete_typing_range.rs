//! Coalesce only proved directional, same-block, caret-adjacent deletion inputs.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichTypingDeleteDirection, typing_history::Kind,
};
use crate::rich_content::RichSelectionKind;

impl RichLocalSession {
    /// Delete one nonempty browser-planned scalar range immediately next to the actual caret.
    ///
    /// Reversed range direction is retained as input but its ordered bounds must
    /// touch the current caret on the requested side. Rust admits the complete
    /// target and preserves the actual pre-edit selection for Undo. Consecutive
    /// deletions of the same direction/style/context share the bounded burst;
    /// crossing a line separator is isolated, never joined to neighboring input.
    /// # Errors
    /// Rejects stale/read-only/disabled owners, wrong direction, cross-block or invalid ranges atomically.
    pub fn delete_typing_range(
        &mut self,
        snapshot: &RichLocalSnapshot,
        target: &RichSelectionKind,
        direction: RichTypingDeleteDirection,
        clock_ms: u64,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let kind = match direction {
            RichTypingDeleteDirection::Backward => Kind::Backward,
            RichTypingDeleteDirection::Forward => Kind::Forward,
        };
        let (join, formats) = self.typing_before(kind, clock_ms)?;
        let caret = super::typing_state::caret(self.state.selection.as_ref())
            .ok_or(RichLocalSessionError::TypingCaret)?;
        let RichSelectionKind::TextRange { anchor, focus } = target else {
            return Err(RichLocalSessionError::TypingDeleteTarget);
        };
        let start = anchor.offset().min(focus.offset());
        let end = anchor.offset().max(focus.offset());
        if anchor.block() != caret.block()
            || focus.block() != caret.block()
            || start >= end
            || match direction {
                RichTypingDeleteDirection::Backward => end != caret.offset(),
                RichTypingDeleteDirection::Forward => start != caret.offset(),
            }
        {
            return Err(RichLocalSessionError::TypingDeleteTarget);
        }
        let block = self
            .state
            .document
            .block_path(caret.block())
            .and_then(|path| self.state.document.document().node_at(path).ok())
            .and_then(crate::document::NodeRef::as_element)
            .ok_or(RichLocalSessionError::TypingDeleteTarget)?;
        let isolated = block
            .children()
            .iter()
            .filter_map(crate::document::NodeRef::as_text)
            .flat_map(|run| run.text().encode_utf16())
            .enumerate()
            .any(|(index, unit)| {
                (index as u64) >= start.get()
                    && (index as u64) < end.get()
                    && matches!(unit, 0x0a | 0x0d | 0x2028 | 0x2029)
            });
        let outcome = self.replace_range_plain_text(snapshot, target, "")?;
        if outcome == RichLocalOutcome::ContentCommitted {
            self.typing_after(join, kind, clock_ms, formats, isolated);
        }
        Ok(outcome)
    }
}
