//! Snapshot-bound coverage keeps structural topology, text intervals and editing domains.
//!
//! This is an immutable read/plan, not a new serialized selection, a mutable
//! document projection or permission to publish. Original text ranges retain
//! their AST order; grid rectangles retain merged closure without becoming a
//! text range. Explicit whole-document coverage also includes leading/trailing
//! atoms which cannot be represented by two text endpoints.
use super::{
    BlockId, CellId, ColumnId, RichDocument, RichSelection, RichSelectionError, RichSelectionKind,
    RowId, TableId, ast_properties, rich_selection::text_length,
};
use crate::{
    document::{ElementNode, NodeRef},
    identity::QualifiedName,
    position::{NodePath, TextOffset},
};

/// Nearest protected text owner, independent of transparent lists and quotes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RichCoverageDomain {
    /// Ordinary document flow, including nested lists, tasks, quotes and code.
    Document,
    /// One original base cell; covered merged bodies retain their own identities.
    Cell(CellId),
    /// Caption of this image block, never the image's outer flow.
    Caption(BlockId),
}
/// Whether the selection encloses a structural node, rather than only touching descendants.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichCoverageExtent {
    /// A boundary crosses or lies within this node; do not infer whole-node deletion.
    Partial,
    /// The complete node is within the selected scope.
    Whole,
}
/// One selected structural record in AST preorder, including partial ancestors.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichCoveredNode {
    block: BlockId,
    parent: Option<BlockId>,
    kind: QualifiedName,
    extent: RichCoverageExtent,
    domain: RichCoverageDomain,
    hidden_table: bool,
}
impl RichCoveredNode {
    /// Existing stable source identity, not an allocated replacement ID.
    #[must_use]
    pub const fn block(&self) -> &BlockId {
        &self.block
    }
    /// Immediate structural parent; absent only for direct document children.
    #[must_use]
    pub const fn parent(&self) -> Option<&BlockId> {
        self.parent.as_ref()
    }
    /// Admitted node kind, including rows, cells and item wrappers.
    #[must_use]
    pub const fn kind(&self) -> &QualifiedName {
        &self.kind
    }
    /// Whole or partial structural inclusion. Text endpoints do not select their wrappers.
    #[must_use]
    pub const fn extent(&self) -> RichCoverageExtent {
        self.extent
    }
    /// Nearest protected editing owner for this node.
    #[must_use]
    pub const fn domain(&self) -> &RichCoverageDomain {
        &self.domain
    }
    /// A retained zero-axis table, not a newly admitted visible node selection.
    #[must_use]
    pub const fn is_hidden_table(&self) -> bool {
        self.hidden_table
    }
}
/// One exact half-open UTF-16 interval, retaining zero-width boundary blocks.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichCoveredText {
    block: BlockId,
    kind: QualifiedName,
    start: TextOffset,
    end: TextOffset,
    domain: RichCoverageDomain,
}
impl RichCoveredText {
    /// Existing paragraph, heading or code block.
    #[must_use]
    pub const fn block(&self) -> &BlockId {
        &self.block
    }
    /// Exact text kind; consumers must not silently format or convert code.
    #[must_use]
    pub const fn kind(&self) -> &QualifiedName {
        &self.kind
    }
    /// Inclusive scalar-aligned UTF-16 boundary.
    #[must_use]
    pub const fn start(&self) -> TextOffset {
        self.start
    }
    /// Exclusive scalar-aligned UTF-16 boundary.
    #[must_use]
    pub const fn end(&self) -> TextOffset {
        self.end
    }
    /// Protected base cell/caption ownership, or ordinary document flow.
    #[must_use]
    pub const fn domain(&self) -> &RichCoverageDomain {
        &self.domain
    }
}
/// One proved immutable selection/document coverage; contains no copied Unicode or asset bytes.
#[derive(Clone, Debug)]
pub struct RichSelectionCoverage {
    source: RichDocument,
    selection: Option<RichSelectionKind>,
    backward: Option<bool>,
    nodes: Vec<RichCoveredNode>,
    text: Vec<RichCoveredText>,
    utf16: u64,
}
impl RichSelectionCoverage {
    /// Cover one exact admitted text/node/grid selection, preserving its original direction.
    ///
    /// Text endpoints retain the original AST interval interpretation. Grid
    /// coverage includes each merge-closed source cell once, never intervening
    /// unselected cells. Whole-node selection includes its subtree, not siblings.
    /// # Errors
    /// Stale/foreign proof or a contradiction of the admitted AST rejects the complete read.
    pub fn capture(
        document: &RichDocument,
        selection: &RichSelection,
    ) -> Result<Self, RichSelectionError> {
        selection.resolve(document)?;
        Self::build(document, Some(selection.kind().clone()))
    }
    /// Cover the complete document, including atoms, hidden tables and empty blocks.
    ///
    /// This explicit read does not manufacture an original text selection or
    /// change an editor's selection/checkpoint. A later mutation still requires
    /// its own named policy, exact owner observation and admitted actions.
    /// # Errors
    /// Rejects a contradiction of the already admitted rich tree or checked totals.
    pub fn document(document: &RichDocument) -> Result<Self, RichSelectionError> {
        Self::build(document, None)
    }
    /// Original directional candidate; `None` means explicit whole-document coverage.
    #[must_use]
    pub const fn selection(&self) -> Option<&RichSelectionKind> {
        self.selection.as_ref()
    }
    /// Text direction only; node/grid/document scopes retain their original source values.
    #[must_use]
    pub const fn is_backward(&self) -> Option<bool> {
        self.backward
    }
    /// Selected structural nodes in AST preorder, with original parent relationships.
    #[must_use]
    pub fn nodes(&self) -> &[RichCoveredNode] {
        &self.nodes
    }
    /// Selected intervals in AST order; no base-cell body or caption is duplicated.
    #[must_use]
    pub fn text(&self) -> &[RichCoveredText] {
        &self.text
    }
    /// Exact selected Unicode length, excluding structural separators and atom labels.
    #[must_use]
    pub const fn selected_utf16(&self) -> u64 {
        self.utf16
    }
    /// Recheck the immutable source before consuming this read as an edit plan.
    /// # Errors
    /// A different document/schema or changed source tree rejects; equal independent trees are legal.
    pub fn validate_document(&self, document: &RichDocument) -> Result<(), RichSelectionError> {
        if self.source.id() != document.id()
            || self.source.document().schema_fingerprint()
                != document.document().schema_fingerprint()
        {
            return Err(RichSelectionError::Binding);
        }
        if self.source.document().root() != document.document().root() {
            return Err(RichSelectionError::StaleSnapshot);
        }
        Ok(())
    }
    fn build(
        document: &RichDocument,
        selection: Option<RichSelectionKind>,
    ) -> Result<Self, RichSelectionError> {
        let scope = scope::Scope::new(document, selection.as_ref())?;
        let mut result = Self {
            source: document.clone(),
            selection,
            backward: scope.backward(),
            nodes: vec![],
            text: vec![],
            utf16: 0,
        };
        let mut path = NodePath::root();
        loop {
            let node = element(document, &path)?;
            let included = scope.extent(&path);
            if let Some(extent) = included
                && !path.is_root()
            {
                result.record(document, &path, node, extent, &scope)?;
            }
            if included.is_some() && !is_text(node) && !node.children().is_empty() {
                path = child(&path, 0)?;
                continue;
            }
            let Some(next) = next(document, &path)? else {
                break;
            };
            path = next;
        }
        Ok(result)
    }
    fn record(
        &mut self,
        document: &RichDocument,
        path: &NodePath,
        node: &ElementNode,
        extent: RichCoverageExtent,
        scope: &scope::Scope<'_>,
    ) -> Result<(), RichSelectionError> {
        let block = identity(node)?;
        let domain = domain(document, path)?;
        let parent_path = path.parent().ok_or(RichSelectionError::Invariant)?;
        let parent = if parent_path.is_root() {
            None
        } else {
            Some(identity(element(document, &parent_path)?)?)
        };
        let hidden_table = if node.kind().as_str() == "breditor/table" {
            let id = TableId::try_new(
                ast_properties::string(node, "table-id")
                    .map_err(|_| RichSelectionError::Invariant)?,
            )
            .map_err(|_| RichSelectionError::Invariant)?;
            document
                .table(&id)
                .map_err(|_| RichSelectionError::Invariant)?
                .ok_or(RichSelectionError::Invariant)?
                .geometry()
                .is_hidden()
        } else {
            false
        };
        self.nodes.push(RichCoveredNode {
            block: block.clone(),
            parent,
            kind: node.kind().clone(),
            extent,
            domain: domain.clone(),
            hidden_table,
        });
        if is_text(node) {
            let (start, end) = scope.interval(path, text_length(node)?);
            self.utf16 = self
                .utf16
                .checked_add(end.get() - start.get())
                .ok_or(RichSelectionError::Invariant)?;
            self.text.push(RichCoveredText {
                block,
                kind: node.kind().clone(),
                start,
                end,
                domain,
            });
        }
        Ok(())
    }
}
mod scope;
fn is_text(node: &ElementNode) -> bool {
    matches!(
        node.kind().as_str(),
        "breditor/paragraph"
            | "breditor/heading"
            | "breditor/code-block"
            | "breditor/details-summary"
    )
}
fn element<'a>(
    document: &'a RichDocument,
    path: &NodePath,
) -> Result<&'a ElementNode, RichSelectionError> {
    document
        .document()
        .node_at(path)
        .ok()
        .and_then(NodeRef::as_element)
        .ok_or(RichSelectionError::Invariant)
}
fn identity(node: &ElementNode) -> Result<BlockId, RichSelectionError> {
    BlockId::try_new(
        ast_properties::string(node, "block-id").map_err(|_| RichSelectionError::Invariant)?,
    )
    .map_err(|_| RichSelectionError::Invariant)
}
fn child(path: &NodePath, index: usize) -> Result<NodePath, RichSelectionError> {
    path.try_child(u32::try_from(index).map_err(|_| RichSelectionError::Invariant)?)
        .map_err(|_| RichSelectionError::Invariant)
}
fn next(document: &RichDocument, path: &NodePath) -> Result<Option<NodePath>, RichSelectionError> {
    let mut path = path.clone();
    while let Some(parent) = path.parent() {
        let index = usize::try_from(path.last_index().ok_or(RichSelectionError::Invariant)?)
            .map_err(|_| RichSelectionError::Invariant)?
            + 1;
        if index < element(document, &parent)?.children().len() {
            return Ok(Some(child(&parent, index)?));
        }
        path = parent;
    }
    Ok(None)
}
fn domain(
    document: &RichDocument,
    path: &NodePath,
) -> Result<RichCoverageDomain, RichSelectionError> {
    let mut current = path.clone();
    while let Some(parent) = current.parent() {
        let node = element(document, &parent)?;
        if node.kind().as_str() == "breditor/image" {
            return Ok(RichCoverageDomain::Caption(identity(node)?));
        }
        if node.kind().as_str() == "breditor/table-cell" {
            let row_path = parent.parent().ok_or(RichSelectionError::Invariant)?;
            let table_path = row_path.parent().ok_or(RichSelectionError::Invariant)?;
            let value = |node, key| {
                ast_properties::string(node, key).map_err(|_| RichSelectionError::Invariant)
            };
            let table = TableId::try_new(value(element(document, &table_path)?, "table-id")?)
                .map_err(|_| RichSelectionError::Invariant)?;
            let row = RowId::try_new(value(element(document, &row_path)?, "row-id")?)
                .map_err(|_| RichSelectionError::Invariant)?;
            let column = ColumnId::try_new(value(node, "column-id")?)
                .map_err(|_| RichSelectionError::Invariant)?;
            return Ok(RichCoverageDomain::Cell(CellId::new(table, row, column)));
        }
        current = parent;
    }
    Ok(RichCoverageDomain::Document)
}
