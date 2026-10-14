//! Immutable rich runtime state; revision advances on each effective publication.

use super::RichLocalSessionError;
use crate::{
    rich_content::{RichDocument, RichSelection, RichSelectionKind},
    state::{EditorContext, Revision},
};

/// One immutable local rich publication, excluding history and owner tokens.
#[derive(Clone, Debug)]
pub struct RichLocalState {
    pub(super) document: RichDocument,
    pub(super) selection: Option<RichSelection>,
    pub(super) revision: Revision,
}

impl RichLocalState {
    pub(super) fn try_new(
        context: &EditorContext,
        document: RichDocument,
        selection: Option<RichSelectionKind>,
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
        Ok(Self { document, selection, revision })
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
    /// Monotonic u64 publication revision; browser transport must use exact words/strings.
    #[must_use]
    pub const fn revision(&self) -> Revision {
        self.revision
    }
}
