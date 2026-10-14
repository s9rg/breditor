//! Inline paste/deletion through the exclusive owner with one exact advanced caret.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::TextFragment,
    rich_content::{
        RichSelectionKind,
        actions::{ReplaceTextRange, RichAction, RichActionError},
    },
};

impl RichLocalSession {
    /// Replace selected rich text with a canonical fragment and collapse after insertion.
    ///
    /// Nonempty insertion retains the last inserted run's formats for subsequent
    /// typing, rather than inheriting an unrelated retained suffix at that seam.
    /// Empty deletion uses ordinary pending-format mapping. A collapsed empty
    /// insertion is a true no-op, including caret affinity and redo history.
    ///
    /// # Errors
    /// Rejects stale observations, non-text/unsupported ranges, invalid formats or active limits.
    pub fn replace_selection_text(
        &mut self,
        snapshot: &RichLocalSnapshot,
        inserted: &TextFragment,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        if inserted.is_empty()
            && super::typing_state::caret(self.state.selection.as_ref()).is_some()
        {
            return Ok(RichLocalOutcome::Unchanged);
        }
        let selection = self.state.selection.as_ref().ok_or(RichActionError::SelectionKind)?;
        let action = ReplaceTextRange::capture(&self.state.document, selection, inserted)?;
        let caret = action.insertion_end().clone();
        let pending = inserted.iter().next_back().map_or(RichPendingFormatsUpdate::Map, |run| {
            RichPendingFormatsUpdate::Set(Some(run.formats().clone()))
        });
        self.dispatch_with_pending_formats(
            snapshot,
            &[RichAction::ReplaceTextRange(action)],
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: caret.clone(),
                focus: caret,
            })),
            pending,
        )
    }
}
