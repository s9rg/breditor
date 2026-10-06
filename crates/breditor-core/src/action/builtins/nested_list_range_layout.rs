//! Result hierarchy for a contiguous nested text-range replacement.
//!
//! Keep the left block's location. Remove later selected leading blocks. Surviving
//! child sections of a removed item attach to the preceding retained sibling; if
//! there is none, they rise one level as separate sections. Marker families and
//! section starts remain explicit. Empty containers disappear. Every retained
//! text block stays in reading order; the operation independently proves that law.
use super::{outdent_list_items::suffix, support::fault};
use crate::{
    action::{ActionFault, text_position::TextRangeSelection},
    document::{ElementNode, NodeRef},
    position::NodePath,
    state::EditorState,
};

pub(super) fn replacement_roots(
    state: &EditorState,
    range: &TextRangeSelection,
    inserted: &[NodeRef],
) -> Result<Vec<NodeRef>, ActionFault> {
    let start = range.start().paragraph_path();
    let end = range.end().paragraph_path();
    let mut roots = Vec::new();
    for index in start.as_slice()[0]..=end.as_slice()[0] {
        let path = NodePath::try_from_indices(vec![index])
            .map_err(|_| fault("breditor/nested-range-path-fault"))?;
        let node = state
            .document()
            .node_at(&path)
            .map_err(|_| fault("breditor/nested-range-source-fault"))?;
        roots.extend(prune(node, &path, start, end)?);
    }
    if inserted.is_empty() {
        return Err(fault("breditor/nested-range-empty-replacement"));
    }
    if start.len() == 1 {
        roots.splice(0..1, inserted.iter().cloned());
    } else {
        // No removal precedes the left endpoint, so its path inside the first
        // guarded root is unchanged. Only its item expands into new siblings.
        let root = roots.first_mut().ok_or_else(|| fault("breditor/nested-range-source-fault"))?;
        let indexes = start.as_slice();
        *root = expand_item(
            root,
            &indexes[1..indexes.len() - 2],
            indexes[indexes.len() - 2],
            inserted,
        )?;
    }
    Ok(roots)
}

fn prune(
    node: &NodeRef,
    path: &NodePath,
    start: &NodePath,
    end: &NodePath,
) -> Result<Vec<NodeRef>, ActionFault> {
    let element = node.as_element().ok_or_else(|| fault("breditor/nested-range-source-fault"))?;
    if matches!(element.kind().as_str(), "breditor/paragraph" | "breditor/heading") {
        return Ok(if start < path && path <= end { vec![] } else { vec![node.clone()] });
    }
    let mut sections = Vec::new();
    let mut items: Vec<NodeRef> = Vec::new();
    let mut first_index = None;
    for (index, item) in element.children().iter().enumerate() {
        let index = u32::try_from(index).map_err(|_| fault("breditor/nested-range-path-fault"))?;
        let item_path =
            path.try_child(index).map_err(|_| fault("breditor/nested-range-path-fault"))?;
        let block_path =
            item_path.try_child(0).map_err(|_| fault("breditor/nested-range-path-fault"))?;
        let item = item.as_element().ok_or_else(|| fault("breditor/nested-range-source-fault"))?;
        let mut children = Vec::new();
        for (child_index, child) in item.children().iter().enumerate().skip(1) {
            let child_index = u32::try_from(child_index)
                .map_err(|_| fault("breditor/nested-range-path-fault"))?;
            let path = item_path
                .try_child(child_index)
                .map_err(|_| fault("breditor/nested-range-path-fault"))?;
            children.extend(prune(child, &path, start, end)?);
        }
        if start < &block_path && &block_path <= end {
            if let Some(previous) = items.last_mut() {
                let element = previous
                    .as_element()
                    .ok_or_else(|| fault("breditor/nested-range-source-fault"))?;
                let combined = element.children().iter().cloned().chain(children).collect();
                *previous = NodeRef::element(
                    element
                        .try_with_children(combined)
                        .map_err(|_| fault("breditor/nested-range-build-fault"))?,
                );
            } else {
                sections.extend(children);
            }
        } else {
            first_index.get_or_insert(index);
            let leading = item
                .children()
                .get(0)
                .ok_or_else(|| fault("breditor/nested-range-source-fault"))?
                .clone();
            let combined = std::iter::once(leading).chain(children).collect();
            items.push(NodeRef::element(
                item.try_with_children(combined)
                    .map_err(|_| fault("breditor/nested-range-build-fault"))?,
            ));
        }
    }
    if let Some(first) = first_index {
        sections.push(if first == 0 {
            NodeRef::element(
                element
                    .try_with_children(items)
                    .map_err(|_| fault("breditor/nested-range-build-fault"))?,
            )
        } else {
            suffix(node, first, items)?
        });
    }
    Ok(sections)
}

// Paths are already bounded by NodePath and source schema validation.
fn expand_item(
    node: &NodeRef,
    path: &[u32],
    index: u32,
    blocks: &[NodeRef],
) -> Result<NodeRef, ActionFault> {
    let element = node.as_element().ok_or_else(|| fault("breditor/nested-range-source-fault"))?;
    let mut children = element.children().to_vec();
    if let Some((first, rest)) = path.split_first() {
        let first =
            usize::try_from(*first).map_err(|_| fault("breditor/nested-range-path-fault"))?;
        let child =
            children.get_mut(first).ok_or_else(|| fault("breditor/nested-range-path-fault"))?;
        *child = expand_item(child, rest, index, blocks)?;
    } else {
        let index =
            usize::try_from(index).map_err(|_| fault("breditor/nested-range-path-fault"))?;
        let item = children
            .get(index)
            .and_then(NodeRef::as_element)
            .ok_or_else(|| fault("breditor/nested-range-source-fault"))?;
        let mut replacements = Vec::new();
        for (offset, block) in blocks.iter().enumerate() {
            let mut contents = vec![block.clone()];
            if offset + 1 == blocks.len() {
                contents.extend(item.children().iter().skip(1).cloned());
            }
            let replacement = if offset == 0 {
                item.try_with_children(contents)
            } else {
                ElementNode::try_new(item.kind().clone(), None, item.properties().clone(), contents)
            };
            replacements.push(NodeRef::element(
                replacement.map_err(|_| fault("breditor/nested-range-build-fault"))?,
            ));
        }
        children.splice(index..=index, replacements);
    }
    element
        .try_with_children(children)
        .map(NodeRef::element)
        .map_err(|_| fault("breditor/nested-range-build-fault"))
}
