//! Real-path text capture and explicit layout coordinates for flat-list actions.
use super::{flat_list_support::list_kind, support::fault};
use crate::{
    action::ActionFault,
    block::{ListKind, OrderedListStart},
    document::{ElementNode, NodeRef, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::FlatListRootShape,
    position::NodePath,
    state::EditorState,
};

pub(super) struct ListTextBlock {
    pub(super) node: NodeRef,
    pub(super) text: TextFragment,
    pub(super) root: u32,
    pub(super) kind: Option<ListKind>,
    pub(super) item: u32,
    pub(super) items: u32,
}

/// Called only after the flat-list schema/range admission. No direct-root
/// helper's language is widened to accommodate nested item paths.
pub(super) fn capture(state: &EditorState, path: &NodePath) -> Result<ListTextBlock, ActionFault> {
    let (root, item) = match path.as_slice() {
        [root] => (*root, 0),
        [root, item, 0] => (*root, *item),
        _ => return Err(fault("breditor/list-text-source-fault")),
    };
    let root_path = NodePath::try_from_indices(vec![root])
        .map_err(|_| fault("breditor/list-text-source-fault"))?;
    let root_node = state
        .document()
        .node_at(&root_path)
        .map_err(|_| fault("breditor/list-text-source-fault"))?;
    let kind = list_kind(root_node)?;
    if kind.is_some() != (path.len() == 3) {
        return Err(fault("breditor/list-text-source-fault"));
    }
    let items = if kind.is_some() {
        u32::try_from(
            root_node
                .as_element()
                .ok_or_else(|| fault("breditor/list-text-source-fault"))?
                .children()
                .len(),
        )
        .map_err(|_| fault("breditor/list-text-source-fault"))?
    } else {
        1
    };
    let node =
        state.document().node_at(path).map_err(|_| fault("breditor/list-text-source-fault"))?;
    let runs = node
        .as_element()
        .ok_or_else(|| fault("breditor/list-text-source-fault"))?
        .children()
        .iter()
        .map(|node| {
            node.as_text()
                .map(TextRun::from_text_node)
                .ok_or_else(|| fault("breditor/list-text-source-fault"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let text =
        TextFragment::try_from_runs(runs).map_err(|_| fault("breditor/list-text-source-fault"))?;
    Ok(ListTextBlock { node: node.clone(), text, root, kind, item, items })
}

pub(super) fn empty_block(template: &NodeRef, paragraph: bool) -> Result<NodeRef, ActionFault> {
    let node = if paragraph {
        ElementNode::try_new(
            QualifiedName::from_known_static("breditor/paragraph"),
            None,
            PropertyMap::default(),
            vec![],
        )
    } else {
        template
            .as_element()
            .ok_or_else(|| fault("breditor/list-text-source-fault"))?
            .try_with_children(vec![])
    }
    .map_err(|_| fault("breditor/list-text-block-fault"))?;
    Ok(NodeRef::element(node))
}

/// A retained ordered section keeps the original first surviving ordinal.
/// Count/final-ordinal admission belongs to the authoritative operation preview.
pub(super) fn shape(
    kind: Option<ListKind>,
    first: u32,
    count: u32,
) -> Result<FlatListRootShape, ActionFault> {
    match kind {
        None if first == 0 && count == 1 => Ok(FlatListRootShape::TextBlock),
        Some(kind) if count > 0 => {
            let kind = if let ListKind::Ordered(start) = kind {
                ListKind::Ordered(
                    OrderedListStart::try_new(
                        start
                            .ordinal_at(first)
                            .ok_or_else(|| fault("breditor/list-text-ordinal-fault"))?,
                    )
                    .map_err(|_| fault("breditor/list-text-ordinal-fault"))?,
                )
            } else {
                kind
            };
            Ok(FlatListRootShape::List { kind, items: count })
        }
        _ => Err(fault("breditor/list-text-layout-fault")),
    }
}

/// Locate a result block through the explicit layout, without guessing a DOM
/// index or publishing a transient intermediate document.
pub(super) fn result_path(
    root: u32,
    layout: &[FlatListRootShape],
    mut index: u32,
) -> Result<NodePath, ActionFault> {
    for (relative, shape) in layout.iter().enumerate() {
        let root = root
            .checked_add(
                u32::try_from(relative).map_err(|_| fault("breditor/list-text-path-fault"))?,
            )
            .ok_or_else(|| fault("breditor/list-text-path-fault"))?;
        let count = match shape {
            FlatListRootShape::TextBlock => 1,
            FlatListRootShape::List { items, .. } => *items,
        };
        if index < count {
            return NodePath::try_from_indices(match shape {
                FlatListRootShape::TextBlock => vec![root],
                FlatListRootShape::List { .. } => vec![root, index, 0],
            })
            .map_err(|_| fault("breditor/list-text-path-fault"));
        }
        index = index.checked_sub(count).ok_or_else(|| fault("breditor/list-text-path-fault"))?;
    }
    Err(fault("breditor/list-text-path-fault"))
}
