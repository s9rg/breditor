//! Atomic content/selection/history publication through one exclusive rich owner.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState,
    RichPendingFormatsUpdate, RichSelectionUpdate, history_entry::RichHistoryEntry,
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
        self.dispatch_with_pending_formats(
            snapshot,
            actions,
            selection_update,
            RichPendingFormatsUpdate::Map,
        )
    }

    /// Publish one complete content/selection/typing-state group, with explicit pending-format policy.
    ///
    /// # Errors
    /// Rejects stale observations, failed actions, invalid final selections/formats or revision overflow.
    pub fn dispatch_with_pending_formats(
        &mut self,
        snapshot: &RichLocalSnapshot,
        actions: &[RichAction],
        selection_update: RichSelectionUpdate,
        pending_update: RichPendingFormatsUpdate,
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
        let pending_formats = match pending_update {
            RichPendingFormatsUpdate::Set(formats) => formats,
            RichPendingFormatsUpdate::Map => super::typing_state::mapped(
                &self.state,
                &document,
                selection.as_ref(),
                edit.as_ref(),
            ),
        };
        super::typing_state::validate(&self.context, selection.as_ref(), pending_formats.as_ref())?;
        let content_changed = document.document() != self.state.document.document();
        if !content_changed
            && selection == self.state.selection
            && pending_formats == self.state.pending_formats
        {
            return Ok(RichLocalOutcome::Unchanged);
        }
        let selection_changed = selection != self.state.selection;
        let candidate = RichLocalState {
            document,
            selection,
            pending_formats,
            revision: self.state.revision.successor()?,
        };
        if !content_changed {
            self.publish(candidate);
            return Ok(if selection_changed {
                RichLocalOutcome::SelectionOnly
            } else {
                RichLocalOutcome::TypingStateOnly
            });
        }
        let edit = edit.ok_or(RichLocalSessionError::HistoryMismatch)?;
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
