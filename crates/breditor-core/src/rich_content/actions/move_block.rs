//! Move one retained block subtree to a stable parent/before-anchor position.
//!
//! The moved block keeps its identity and complete body: nothing is copied,
//! deleted or re-inserted with fresh IDs. Only the lowest common ancestor of the
//! source and destination containers is rewritten, under an exact source guard.

use super::{
    RichAction, RichActionError, RichEdit, branch_patch::BranchPatch, flow_patch::FlowPatch,
    node_patch::NodePatch,
};
use crate::{
    document::NodeRef,
    position::NodePath,
    rich_content::{BlockId, RichDocument, RichFlowParent, ast_properties},
    state::EditorContext,
};

/// Containers whose direct children may be rearranged by a general block move.
const CONTAINERS: [&str; 9] = [
    "breditor/document",
    "breditor/blockquote",
    "breditor/details",
    "breditor/list-item",
    "breditor/task-item",
    "breditor/table-cell",
    "breditor/bullet-list",
    "breditor/ordered-list",
    "breditor/task-list",
];
/// Items whose first child must stay a text line.
const LEAD_ITEMS: [&str; 2] = ["breditor/list-item", "breditor/task-item"];

/// Exact guarded local move of one retained block; an absent before-anchor means append.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MoveBlock {
    patch: BranchPatch,
}

fn kind(node: &NodeRef) -> Option<&str> {
    node.as_element().map(|element| element.kind().as_str())
}

fn block_id(node: &NodeRef) -> Option<&str> {
    node.as_element().and_then(|element| ast_properties::string(element, "block-id").ok())
}

fn is_lead(node: Option<&NodeRef>) -> bool {
    matches!(node.and_then(kind), Some("breditor/paragraph" | "breditor/heading"))
}

fn index(value: u32) -> Result<usize, RichActionError> {
    usize::try_from(value).map_err(|_| RichActionError::Rewrite)
}

/// Rebuild `node` with the child at relative `path` replaced by `edit`'s result.
fn rewrite_at(
    node: &NodeRef,
    path: &[u32],
    edit: &mut dyn FnMut(&mut Vec<NodeRef>) -> Result<(), RichActionError>,
) -> Result<NodeRef, RichActionError> {
    let element = node.as_element().ok_or(RichActionError::Rewrite)?;
    let mut children = element.children().to_vec();
    if let Some((first, rest)) = path.split_first() {
        let child = children.get_mut(index(*first)?).ok_or(RichActionError::Rewrite)?;
        *child = rewrite_at(child, rest, edit)?;
    } else {
        edit(&mut children)?;
    }
    Ok(NodeRef::element(element.try_with_children(children).map_err(|_| RichActionError::Rewrite)?))
}

fn relative(path: &NodePath, ancestor: &NodePath) -> Vec<u32> {
    path.iter().skip(ancestor.len()).collect()
}

fn common_ancestor(left: &NodePath, right: &NodePath) -> Result<NodePath, RichActionError> {
    let shared: Vec<u32> =
        left.iter().zip(right.iter()).take_while(|(a, b)| a == b).map(|(a, _)| a).collect();
    NodePath::try_from_indices(shared).map_err(|_| RichActionError::Rewrite)
}

/// Resolve and check the moved block, returning its path and parent path.
fn source(
    document: &RichDocument,
    block: &BlockId,
) -> Result<(NodePath, NodePath), RichActionError> {
    let path = document.block_path(block).ok_or(RichActionError::MissingTarget)?.clone();
    let parent = path.parent().ok_or(RichActionError::MoveSource)?;
    let parent_node =
        document.document().node_at(&parent).map_err(|_| RichActionError::MissingTarget)?;
    // Rows, cells, captions and other non-container children have dedicated actions.
    if !kind(parent_node).is_some_and(|parent| CONTAINERS.contains(&parent)) {
        return Err(RichActionError::MoveSource);
    }
    // A section summary is part of its section, never an independently movable block.
    if document.document().node_at(&path).is_ok_and(crate::rich_content::details::is_summary_node) {
        return Err(RichActionError::MoveSource);
    }
    Ok((path, parent))
}

/// Resolve the destination container, rejecting non-containers and cycles.
fn destination(
    document: &RichDocument,
    source: &NodePath,
    parent: Option<&BlockId>,
) -> Result<NodePath, RichActionError> {
    let path = match parent {
        None => NodePath::root(),
        Some(id) => document.block_path(id).ok_or(RichActionError::MissingTarget)?.clone(),
    };
    if path.len() >= source.len() && path.iter().zip(source.iter()).all(|(a, b)| a == b) {
        return Err(RichActionError::MoveCycle);
    }
    let node = document.document().node_at(&path).map_err(|_| RichActionError::MissingTarget)?;
    if !kind(node).is_some_and(|parent| CONTAINERS.contains(&parent)) {
        return Err(RichActionError::FlowParent);
    }
    Ok(path)
}

