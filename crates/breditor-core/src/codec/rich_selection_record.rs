//! Closed stable-ID selection records for the local rich session family only.

use super::RichSessionCodecError;
use crate::{
    position::{Affinity, TextOffset},
    record::{AffinityRecordV1, DecimalU64Record},
    rich_content::{BlockId, CellId, ColumnId, RichSelectionKind, RichTextPoint, RowId, TableId},
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, tag = "kind", rename_all = "camelCase")]
pub(super) enum SelectionRecord {
    TextRange { anchor: PointRecord, focus: PointRecord },
    Node { block: String },
    Grid { anchor: CellRecord, focus: CellRecord },
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct PointRecord {
    block: String,
    offset: DecimalU64Record,
    affinity: AffinityRecordV1,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CellRecord {
    table: String,
    row: String,
    column: String,
}

impl SelectionRecord {
    pub(super) fn from_kind(kind: &RichSelectionKind) -> Self {
        match kind {
            RichSelectionKind::TextRange { anchor, focus } => Self::TextRange {
                anchor: PointRecord::from_point(anchor),
                focus: PointRecord::from_point(focus),
            },
            RichSelectionKind::Node(block) => Self::Node { block: block.as_str().to_owned() },
            RichSelectionKind::Grid { anchor, focus } => Self::Grid {
                anchor: CellRecord::from_cell(anchor),
                focus: CellRecord::from_cell(focus),
            },
        }
    }
    pub(super) fn into_kind(self) -> Result<RichSelectionKind, RichSessionCodecError> {
        Ok(match self {
            Self::TextRange { anchor, focus } => RichSelectionKind::TextRange {
                anchor: anchor.into_point()?,
                focus: focus.into_point()?,
            },
            Self::Node { block } => RichSelectionKind::Node(
                BlockId::try_new(block).map_err(|_| RichSessionCodecError::Value)?,
            ),
            Self::Grid { anchor, focus } => {
                RichSelectionKind::Grid { anchor: anchor.into_cell()?, focus: focus.into_cell()? }
            }
        })
    }
}
impl PointRecord {
    fn from_point(point: &RichTextPoint) -> Self {
        Self {
            block: point.block().as_str().to_owned(),
            offset: DecimalU64Record::new(point.offset().get()),
            affinity: match point.affinity() {
                Affinity::Before => AffinityRecordV1::Before,
                Affinity::After => AffinityRecordV1::After,
            },
        }
    }
    fn into_point(self) -> Result<RichTextPoint, RichSessionCodecError> {
        Ok(RichTextPoint::new(
            BlockId::try_new(self.block).map_err(|_| RichSessionCodecError::Value)?,
            TextOffset::try_new(self.offset.get()).map_err(|_| RichSessionCodecError::Value)?,
            match self.affinity {
                AffinityRecordV1::Before => Affinity::Before,
                AffinityRecordV1::After => Affinity::After,
            },
        ))
    }
}
impl CellRecord {
    fn from_cell(cell: &CellId) -> Self {
        Self {
            table: cell.table().as_str().to_owned(),
            row: cell.row().as_str().to_owned(),
            column: cell.column().as_str().to_owned(),
        }
    }
    fn into_cell(self) -> Result<CellId, RichSessionCodecError> {
        Ok(CellId::new(
            TableId::try_new(self.table).map_err(|_| RichSessionCodecError::Value)?,
            RowId::try_new(self.row).map_err(|_| RichSessionCodecError::Value)?,
            ColumnId::try_new(self.column).map_err(|_| RichSessionCodecError::Value)?,
        ))
    }
}
