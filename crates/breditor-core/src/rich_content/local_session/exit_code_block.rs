//! Exit code without splitting or converting it; persist only the existing flow insertion action.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::TextFragment,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichBlockDraft, RichSelectionKind, RichTextPoint,
        actions::{InsertBlocks, RichAction, RichActionError},
    },
};

impl RichLocalSession {
    /// Insert a fresh empty paragraph immediately after the current code block and enter it.
    ///
    /// Requires one scalar-aligned collapsed code caret, at any offset. All code
    /// text/language and surrounding flow remain unchanged. The new paragraph
    /// stays in the same document/cell/quote/list/task body, before its original
    /// next sibling. Pending styles derive afresh. One existing `InsertBlocks`
    /// history recipe owns the insertion and exact before/after selection.
    ///
    /// # Errors
    /// Stale/foreign observations and read-only policy reject before planning.
    /// Wrong selections, reused IDs, unsupported flow or limits publish nothing.
    pub fn exit_code_block(
        &mut self,
        snapshot: &RichLocalSnapshot,
        paragraph: &BlockId,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let point = super::typing_state::caret(self.state.selection.as_ref())
            .ok_or(RichLocalSessionError::TypingCaret)?;
        let node = super::super::rich_selection::block(&self.state.document, point.block())?;
        if node.kind().as_str() != "breditor/code-block" {
            return Err(RichActionError::CodeTarget.into());
        }
        let position = self
            .state
            .document
            .flow_position_after(point.block())
            .ok_or(RichActionError::FlowParent)?;
        let draft = RichBlockDraft::paragraph(paragraph, &TextFragment::empty())
            .map_err(RichActionError::from)?;
        let action = InsertBlocks::capture(&self.state.document, &position, vec![draft])?;
        let caret = RichTextPoint::new(paragraph.clone(), TextOffset::ZERO, Affinity::After);
        self.dispatch_with_pending_formats(
            snapshot,
            &[RichAction::InsertBlocks(action)],
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: caret.clone(),
                focus: caret,
            })),
            RichPendingFormatsUpdate::Set(None),
        )
    }
}
