//! Immutable insertion drafts, not schema-admitted content or identity allocation.
//!
//! Hosts provide fresh stable IDs. Complete schema, cross-node uniqueness,
//! nested-table and active resource checks run before an action can publish.

use super::{BlockId, ColumnId, RichDocument, RowId};
use crate::{
    document::{
        ElementNode, NodeRef, PropertyInteger, PropertyMap, PropertyValue, TextFragment, TextRun,
    },
    identity::QualifiedName,
};
use std::collections::BTreeMap;

/// Why an insertion draft cannot represent the declared structural shape.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichDraftError {
    /// A cell needs one or more flow blocks, never a raw text leaf.
    #[error("a cell draft must contain at least one flow block")]
    EmptyCell,
    /// The draft exceeds a fixed rich-table axis ceiling.
    #[error("rich table draft exceeds its axis ceiling")]
    AxisLimit,
    /// A heading rank is outside 1–6.
    #[error("rich heading rank must be 1–6")]
    HeadingRank,
    /// A column display width is outside 32–4096 logical pixels.
    #[error("column draft width must be 32–4096 logical pixels")]
    ColumnWidth,
    /// The stable node is absent or is not a flow block.
    #[error("rich flow-block source is absent or has the wrong kind")]
    FlowBlock,
    /// Image captions are a single paragraph, not arbitrary flow or a heading.
    #[error("an image caption draft must be a paragraph")]
    Caption,
    /// Draft rows/cells do not form one unique rectangular set of axes.
    #[error("table draft axes must be unique and rectangular")]
    AxisShape,
    /// A canonical AST constructor rejected an internal draft invariant.
    #[error("rich insertion draft invariant failed")]
    Invariant,
}

pub(crate) fn element(
    local: &str,
    properties: Vec<(&str, PropertyValue)>,
    children: Vec<NodeRef>,
) -> Result<NodeRef, RichDraftError> {
    let mut entries = properties
        .into_iter()
        .map(|(local, value)| {
            Ok((
                QualifiedName::try_new(format!("breditor/{local}"))
                    .map_err(|_| RichDraftError::Invariant)?,
                value,
            ))
        })
        .collect::<Result<Vec<_>, RichDraftError>>()?;
    entries.sort_by(|left, right| left.0.cmp(&right.0));
    let properties =
        PropertyMap::try_from_sorted(entries).map_err(|_| RichDraftError::Invariant)?;
    Ok(NodeRef::element(
        ElementNode::try_new(
            QualifiedName::try_new(format!("breditor/{local}"))
                .map_err(|_| RichDraftError::Invariant)?,
            None,
            properties,
            children,
        )
        .map_err(|_| RichDraftError::Invariant)?,
    ))
}

/// Immutable flow-block draft; formats and global IDs require final admission.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichBlockDraft(NodeRef);

impl RichBlockDraft {
    pub(crate) fn from_node(node: NodeRef) -> Self {
        Self(node)
    }
    pub(crate) fn node(&self) -> &NodeRef {
        &self.0
    }
    pub(crate) fn into_node(self) -> NodeRef {
        self.0
    }
    /// Construct a paragraph from canonical text without normalizing Unicode.
    ///
    /// # Errors
    /// Rejects an internal AST construction invariant; schema admission is deferred.
    pub fn paragraph(id: &BlockId, text: &TextFragment) -> Result<Self, RichDraftError> {
        Self::text_block("paragraph", id, text, None)
    }
    /// Construct a ranked heading from canonical text.
    ///
    /// # Errors
    /// Rejects ranks outside 1–6 or an internal AST construction invariant.
    pub fn heading(id: &BlockId, rank: u8, text: &TextFragment) -> Result<Self, RichDraftError> {
        if !(1..=6).contains(&rank) {
            return Err(RichDraftError::HeadingRank);
        }
        Self::text_block("heading", id, text, Some(rank))
    }
    /// Capture an admitted flow subtree, retaining every format/image/caption.
    ///
    /// This preserves IDs, so it is appropriate for moves or local restoration,
    /// not ordinary copy/paste. Inserting it beside its source fails uniqueness
    /// admission. Hosts must allocate new IDs for copied content.
    ///
    /// # Errors
    /// Rejects an absent node or row/cell container rather than a flow block.
    pub fn capture(document: &RichDocument, id: &BlockId) -> Result<Self, RichDraftError> {
        let node = document
            .block_path(id)
            .and_then(|path| document.document().node_at(path).ok())
            .ok_or(RichDraftError::FlowBlock)?;
        if !node.as_element().is_some_and(|node| {
            matches!(
                node.kind().as_str(),
                "breditor/paragraph"
                    | "breditor/heading"
                    | "breditor/bullet-list"
                    | "breditor/ordered-list"
                    | "breditor/table"
                    | "breditor/image"
            )
        }) {
            return Err(RichDraftError::FlowBlock);
        }
        Ok(Self(node.clone()))
    }
    fn text_block(
        local: &str,
        id: &BlockId,
        text: &TextFragment,
        rank: Option<u8>,
    ) -> Result<Self, RichDraftError> {
        let mut properties = vec![("block-id", PropertyValue::from_string(id.as_str()))];
        if let Some(rank) = rank {
            properties.push((
                "level",
                PropertyValue::from_integer(
                    PropertyInteger::try_new(i64::from(rank))
                        .map_err(|_| RichDraftError::Invariant)?,
                ),
            ));
        }
        let children =
            text.iter().cloned().map(TextRun::into_text_node).map(NodeRef::text).collect();
        Ok(Self(element(local, properties, children)?))
    }
}

