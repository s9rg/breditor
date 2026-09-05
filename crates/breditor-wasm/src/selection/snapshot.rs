use breditor_core::{
    position::{Affinity, Point},
    selection::{RangeOrder, Selection},
    state::EditorState,
};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorError, error::SELECTION_READ_CODE};

use super::node_index::semantic_node_index;

enum SelectionSnapshotValue {
    None,
    Range { anchor: SelectionPointSnapshot, focus: SelectionPointSnapshot, order: RangeOrder },
}

struct SelectionPointSnapshot {
    kind: SelectionPointSnapshotKind,
    node_index: u32,
    offset: u32,
    affinity: Affinity,
}

#[derive(Clone, Copy)]
enum SelectionPointSnapshotKind {
    Text,
    Children,
}

/// Snapshot-bound, non-JSON view of the canonical semantic selection.
///
/// Endpoint node indexes use the same deterministic preorder coordinates as
/// [`crate::BreditorProjection`]. They are meaningful only at this exact
/// snapshot and must be paired with its guarded observation.
#[wasm_bindgen]
pub struct BreditorSelection {
    lineage: String,
    revision: String,
    value: SelectionSnapshotValue,
}

impl BreditorSelection {
    pub(crate) fn from_state(state: &EditorState) -> Result<Self, BreditorError> {
        let value = match state.selection() {
            None => SelectionSnapshotValue::None,
            Some(Selection::Range(range)) => {
                let resolved = range
                    .resolve(state.context().schema(), state.document())
                    .map_err(|_| selection_read_error())?;
                SelectionSnapshotValue::Range {
                    anchor: SelectionPointSnapshot::from_point(state, range.anchor())?,
                    focus: SelectionPointSnapshot::from_point(state, range.focus())?,
                    order: resolved.order(),
                }
            }
            _ => return Err(selection_read_error()),
        };
        Ok(Self {
            lineage: state.snapshot().lineage().as_str().to_owned(),
            revision: state.snapshot().revision().get().to_string(),
            value,
        })
    }

    fn range(&self) -> Option<(&SelectionPointSnapshot, &SelectionPointSnapshot, RangeOrder)> {
        match &self.value {
            SelectionSnapshotValue::Range { anchor, focus, order } => Some((anchor, focus, *order)),
            SelectionSnapshotValue::None => None,
        }
    }
}

impl SelectionPointSnapshot {
    fn from_point(state: &EditorState, point: &Point) -> Result<Self, BreditorError> {
        let node_index = semantic_node_index(state.document(), point.target_path())
            .ok_or_else(selection_read_error)?;
        let (kind, offset) = match point {
            Point::Text { utf16_offset, .. } => (SelectionPointSnapshotKind::Text, *utf16_offset),
            Point::Children { child_index, .. } => {
                (SelectionPointSnapshotKind::Children, *child_index)
            }
        };
        Ok(Self { kind, node_index, offset, affinity: point.affinity() })
    }

    const fn kind_str(&self) -> &'static str {
        match self.kind {
            SelectionPointSnapshotKind::Text => "text",
            SelectionPointSnapshotKind::Children => "children",
        }
    }

    const fn affinity_str(&self) -> &'static str {
        match self.affinity {
            Affinity::Before => "before",
            Affinity::After => "after",
        }
    }
}

#[wasm_bindgen]
impl BreditorSelection {
    /// Returns the lineage of the exact editor snapshot represented here.
    #[must_use]
    #[wasm_bindgen(getter, js_name = snapshotLineage)]
    pub fn snapshot_lineage(&self) -> String {
        self.lineage.clone()
    }

    /// Returns the full-width snapshot revision as canonical decimal text.
    #[must_use]
    #[wasm_bindgen(getter, js_name = snapshotRevision)]
    pub fn snapshot_revision(&self) -> String {
        self.revision.clone()
    }

    /// Returns `none` or `range`.
    #[must_use]
    #[wasm_bindgen(getter, unchecked_return_type = "BreditorSelectionKind")]
    pub fn kind(&self) -> String {
        match self.value {
            SelectionSnapshotValue::None => "none",
            SelectionSnapshotValue::Range { .. } => "range",
        }
        .to_owned()
    }

    /// Returns the anchor point kind for a range selection.
    #[must_use]
    #[wasm_bindgen(
        getter,
        js_name = anchorPointKind,
        unchecked_return_type = "BreditorSelectionPointKind | undefined"
    )]
    pub fn anchor_point_kind(&self) -> Option<String> {
        self.range().map(|(anchor, _, _)| anchor.kind_str().to_owned())
    }

    /// Returns the anchor target's flattened semantic node index.
    #[must_use]
    #[wasm_bindgen(getter, js_name = anchorNodeIndex)]
    pub fn anchor_node_index(&self) -> Option<u32> {
        self.range().map(|(anchor, _, _)| anchor.node_index)
    }

    /// Returns the anchor UTF-16 or child-boundary offset.
    #[must_use]
    #[wasm_bindgen(getter, js_name = anchorOffset)]
    pub fn anchor_offset(&self) -> Option<u32> {
        self.range().map(|(anchor, _, _)| anchor.offset)
    }

    /// Returns the anchor insertion-boundary affinity.
    #[must_use]
    #[wasm_bindgen(
        getter,
        js_name = anchorAffinity,
        unchecked_return_type = "BreditorSelectionAffinity | undefined"
    )]
    pub fn anchor_affinity(&self) -> Option<String> {
        self.range().map(|(anchor, _, _)| anchor.affinity_str().to_owned())
    }

    /// Returns the focus point kind for a range selection.
    #[must_use]
    #[wasm_bindgen(
        getter,
        js_name = focusPointKind,
        unchecked_return_type = "BreditorSelectionPointKind | undefined"
    )]
    pub fn focus_point_kind(&self) -> Option<String> {
        self.range().map(|(_, focus, _)| focus.kind_str().to_owned())
    }

    /// Returns the focus target's flattened semantic node index.
    #[must_use]
    #[wasm_bindgen(getter, js_name = focusNodeIndex)]
    pub fn focus_node_index(&self) -> Option<u32> {
        self.range().map(|(_, focus, _)| focus.node_index)
    }

    /// Returns the focus UTF-16 or child-boundary offset.
    #[must_use]
    #[wasm_bindgen(getter, js_name = focusOffset)]
    pub fn focus_offset(&self) -> Option<u32> {
        self.range().map(|(_, focus, _)| focus.offset)
    }

    /// Returns the focus insertion-boundary affinity.
    #[must_use]
    #[wasm_bindgen(
        getter,
        js_name = focusAffinity,
        unchecked_return_type = "BreditorSelectionAffinity | undefined"
    )]
    pub fn focus_affinity(&self) -> Option<String> {
        self.range().map(|(_, focus, _)| focus.affinity_str().to_owned())
    }

    /// Returns `collapsed`, `forward`, or `backward` for a range selection.
    #[must_use]
    #[wasm_bindgen(
        getter,
        js_name = rangeOrder,
        unchecked_return_type = "BreditorSelectionRangeOrder | undefined"
    )]
    pub fn range_order(&self) -> Option<String> {
        self.range().map(|(_, _, order)| {
            match order {
                RangeOrder::Collapsed => "collapsed",
                RangeOrder::Forward => "forward",
                RangeOrder::Backward => "backward",
            }
            .to_owned()
        })
    }
}

const fn selection_read_error() -> BreditorError {
    BreditorError::new(SELECTION_READ_CODE, "the semantic selection could not be projected")
}
