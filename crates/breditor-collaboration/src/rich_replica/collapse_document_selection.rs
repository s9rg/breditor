//! Native document-edge navigation publishes local UI only, never replicated content.
use super::{RichReplica, SharedObservation};
use crate::Error;
use breditor_core::rich_content::{
    FlowMove, FlowNavigationOutcome, RichSelection, RichSelectionKind,
};
impl RichReplica {
    /// Collapse explicit document scope to the outer logical start/end under the current proof.
    /// Read-only navigation is allowed. Hidden-only documents retain scope and do not create a floor.
    /// # Errors
    /// Stale/foreign guards, wrong family and invalid side or native publication reject atomically.
    pub fn collapse_document_selection_guarded(
        &mut self,
        observation: &SharedObservation,
        side: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        if !self.document_selection_enabled() {
            return Err(Error::Contract("document navigation requires explicit family"));
        }
        let side = match side {
            "before" => FlowMove::Before,
            "after" => FlowMove::After,
            _ => return Err(Error::Contract("document navigation side")),
        };
        if !self.document_selected() {
            return Ok(false);
        }
        let proof = RichSelection::try_new(&self.document, RichSelectionKind::Document)
            .map_err(|_| Error::Contract("document navigation proof"))?;
        let FlowNavigationOutcome::Moved(stop) =
            breditor_core::rich_content::collapse_document_selection(&self.document, &proof, side)
                .map_err(|_| Error::Contract("document navigation plan"))?
        else {
            return Ok(false);
        };
        let selection = super::atom_edit::selection(stop.kind())?;
        self.set_selection(Some(&selection))
    }
}
