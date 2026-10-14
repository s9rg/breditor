//! Replace an explicit input target while retaining the user's actual pre-edit selection in history.
//!
//! Browser Backspace, native replacement and composition can target a span even
//! when the visible selection is a caret. Restaging that span as the owner's
//! selection would make Undo restore the wrong selection. This method publishes
//! the target edit, resulting caret and pending formats in one undo unit.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::{TextFragment, TextRun},
    rich_content::{
        RichSelection, RichSelectionKind,
        actions::{ReplaceTextRange, RichAction, RichActionError, replace_text_range::ordered},
    },
};

impl RichLocalSession {
    /// Replace a proved input target without publishing a temporary target selection.
    ///
    /// The actual caret's pending/effective style applies when it lies in the
    /// target; otherwise the logical start's affinity derives insertion style.
    /// Empty collapsed input is a no-op, not a selection change.
    ///
    /// # Errors
    /// Rejects stale observations, unsupported/non-scalar targets, invalid text or active limits atomically.
    pub fn replace_range_plain_text(
        &mut self,
        snapshot: &RichLocalSnapshot,
        target: &RichSelectionKind,
        text: &str,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        let selection = RichSelection::try_new(&self.state.document, target.clone())?;
        let RichSelectionKind::TextRange { anchor, focus } = selection.kind() else {
            return Err(RichActionError::SelectionKind.into());
        };
        if text.is_empty() && super::typing_state::caret(Some(&selection)).is_some() {
            return Ok(RichLocalOutcome::Unchanged);
        }
        let (start, end) = ordered(&self.state.document, anchor, focus)?;
        let original = super::typing_state::caret(self.state.selection.as_ref()).filter(|caret| {
            (caret.block() == start.block()
                && caret.offset() >= start.offset()
                && (start.block() != end.block() || caret.offset() <= end.offset()))
                || (caret.block() == end.block()
                    && caret.offset() <= end.offset()
                    && (start.block() != end.block() || caret.offset() >= start.offset()))
        });
        let source = original
            .unwrap_or_else(|| super::typing_state::caret(Some(&selection)).unwrap_or(start));
        let formats = if original.is_some() {
            self.state.effective_caret_formats()?
        } else {
            RichLocalState::try_new(
                &self.context,
                self.state.document.clone(),
                Some(RichSelectionKind::TextRange {
                    anchor: source.clone(),
                    focus: source.clone(),
                }),
                None,
                self.state.revision,
            )?
            .effective_caret_formats()?
        };
        let inserted = if text.is_empty() {
            TextFragment::empty()
        } else {
            TextRun::try_new(text, formats.clone())
                .map_err(|_| RichActionError::TextPrimitive)?
                .into()
        };
        let action = ReplaceTextRange::capture(&self.state.document, &selection, &inserted)?;
        let caret = action.insertion_end().clone();
        self.dispatch_with_pending_formats(
            snapshot,
            &[RichAction::ReplaceTextRange(action)],
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: caret.clone(),
                focus: caret,
            })),
            RichPendingFormatsUpdate::Set(Some(formats)),
        )
    }
}
