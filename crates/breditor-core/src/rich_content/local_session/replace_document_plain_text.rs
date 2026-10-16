//! One whole-document plain replacement; exact actual before-UI survives Undo and restart.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::{FormatSet, TextFragment, TextRun},
    position::Affinity,
    rich_content::{
        BlockId, RichBlockDraft, RichSelectionError, RichSelectionKind, RichTextPoint,
        actions::{ReplaceDocument, RichAction, RichActionError},
    },
};
impl RichLocalSession {
    /// Replace an explicitly selected document with one fresh plain paragraph and a final caret.
    /// Empty text means Delete/Cut and retains a usable empty paragraph. No source format, layout,
    /// asset or hidden structure is implicitly carried into the replacement. This is one explicit
    /// history unit even when natural typing history is enabled; future typing starts separately.
    /// # Errors
    /// Stale/read-only guards precede target checks; wrong scope, reused ID, >64 KiB or final
    /// schema/resource failures publish no partial content, selection or history.
    pub fn replace_document_plain_text(
        &mut self,
        snapshot: &RichLocalSnapshot,
        paragraph: &BlockId,
        text: &str,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        if !matches!(
            self.state.selection.as_ref().map(crate::rich_content::RichSelection::kind),
            Some(RichSelectionKind::Document)
        ) {
            return Err(RichSelectionError::TargetKind.into());
        }
        if self.state.document.block_path(paragraph).is_some() {
            return Err(RichLocalSessionError::AtomIdentityReuse);
        }
        if text.len() > 64 * 1024 {
            return Err(RichActionError::TextPrimitive.into());
        }
        let formats = FormatSet::default();
        let fragment = if text.is_empty() {
            TextFragment::empty()
        } else {
            TextRun::try_new(text, formats.clone())
                .map_err(|_| RichActionError::TextPrimitive)?
                .into()
        };
        let draft =
            RichBlockDraft::paragraph(paragraph, &fragment).map_err(RichActionError::from)?;
        let action = ReplaceDocument::capture(&self.state.document, vec![draft])?;
        let point = RichTextPoint::new(paragraph.clone(), fragment.utf16_len(), Affinity::After);
        self.dispatch_with_pending_formats(
            snapshot,
            &[RichAction::ReplaceDocument(action)],
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: point.clone(),
                focus: point,
            })),
            RichPendingFormatsUpdate::Set(Some(formats)),
        )
    }
}
