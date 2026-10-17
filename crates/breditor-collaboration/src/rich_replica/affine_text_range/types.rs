use super::super::{
    WriterDependency,
    selection::{CellTarget, Selection, TextPoint},
};
use serde::Serialize;
use serde_json::Value;
/// Original protected editing domain. Text never silently migrates between captions/base cells.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AffineTextDomain {
    /// Ordinary flow, including transparent lists and quotes.
    Document,
    /// Exact original base cell, not a neighboring or merged-master fallback.
    Cell {
        /// Stable table/row/column coordinates.
        cell: CellTarget,
    },
    /// Caption of this exact original image.
    Caption {
        /// Stable image block identity.
        image: String,
    },
}
/// Descriptive range identity. No author, permission, Accept or mutable native state is present.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct AffineTextRangeInfo {
    /// Domain-separated immutable packet digest.
    pub id: String,
    /// Original directional candidate; descriptive admission does not validate its source yet.
    pub selection: Selection,
}
/// One maximal contiguous original/current run. New intervening characters are excluded.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AffineTextSegment {
    /// Original source run start. Its affinity does not authorize including new characters.
    pub source: TextPoint,
    /// Current native run start, which may have followed a text-flow split or join.
    pub current: TextPoint,
    /// Exact UTF-16 length, bounded to u32 like native text actions.
    pub length: u32,
    /// Original characters, without normalization or replacement matching.
    pub text: String,
    /// Original admitted marks; callers must explicitly choose their edit's conflict policy.
    pub source_formats: Vec<Value>,
    /// Current admitted marks, including independently edited properties.
    pub current_formats: Vec<Value>,
    /// Preserved original protected domain.
    pub domain: AffineTextDomain,
}
/// No nearest character/block substitution can turn these losses into a usable range.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AffineTextRangeConflict {
    /// At least one original selected scalar was deleted, even if equal text was reinserted.
    CharactersDeleted,
    /// Original scalar order changed in the visible rich tree.
    CharactersReordered,
    /// A selected scalar crossed an original protected cell/caption boundary.
    DomainChanged,
    /// The original text kind changed, e.g. prose became code.
    KindChanged,
    /// An original endpoint cannot resolve to an admitted visible text boundary.
    BoundaryDeleted,
}
/// A pure native range read, never a Ready suggestion preview or executable mutation plan.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AffineTextRangeResolution {
    /// Exact original operations are not retained yet.
    Pending {
        /// Original exclusive causal ends, not optimistic server receipts.
        missing: Vec<WriterDependency>,
    },
    /// No partially usable subset or guessed endpoint is returned.
    Conflict {
        /// Exact conservative range loss.
        reason: AffineTextRangeConflict,
    },
    /// Every original scalar survives in order in the same protected domain/kind.
    Resolved {
        /// Original immutable identity/direction.
        info: Box<AffineTextRangeInfo>,
        /// Original directional anchor mapped through native insertion affinity.
        anchor: TextPoint,
        /// Original directional focus; not sorted into the anchor.
        focus: TextPoint,
        /// Exact original-character runs, excluding all newer characters between them.
        segments: Vec<AffineTextSegment>,
        /// Original native source cut, not a current-author or server-finalization credential.
        clocks: Vec<WriterDependency>,
    },
}
