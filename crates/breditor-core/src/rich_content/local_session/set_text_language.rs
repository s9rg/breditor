//! V4 text-run language over the native selection, through selection formatting.
use super::{RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot};
use crate::rich_content::{
    RichLanguageTag, RichSelectionFormatChange, RichTextLanguageError, actions::RichActionError,
};
impl RichLocalSession {
    /// Set (`Some`) or clear (`None`) the text language of the current selection.
    ///
    /// This is exactly one native selection-format change of the valued
    /// `breditor/text-language` format: a range replaces every selected
    /// character's language in one history group (unselected text keeps its
    /// value), and a caret changes pending typing formats only. Block direction
    /// and every other format are untouched.
    /// # Errors
    /// Stale or foreign observation, read-only owner, a non-V4 context, a missing
    /// or code selection and every resource/admission failure are atomic.
    pub fn set_text_language(
        &mut self,
        snapshot: &RichLocalSnapshot,
        language: Option<&RichLanguageTag>,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        if !self.context.schema().supports_rich_text_language() {
            return Err(RichActionError::from(RichTextLanguageError::Profile).into());
        }
        let change = match language {
            Some(tag) => RichSelectionFormatChange::Set(tag.format()),
            // A removal carries one complete admitted literal of the kind; its value is irrelevant.
            None => RichSelectionFormatChange::Remove(
                RichLanguageTag::canonicalize("und").map_err(RichActionError::from)?.format(),
            ),
        };
        self.change_selection_formats(snapshot, &[change])
    }
}
