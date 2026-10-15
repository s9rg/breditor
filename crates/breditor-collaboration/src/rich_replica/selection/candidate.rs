//! Strict decimal offsets and stable cell coordinates for snapshot-local selection candidates.
use crate::{Error, anchor::Affinity};
use breditor_core::{
    position::TextOffset,
    rich_content::{
        BlockId, CellId, ColumnId, RichDocument, RichSelection, RichSelectionKind, RichTextPoint,
        RowId, TableId,
    },
};
use serde::{Deserialize, Serialize};

/// An admitted scalar boundary candidate; serialized UTF-16 offsets are canonical decimal strings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TextPoint {
    /// Stable paragraph/heading block, including captions and cell text.
    pub block: String,
    /// Bounded exact UTF-16 coordinate, not a persisted causal identity.
    #[serde(with = "decimal")]
    pub offset: u32,
    /// Which side of a concurrent insertion keeps the endpoint.
    pub affinity: Affinity,
}

/// A stable table-scoped base-cell coordinate, independent of DOM paths or merge masters.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CellTarget {
    /// Stable table entity ID, not its block ID.
    pub table: String,
    /// Stable logical row ID.
    pub row: String,
    /// Stable logical column ID.
    pub column: String,
}

/// A directional selection candidate admitted against the current immutable rich document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Selection {
    /// A directional text range, including collapsed carets.
    #[serde(rename = "text")]
    TextRange {
        /// Fixed endpoint.
        anchor: TextPoint,
        /// Moving endpoint; never sorted with the anchor.
        focus: TextPoint,
    },
    /// One flow node such as an image or table.
    Node {
        /// Stable selected block ID.
        block: String,
    },
    /// A directional rectangle, resolved with the existing core's merged closure.
    Grid {
        /// Fixed base cell.
        anchor: CellTarget,
        /// Moving base cell.
        focus: CellTarget,
    },
}

/// Why a selection cannot remain visible after a structural change.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SelectionLoss {
    /// The target or all safe original-axis neighbours were removed.
    TargetDeleted,
    /// A retained table has zero visible rows or columns.
    HiddenTable,
    /// A surviving neighbour has no text caret target.
    NoTextTarget,
}

/// Observable mapping result, separate from content/history success.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum SelectionOutcome {
    /// Stable targets and visible coordinates remain unchanged.
    #[default]
    Preserved,
    /// Coordinates or deleted targets moved according to explicit causal/fallback laws.
    Relocated,
    /// No safe visible selection remains.
    Cleared {
        /// Machine-readable clearing reason.
        reason: SelectionLoss,
    },
}

impl TextPoint {
    fn core(&self) -> Result<RichTextPoint, Error> {
        Ok(RichTextPoint::new(
            BlockId::try_new(&self.block)
                .map_err(|_| Error::Contract("shared text point block"))?,
            TextOffset::try_new(u64::from(self.offset)).map_err(|_| Error::Offset)?,
            super::core_affinity(self.affinity),
        ))
    }
}
impl CellTarget {
    pub(super) fn core(&self) -> Result<CellId, Error> {
        Ok(CellId::new(
            TableId::try_new(&self.table).map_err(|_| Error::Contract("shared grid table"))?,
            RowId::try_new(&self.row).map_err(|_| Error::Contract("shared grid row"))?,
            ColumnId::try_new(&self.column).map_err(|_| Error::Contract("shared grid column"))?,
        ))
    }
    pub(in crate::rich_replica) fn from_core(cell: &CellId) -> Self {
        Self {
            table: cell.table().as_str().into(),
            row: cell.row().as_str().into(),
            column: cell.column().as_str().into(),
        }
    }
}
impl Selection {
    /// Admit current coordinates and obtain a snapshot-bound original Breditor selection.
    /// # Errors
    /// Rejects missing/wrong-kind targets, hidden/cross-table grids and non-scalar text positions.
    pub fn admit(&self, document: &RichDocument) -> Result<RichSelection, Error> {
        let kind = match self {
            Self::TextRange { anchor, focus } => {
                RichSelectionKind::TextRange { anchor: anchor.core()?, focus: focus.core()? }
            }
            Self::Node { block } => RichSelectionKind::Node(
                BlockId::try_new(block).map_err(|_| Error::Contract("shared node selection"))?,
            ),
            Self::Grid { anchor, focus } => {
                RichSelectionKind::Grid { anchor: anchor.core()?, focus: focus.core()? }
            }
        };
        RichSelection::try_new(document, kind)
            .map_err(|_| Error::Contract("shared selection admission"))
    }
    /// Collapsed caret without discarding affinity or directional range values.
    #[must_use]
    pub fn caret(&self) -> Option<&TextPoint> {
        let Self::TextRange { anchor, focus } = self else {
            return None;
        };
        (anchor.block == focus.block && anchor.offset == focus.offset).then_some(focus)
    }
}

mod decimal {
    use serde::{Deserialize, Deserializer, Serializer, de::Error};
    #[allow(clippy::trivially_copy_pass_by_ref)] // Serde's field serializer requires a reference.
    pub(super) fn serialize<S: Serializer>(value: &u32, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&value.to_string())
    }
    pub(super) fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u32, D::Error> {
        let text = String::deserialize(deserializer)?;
        let value = text.parse::<u32>().map_err(|_| D::Error::custom("bounded UTF-16 decimal"))?;
        if value.to_string() != text {
            return Err(D::Error::custom("canonical UTF-16 decimal"));
        }
        Ok(value)
    }
}