impl MoveBlock {
    /// Capture a move of `block` into `parent` (the document root when `None`),
    /// before the direct child `before`, or appended when `before` is `None`.
    ///
    /// # Errors
    /// Rejects a missing block, parent or anchor; a row, cell, caption or other
    /// non-flow child; a destination inside the moved subtree; an anchor that is
    /// not a direct child of the destination; a move that would empty its source
    /// container; and a list or task item that would no longer start with a
    /// paragraph or heading. The child grammar is checked again on apply.
    pub fn capture(
        document: &RichDocument,
        block: &BlockId,
        parent: Option<&BlockId>,
        before: Option<&BlockId>,
    ) -> Result<Self, RichActionError> {
        let (source_path, source_parent) = source(document, block)?;
        let destination = destination(document, &source_path, parent)?;
        if let Some(anchor) = before {
            let anchor_path = document.block_path(anchor).ok_or(RichActionError::MissingTarget)?;
            if anchor_path.parent().as_ref() != Some(&destination) {
                return Err(RichActionError::MoveAnchor);
            }
        }
        let ancestor = common_ancestor(&source_parent, &destination)?;
        let original =
            document.document().node_at(&ancestor).map_err(|_| RichActionError::MissingTarget)?;
        let mut moved = None;
        let source_index = index(source_path.last_index().ok_or(RichActionError::Rewrite)?)?;
        let removed =
            rewrite_at(original, &relative(&source_parent, &ancestor), &mut |children| {
                moved = Some(children.remove(source_index));
                if children.is_empty() {
                    return Err(RichActionError::FlowWouldBeEmpty);
                }
                Ok(())
            })?;
        // Only a destination below a later sibling of the moved block shifts; the
        // before-anchor itself is re-resolved by identity after the removal.
        let mut destination_relative = relative(&destination, &ancestor);
        if source_parent == ancestor
            && let (Some(level), Some(source_level)) =
                (destination_relative.first_mut(), source_path.last_index())
            && *level > source_level
        {
            *level -= 1;
        }
        let replacement = rewrite_at(&removed, &destination_relative, &mut |children| {
            let at = before.map_or(Ok(children.len()), |anchor| {
                // Before itself is its own position: an admitted no-op, as in the shared move.
                if anchor == block {
                    return Ok(source_index);
                }
                children
                    .iter()
                    .position(|node| block_id(node) == Some(anchor.as_str()))
                    .ok_or(RichActionError::MoveAnchor)
            })?;
            children.insert(at, moved.take().ok_or(RichActionError::Rewrite)?);
            Ok(())
        })?;
        check_leads(document, &replacement, &[&source_parent, &destination])?;
        let patch = if ancestor.is_root() {
            BranchPatch::Flow(FlowPatch::rewrite_children(
                document,
                &RichFlowParent::Document,
                replacement.as_element().ok_or(RichActionError::Rewrite)?.children().to_vec(),
            )?)
        } else {
            let id = block_id(original).ok_or(RichActionError::Rewrite)?;
            BranchPatch::Node(NodePatch::capture(
                document,
                &BlockId::try_new(id).map_err(|_| RichActionError::Rewrite)?,
                replacement,
            )?)
        };
        Ok(Self { patch })
    }

    /// Publish one complete move with an exact inverse; an unchanged position is a no-op.
    ///
    /// # Errors
    /// Rejects stale sources, grammar violations or active schema/resource policy failures.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::MoveBlock(Self { patch: self.patch.inverse() }),
        )
    }
}

fn find<'a>(node: &'a NodeRef, id: &str) -> Option<&'a NodeRef> {
    if block_id(node) == Some(id) {
        return Some(node);
    }
    node.as_element()?.children().iter().find_map(|child| find(child, id))
}

/// Every list/task item touched by the move must still start with a text line, and every
/// touched section must keep its leading summary and a nonempty body.
fn check_leads(
    document: &RichDocument,
    replacement: &NodeRef,
    containers: &[&NodePath],
) -> Result<(), RichActionError> {
    for container in containers {
        let before =
            document.document().node_at(container).map_err(|_| RichActionError::Rewrite)?;
        let Some(element) = before.as_element() else { continue };
        if element.kind().as_str() == "breditor/details" {
            // A section keeps its summary first and at least one body block.
            let id = block_id(before).ok_or(RichActionError::Rewrite)?;
            let children = find(replacement, id)
                .and_then(NodeRef::as_element)
                .ok_or(RichActionError::Rewrite)?
                .children();
            if children.len() < 2
                || !children.get(0).is_some_and(crate::rich_content::details::is_summary_node)
                || children.iter().skip(1).any(crate::rich_content::details::is_summary_node)
            {
                return Err(crate::rich_content::RichDetailsError::Shape.into());
            }
            continue;
        }
        if !LEAD_ITEMS.contains(&element.kind().as_str()) {
            continue;
        }
        let id = block_id(before).ok_or(RichActionError::Rewrite)?;
        let after = find(replacement, id).ok_or(RichActionError::Rewrite)?;
        let first = after.as_element().and_then(|element| element.children().get(0));
        if !is_lead(first) {
            return Err(RichActionError::MoveItemLead);
        }
    }
    Ok(())
}
