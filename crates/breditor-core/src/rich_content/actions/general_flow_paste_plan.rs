//! Atomic rich-flow insertion over general text coverage; planning never publishes partial edits.
use super::{InsertBlocks, RichAction, RichActionError, RichGeneralRangePlan, SplitTextBlock};
use crate::{
    document::TextFragment,
    position::{Affinity, TextOffset},
    rich_content::{BlockId, RichBlockDraft, RichDocument, RichSelection, RichTextPoint},
    state::EditorContext,
};

/// Three dependent native phases, captured against their exact preceding immutable documents.
#[derive(Clone, Debug)]
pub struct RichGeneralFlowPastePlan {
    actions: Vec<RichAction>,
    document: RichDocument,
    caret: RichTextPoint,
}
impl RichGeneralFlowPastePlan {
    /// Trim general coverage, split its retained prose start, then insert rich blocks before the suffix.
    /// Partially selected structural owners survive; all pasted identities must already be fresh.
    /// The caller supplies exactly the native range floor IDs and a separate fresh suffix ID.
    /// No interim selection is published, so an owner can retain its real before-UI in one history unit.
    /// # Errors
    /// Invalid/stale ranges, caption/code insertion starts, reused IDs, wrong floor counts,
    /// invalid pasted grammar or final resource limits reject the complete plan.
    pub fn capture(
        context: &EditorContext,
        document: &RichDocument,
        selection: &RichSelection,
        empty: &[BlockId],
        right: &BlockId,
        blocks: Vec<RichBlockDraft>,
    ) -> Result<Self, RichActionError> {
        if blocks.is_empty() || document.block_path(right).is_some() {
            return Err(RichActionError::FlowRange);
        }
        // A source identity cannot become a fresh birth merely because this range deletes it.
        let nodes: Vec<_> = blocks.iter().cloned().map(RichBlockDraft::into_node).collect();
        let mut todo: Vec<_> = nodes.iter().collect();
        while let Some(node) = todo.pop() {
            if let Some(element) = node.as_element() {
                let id = BlockId::try_new(
                    super::super::ast_properties::string(element, "block-id")
                        .map_err(|_| RichActionError::FlowRange)?,
                )
                .map_err(|_| RichActionError::FlowRange)?;
                if document.block_path(&id).is_some() || id == *right || empty.contains(&id) {
                    return Err(RichActionError::RangeFloorIds);
                }
                todo.extend(element.children());
            }
        }
        let replace = RichGeneralRangePlan::capture(document, selection, &TextFragment::empty())?;
        let point = replace.insertion_end()?;
        let mut plan = Self { actions: vec![], document: document.clone(), caret: point.clone() };
        plan.add(context, replace.action(empty)?)?;
        plan.add(
            context,
            RichAction::SplitTextBlock(SplitTextBlock::capture(
                &plan.document,
                &point,
                right,
                None,
            )?),
        )?;
        let position =
            plan.document.flow_position_before(right).ok_or(RichActionError::FlowParent)?;
        plan.add(
            context,
            RichAction::InsertBlocks(InsertBlocks::capture(&plan.document, &position, blocks)?),
        )?;
        plan.caret = RichTextPoint::new(right.clone(), TextOffset::ZERO, Affinity::After);
        Ok(plan)
    }
    fn add(&mut self, context: &EditorContext, action: RichAction) -> Result<(), RichActionError> {
        if let Some(edit) = action.apply(context, &self.document)? {
            self.document = edit.document().clone();
        }
        self.actions.push(action);
        Ok(())
    }
    /// Exact dependent captured actions, dispatched together under one observed owner guard.
    #[must_use]
    pub fn actions(&self) -> &[RichAction] {
        &self.actions
    }
    /// Fully admitted result for cross-adapter equivalence checks, not an authoring root replacement.
    #[must_use]
    pub const fn document(&self) -> &RichDocument {
        &self.document
    }
    /// Collapsed insertion caret in the retained right suffix.
    #[must_use]
    pub const fn insertion_end(&self) -> &RichTextPoint {
        &self.caret
    }
}
