//! Pure lane-preserving destinations and unique visible-cell Tab order.

use super::{CellId, GridBoundary, GridMove, RichSelectionError, RichTableView};

fn position(view: &RichTableView, cell: &CellId) -> Result<(usize, usize), RichSelectionError> {
    Ok((
        view.rows()
            .iter()
            .position(|row| row == cell.row())
            .ok_or(RichSelectionError::Invariant)?,
        view.columns()
            .iter()
            .position(|column| column.id() == cell.column())
            .ok_or(RichSelectionError::Invariant)?,
    ))
}

pub(super) fn destination(
    view: &RichTableView,
    focus: &CellId,
    movement: GridMove,
) -> Result<Result<CellId, GridBoundary>, RichSelectionError> {
    let geometry = view.geometry();
    let (row, column) = position(view, focus)?;
    let cell = geometry.cell(row, column).ok_or(RichSelectionError::Invariant)?;
    if matches!(
        movement,
        GridMove::Next | GridMove::Previous | GridMove::TableStart | GridMove::TableEnd
    ) {
        return tab(view, cell.master(), movement);
    }
    let (master_row, master_column) = position(view, cell.master())?;
    let master = geometry.cell(master_row, master_column).ok_or(RichSelectionError::Invariant)?;
    let row_span = usize::try_from(master.row_span()).map_err(|_| RichSelectionError::Invariant)?;
    let column_span =
        usize::try_from(master.column_span()).map_err(|_| RichSelectionError::Invariant)?;
    let target = match movement {
        GridMove::Left => {
            master_column.checked_sub(1).map(|column| (row, column)).ok_or(GridBoundary::LeftEdge)
        }
        GridMove::Right => master_column
            .checked_add(column_span)
            .filter(|column| *column < view.columns().len())
            .map(|column| (row, column))
            .ok_or(GridBoundary::RightEdge),
        GridMove::Up => {
            master_row.checked_sub(1).map(|row| (row, column)).ok_or(GridBoundary::TopEdge)
        }
        GridMove::Down => master_row
            .checked_add(row_span)
            .filter(|row| *row < view.rows().len())
            .map(|row| (row, column))
            .ok_or(GridBoundary::BottomEdge),
        GridMove::RowStart => Ok((row, 0)),
        GridMove::RowEnd => Ok((row, view.columns().len() - 1)),
        _ => return Err(RichSelectionError::Invariant),
    };
    Ok(match target {
        Ok((row, column)) => {
            Ok(geometry.cell(row, column).ok_or(RichSelectionError::Invariant)?.base().clone())
        }
        Err(boundary) => Err(boundary),
    })
}

fn tab(
    view: &RichTableView,
    focus: &CellId,
    movement: GridMove,
) -> Result<Result<CellId, GridBoundary>, RichSelectionError> {
    let masters = view
        .geometry()
        .cells()
        .iter()
        .filter(|cell| cell.is_master())
        .map(super::ResolvedCell::base)
        .collect::<Vec<_>>();
    let index =
        masters.iter().position(|master| *master == focus).ok_or(RichSelectionError::Invariant)?;
    let index = match movement {
        GridMove::Next => index
            .checked_add(1)
            .filter(|index| *index < masters.len())
            .ok_or(GridBoundary::AfterTable),
        GridMove::Previous => index.checked_sub(1).ok_or(GridBoundary::BeforeTable),
        GridMove::TableStart => Ok(0),
        GridMove::TableEnd => masters.len().checked_sub(1).ok_or(GridBoundary::AfterTable),
        _ => return Err(RichSelectionError::Invariant),
    };
    Ok(index.map(|index| masters[index].clone()))
}
