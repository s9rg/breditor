//! Logical flow boundaries, independent of visual lines, bidi keys and mutation.
//!
//! Lists, tasks and quotes are transparent reading-order containers. Images,
//! visible tables and rules are single outer stops. A table cell and an image
//! caption each retain their own editing domain; grid/host commands own escape.
use super::{
    BlockId, RichDocument, RichSelection, RichSelectionError, RichSelectionKind, RichTextPoint,
    rich_selection::{block, text_length},
};
use crate::{
    document::ElementNode,
    position::{Affinity, NodePath, TextOffset},
};

/// Logical structural direction, never a claim about physical arrow or visual line order.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FlowMove {
    /// Previous stop; text destinations use their final scalar-aligned UTF-16 boundary.
    Before,
    /// Next stop; text destinations use their first boundary.
    After,
}

/// Pure selection plan; movement neither allocates identities nor edits content.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FlowNavigationOutcome {
    /// A proved selection in the same editing domain.
    Moved(RichSelection),
    /// No earlier/later visible stop exists in this domain. The source is retained.
    Boundary(FlowMove),
    /// A range, grid or interior text caret belongs to another navigation contract.
    NotApplicable,
}

/// Resolve the adjacent logical flow stop from a whole-node selection or text edge.
///
/// Ranges are never collapsed. Atoms are not silently entered or skipped, hidden
/// tables are not stops, and cell/caption navigation cannot escape its owner.
/// This walks adjacent siblings/ancestors and a destination edge, not a flattened
/// document-wide index. No DOM, replication engine or visual layout is involved.
///
/// # Errors
/// Rejects stale/foreign snapshot selections and contradictions of the admitted tree.
pub fn navigate_flow(
    document: &RichDocument,
    selection: &RichSelection,
    movement: FlowMove,
) -> Result<FlowNavigationOutcome, RichSelectionError> {
    selection.resolve(document)?;
    let id = match selection.kind() {
        RichSelectionKind::Node(id) => id,
        RichSelectionKind::TextRange { anchor, focus } => {
            if anchor.block() != focus.block() || anchor.offset() != focus.offset() {
                return Ok(FlowNavigationOutcome::NotApplicable);
            }
            let edge = match movement {
                FlowMove::Before => TextOffset::ZERO,
                FlowMove::After => text_length(block(document, focus.block())?)?,
            };
            if focus.offset() != edge {
                return Ok(FlowNavigationOutcome::NotApplicable);
            }
            focus.block()
        }
        RichSelectionKind::Grid { .. } | RichSelectionKind::Document => {
            return Ok(FlowNavigationOutcome::NotApplicable);
        }
    };
    let mut path = document.block_path(id).ok_or(RichSelectionError::MissingTarget)?.clone();
    let domain = domain(document, &path)?;
    while path != domain {
        let parent = path.parent().ok_or(RichSelectionError::Invariant)?;
        let count = element(document, &parent)?.children().len();
        let mut index = usize::try_from(path.last_index().ok_or(RichSelectionError::Invariant)?)
            .map_err(|_| RichSelectionError::Invariant)?;
        while let Some(next) = adjacent(index, count, movement) {
            let candidate = child(&parent, next)?;
            if let Some(selection) = edge_stop(document, &candidate, movement)? {
                return Ok(FlowNavigationOutcome::Moved(selection));
            }
            index = next;
        }
        path = parent;
    }
    Ok(FlowNavigationOutcome::Boundary(movement))
}

fn domain(document: &RichDocument, path: &NodePath) -> Result<NodePath, RichSelectionError> {
    let mut current = path.clone();
    while let Some(parent) = current.parent() {
        if matches!(
            element(document, &parent)?.kind().as_str(),
            "breditor/table-cell" | "breditor/image"
        ) {
            return Ok(parent);
        }
        current = parent;
    }
    Ok(NodePath::root())
}

fn element<'a>(
    document: &'a RichDocument,
    path: &NodePath,
) -> Result<&'a ElementNode, RichSelectionError> {
    document
        .document()
        .node_at(path)
        .ok()
        .and_then(crate::document::NodeRef::as_element)
        .ok_or(RichSelectionError::Invariant)
}
fn child(parent: &NodePath, index: usize) -> Result<NodePath, RichSelectionError> {
    parent
        .try_child(u32::try_from(index).map_err(|_| RichSelectionError::Invariant)?)
        .map_err(|_| RichSelectionError::Invariant)
}
fn adjacent(index: usize, count: usize, movement: FlowMove) -> Option<usize> {
    match movement {
        FlowMove::Before => index.checked_sub(1),
        FlowMove::After => index.checked_add(1).filter(|next| *next < count),
    }
}
fn identity(node: &ElementNode) -> Result<BlockId, RichSelectionError> {
    BlockId::try_new(
        super::ast_properties::string(node, "block-id")
            .map_err(|_| RichSelectionError::Invariant)?,
    )
    .map_err(|_| RichSelectionError::Invariant)
}

// Iterative depth-first edge search. Only the current bounded path is retained;
// a wide list never allocates a frontier or clones every sibling identity.
fn edge_stop(
    document: &RichDocument,
    root: &NodePath,
    movement: FlowMove,
) -> Result<Option<RichSelection>, RichSelectionError> {
    let mut path = root.clone();
    loop {
        let node = element(document, &path)?;
        let kind = match node.kind().as_str() {
            "breditor/paragraph" | "breditor/heading" | "breditor/code-block" => {
                let offset = match movement {
                    FlowMove::Before => text_length(node)?,
                    FlowMove::After => TextOffset::ZERO,
                };
                let affinity = match movement {
                    FlowMove::Before => Affinity::Before,
                    FlowMove::After => Affinity::After,
                };
                let point = RichTextPoint::new(identity(node)?, offset, affinity);
                Some(RichSelectionKind::TextRange { anchor: point.clone(), focus: point })
            }
            "breditor/image" | "breditor/table" | "breditor/horizontal-rule" => {
                Some(RichSelectionKind::Node(identity(node)?))
            }
            "breditor/bullet-list"
            | "breditor/ordered-list"
            | "breditor/list-item"
            | "breditor/blockquote"
            | "breditor/task-list"
            | "breditor/task-item" => None,
            _ => return Err(RichSelectionError::Invariant),
        };
        if let Some(kind) = kind {
            match RichSelection::try_new(document, kind) {
                Ok(selection) => return Ok(Some(selection)),
                Err(RichSelectionError::HiddenTable) => {}
                Err(error) => return Err(error),
            }
        } else if !node.children().is_empty() {
            let index = match movement {
                FlowMove::Before => node.children().len() - 1,
                FlowMove::After => 0,
            };
            path = child(&path, index)?;
            continue;
        }
        loop {
            if &path == root {
                return Ok(None);
            }
            let parent = path.parent().ok_or(RichSelectionError::Invariant)?;
            let index = usize::try_from(path.last_index().ok_or(RichSelectionError::Invariant)?)
                .map_err(|_| RichSelectionError::Invariant)?;
            if let Some(next) =
                adjacent(index, element(document, &parent)?.children().len(), movement)
            {
                path = child(&parent, next)?;
                break;
            }
            path = parent;
        }
    }
}
