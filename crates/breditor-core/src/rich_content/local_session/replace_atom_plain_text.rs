//! Explicit whole-atom replacement, suitable for plain paste and programmatic edits.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::{FormatSet, TextFragment, TextRun},
    position::Affinity,
    rich_content::{
        BlockId, RichBlockDraft, RichSelectionError, RichSelectionKind, RichTextPoint,
        actions::{ReplaceBlocks, RichAction, RichActionError},
        selected_flow_atom,
    },
};
impl RichLocalSession {
    /// Replace a selected whole image/table/rule with one fresh plain paragraph.
    ///
    /// Empty explicit text deliberately creates an empty paragraph. The caret is
    /// its final UTF-16 boundary with plain pending formats. One original action
    /// retains the entire source (including captions/geometry) for exact Undo.
    /// Asset storage is unaffected. This is not natural user-input grouping.
    /// # Errors
    /// Stale/read-only, non-atoms, reused IDs, malformed text and limits reject atomically.
    pub fn replace_atom_plain_text(
        &mut self,
        snapshot: &RichLocalSnapshot,
        paragraph: &BlockId,
        text: &str,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let source = self.state.selection.as_ref().ok_or(RichSelectionError::TargetKind)?;
        let target = selected_flow_atom(&self.state.document, source)?;
        if self.state.document.block_path(paragraph).is_some() {
            return Err(RichLocalSessionError::AtomIdentityReuse);
        }
        let formats = FormatSet::default();
        let fragment: TextFragment = if text.is_empty() {
            TextFragment::empty()
        } else {
            TextRun::try_new(text, formats.clone())
                .map_err(|_| RichActionError::TextPrimitive)?
                .into()
        };
        let draft =
            RichBlockDraft::paragraph(paragraph, &fragment).map_err(RichActionError::from)?;
        let action = ReplaceBlocks::capture(&self.state.document, &target, &target, vec![draft])?;
        let point = RichTextPoint::new(paragraph.clone(), fragment.utf16_len(), Affinity::After);
        self.dispatch_with_pending_formats(
            snapshot,
            &[RichAction::ReplaceBlocks(action)],
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: point.clone(),
                focus: point,
            })),
            RichPendingFormatsUpdate::Set(Some(formats)),
        )
    }
}
