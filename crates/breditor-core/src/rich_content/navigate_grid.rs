//! Pure logical table navigation over the admitted non-destructive merge view.
//!
//! Directions refer to axis order, not CSS bidi layout. Hosts translate physical
//! keys and handle explicit boundaries. Navigation never creates rows or IDs.

use super::{
    ResolvedRichSelection, RichDocument, RichSelection, RichSelectionError, RichSelectionKind,
};

/// Logical movement; Tab order visits row-major presentation masters once.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GridMove {
    /// Next displayed cell, skipping covered base cells.
    Next,
    /// Previous displayed cell.
    Previous,
    /// Previous column outside this span, retaining the logical focus row.
    Left,
    /// Next column outside this span, retaining the logical focus row.
    Right,
    /// Previous row outside this span, retaining the logical focus column.
    Up,
    /// Next row outside this span, retaining the logical focus column.
    Down,
    /// First column of the logical focus row.
    RowStart,
    /// Last column of the logical focus row.
    RowEnd,
    /// First displayed cell in Tab order.
    TableStart,
    /// Last displayed cell in Tab order, not necessarily the last covered base cell.
    TableEnd,
}

/// Collapse on the destination or preserve the original directional anchor.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GridNavigationMode {
    /// Collapse both endpoints onto the destination base cell.
    Collapse,
    /// Retain anchor, move focus, and resolve complete merged closure again.
    Extend,
}

/// Explicit boundary for host focus transfer or an independently authored structural command.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GridBoundary {
    /// Tab moved before the first displayed cell.
    BeforeTable,
    /// Tab moved after the last displayed cell.
    AfterTable,
    /// No column exists to the left of this displayed span.
    LeftEdge,
    /// No column exists to the right of this displayed span.
    RightEdge,
    /// No row exists above this displayed span.
    TopEdge,
    /// No row exists below this displayed span.
    BottomEdge,
}

/// Snapshot-bound navigation result without document/history mutation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GridNavigationOutcome {
    /// Admitted collapse/extension at the destination.
    Moved(RichSelection),
    /// These exact selection values already hold.
    Unchanged,
    /// Host policy is required; current selection is not changed.
    Boundary(GridBoundary),
}

/// Navigate a proved directional grid without mutating content.
///
/// Covered focus cells retain their logical lane for arrows, even when the
/// destination master lies elsewhere. Tab/table-start/end name presentation
/// masters instead. Extension retains anchor order and rechecks merge closure.
///
/// # Errors
/// Rejects stale/foreign or non-grid selections, hidden/missing tables or an
/// internal contradiction of admitted geometry.
pub fn navigate_grid(
    document: &RichDocument,
    selection: &RichSelection,
    movement: GridMove,
    mode: GridNavigationMode,
) -> Result<GridNavigationOutcome, RichSelectionError> {
    let ResolvedRichSelection::Grid(grid) = selection.resolve(document)? else {
        return Err(RichSelectionError::TargetKind);
    };
    let view = document
        .table(grid.focus().table())
        .map_err(|_| RichSelectionError::Invariant)?
        .ok_or(RichSelectionError::MissingTarget)?;
    let destination = match super::grid_destination::destination(&view, grid.focus(), movement)? {
        Ok(cell) => cell,
        Err(boundary) => return Ok(GridNavigationOutcome::Boundary(boundary)),
    };
    let anchor = match mode {
        GridNavigationMode::Collapse => destination.clone(),
        GridNavigationMode::Extend => grid.anchor().clone(),
    };
    let kind = RichSelectionKind::Grid { anchor, focus: destination };
    if &kind == selection.kind() {
        return Ok(GridNavigationOutcome::Unchanged);
    }
    Ok(GridNavigationOutcome::Moved(RichSelection::try_new(document, kind)?))
}