/// One immutable base-cell insertion draft, with explicit column and header intent.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TableCellDraft {
    column: ColumnId,
    node: NodeRef,
}

impl TableCellDraft {
    /// Construct a cell body; no paragraph or identity is silently fabricated.
    ///
    /// # Errors
    /// Rejects an empty body or a local AST invariant. Complete schema/resource
    /// and nested-table checks run when the containing action is applied.
    pub fn try_new(
        id: &BlockId,
        column: ColumnId,
        header: bool,
        body: Vec<RichBlockDraft>,
    ) -> Result<Self, RichDraftError> {
        if body.is_empty() {
            return Err(RichDraftError::EmptyCell);
        }
        let node = element(
            "table-cell",
            vec![
                ("block-id", PropertyValue::from_string(id.as_str())),
                ("column-id", PropertyValue::from_string(column.as_str())),
                ("header", PropertyValue::boolean(header)),
            ],
            body.into_iter().map(|block| block.0).collect(),
        )?;
        Ok(Self { column, node })
    }
    /// Stable column this base-cell draft belongs to.
    #[must_use]
    pub const fn column(&self) -> &ColumnId {
        &self.column
    }
    pub(crate) fn into_node(self) -> NodeRef {
        self.node
    }
}

/// One immutable row insertion draft, with cells in explicit column order.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TableRowDraft {
    row: RowId,
    node: NodeRef,
}

impl TableRowDraft {
    pub(crate) fn node(&self) -> &NodeRef {
        &self.node
    }
    /// Construct a row; an empty cell sequence is valid only for a zero-column table.
    ///
    /// # Errors
    /// Rejects more than 128 cells or an internal AST construction invariant.
    pub fn try_new(
        id: &BlockId,
        row: RowId,
        cells: Vec<TableCellDraft>,
    ) -> Result<Self, RichDraftError> {
        if cells.len() > 128 {
            return Err(RichDraftError::AxisLimit);
        }
        let node = element(
            "table-row",
            vec![
                ("block-id", PropertyValue::from_string(id.as_str())),
                ("row-id", PropertyValue::from_string(row.as_str())),
            ],
            cells.into_iter().map(TableCellDraft::into_node).collect(),
        )?;
        Ok(Self { row, node })
    }
    /// Stable row identity, never a numeric insertion position.
    #[must_use]
    pub const fn row(&self) -> &RowId {
        &self.row
    }
    pub(crate) fn into_node(self) -> NodeRef {
        self.node
    }
}

/// Stable column metadata for insertion, independent of row-specific cell bodies.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TableColumnDraft {
    id: ColumnId,
    width: u32,
}

impl TableColumnDraft {
    /// Check one explicit column identity and logical display width.
    ///
    /// # Errors
    /// Rejects widths outside 32–4096; no default width is inferred.
    pub fn try_new(id: ColumnId, width: u32) -> Result<Self, RichDraftError> {
        if !(32..=4096).contains(&width) {
            return Err(RichDraftError::ColumnWidth);
        }
        Ok(Self { id, width })
    }
    /// Stable column identity.
    #[must_use]
    pub const fn id(&self) -> &ColumnId {
        &self.id
    }
    pub(crate) fn property(&self) -> Result<PropertyValue, RichDraftError> {
        let values = BTreeMap::from([
            ("id".into(), PropertyValue::from_string(self.id.as_str())),
            (
                "width".into(),
                PropertyValue::from_integer(
                    PropertyInteger::try_new(i64::from(self.width))
                        .map_err(|_| RichDraftError::Invariant)?,
                ),
            ),
        ]);
        Ok(PropertyValue::object(
            crate::document::PropertyObject::try_from_map(values)
                .map_err(|_| RichDraftError::Invariant)?,
        ))
    }
}
