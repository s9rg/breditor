use breditor_core::{
    document::{Document, NodeKind, NodeRef},
    position::NodePath,
};

pub(super) struct IndexedSemanticNode {
    path: NodePath,
    kind: NodeKind,
}

impl IndexedSemanticNode {
    pub(super) const fn path(&self) -> &NodePath {
        &self.path
    }

    pub(super) const fn kind(&self) -> NodeKind {
        self.kind
    }
}

pub(super) fn semantic_node_at(
    document: &Document,
    target_index: u32,
) -> Option<IndexedSemanticNode> {
    let mut next_index = 0_u64;
    let mut path = Vec::new();
    find_node_at(document.root(), u64::from(target_index), &mut next_index, &mut path)
}

pub(super) fn semantic_node_index(document: &Document, target_path: &NodePath) -> Option<u32> {
    document.node_at(target_path).ok()?;
    let mut next_index = 0_u64;
    let mut path = Vec::new();
    find_node_index(document.root(), target_path, &mut next_index, &mut path)
}

fn find_node_at(
    node: &NodeRef,
    target_index: u64,
    next_index: &mut u64,
    path: &mut Vec<u32>,
) -> Option<IndexedSemanticNode> {
    if *next_index == target_index {
        return Some(IndexedSemanticNode {
            path: NodePath::try_from_indices(path.clone()).ok()?,
            kind: node.kind(),
        });
    }
    *next_index = next_index.checked_add(1)?;
    let element = node.as_element()?;
    for (child_index, child) in element.children().iter().enumerate() {
        path.push(u32::try_from(child_index).ok()?);
        let found = find_node_at(child, target_index, next_index, path);
        path.pop();
        if found.is_some() {
            return found;
        }
    }
    None
}

fn find_node_index(
    node: &NodeRef,
    target_path: &NodePath,
    next_index: &mut u64,
    path: &mut Vec<u32>,
) -> Option<u32> {
    if path.iter().copied().eq(target_path.iter()) {
        return u32::try_from(*next_index).ok();
    }
    *next_index = next_index.checked_add(1)?;
    let element = node.as_element()?;
    for (child_index, child) in element.children().iter().enumerate() {
        path.push(u32::try_from(child_index).ok()?);
        let found = find_node_index(child, target_path, next_index, path);
        path.pop();
        if found.is_some() {
            return found;
        }
    }
    None
}
