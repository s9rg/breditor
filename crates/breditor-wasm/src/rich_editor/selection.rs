//! Closed stable-ID rich selection DTO; text offsets are canonical decimal u64 strings.

use super::error;
use crate::BreditorError;
use breditor_core::{
    position::{Affinity, TextOffset},
    rich_content::{BlockId, CellId, ColumnId, RichSelectionKind, RichTextPoint, RowId, TableId},
};
use serde::{Deserialize, Deserializer};
use serde_json::{Value, json};

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum SelectionRecord {
    Text { anchor: PointRecord, focus: PointRecord },
    Node { block: String },
    Grid { anchor: CellRecord, focus: CellRecord },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct PointRecord {
    block: String,
    #[serde(deserialize_with = "decimal")]
    offset: u64,
    affinity: Side,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Side {
    Before,
    After,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CellRecord {
    table: String,
    row: String,
    column: String,
}
pub(super) fn decimal<'de, D: Deserializer<'de>>(decoder: D) -> Result<u64, D::Error> {
    let input = String::deserialize(decoder)?;
    if input.is_empty()
        || !input.bytes().all(|byte| byte.is_ascii_digit())
        || (input.len() > 1 && input.starts_with('0'))
    {
        return Err(serde::de::Error::custom("canonical unsigned decimal required"));
    }
    input.parse().map_err(serde::de::Error::custom)
}
impl SelectionRecord {
    pub(super) fn into_kind(self) -> Result<RichSelectionKind, BreditorError> {
        Ok(match self {
            Self::Text { anchor, focus } => RichSelectionKind::TextRange {
                anchor: anchor.into_point()?,
                focus: focus.into_point()?,
            },
            Self::Node { block } => {
                RichSelectionKind::Node(BlockId::try_new(block).map_err(|_| invalid())?)
            }
            Self::Grid { anchor, focus } => {
                RichSelectionKind::Grid { anchor: anchor.into_cell()?, focus: focus.into_cell()? }
            }
        })
    }
}
impl PointRecord {
    pub(super) fn into_point(self) -> Result<RichTextPoint, BreditorError> {
        Ok(RichTextPoint::new(
            BlockId::try_new(self.block).map_err(|_| invalid())?,
            TextOffset::try_new(self.offset).map_err(|_| invalid())?,
            match self.affinity {
                Side::Before => Affinity::Before,
                Side::After => Affinity::After,
            },
        ))
    }
}
impl CellRecord {
    pub(super) fn into_cell(self) -> Result<CellId, BreditorError> {
        Ok(CellId::new(
            TableId::try_new(self.table).map_err(|_| invalid())?,
            RowId::try_new(self.row).map_err(|_| invalid())?,
            ColumnId::try_new(self.column).map_err(|_| invalid())?,
        ))
    }
}
const fn invalid() -> BreditorError {
    error::rejected("breditor_rich.selection_rejected")
}
pub(super) fn encode(kind: &RichSelectionKind) -> Value {
    match kind {
        RichSelectionKind::TextRange { anchor, focus } => {
            json!({"kind":"text","anchor":point(anchor),"focus":point(focus)})
        }
        RichSelectionKind::Node(block) => json!({"kind":"node","block":block.as_str()}),
        RichSelectionKind::Grid { anchor, focus } => {
            json!({"kind":"grid","anchor":cell(anchor),"focus":cell(focus)})
        }
    }
}
fn point(point: &RichTextPoint) -> Value {
    json!({"block":point.block().as_str(),"offset":point.offset().get().to_string(),"affinity":if point.affinity()==Affinity::Before {"before"} else {"after"}})
}
pub(super) fn cell(cell: &CellId) -> Value {
    json!({"table":cell.table().as_str(),"row":cell.row().as_str(),"column":cell.column().as_str()})
}
