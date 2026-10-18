//! One admitted candidate and actual directional selection, never an unchecked target tree.
use super::{RichSearchError, RichSearchReplacePlan};
use crate::{
    rich_content::{RichDocument, RichSelection},
    state::EditorContext,
};
use std::fmt;

/// Native complete replacement preview with its source-proved mapped selection.
#[derive(Clone)]
pub struct RichSearchPreview {
    document: RichDocument,
    selection: Option<RichSelection>,
}
impl fmt::Debug for RichSearchPreview {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("RichSearchPreview")
            .field("has_selection", &self.selection.is_some())
            .finish_non_exhaustive()
    }
}
impl RichSearchPreview {
    /// Complete admitted candidate; no owner publication has occurred.
    #[must_use]
    pub const fn document(&self) -> &RichDocument {
        &self.document
    }
    /// Actual mapped direction/scope, or the original explicitly cleared selection.
    #[must_use]
    pub const fn selection(&self) -> Option<&RichSelection> {
        self.selection.as_ref()
    }
    /// Transfer the inseparable candidate and its mapped selection to an owner preflight.
    #[must_use]
    pub fn into_parts(self) -> (RichDocument, Option<RichSelection>) {
        (self.document, self.selection)
    }
}
impl RichSearchReplacePlan {
    /// Admit one complete candidate and map an actual source selection using the
    /// same splice boundaries as ordinary edits. No caller-supplied target is trusted.
    /// # Errors
    /// Rejects stale/foreign source, active policy failures or an invalid source selection.
    pub fn preview_with_selection(
        &self,
        context: &EditorContext,
        document: &RichDocument,
        selection: Option<&RichSelection>,
    ) -> Result<RichSearchPreview, RichSearchError> {
        let candidate = self.preview(context, document)?;
        let selection = selection
            .map(|selection| self.map_selection(selection, &candidate))
            .transpose()
            .map_err(|_| RichSearchError::Selection)?;
        Ok(RichSearchPreview { document: candidate, selection })
    }
}
