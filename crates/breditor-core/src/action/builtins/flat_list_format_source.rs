//! Captures exact roots and their unchanged layout for flat-list formatting.
use super::{
    flat_list_support::list_kind,
    flat_list_text_support::{capture, shape},
    support::fault,
};
use crate::{
    action::{ActionFault, text_position::TextRangeSelection},
    document::{NodeRef, TextFragment},
    operation::FlatListRootShape,
    position::NodePath,
    state::EditorState,
};

pub(super) struct FormatBlock {
    pub(super) path: NodePath,
    pub(super) node: NodeRef,
    pub(super) text: TextFragment,
}
pub(super) struct FormatSource {
    pub(super) start: u32,
    pub(super) roots: Vec<NodeRef>,
    pub(super) layout: Vec<FlatListRootShape>,
    pub(super) blocks: Vec<FormatBlock>,
}
impl FormatSource {
    /// The schema and selection have already been admitted by the action. Root
    /// guards include unselected prefix/suffix items; their layout stays exact.
    pub(super) fn capture(
        state: &EditorState,
        range: &TextRangeSelection,
    ) -> Result<Self, ActionFault> {
        let start = range
            .start()
            .paragraph_path()
            .iter()
            .next()
            .ok_or_else(|| fault("breditor/list-format-range-fault"))?;
        let end = range
            .end()
            .paragraph_path()
            .iter()
            .next()
            .ok_or_else(|| fault("breditor/list-format-range-fault"))?;
        let mut roots = Vec::new();
        let mut layout = Vec::new();
        let mut blocks = Vec::new();
        for index in start..=end {
            let path = NodePath::try_from_indices(vec![index])
                .map_err(|_| fault("breditor/list-format-path-fault"))?;
            let node = state
                .document()
                .node_at(&path)
                .map_err(|_| fault("breditor/list-format-source-fault"))?;
            let kind = list_kind(node)?;
            let items = if kind.is_some() {
                u32::try_from(
                    node.as_element()
                        .ok_or_else(|| fault("breditor/list-format-source-fault"))?
                        .children()
                        .len(),
                )
                .map_err(|_| fault("breditor/list-format-source-fault"))?
            } else {
                1
            };
            layout.push(shape(kind, 0, items)?);
            roots.push(node.clone());
            for item in 0..items {
                let path = if kind.is_some() {
                    NodePath::try_from_indices(vec![index, item, 0])
                        .map_err(|_| fault("breditor/list-format-path-fault"))?
                } else {
                    path.clone()
                };
                let source = capture(state, &path)?;
                blocks.push(FormatBlock { path, node: source.node, text: source.text });
            }
        }
        Ok(Self { start, roots, layout, blocks })
    }
}
