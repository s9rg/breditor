//! Immutable rich runtime state; revision advances on each effective publication.

use super::RichLocalSessionError;
use crate::{
    document::FormatSet,
    position::Point,
    rich_content::{RichDocument, RichSelection, RichSelectionKind},
    state::{EditorContext, Revision},
};

/// One immutable local rich publication, excluding history and owner tokens.
#[derive(Clone, Debug)]
pub struct RichLocalState {
    pub(super) document: RichDocument,
    pub(super) selection: Option<RichSelection>,
    pub(super) pending_formats: Option<FormatSet>,
    pub(super) revision: Revision,
}

impl RichLocalState {
    pub(super) fn try_new(
        context: &EditorContext,
        document: RichDocument,
        selection: Option<RichSelectionKind>,
        pending_formats: Option<FormatSet>,
        revision: Revision,
    ) -> Result<Self, RichLocalSessionError> {
        let document = if context.schema().is_rich_content_profile()
            && document.document().is_proven_for(context.schema(), context.limits())
        {
            document
        } else {
            RichDocument::try_admit(context.schema(), document.into_document(), context.limits())?
        };
        let selection =
            selection.map(|kind| RichSelection::try_new(&document, kind)).transpose()?;
        super::typing_state::validate(context, selection.as_ref(), pending_formats.as_ref())?;
        Ok(Self { document, selection, pending_formats, revision })
    }
    /// The one authoritative admitted immutable AST and directory.
    #[must_use]
    pub const fn document(&self) -> &RichDocument {
        &self.document
    }
    /// Snapshot-bound logical selection, including explicit cleared state.
    #[must_use]
    pub const fn selection(&self) -> Option<&RichSelection> {
        self.selection.as_ref()
    }
    /// Explicit pending caret override; `Some(empty)` is distinct from deriving formats.
    #[must_use]
    pub const fn pending_formats(&self) -> Option<&FormatSet> {
        self.pending_formats.as_ref()
    }

    /// Effective pending or affinity-resolved source-run formats for one collapsed caret.
    ///
    /// # Errors
    /// Rejects absent/non-caret selections or inconsistent admitted source points.
    pub fn effective_caret_formats(&self) -> Result<FormatSet, RichLocalSessionError> {
        if super::typing_state::caret(self.selection.as_ref()).is_none() {
            return Err(RichLocalSessionError::TypingCaret);
        }
        if let Some(formats) = &self.pending_formats {
            return Ok(formats.clone());
        }
        let selection = self.selection.as_ref().ok_or(RichLocalSessionError::TypingCaret)?;
        let crate::rich_content::ResolvedRichSelection::TextRange { focus, .. } =
            selection.resolve(&self.document)?
        else {
            return Err(RichLocalSessionError::TypingCaret);
        };
        match focus {
            Point::Text { text_path, .. } => self
                .document
                .document()
                .node_at(&text_path)
                .ok()
                .and_then(crate::document::NodeRef::as_text)
                .map(|text| text.formats().clone())
                .ok_or(RichLocalSessionError::HistoryMismatch),
            Point::Children { .. } => Ok(FormatSet::default()),
        }
    }
    /// Monotonic u64 publication revision; browser transport must use exact words/strings.
    #[must_use]
    pub const fn revision(&self) -> Revision {
        self.revision
    }
}
