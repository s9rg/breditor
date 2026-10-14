//! Snapshot-proved rich selections with stable content IDs, not DOM paths.
//!
//! Block-relative text offsets survive structural edits, not arbitrary text
//! mutations. Collaborative text uses the replication adapter's causal anchors.

use super::{
    BlockId, CellId, DocumentId, RichDocument,
    rich_grid_selection::{ResolvedRichGrid, resolve_grid},
};
use crate::{
    document::{ElementNode, NodeRef},
    position::{Affinity, NodePath, Point, TextOffset},
    schema::SchemaFingerprint,
};

/// Stable block-relative text point candidate; admission checks scalar alignment.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichTextPoint {
    block: BlockId,
    offset: TextOffset,
    affinity: Affinity,
}

impl RichTextPoint {
    /// Combine checked syntax values; a selection constructor validates the target.
    #[must_use]
    pub const fn new(block: BlockId, offset: TextOffset, affinity: Affinity) -> Self {
        Self { block, offset, affinity }
    }
    /// Stable paragraph/heading identity, including captions and cell text blocks.
    #[must_use]
    pub const fn block(&self) -> &BlockId {
        &self.block
    }
    /// Aggregate scalar-aligned UTF-16 offset across canonical text runs.
    #[must_use]
    pub const fn offset(&self) -> TextOffset {
        self.offset
    }
    /// Insertion-boundary ownership.
    #[must_use]
    pub const fn affinity(&self) -> Affinity {
        self.affinity
    }
}

/// Rich selection candidate; constructors validate it against one exact snapshot.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RichSelectionKind {
    /// Directional text range; endpoint order is never sorted or collapsed implicitly.
    TextRange {
        /// Logical anchor, not necessarily the earlier endpoint.
        anchor: RichTextPoint,
        /// Logical focus, not necessarily the later endpoint.
        focus: RichTextPoint,
    },
    /// One complete flow node, including an image or visible table.
    Node(BlockId),
    /// Directional rectangular grid, retaining canonical base-cell endpoints.
    Grid {
        /// Logical anchor base cell, even when covered by a merge.
        anchor: CellId,
        /// Logical focus base cell, even when covered by a merge.
        focus: CellId,
    },
}

/// Validated rich selection bound to the exact immutable source tree.
///
/// Use an edit's mapping before resolving it against a changed snapshot.
/// This separate family does not widen legacy Selection/session codecs.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichSelection {
    document: DocumentId,
    fingerprint: SchemaFingerprint,
    root: NodeRef,
    kind: RichSelectionKind,
}

impl RichSelection {
    /// Validate a rich selection and bind it to the complete source snapshot.
    ///
    /// # Errors
    /// Rejects absent/wrong-kind targets, hidden tables, cross-table grids or
    /// out-of-range/half-surrogate text positions.
    pub fn try_new(
        document: &RichDocument,
        kind: RichSelectionKind,
    ) -> Result<Self, RichSelectionError> {
        resolve_kind(document, &kind)?;
        Ok(Self {
            document: document.id().clone(),
            fingerprint: document.document().schema_fingerprint(),
            root: document.document().root().clone(),
            kind,
        })
    }
    /// Stable semantic selection values, excluding snapshot-local rendering paths.
    #[must_use]
    pub const fn kind(&self) -> &RichSelectionKind {
        &self.kind
    }
    /// Resolve current rendering paths and merge-closed grid geometry.
    ///
    /// # Errors
    /// Rejects a different document/schema or stale source tree. An equal tree
    /// decoded independently is valid; pointer identity never defines semantics.
    pub fn resolve(
        &self,
        document: &RichDocument,
    ) -> Result<ResolvedRichSelection, RichSelectionError> {
        if document.id() != &self.document
            || document.document().schema_fingerprint() != self.fingerprint
        {
            return Err(RichSelectionError::Binding);
        }
        if document.document().root() != &self.root {
            return Err(RichSelectionError::StaleSnapshot);
        }
        resolve_kind(document, &self.kind)
    }
}

/// Snapshot-local rich rendering selection; re-resolve after each document edit.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ResolvedRichSelection {
    /// Scalar-aligned leaf/child points with original range direction.
    TextRange {
        /// Resolved anchor.
        anchor: Point,
        /// Resolved focus.
        focus: Point,
    },
    /// One current flow-node path.
    Node {
        /// Stable node identity.
        block: BlockId,
        /// Path in this snapshot only.
        path: NodePath,
    },
    /// Rectangular selection closed over every touched merged presentation cell.
    Grid(ResolvedRichGrid),
}

