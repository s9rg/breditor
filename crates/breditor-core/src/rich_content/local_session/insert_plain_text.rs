//! Author plain typing with effective caret formats and one atomic advanced-caret publication.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate, typing_state::caret,
};
use crate::{
    document::{TextFragment, TextRun},
    position::Affinity,
    rich_content::{
        RichSelectionKind, RichTextPoint,
        actions::{InsertText, RichAction, RichActionError},
    },
};

impl RichLocalSession {
    /// Insert plain input with effective pending/derived formats and advance the caret once.
    ///
    /// Empty input is a true no-op. Range replacement and paragraph/list Enter use
    /// their separately planned actions, not this collapsed-caret typing helper.
    ///
    /// # Errors
    /// Rejects stale observations, non-caret selections, invalid text or active host limits.
    pub fn insert_plain_text(
        &mut self,
        snapshot: &RichLocalSnapshot,
        text: &str,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        let point =
            caret(self.state.selection.as_ref()).ok_or(RichLocalSessionError::TypingCaret)?.clone();
        if text.is_empty() {
            return Ok(RichLocalOutcome::Unchanged);
        }
        let formats = self.state.effective_caret_formats()?;
        let text: TextFragment =
            TextRun::try_new(text, formats).map_err(|_| RichActionError::TextPrimitive)?.into();
        let action =
            RichAction::InsertText(InsertText::capture(&self.state.document, &point, &text)?);
        let next = RichTextPoint::new(
            point.block().clone(),
            point
                .offset()
                .checked_add(text.utf16_len().get())
                .map_err(|_| RichActionError::TextRange)?,
            Affinity::After,
        );
        self.dispatch_with_pending_formats(
            snapshot,
            &[action],
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: next.clone(),
                focus: next,
            })),
            RichPendingFormatsUpdate::Set(self.state.pending_formats.clone()),
        )
    }
}
