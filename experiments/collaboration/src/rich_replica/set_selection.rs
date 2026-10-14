//! Local selection publication is atomic, history-free and invisible to shared content updates.
use super::{RichReplica, SharedObservation, selection::Selection};
use crate::Error;

impl RichReplica {
    /// Admit and capture a directional selection without activating shared containers or clearing redo.
    /// # Errors
    /// Invalid targets, scalar boundaries, grids or checkpoint limits preserve every published field.
    pub fn set_selection(&mut self, selection: Option<&Selection>) -> Result<bool, Error> {
        if self.selection()?.as_ref() == selection {
            return Ok(false);
        }
        let mut candidate = self.staged()?;
        candidate.journal.ui.set_selection(&candidate.doc, &candidate.document, selection)?;
        self.adopt(candidate)?;
        Ok(true)
    }
    /// Reject old/foreign complete-publication observations before selection admission.
    /// # Errors
    /// A foreign/stale guard, invalid selection or failed staged adoption retains the owner.
    pub fn set_selection_guarded(
        &mut self,
        observation: &SharedObservation,
        selection: Option<&Selection>,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.set_selection(selection)
    }
}
