//! Rectangular rich cell bodies and non-overlapping relative merge intent for paste.

use super::{CausalStamp, MergeId, RichBlockDraft, RichDraftError};
use crate::document::NodeRef;

/// Explicit replacement body and optional header intent for one existing base cell.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TableCellPasteDraft {
    body: Vec<RichBlockDraft>,
    header: Option<bool>,
}

impl TableCellPasteDraft {
    /// Check a nonempty rich body; `header = None` preserves the target's header flag.
    ///
    /// # Errors
    /// Rejects empty cell bodies. Complete schema/identity/resource admission is deferred.
    pub fn try_new(
        body: Vec<RichBlockDraft>,
        header: Option<bool>,
    ) -> Result<Self, RichDraftError> {
        if body.is_empty() {
            return Err(RichDraftError::EmptyCell);
        }
        Ok(Self { body, header })
    }
    pub(crate) fn into_parts(self) -> (Vec<NodeRef>, Option<bool>) {
        (self.body.into_iter().map(RichBlockDraft::into_node).collect(), self.header)
    }
}

/// One fresh merge record over relative coordinates inside the pasted rectangle.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TablePasteMerge {
    pub(crate) id: MergeId,
    pub(crate) stamp: CausalStamp,
    pub(crate) rows: (usize, usize),
    pub(crate) columns: (usize, usize),
}

impl TablePasteMerge {
    /// Check an ordered, non-singleton relative merge with explicit identity/causal stamp.
    ///
    /// Stamps are semantic values, not authentication proof. The shared adapter verifies them.
    ///
    /// # Errors
    /// Rejects reversed/singleton bounds or coordinates above fixed geometry ceilings.
    pub fn try_new(
        id: MergeId,
        stamp: CausalStamp,
        rows: (usize, usize),
        columns: (usize, usize),
    ) -> Result<Self, RichDraftError> {
        if rows.0 > rows.1
            || columns.0 > columns.1
            || rows.1 >= 256
            || columns.1 >= 128
            || (rows.0 == rows.1 && columns.0 == columns.1)
        {
            return Err(RichDraftError::PasteShape);
        }
        Ok(Self { id, stamp, rows, columns })
    }
}

/// Rectangular rich paste draft; source partitions are retained rather than flattened.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TablePasteDraft {
    pub(crate) cells: Vec<Vec<TableCellPasteDraft>>,
    pub(crate) merges: Vec<TablePasteMerge>,
}

impl TablePasteDraft {
    /// Check dimensions, independent ceilings and disjoint in-range relative merges.
    ///
    /// Copied block/image/merge IDs must be re-keyed by the host before constructing
    /// this value. Asset references and source-cell rich bodies remain independent.
    ///
    /// # Errors
    /// Rejects empty/ragged/over-limit grids, duplicate merge IDs, overlaps or absent coordinates.
    pub fn try_new(
        cells: Vec<Vec<TableCellPasteDraft>>,
        merges: Vec<TablePasteMerge>,
    ) -> Result<Self, RichDraftError> {
        let width = cells.first().map_or(0, Vec::len);
        if cells.is_empty()
            || width == 0
            || cells.len() > 256
            || width > 128
            || cells.len().checked_mul(width).is_none_or(|count| count > 4096)
            || cells.iter().any(|row| row.len() != width)
            || merges.len() > 256
        {
            return Err(RichDraftError::PasteShape);
        }
        for (index, merge) in merges.iter().enumerate() {
            if merge.rows.1 >= cells.len() || merge.columns.1 >= width {
                return Err(RichDraftError::PasteShape);
            }
            for earlier in &merges[..index] {
                if earlier.id == merge.id
                    || (earlier.rows.0 <= merge.rows.1
                        && earlier.rows.1 >= merge.rows.0
                        && earlier.columns.0 <= merge.columns.1
                        && earlier.columns.1 >= merge.columns.0)
                {
                    return Err(RichDraftError::PasteShape);
                }
            }
        }
        Ok(Self { cells, merges })
    }
    /// Exact row/column counts; a paste planner must select or explicitly grow a matching target.
    #[must_use]
    pub fn dimensions(&self) -> (usize, usize) {
        (self.cells.len(), self.cells[0].len())
    }
}
