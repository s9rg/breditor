//! Candidate V4 page breaks through the exclusive local owner.
//!
//! Inserting places one atomic page break at an explicit root-flow position and maps the
//! current selection; deleting removes one page break and, when it is node-selected,
//! recovers the selection exactly like whole-atom deletion. Each is one history group
//! with an exact inverse.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichSelectionUpdate,
};
use crate::{
    document::TextFragment,
    rich_content::{
        BlockId, FlowMove, RichBlockDraft, RichFlowParent, RichFlowPosition, RichPageBreakError,
        RichSelectionKind,
        actions::{InsertBlocks, ReplaceBlocks, RichAction, RichActionError},
    },
};

impl RichLocalSession {
    /// Insert one page break with the fresh identity `block` at `position`, which must be
    /// a document-root position, as one history group. The selection is mapped.
    /// # Errors
    /// A non-root position ([`RichPageBreakError::Placement`]), a non-V4 context, a reused
    /// identity, a missing anchor, stale/read-only owners and admission failures are atomic.
    pub fn insert_page_break(
        &mut self,
        snapshot: &RichLocalSnapshot,
        position: &RichFlowPosition,
        block: &BlockId,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        self.require_page_breaks()?;
        if *position.parent() != RichFlowParent::Document {
            return Err(RichActionError::from(RichPageBreakError::Placement).into());
        }
        let draft = RichBlockDraft::page_break(block).map_err(RichActionError::from)?;
        let action = InsertBlocks::capture(&self.state.document, position, vec![draft])?;
        self.dispatch(snapshot, &[RichAction::InsertBlocks(action)], RichSelectionUpdate::Map)
    }

    /// Delete the page break `block` as one history group.
    ///
    /// A node selection of that page break recovers to an adjacent native stop exactly
    /// like [`Self::delete_atom`]; any other selection is mapped. `paragraph` is the fresh
    /// floor identity used only when the root would otherwise become empty (or no stop
    /// survives a node-selected deletion).
    /// # Errors
    /// A target that is not a page break ([`RichPageBreakError::Target`]), a non-V4
    /// context, a reused floor identity, stale/read-only owners and admission failures
    /// are atomic.
    pub fn delete_page_break(
        &mut self,
        snapshot: &RichLocalSnapshot,
        block: &BlockId,
        paragraph: &BlockId,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        self.require_page_breaks()?;
        let document = &self.state.document;
        if !document.is_page_break(block) {
            return Err(RichActionError::from(RichPageBreakError::Target).into());
        }
        if matches!(
            self.state.selection.as_ref().map(crate::rich_content::RichSelection::kind),
            Some(RichSelectionKind::Node(selected)) if selected == block
        ) {
            return self.delete_atom(snapshot, paragraph, FlowMove::After);
        }
        let sole =
            document.document().root().as_element().is_some_and(|root| root.children().len() == 1);
        let replacement = if sole {
            if document.block_path(paragraph).is_some() {
                return Err(RichLocalSessionError::AtomIdentityReuse);
            }
            vec![
                RichBlockDraft::paragraph(paragraph, &TextFragment::empty())
                    .map_err(RichActionError::from)?,
            ]
        } else {
            vec![]
        };
        let action = ReplaceBlocks::capture(document, block, block, replacement)?;
        self.dispatch(snapshot, &[RichAction::ReplaceBlocks(action)], RichSelectionUpdate::Map)
    }

    fn require_page_breaks(&self) -> Result<(), RichLocalSessionError> {
        if self.context.schema().supports_rich_page_breaks() {
            Ok(())
        } else {
            Err(RichActionError::from(RichPageBreakError::Profile).into())
        }
    }
}
