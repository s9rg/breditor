//! Closed logical direction shared by two independent native convenience commands.
use breditor_core::rich_content::FlowMove;
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum Direction {
    Before,
    After,
}
impl From<Direction> for FlowMove {
    fn from(value: Direction) -> Self {
        match value {
            Direction::Before => Self::Before,
            Direction::After => Self::After,
        }
    }
}
