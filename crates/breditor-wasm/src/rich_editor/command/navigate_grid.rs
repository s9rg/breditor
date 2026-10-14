//! Logical grid navigation over Rust-derived merge masters; edges publish no mutation.
use super::support::{checked, decode};
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{
    GridMove, GridNavigationMode, GridNavigationOutcome, RichLocalOutcome, RichLocalSession,
    RichLocalSnapshot, RichSelectionUpdate, navigate_grid,
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Move {
    Next,
    Previous,
    Left,
    Right,
    Up,
    Down,
    RowStart,
    RowEnd,
    TableStart,
    TableEnd,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    movement: Move,
    extend: bool,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let movement = match record.movement {
        Move::Next => GridMove::Next,
        Move::Previous => GridMove::Previous,
        Move::Left => GridMove::Left,
        Move::Right => GridMove::Right,
        Move::Up => GridMove::Up,
        Move::Down => GridMove::Down,
        Move::RowStart => GridMove::RowStart,
        Move::RowEnd => GridMove::RowEnd,
        Move::TableStart => GridMove::TableStart,
        Move::TableEnd => GridMove::TableEnd,
    };
    let mode =
        if record.extend { GridNavigationMode::Extend } else { GridNavigationMode::Collapse };
    let result = checked(navigate_grid(
        owner.state().document(),
        owner.state().selection().ok_or(super::invalid())?,
        movement,
        mode,
    ))?;
    match result {
        GridNavigationOutcome::Moved(selection) => {
            owner.set_selection(observation, Some(selection.kind().clone()))
        }
        GridNavigationOutcome::Unchanged | GridNavigationOutcome::Boundary(_) => {
            owner.dispatch(observation, &[], RichSelectionUpdate::Map)
        }
    }
    .map_err(|value| error::session(&value))
}
