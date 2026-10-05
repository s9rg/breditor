//! Snapshot-local sibling-run resolution for future nested-list actions.
//!
//! This helper grants no editing authority. Callers must independently require
//! the operation's schema capability and validate the resulting transaction.
use crate::{
    document::Document,
    position::{NodePath, Point},
    schema::CompiledSchema,
    selection::{RangeOrder, RangeSelection},
};
use std::ops::Range;
use thiserror::Error;

/// A contiguous run in one list, including each selected item's descendants.
/// Paths and indexes are valid only for the document used to resolve them.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NestedListItemRange {
    list_path: NodePath,
    items: Range<u32>,
}

impl NestedListItemRange {
    /// Resolves endpoints in leading blocks of sibling items at any depth.
    ///
    /// Direction and UTF-16 boundaries are validated first. A later item's
    /// exact block start is excluded. A caret in an empty block includes its
    /// item. Endpoints in different lists are rejected, never flattened or
    /// widened to a common ancestor. Descendants move with their parent item.
    ///
    /// # Errors
    /// Returns an error for invalid selection endpoints or incompatible scope.
    pub fn resolve(
        schema: &CompiledSchema,
        document: &Document,
        selection: &RangeSelection,
    ) -> Result<Self, NestedListSelectionError> {
        let resolved = selection
            .resolve(schema, document)
            .map_err(|_| NestedListSelectionError::InvalidSelection)?;
        let (start, end) = if resolved.order() == RangeOrder::Backward {
            (selection.focus(), selection.anchor())
        } else {
            (selection.anchor(), selection.focus())
        };
        let (list_path, first) = item_address(document, start)?;
        let (end_list, last) = item_address(document, end)?;
        if list_path != end_list || first > last {
            return Err(NestedListSelectionError::DifferentLists);
        }
        let end_index = if first != last && at_block_start(end) {
            last
        } else {
            last.checked_add(1).ok_or(NestedListSelectionError::InvalidSelection)?
        };
        Ok(Self { list_path, items: first..end_index })
    }

    /// Returns the containing list's snapshot-local path.
    #[must_use]
    pub const fn list_path(&self) -> &NodePath {
        &self.list_path
    }

    /// Returns the nonempty half-open sibling index range.
    #[must_use]
    pub fn items(&self) -> Range<u32> {
        self.items.clone()
    }
}

/// Why a selection cannot identify one sibling run for nesting commands.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum NestedListSelectionError {
    /// The range is invalid for this document/schema or its indexes overflow.
    #[error("invalid list selection")]
    InvalidSelection,
    /// An endpoint is not in the leading paragraph/heading of a list item.
    #[error("selection is not in a list item leading block")]
    NotListItem,
    /// Endpoints belong to different list containers or incompatible order.
    #[error("selection endpoints belong to different lists")]
    DifferentLists,
}

fn item_address(
    document: &Document,
    point: &Point,
) -> Result<(NodePath, u32), NestedListSelectionError> {
    let block_path = match point {
        Point::Text { text_path, .. } => text_path.parent(),
        Point::Children { parent_path, .. } => Some(parent_path.clone()),
    }
    .ok_or(NestedListSelectionError::NotListItem)?;
    let kind_at = |path: &NodePath| {
        document
            .node_at(path)
            .ok()
            .and_then(|node| node.as_element())
            .map(|node| node.kind().as_str())
    };
    if !matches!(kind_at(&block_path), Some("breditor/paragraph" | "breditor/heading"))
        || block_path.last_index() != Some(0)
    {
        return Err(NestedListSelectionError::NotListItem);
    }
    let item = block_path.parent().ok_or(NestedListSelectionError::NotListItem)?;
    let list = item.parent().ok_or(NestedListSelectionError::NotListItem)?;
    if kind_at(&item) != Some("breditor/list-item")
        || !matches!(kind_at(&list), Some("breditor/bullet-list" | "breditor/ordered-list"))
    {
        return Err(NestedListSelectionError::NotListItem);
    }
    Ok((list, item.last_index().ok_or(NestedListSelectionError::NotListItem)?))
}

fn at_block_start(point: &Point) -> bool {
    match point {
        Point::Text { text_path, utf16_offset, .. } => {
            text_path.last_index() == Some(0) && *utf16_offset == 0
        }
        Point::Children { child_index, .. } => *child_index == 0,
    }
}
