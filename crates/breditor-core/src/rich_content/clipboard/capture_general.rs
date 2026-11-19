//! General range copy retains selected rich content without borrowing unselected text for validity.
use super::{
    RichClipboardError, RichClipboardFragment, RichClipboardKind, capture::sliced, semantic_table,
};
use crate::{
    document::{ElementNode, NodeRef, PropertyInteger, PropertyValue, TextFragment},
    rich_content::{
        BlockId, RichBlockDraft, RichCoverageExtent, RichCoveredText, RichDocument, RichSelection,
        RichSelectionCoverage, TableId,
        actions::{rewrite_properties::with_properties, text_patch},
        ast_properties,
    },
    state::EditorContext,
};
use std::collections::BTreeMap;

impl RichClipboardFragment {
    /// Copy a general text range, or the unchanged original text/node/grid semantics when supported.
    ///
    /// Partial text is sliced at proved scalar-aligned boundaries. A partial image
    /// contributes only its selected caption, never its unselected asset/alt fields.
    /// Partial tables retain their axes, widths, headers and active merges, with
    /// unselected cell bodies replaced by neutral empty paragraphs.
    /// Partial list/task wrappers retain their selected rich children and required
    /// neutral heads. Synthetic empty paragraphs contain no source text or styles;
    /// their IDs are clipboard-local and must still be re-keyed before paste.
    /// This read changes neither the source document nor any editor UI/history.
    /// # Errors
    /// Stale/foreign selections, incompatible receiving policy, offset/identity
    /// contradictions or complete final schema/resource failures reject the capture.
    pub fn copy_general_selection(
        context: &EditorContext,
        document: &RichDocument,
        selection: &RichSelection,
    ) -> Result<Option<Self>, RichClipboardError> {
        match Self::copy_selection(context, document, selection) {
            Ok(value) => return Ok(value),
            Err(RichClipboardError::UnsupportedRange) => {}
            Err(error) => return Err(error),
        }
        let coverage = RichSelectionCoverage::capture(document, selection)?;
        let mut copier = Copier {
            document,
            nodes: coverage.nodes().iter().map(|n| (n.block().clone(), n.extent())).collect(),
            spans: coverage.text().iter().map(|s| (s.block().clone(), s)).collect(),
            floor: 0,
        };
        let source =
            document.document().root().as_element().ok_or(RichClipboardError::Invariant)?;
        let nodes = copier.capture(source.children().as_slice())?;
        Ok(Some(Self::from_nodes(context, RichClipboardKind::Flow, nodes)?))
    }
}
#[derive(Clone, Copy, Eq, PartialEq)]
enum Axes {
    None,
    Keep,
}
enum Work<'a> {
    Visit(&'a NodeRef, Axes),
    Finish(&'a ElementNode, RichCoverageExtent, usize),
}
struct Copier<'a> {
    document: &'a RichDocument,
    nodes: BTreeMap<BlockId, RichCoverageExtent>,
    spans: BTreeMap<BlockId, &'a RichCoveredText>,
    floor: u64,
}
impl Copier<'_> {
    fn capture(&mut self, source: &[NodeRef]) -> Result<Vec<NodeRef>, RichClipboardError> {
        let mut work = source.iter().rev().map(|n| Work::Visit(n, Axes::None)).collect::<Vec<_>>();
        let mut results: Vec<Vec<NodeRef>> = vec![];
        while let Some(step) = work.pop() {
            match step {
                Work::Visit(node, axes) => {
                    let element = node.as_element().ok_or(RichClipboardError::Invariant)?;
                    let id = identity(element)?;
                    let extent = self.nodes.get(&id).copied();
                    let scaffold = axes == Axes::Keep
                        && matches!(
                            element.kind().as_str(),
                            "breditor/table-row" | "breditor/table-cell"
                        );
                    if extent.is_none() && !scaffold {
                        results.push(vec![]);
                        continue;
                    }
                    if matches!(
                        element.kind().as_str(),
                        "breditor/paragraph" | "breditor/heading" | "breditor/code-block"
                    ) {
                        let span = self.spans.get(&id).ok_or(RichClipboardError::Invariant)?;
                        results.push(vec![text_patch::text_node(
                            node,
                            &sliced(node, span.start(), span.end())?,
                        )?]);
                        continue;
                    }
                    let extent = extent.unwrap_or(RichCoverageExtent::Partial);
                    let children_axes = match element.kind().as_str() {
                        "breditor/table" => Axes::Keep,
                        "breditor/table-row" => axes,
                        _ => Axes::None,
                    };
                    work.push(Work::Finish(element, extent, element.children().len()));
                    work.extend(
                        element.children().iter().rev().map(|n| Work::Visit(n, children_axes)),
                    );
                }
                Work::Finish(node, extent, count) => {
                    let at =
                        results.len().checked_sub(count).ok_or(RichClipboardError::Invariant)?;
                    let children = results.drain(at..).flatten().collect::<Vec<_>>();
                    results.push(self.finish(node, extent, children)?);
                }
            }
        }
        Ok(results.into_iter().flatten().collect())
    }
    fn finish(
        &mut self,
        source: &ElementNode,
        extent: RichCoverageExtent,
        mut children: Vec<NodeRef>,
    ) -> Result<Vec<NodeRef>, RichClipboardError> {
        let kind = source.kind().as_str();
        if kind == "breditor/image" && extent == RichCoverageExtent::Partial {
            return Ok(children);
        }
        if kind == "breditor/table-cell" && children.is_empty() {
            children.push(self.empty()?);
        }
        if matches!(kind, "breditor/list-item" | "breditor/task-item")
            && children.first().is_none_or(|n| {
                n.as_element().is_none_or(|n| {
                    !matches!(n.kind().as_str(), "breditor/paragraph" | "breditor/heading")
                })
            })
        {
            children.insert(0, self.empty()?);
        }
        let node = NodeRef::element(
            source.try_with_children(children).map_err(|_| RichClipboardError::Invariant)?,
        );
        let node = if kind == "breditor/table" {
            self.table(&node)?
        } else if kind == "breditor/ordered-list" && extent == RichCoverageExtent::Partial {
            Self::ordinal(source, &node)?
        } else {
            node
        };
        Ok(vec![node])
    }
    fn empty(&mut self) -> Result<NodeRef, RichClipboardError> {
        loop {
            let id = BlockId::try_new(format!("clipboard:general-floor:{}", self.floor))
                .map_err(|_| RichClipboardError::Invariant)?;
            self.floor = self.floor.checked_add(1).ok_or(RichClipboardError::Invariant)?;
            if self.document.block_path(&id).is_none() {
                return Ok(RichBlockDraft::paragraph(&id, &TextFragment::empty())?.into_node());
            }
        }
    }
    fn table(&self, node: &NodeRef) -> Result<NodeRef, RichClipboardError> {
        let source = node.as_element().ok_or(RichClipboardError::Invariant)?;
        let id = TableId::try_new(
            ast_properties::string(source, "table-id")
                .map_err(|_| RichClipboardError::Invariant)?,
        )
        .map_err(|_| RichClipboardError::Invariant)?;
        let view = self.document.table(&id)?.ok_or(RichClipboardError::Invariant)?;
        if view.geometry().is_hidden() {
            return Ok(with_properties(
                node,
                [
                    ("merges", Some(PropertyValue::array(vec![]))),
                    ("retracted-merges", Some(PropertyValue::array(vec![]))),
                ],
            )?);
        }
        semantic_table::rectangle(
            &view,
            node,
            (0, view.rows().len() - 1),
            (0, view.columns().len() - 1),
        )
    }
    fn ordinal(source: &ElementNode, node: &NodeRef) -> Result<NodeRef, RichClipboardError> {
        let first = node
            .as_element()
            .and_then(|n| n.children().get(0))
            .and_then(NodeRef::as_element)
            .ok_or(RichClipboardError::Invariant)?;
        let id = identity(first)?;
        let index = source
            .children()
            .iter()
            .position(|n| n.as_element().and_then(|n| identity(n).ok()).as_ref() == Some(&id))
            .ok_or(RichClipboardError::Invariant)?;
        // A reversed V4 copy keeps counting down; a start below 1 is unrepresentable.
        let start = i64::from(
            crate::rich_content::list_numbering::continuation_start(source, index)
                .ok_or(RichClipboardError::UnsupportedRange)?,
        );
        Ok(with_properties(
            node,
            [(
                "start",
                Some(PropertyValue::from_integer(
                    PropertyInteger::try_new(start).map_err(|_| RichClipboardError::Invariant)?,
                )),
            )],
        )?)
    }
}
fn identity(node: &ElementNode) -> Result<BlockId, RichClipboardError> {
    BlockId::try_new(
        ast_properties::string(node, "block-id").map_err(|_| RichClipboardError::Invariant)?,
    )
    .map_err(|_| RichClipboardError::Invariant)
}
