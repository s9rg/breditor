//! Logical shared grid navigation changes only local selection and preserves selective history.
use super::{
    RichReplica, SharedObservation,
    selection::{CellTarget, Selection},
};
use crate::Error;
use breditor_core::rich_content::{
    GridBoundary, GridMove, GridNavigationMode, GridNavigationOutcome, RichSelectionKind,
};
use serde::Serialize;

/// Logical navigation result; boundaries never fabricate a row or change the current selection.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GridNavigationResult {
    /// A new admitted directional selection was published.
    Moved,
    /// The requested selection already holds.
    Unchanged,
    /// The host may transfer focus or explicitly author a structure edit.
    Boundary {
        /// Stable boundary name, independent of bidi layout or physical keyboard policy.
        boundary: &'static str,
    },
}
impl RichReplica {
    /// Navigate the current grid through original Rust geometry without authoring shared operations.
    /// # Errors
    /// Rejects stale/foreign observations or non-grid selections without changing any owner state.
    pub fn navigate_grid_guarded(
        &mut self,
        observation: &SharedObservation,
        movement: GridMove,
        extend: bool,
    ) -> Result<GridNavigationResult, Error> {
        self.check(observation)?;
        let selection = self
            .selection()?
            .ok_or(Error::Contract("grid navigation selection"))?
            .admit(&self.document)?;
        let result = breditor_core::rich_content::navigate_grid(
            &self.document,
            &selection,
            movement,
            if extend { GridNavigationMode::Extend } else { GridNavigationMode::Collapse },
        )
        .map_err(|_| Error::Contract("shared grid navigation"))?;
        match result {
            GridNavigationOutcome::Unchanged => Ok(GridNavigationResult::Unchanged),
            GridNavigationOutcome::Boundary(boundary) => Ok(GridNavigationResult::Boundary {
                boundary: match boundary {
                    GridBoundary::BeforeTable => "beforeTable",
                    GridBoundary::AfterTable => "afterTable",
                    GridBoundary::LeftEdge => "leftEdge",
                    GridBoundary::RightEdge => "rightEdge",
                    GridBoundary::TopEdge => "topEdge",
                    GridBoundary::BottomEdge => "bottomEdge",
                },
            }),
            GridNavigationOutcome::Moved(selection) => {
                let RichSelectionKind::Grid { anchor, focus } = selection.kind() else {
                    return Err(Error::Contract("shared navigation result kind"));
                };
                self.set_selection(Some(&Selection::Grid {
                    anchor: CellTarget::from_core(anchor),
                    focus: CellTarget::from_core(focus),
                }))?;
                Ok(GridNavigationResult::Moved)
            }
        }
    }
}
