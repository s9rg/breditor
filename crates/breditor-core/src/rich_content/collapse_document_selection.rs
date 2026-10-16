//! Collapse explicit whole-document scope to a native outer reading-order stop, not fake endpoints.
use super::{
    FlowMove, FlowNavigationOutcome, RichDocument, RichSelection, RichSelectionError,
    RichSelectionKind,
};
use crate::position::NodePath;

/// Collapse to the logical start (`Before`) or end (`After`) of the complete outer document.
/// Lists/tasks/quotes are transparent; images, visible tables and rules remain whole atoms.
/// Hidden-only content has no visible stop and retains document scope without creating content.
/// Non-document selections are not applicable. No identity, history, DOM or text endpoint is invented.
/// # Errors
/// Rejects stale/foreign proofs or contradictions of the admitted document.
pub fn collapse_document_selection(
    document: &RichDocument,
    selection: &RichSelection,
    side: FlowMove,
) -> Result<FlowNavigationOutcome, RichSelectionError> {
    selection.resolve(document)?;
    if !matches!(selection.kind(), RichSelectionKind::Document) {
        return Ok(FlowNavigationOutcome::NotApplicable);
    }
    let count = document
        .document()
        .root()
        .as_element()
        .ok_or(RichSelectionError::Invariant)?
        .children()
        .len();
    let movement = match side {
        FlowMove::Before => FlowMove::After,
        FlowMove::After => FlowMove::Before,
    };
    for ordinal in 0..count {
        let index = match side {
            FlowMove::Before => ordinal,
            FlowMove::After => count - 1 - ordinal,
        };
        let path = NodePath::root()
            .try_child(u32::try_from(index).map_err(|_| RichSelectionError::Invariant)?)
            .map_err(|_| RichSelectionError::Invariant)?;
        if let Some(stop) = super::navigate_flow::edge_stop(document, &path, movement)? {
            return Ok(FlowNavigationOutcome::Moved(stop));
        }
    }
    Ok(FlowNavigationOutcome::Boundary(side))
}
