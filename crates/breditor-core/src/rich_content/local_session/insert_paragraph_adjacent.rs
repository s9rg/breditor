//! Explicit text recovery beside a selected atom, using the original insertion action.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::TextFragment,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, FlowMove, RichBlockDraft, RichSelectionError, RichSelectionKind, RichTextPoint,
        actions::{InsertBlocks, RichAction, RichActionError},
    },
};

impl RichLocalSession {
    /// Insert and enter one fresh plain paragraph immediately before/after a selected atom.
    ///
    /// Only whole image, visible table and rule selections qualify. The original
    /// node, parent and sibling order remain intact. Explicit identity allocation
    /// and one existing insertion history recipe make sole/trailing atoms editable
    /// without hidden normalization or a new persisted gap selection.
    /// # Errors
    /// Stale/read-only, non-atom selections, duplicate IDs and limits reject atomically.
    pub fn insert_paragraph_adjacent(
        &mut self,
        snapshot: &RichLocalSnapshot,
        paragraph: &BlockId,
        movement: FlowMove,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let Some(RichSelectionKind::Node(block)) =
            self.state.selection.as_ref().map(crate::rich_content::RichSelection::kind)
        else {
            return Err(RichSelectionError::TargetKind.into());
        };
        if !matches!(
            super::super::rich_selection::block(&self.state.document, block)?.kind().as_str(),
            "breditor/image" | "breditor/table" | "breditor/horizontal-rule"
        ) {
            return Err(RichSelectionError::TargetKind.into());
        }
        let position = match movement {
            FlowMove::Before => self.state.document.flow_position_before(block),
            FlowMove::After => self.state.document.flow_position_after(block),
        }
        .ok_or(RichActionError::FlowParent)?;
        let draft = RichBlockDraft::paragraph(paragraph, &TextFragment::empty())
            .map_err(RichActionError::from)?;
        let action = InsertBlocks::capture(&self.state.document, &position, vec![draft])?;
        let point = RichTextPoint::new(paragraph.clone(), TextOffset::ZERO, Affinity::After);
        self.dispatch_with_pending_formats(
            snapshot,
            &[RichAction::InsertBlocks(action)],
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: point.clone(),
                focus: point,
            })),
            RichPendingFormatsUpdate::Set(None),
        )
    }
}