/// Payload-free rich selection admission/mapping failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichSelectionError {
    /// Stable selection scope differs from the current document/schema.
    #[error("rich selection document/schema binding differs")]
    Binding,
    /// A prior tree was used without a structural/text mapping.
    #[error("rich selection belongs to a different snapshot")]
    StaleSnapshot,
    /// A stable content target is absent.
    #[error("rich selection target is absent")]
    MissingTarget,
    /// The target kind is not appropriate for this selection.
    #[error("rich selection target has the wrong kind")]
    TargetKind,
    /// A text offset is out of bounds or splits a surrogate pair.
    #[error("rich text point must be a scalar-aligned UTF-16 boundary")]
    Offset,
    /// A zero-axis hidden table cannot hold a visible node/grid selection.
    #[error("a hidden table cannot hold a visible selection")]
    HiddenTable,
    /// Both grid endpoints must belong to the same table.
    #[error("rich grid endpoints must belong to one table")]
    CrossTable,
    /// Structural-only mapping cannot safely relocate concurrent text changes.
    #[error("text changed; a text-operation or causal-anchor mapping is required")]
    TextChanged,
    /// A typed immutable AST read contradicted its existing proof.
    #[error("rich selection invariant failed")]
    Invariant,
}

pub(super) fn block<'a>(
    document: &'a RichDocument,
    id: &BlockId,
) -> Result<&'a ElementNode, RichSelectionError> {
    document
        .block_path(id)
        .and_then(|path| document.document().node_at(path).ok())
        .and_then(NodeRef::as_element)
        .ok_or(RichSelectionError::MissingTarget)
}

pub(super) fn text_length(node: &ElementNode) -> Result<TextOffset, RichSelectionError> {
    let length = node.children().iter().try_fold(0u64, |length, node| {
        length
            .checked_add(u64::from(
                node.as_text().ok_or(RichSelectionError::TargetKind)?.utf16_len(),
            ))
            .ok_or(RichSelectionError::Offset)
    })?;
    TextOffset::try_new(length).map_err(|_| RichSelectionError::Offset)
}

fn text_point(document: &RichDocument, point: &RichTextPoint) -> Result<Point, RichSelectionError> {
    let node = block(document, point.block())?;
    if !matches!(node.kind().as_str(), "breditor/paragraph" | "breditor/heading") {
        return Err(RichSelectionError::TargetKind);
    }
    let path = document.block_path(point.block()).ok_or(RichSelectionError::MissingTarget)?;
    if node.children().is_empty() {
        if point.offset() != TextOffset::ZERO {
            return Err(RichSelectionError::Offset);
        }
        return Ok(Point::Children {
            parent_path: path.clone(),
            child_index: 0,
            affinity: point.affinity(),
        });
    }
    let mut cursor = 0u64;
    for (index, child) in node.children().iter().enumerate() {
        let text = child.as_text().ok_or(RichSelectionError::TargetKind)?;
        let end =
            cursor.checked_add(u64::from(text.utf16_len())).ok_or(RichSelectionError::Offset)?;
        if point.offset().get() <= end
            && (point.offset().get() != end
                || point.affinity() == Affinity::Before
                || index + 1 == node.children().len())
        {
            let local = u32::try_from(
                point.offset().get().checked_sub(cursor).ok_or(RichSelectionError::Offset)?,
            )
            .map_err(|_| RichSelectionError::Offset)?;
            text.byte_offset_at_utf16(local).map_err(|_| RichSelectionError::Offset)?;
            let mut indices = path.to_vec();
            indices.push(u32::try_from(index).map_err(|_| RichSelectionError::Invariant)?);
            return Ok(Point::Text {
                text_path: NodePath::try_from_indices(indices)
                    .map_err(|_| RichSelectionError::Invariant)?,
                utf16_offset: local,
                affinity: point.affinity(),
            });
        }
        cursor = end;
    }
    Err(RichSelectionError::Offset)
}

fn resolve_kind(
    document: &RichDocument,
    kind: &RichSelectionKind,
) -> Result<ResolvedRichSelection, RichSelectionError> {
    match kind {
        RichSelectionKind::TextRange { anchor, focus } => Ok(ResolvedRichSelection::TextRange {
            anchor: text_point(document, anchor)?,
            focus: text_point(document, focus)?,
        }),
        RichSelectionKind::Node(id) => {
            let node = block(document, id)?;
            if !matches!(
                node.kind().as_str(),
                "breditor/paragraph"
                    | "breditor/heading"
                    | "breditor/bullet-list"
                    | "breditor/ordered-list"
                    | "breditor/image"
                    | "breditor/table"
            ) {
                return Err(RichSelectionError::TargetKind);
            }
            if node.kind().as_str() == "breditor/table" {
                let table = super::TableId::try_new(
                    super::ast_properties::string(node, "table-id")
                        .map_err(|_| RichSelectionError::Invariant)?,
                )
                .map_err(|_| RichSelectionError::Invariant)?;
                if document
                    .table(&table)
                    .map_err(|_| RichSelectionError::Invariant)?
                    .ok_or(RichSelectionError::MissingTarget)?
                    .geometry()
                    .is_hidden()
                {
                    return Err(RichSelectionError::HiddenTable);
                }
            }
            Ok(ResolvedRichSelection::Node {
                block: id.clone(),
                path: document.block_path(id).ok_or(RichSelectionError::MissingTarget)?.clone(),
            })
        }
        RichSelectionKind::Grid { anchor, focus } => {
            Ok(ResolvedRichSelection::Grid(resolve_grid(document, anchor, focus)?))
        }
    }
}
