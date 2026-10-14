//! Atomic rich range replacement with one final-state admission and exact guarded inverse.

use super::{
    RichAction, RichActionError, RichEdit, branch_patch::BranchPatch, flow_siblings::FlowSiblings,
    node_patch::NodePatch, text_patch,
};
use crate::{
    document::{NodeRef, TextFragment},
    position::Affinity,
    rich_content::{
        BlockId, RichDocument, RichSelection, RichSelectionKind, RichTextPoint, ast_properties,
        rich_range_mapping::RichRangeMap,
        rich_text_mapping::{RichPositionMap, RichTextMap},
    },
    state::EditorContext,
};

/// Replace selected inline content across one text block or direct sibling rich flows.
///
/// The first block keeps its ID/kind, prefix and formatting; the last block's
/// suffix is appended without losing its formats. Fully selected intervening
/// flow/media nodes are removed, not flattened. Host asset bytes are never deleted.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplaceTextRange {
    branch: BranchPatch,
    pub(super) map: RichPositionMap,
    caret: RichTextPoint,
}

impl ReplaceTextRange {
    /// Capture one proved directional text range; collapsed ranges are ordinary insertions.
    ///
    /// Direct sibling flows and sibling leading list heads have exact structural semantics.
    /// Other cross-container ranges require their dedicated structural planner.
    /// Only the final replacement tree is subject to active aggregate limits.
    ///
    /// # Errors
    /// Rejects stale/non-text selections, unsupported flow boundaries or text/draft invariants.
    pub fn capture(
        document: &RichDocument,
        selection: &RichSelection,
        inserted: &TextFragment,
    ) -> Result<Self, RichActionError> {
        selection.resolve(document)?;
        let RichSelectionKind::TextRange { anchor, focus } = selection.kind() else {
            return Err(RichActionError::SelectionKind);
        };
        let (start, end) = ordered(document, anchor, focus)?;
        let first = text_patch::block_node(document, start.block())?;
        let last = text_patch::block_node(document, end.block())?;
        let original = text_patch::fragment(first)?;
        let prefix = original.split_at(start.offset()).map_err(|_| RichActionError::TextRange)?.0;
        let suffix = text_patch::fragment(last)?
            .split_at(end.offset())
            .map_err(|_| RichActionError::TextRange)?
            .1;
        let combined = prefix
            .try_concat(inserted)
            .and_then(|value| value.try_concat(&suffix))
            .map_err(|_| RichActionError::TextPrimitive)?;
        let after = text_patch::text_node(first, &combined)?;
        let (branch, map) = if start.block() == end.block() {
            (
                BranchPatch::Node(NodePatch::capture(document, start.block(), after.clone())?),
                RichPositionMap::Text(RichTextMap {
                    block: start.block().clone(),
                    start: start.offset(),
                    end: end.offset(),
                    inserted: inserted.utf16_len(),
                    before: first.clone(),
                    after,
                }),
            )
        } else {
            let (branch, removed) =
                if let Ok(flow) = FlowSiblings::capture(document, start.block(), end.block()) {
                    let mut removed = Vec::new();
                    for node in &flow.children[flow.first + 1..flow.last] {
                        removed_text(node, &mut removed)?;
                    }
                    (BranchPatch::Flow(flow.splice(document, vec![after.clone()])?), removed)
                } else {
                    super::text_range_list::capture(document, start, end, after.clone())?
                };
            let map = RichPositionMap::Range(RichRangeMap {
                first: start.block().clone(),
                last: end.block().clone(),
                start: start.offset(),
                end: end.offset(),
                inserted: inserted.utf16_len(),
                before_first: first.clone(),
                before_last: last.clone(),
                after,
                removed,
                undoing: false,
            });
            (branch, map)
        };
        let caret = caret(&map)?;
        Ok(Self { branch, map, caret })
    }
    /// Candidate collapsed caret after a successfully admitted replacement.
    #[must_use]
    pub const fn insertion_end(&self) -> &RichTextPoint {
        &self.caret
    }
    /// Apply as one final-state rewrite and return an exact retained inverse.
    ///
    /// # Errors
    /// Rejects stale source branches, incompatible schemas/formats or active resource policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        let map = self.map.inverse()?;
        let inverse = Self { branch: self.branch.inverse(), caret: caret(&map)?, map };
        self.branch.edit(context, document, RichAction::ReplaceTextRange(inverse))
    }
}

pub(crate) fn ordered<'a>(
    document: &RichDocument,
    anchor: &'a RichTextPoint,
    focus: &'a RichTextPoint,
) -> Result<(&'a RichTextPoint, &'a RichTextPoint), RichActionError> {
    if anchor.block() == focus.block() {
        return Ok(if anchor.offset() <= focus.offset() {
            (anchor, focus)
        } else {
            (focus, anchor)
        });
    }
    let first = document.block_path(anchor.block()).ok_or(RichActionError::MissingTarget)?.to_vec();
    let last = document.block_path(focus.block()).ok_or(RichActionError::MissingTarget)?.to_vec();
    Ok(if first < last { (anchor, focus) } else { (focus, anchor) })
}
fn caret(map: &RichPositionMap) -> Result<RichTextPoint, RichActionError> {
    let (block, offset) = match map {
        RichPositionMap::Text(map) => (
            map.block.clone(),
            map.start.checked_add(map.inserted.get()).map_err(|_| RichActionError::TextRange)?,
        ),
        RichPositionMap::Range(map) if map.undoing => (map.last.clone(), map.end),
        RichPositionMap::Range(map) => (
            map.first.clone(),
            map.start.checked_add(map.inserted.get()).map_err(|_| RichActionError::TextRange)?,
        ),
        RichPositionMap::Boundary(_) => return Err(RichActionError::Rewrite),
    };
    Ok(RichTextPoint::new(block, offset, Affinity::After))
}
pub(super) fn removed_text(
    node: &NodeRef,
    output: &mut Vec<(BlockId, NodeRef)>,
) -> Result<(), RichActionError> {
    let Some(element) = node.as_element() else {
        return Ok(());
    };
    if matches!(element.kind().as_str(), "breditor/paragraph" | "breditor/heading") {
        let id = BlockId::try_new(
            ast_properties::string(element, "block-id").map_err(|_| RichActionError::Rewrite)?,
        )
        .map_err(|_| RichActionError::Rewrite)?;
        output.push((id, node.clone()));
    } else {
        for child in element.children() {
            removed_text(child, output)?;
        }
    }
    Ok(())
}
