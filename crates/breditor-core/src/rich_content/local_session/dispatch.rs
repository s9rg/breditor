//! Atomic content/selection/history publication through one exclusive rich owner.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState,
    RichSelectionUpdate, history_entry::RichHistoryEntry,
};
use crate::rich_content::{
    RichSelection, RichSelectionKind,
    actions::{RichAction, apply_batch},
};

impl RichLocalSession {
    /// Dispatch one complete captured group against its exact observed publication.
    ///
    /// A content group is one undo unit. Selection-only publication retains redo;
    /// no-ops leave the owner token, revision and all history branches unchanged.
    ///
    /// # Errors
    /// Rejects stale/foreign observations, late action failures, invalid selection
    /// mapping/update or revision overflow before changing any owner field.
    pub fn dispatch(
        &mut self,
        snapshot: &RichLocalSnapshot,
        actions: &[RichAction],
        selection_update: RichSelectionUpdate,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        let edit = apply_batch(&self.context, &self.state.document, actions)?;
        let document = edit
            .as_ref()
            .map_or_else(|| self.state.document.clone(), |edit| edit.document().clone());
        let selection = match selection_update {
            RichSelectionUpdate::Set(kind) => {
                kind.map(|kind| RichSelection::try_new(&document, kind)).transpose()?
            }
            RichSelectionUpdate::Map => match (&edit, &self.state.selection) {
                (Some(edit), Some(selection)) => edit.map_selection(selection)?.into_selection(),
                _ => self.state.selection.clone(),
            },
        };
        if edit.is_none() && selection == self.state.selection {
            return Ok(RichLocalOutcome::Unchanged);
        }
        let candidate =
            RichLocalState { document, selection, revision: self.state.revision.successor()? };
        let Some(edit) = edit else {
            self.publish(candidate);
            return Ok(RichLocalOutcome::SelectionOnly);
        };
        let inverse = edit.into_parts().1;
        let entry = RichHistoryEntry {
            before: self.state.clone(),
            after: candidate.clone(),
            forward: actions.to_vec(),
            inverse,
        };
        self.entries.truncate(self.cursor);
        if self.capacity.get() == 0 {
            self.entries.clear();
            self.cursor = 0;
        } else {
            self.entries.push(entry);
            if self.entries.len() > self.capacity.as_usize() {
                self.entries.remove(0);
            }
            self.cursor = self.entries.len();
        }
        self.publish(candidate);
        Ok(RichLocalOutcome::ContentCommitted)
    }

    /// Validate and publish only logical selection; this does not create user undo.
    ///
    /// # Errors
    /// Rejects stale observations, invalid targets or revision overflow atomically.
    pub fn set_selection(
        &mut self,
        snapshot: &RichLocalSnapshot,
        kind: Option<RichSelectionKind>,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.dispatch(snapshot, &[], RichSelectionUpdate::Set(kind))
    }
}
