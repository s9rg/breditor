//! Native multi-root owner: several root sessions, one active root, one global history.

use super::{
    RichRootCheckpointPart, RichRootHistory, RichRootId, RichRootMeta, RichRootSelectionPolicy,
    RichRootSet, RichRootSetCheckpoint, RichRootSetError,
};
use crate::{
    codec::{RichSessionJsonCodec, RichTypingSessionJsonCodec},
    rich_content::{RichLocalOutcome, RichLocalSession},
    state::EditorContext,
};
use std::collections::BTreeMap;

/// One editor over several editable roots sharing one schema context and one Undo order.
///
/// Every root is an ordinary [`RichLocalSession`] over a frozen-grammar document.
/// Commands go to one root at a time ([`Self::dispatch`]); global [`Self::undo`] and
/// [`Self::redo`] follow the journal across roots in chronological order.
#[derive(Debug)]
pub struct RichMultiRootSession {
    context: EditorContext,
    set: RichRootSet,
    sessions: BTreeMap<RichRootId, RichLocalSession>,
}

impl RichMultiRootSession {
    /// An empty owner for one schema/limits context.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        Self { context, set: RichRootSet::new(), sessions: BTreeMap::new() }
    }
    /// Set metadata, active root and global journal.
    #[must_use]
    pub const fn set(&self) -> &RichRootSet {
        &self.set
    }
    /// Read one root owner (per-root `getData` reads go through it).
    #[must_use]
    pub fn root(&self, id: &RichRootId) -> Option<&RichLocalSession> {
        self.sessions.get(id)
    }
    /// Add a root with empty history at `index` (default last).
    ///
    /// # Errors
    /// Rejects context mismatches and every [`RichRootSet::add_root`] failure.
    pub fn add_root(
        &mut self,
        meta: RichRootMeta,
        session: RichLocalSession,
        index: Option<usize>,
    ) -> Result<(), RichRootSetError> {
        if session.context() != &self.context {
            return Err(RichRootSetError::ContextMismatch);
        }
        let id = meta.id().clone();
        self.set.add_root(meta, &session, index)?;
        self.sessions.insert(id, session);
        Ok(())
    }
    /// Detach a root, returning its metadata and owner (e.g. to save its data).
    ///
    /// # Errors
    /// Rejects unknown roots.
    pub fn remove_root(
        &mut self,
        id: &RichRootId,
    ) -> Result<(RichRootMeta, RichLocalSession), RichRootSetError> {
        let meta = self.set.remove_root(id)?;
        let session = self.sessions.remove(id).ok_or(RichRootSetError::UnknownRoot)?;
        Ok((meta, session))
    }
    /// Make `id` the active root.
    ///
    /// # Errors
    /// Rejects unknown roots.
    pub fn focus(&mut self, id: &RichRootId) -> Result<bool, RichRootSetError> {
        self.set.focus(id)
    }
    /// Replace one root's host attributes (not an Undo unit).
    ///
    /// # Errors
    /// Rejects unknown roots or unbounded attributes.
    pub fn set_attributes(
        &mut self,
        id: &RichRootId,
        attributes: BTreeMap<String, String>,
    ) -> Result<(), RichRootSetError> {
        self.set.set_attributes(id, attributes)
    }
    /// Run one command on root `id`, then record its history events in the global order.
    ///
    /// # Errors
    /// Rejects unknown roots; a failed command is returned after reconciliation.
    pub fn dispatch<T>(
        &mut self,
        id: &RichRootId,
        command: impl FnOnce(&mut RichLocalSession) -> Result<T, RichRootSetError>,
    ) -> Result<T, RichRootSetError> {
        let session = self.sessions.get_mut(id).ok_or(RichRootSetError::UnknownRoot)?;
        self.set.focus(id)?;
        let result = command(session);
        self.set.reconcile(id, session)?;
        result
    }
    /// Undo the newest global unit, in whichever root owns it; returns that root.
    ///
    /// # Errors
    /// Propagates the root owner's exact undo failure.
    pub fn undo(&mut self) -> Result<Option<RichRootId>, RichRootSetError> {
        let Some(id) = self.set.undo_target().cloned() else { return Ok(None) };
        self.dispatch(&id, |session| Ok(session.undo(&session.snapshot())?))?;
        Ok(Some(id))
    }
    /// Redo the next global unit, in whichever root owns it; returns that root.
    ///
    /// # Errors
    /// Propagates the root owner's exact redo failure.
    pub fn redo(&mut self) -> Result<Option<RichRootId>, RichRootSetError> {
        let Some(id) = self.set.redo_target().cloned() else { return Ok(None) };
        let outcome = self.dispatch(&id, |session| Ok(session.redo(&session.snapshot())?))?;
        debug_assert_eq!(outcome, RichLocalOutcome::RedoApplied);
        Ok(Some(id))
    }
    /// Encode the whole set: metadata, journal and each root's exact local checkpoint.
    ///
    /// # Errors
    /// Rejects root checkpoint encoding failures.
    pub fn checkpoint(&self) -> Result<String, RichRootSetError> {
        let mut parts = Vec::new();
        for meta in self.set.roots() {
            let session = &self.sessions[meta.id()];
            let typing = session.typing_history_enabled();
            let checkpoint = if typing {
                RichTypingSessionJsonCodec::new(self.context.clone()).encode(session)
            } else {
                RichSessionJsonCodec::new(self.context.clone()).encode(session)
            }
            .map_err(|_| RichRootSetError::CheckpointRejected)?;
            parts.push(RichRootCheckpointPart {
                id: meta.id().clone(),
                history: if typing { RichRootHistory::TypingV1 } else { RichRootHistory::Explicit },
                selection: RichRootSelectionPolicy::Original,
                checkpoint,
            });
        }
        self.set.encode_checkpoint(&parts)
    }
    /// Replay-admit every root and verify the global journal against each restored owner.
    ///
    /// # Errors
    /// Rejects malformed envelopes, document-selection roots (restored through the
    /// Wasm document codec instead), root checkpoint failures and journal mismatches.
    pub fn restore(context: EditorContext, input: &str) -> Result<Self, RichRootSetError> {
        let RichRootSetCheckpoint { mut set, parts } = RichRootSetCheckpoint::decode(input)?;
        let mut sessions = BTreeMap::new();
        for part in parts {
            if part.selection != RichRootSelectionPolicy::Original {
                return Err(RichRootSetError::CheckpointRejected);
            }
            let session = match part.history {
                RichRootHistory::Explicit => {
                    RichSessionJsonCodec::new(context.clone()).decode(&part.checkpoint)
                }
                RichRootHistory::TypingV1 => {
                    RichTypingSessionJsonCodec::new(context.clone()).decode(&part.checkpoint)
                }
            }
            .map_err(|_| RichRootSetError::CheckpointRejected)?;
            set.attach(&part.id, &session)?;
            sessions.insert(part.id, session);
        }
        Ok(Self { context, set, sessions })
    }
}
