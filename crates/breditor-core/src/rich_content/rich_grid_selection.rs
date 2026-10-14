//! Bounded rectangle closure over non-destructive merged presentation cells.

use super::{CellId, RichDocument, RichSelectionError};
use std::collections::BTreeSet;

/// A resolved visible rectangle, including every touched merged cell's base bodies.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedRichGrid {
    anchor: CellId,
    focus: CellId,
    first_row: usize,
    last_row: usize,
    first_column: usize,
    last_column: usize,
    cells: Vec<CellId>,
    masters: Vec<CellId>,
}

impl ResolvedRichGrid {
    /// Original logical anchor, retaining direction even when it is a covered cell.
    #[must_use]
    pub const fn anchor(&self) -> &CellId {
        &self.anchor
    }
    /// Original logical focus, retaining direction even when it is a covered cell.
    #[must_use]
    pub const fn focus(&self) -> &CellId {
        &self.focus
    }
    /// Inclusive visual row boundaries after merged-cell closure.
    #[must_use]
    pub const fn rows(&self) -> (usize, usize) {
        (self.first_row, self.last_row)
    }
    /// Inclusive visual column boundaries after merged-cell closure.
    #[must_use]
    pub const fn columns(&self) -> (usize, usize) {
        (self.first_column, self.last_column)
    }
    /// All selected base cells in current row-major order; no covered body is lost.
    #[must_use]
    pub fn cells(&self) -> &[CellId] {
        &self.cells
    }
    /// Unique presentation masters in their first row-major encounter order.
    #[must_use]
    pub fn masters(&self) -> &[CellId] {
        &self.masters
    }
}

pub(super) fn resolve_grid(
    document: &RichDocument,
    anchor: &CellId,
    focus: &CellId,
) -> Result<ResolvedRichGrid, RichSelectionError> {
    if anchor.table() != focus.table() {
        return Err(RichSelectionError::CrossTable);
    }
    let view = document
        .table(anchor.table())
        .map_err(|_| RichSelectionError::Invariant)?
        .ok_or(RichSelectionError::MissingTarget)?;
    if view.geometry().is_hidden() {
        return Err(RichSelectionError::HiddenTable);
    }
    let position = |cell: &CellId| -> Result<(usize, usize), RichSelectionError> {
        if document.cell_path(cell).is_none() {
            return Err(RichSelectionError::MissingTarget);
        }
        Ok((
            view.rows()
                .iter()
                .position(|row| row == cell.row())
                .ok_or(RichSelectionError::MissingTarget)?,
            view.columns()
                .iter()
                .position(|column| column.id() == cell.column())
                .ok_or(RichSelectionError::MissingTarget)?,
        ))
    };
    let (ar, ac) = position(anchor)?;
    let (fr, fc) = position(focus)?;
    let (mut r0, mut r1, mut c0, mut c1) = (ar.min(fr), ar.max(fr), ac.min(fc), ac.max(fc));
    let mut regions = Vec::new();
    for (index, cell) in view.geometry().cells().iter().enumerate() {
        if cell.is_master() && (cell.row_span() > 1 || cell.column_span() > 1) {
            let row = index / view.columns().len();
            let column = index % view.columns().len();
            regions.push((
                row,
                row + usize::try_from(cell.row_span())
                    .map_err(|_| RichSelectionError::Invariant)?
                    - 1,
                column,
                column
                    + usize::try_from(cell.column_span())
                        .map_err(|_| RichSelectionError::Invariant)?
                    - 1,
            ));
        }
    }
    // At most 256 disjoint active regions. Each expansion consumes a previously
    // unvisited region, bounding closure to 256² overlap checks, not cell² scans.
    let mut visited = vec![false; regions.len()];
    loop {
        let mut expanded = false;
        for (index, (a, b, c, d)) in regions.iter().copied().enumerate() {
            if !visited[index] && a <= r1 && b >= r0 && c <= c1 && d >= c0 {
                visited[index] = true;
                r0 = r0.min(a);
                r1 = r1.max(b);
                c0 = c0.min(c);
                c1 = c1.max(d);
                expanded = true;
            }
        }
        if !expanded {
            break;
        }
    }
    let mut cells = Vec::new();
    let mut masters = Vec::new();
    let mut seen = BTreeSet::new();
    for row in r0..=r1 {
        for column in c0..=c1 {
            let cell = view.geometry().cell(row, column).ok_or(RichSelectionError::Invariant)?;
            cells.push(cell.base().clone());
            if seen.insert(cell.master().clone()) {
                masters.push(cell.master().clone());
            }
        }
    }
    Ok(ResolvedRichGrid {
        anchor: anchor.clone(),
        focus: focus.clone(),
        first_row: r0,
        last_row: r1,
        first_column: c0,
        last_column: c1,
        cells,
        masters,
    })
}
