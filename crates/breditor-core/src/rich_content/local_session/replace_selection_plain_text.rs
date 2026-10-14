//! Plain typing over a range derives logical-start style, independent of selection direction.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::{TextFragment, TextRun},
    rich_content::{
        RichSelectionKind,
        actions::{ReplaceTextRange, RichAction, RichActionError, replace_text_range::ordered},
    },
};

impl RichLocalSession {
    /// Replace a text selection with plain input, retaining pending/logical-start formats.
    ///
    /// At a caret, explicit pending formats take priority. Across a range the
    /// original logical start's affinity determines style, not backward/forward
    /// drag direction. The advanced caret retains this style for continued typing.
    ///
    /// # Errors
    /// Rejects stale observations, non-text/unsupported ranges, text construction or active limits.
    pub fn replace_selection_plain_text(
        &mut self,
        snapshot: &RichLocalSnapshot,
        text: &str,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        if text.is_empty() && super::typing_state::caret(self.state.selection.as_ref()).is_some() {
            return Ok(RichLocalOutcome::Unchanged);
        }
        let selection = self.state.selection.as_ref().ok_or(RichActionError::SelectionKind)?;
        let RichSelectionKind::TextRange { anchor, focus } = selection.kind() else {
            return Err(RichActionError::SelectionKind.into());
        };
        let start = if let Some(caret) = super::typing_state::caret(Some(selection)) {
            caret
        } else {
            ordered(&self.state.document, anchor, focus)?.0
        };
        let caret = RichSelectionKind::TextRange { anchor: start.clone(), focus: start.clone() };
        let state = RichLocalState::try_new(
            &self.context,
            self.state.document.clone(),
            Some(caret),
            self.state.pending_formats.clone(),
            self.state.revision,
        )?;
        let formats = state.effective_caret_formats()?;
        let fragment = if text.is_empty() {
            TextFragment::empty()
        } else {
            TextRun::try_new(text, formats.clone())
                .map_err(|_| RichActionError::TextPrimitive)?
                .into()
        };
        let action = ReplaceTextRange::capture(&self.state.document, selection, &fragment)?;
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
