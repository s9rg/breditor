//! Native multi-root owner: several root sessions, one active root, one global history.

use super::{
    RichRootCheckpointPart, RichRootHistory, RichRootId, RichRootJournalEntry, RichRootMeta,
    RichRootSelectionPolicy, RichRootSet, RichRootSetCheckpoint, RichRootSetError,
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
/// [`Self::redo`] follow the journal across roots and structure steps in
/// chronological order. Sessions of roots detached by an undoable removal (or an
/// undone addition) are retained until no Undo/Redo step can restore them.
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
    /// Read one attached root owner (per-root `getData` reads go through it).
    #[must_use]
    pub fn root(&self, id: &RichRootId) -> Option<&RichLocalSession> {
        self.set.meta(id).and_then(|_| self.sessions.get(id))
    }
    /// Read a retained detached root owner (restorable by global Undo/Redo).
    #[must_use]
    pub fn detached_root(&self, id: &RichRootId) -> Option<&RichLocalSession> {
        self.set.detached().any(|meta| meta.id() == id).then(|| self.sessions.get(id)).flatten()
    }
    /// Drop owners the set no longer retains (released detached roots).
    fn sweep(&mut self) {
        let set = &self.set;
        self.sessions.retain(|id, _| set.retains(id));
    }
    fn admit(&self, session: &RichLocalSession) -> Result<(), RichRootSetError> {
        if session.context() == &self.context {
            Ok(())
        } else {
            Err(RichRootSetError::ContextMismatch)
        }
    }
    /// Add a root with empty history at `index` (default last) outside history.
    ///
    /// # Errors
    /// Rejects context mismatches and every [`RichRootSet::add_root`] failure.
    pub fn add_root(
        &mut self,
        meta: RichRootMeta,
        session: RichLocalSession,
        index: Option<usize>,
    ) -> Result<(), RichRootSetError> {
        self.admit(&session)?;
        let id = meta.id().clone();
        self.set.add_root(meta, &session, index)?;
        self.sweep();
        self.sessions.insert(id, session);
        Ok(())
    }
    /// Add a root with empty history at `index` (default last) as one global Undo step.
    ///
    /// # Errors
    /// Rejects context mismatches and every [`RichRootSet::add_root_undoable`] failure.
    pub fn add_root_undoable(
        &mut self,
        meta: RichRootMeta,
        session: RichLocalSession,
        index: Option<usize>,
    ) -> Result<(), RichRootSetError> {
        self.admit(&session)?;
        let id = meta.id().clone();
        self.set.add_root_undoable(meta, &session, index)?;
        self.sweep();
        self.sessions.insert(id, session);
        Ok(())
    }
    /// Detach a root outside history, returning its metadata and owner (e.g. to save its data).
    ///
    /// # Errors
    /// Rejects unknown roots and the last root.
    pub fn remove_root(
        &mut self,
        id: &RichRootId,
    ) -> Result<(RichRootMeta, RichLocalSession), RichRootSetError> {
        let meta = self.set.remove_root(id)?;
        let session = self.sessions.remove(id).ok_or(RichRootSetError::UnknownRoot)?;
        self.sweep();
        Ok((meta, session))
    }
    /// Detach a root as one global Undo step; its session is retained for Undo.
    ///
    /// # Errors
    /// Rejects unknown roots and the last root.
    pub fn remove_root_undoable(
        &mut self,
        id: &RichRootId,
    ) -> Result<RichRootMeta, RichRootSetError> {
        let meta = self.set.remove_root_undoable(id)?;
        self.sweep();
        Ok(meta)
    }
    /// Move a root to set-order position `to` as one global Undo step.
    ///
    /// # Errors
    /// Rejects unknown roots and out-of-range positions.
    pub fn move_root(&mut self, id: &RichRootId, to: usize) -> Result<bool, RichRootSetError> {
        let moved = self.set.move_root(id, to)?;
        self.sweep();
        Ok(moved)
    }
    /// Make `id` the active root.
    ///
    /// # Errors
    /// Rejects unknown roots.
    pub fn focus(&mut self, id: &RichRootId) -> Result<bool, RichRootSetError> {
        self.set.focus(id)
    }
    /// Replace one root's host attributes as one global Undo step.
    ///
    /// # Errors
    /// Rejects unknown roots or unbounded attributes.
    pub fn set_attributes(
        &mut self,
        id: &RichRootId,
        attributes: BTreeMap<String, String>,
    ) -> Result<bool, RichRootSetError> {
        let changed = self.set.set_attributes(id, attributes)?;
        self.sweep();
        Ok(changed)
    }
    /// Set one root attribute as one global Undo step.
    ///
    /// # Errors
    /// Rejects unknown roots or unbounded attributes.
    pub fn set_attribute(
        &mut self,
        id: &RichRootId,
        key: &str,
        value: &str,
    ) -> Result<bool, RichRootSetError> {
        let changed = self.set.set_attribute(id, key, value)?;
        self.sweep();
        Ok(changed)
    }
    /// Remove one root attribute as one global Undo step.
    ///
    /// # Errors
    /// Rejects unknown roots.
    pub fn remove_attribute(
        &mut self,
        id: &RichRootId,
        key: &str,
    ) -> Result<bool, RichRootSetError> {
        let changed = self.set.remove_attribute(id, key)?;
        self.sweep();
        Ok(changed)
    }
    /// Run one command on attached root `id`, then record its history events in the global order.
    ///
    /// # Errors
    /// Rejects unknown and detached roots; a failed command is returned after reconciliation.
    pub fn dispatch<T>(
        &mut self,
        id: &RichRootId,
        command: impl FnOnce(&mut RichLocalSession) -> Result<T, RichRootSetError>,
    ) -> Result<T, RichRootSetError> {
        self.set.focus(id)?;
        let session = self.sessions.get_mut(id).ok_or(RichRootSetError::UnknownRoot)?;
        let result = command(session);
        self.set.reconcile(id, session)?;
        self.sweep();
        result
    }
    /// Undo the newest global step (a root's unit or a structure step); returns its root.
    ///
    /// # Errors
    /// Propagates the root owner's exact undo failure or a structure mismatch.
    pub fn undo(&mut self) -> Result<Option<RichRootId>, RichRootSetError> {
        match self.set.undo_step().cloned() {
            None => Ok(None),
            Some(RichRootJournalEntry::Structure(_)) => {
                Ok(Some(self.set.undo_structure()?.root().clone()))
            }
            Some(RichRootJournalEntry::Unit(id)) => {
                self.dispatch(&id, |session| Ok(session.undo(&session.snapshot())?))?;
                Ok(Some(id))
            }
        }
    }
    /// Redo the next global step (a root's unit or a structure step); returns its root.
    ///
    /// # Errors
    /// Propagates the root owner's exact redo failure or a structure mismatch.
    pub fn redo(&mut self) -> Result<Option<RichRootId>, RichRootSetError> {
        match self.set.redo_step().cloned() {
            None => Ok(None),
            Some(RichRootJournalEntry::Structure(_)) => {
                Ok(Some(self.set.redo_structure()?.root().clone()))
            }
            Some(RichRootJournalEntry::Unit(id)) => {
                let outcome =
                    self.dispatch(&id, |session| Ok(session.redo(&session.snapshot())?))?;
                debug_assert_eq!(outcome, RichLocalOutcome::RedoApplied);
                Ok(Some(id))
            }
        }
    }
    /// Encode the whole set: metadata, journal and each retained root's exact local checkpoint.
    ///
    /// # Errors
    /// Rejects root checkpoint encoding failures.
    pub fn checkpoint(&self) -> Result<String, RichRootSetError> {
        let mut parts = Vec::new();
        let roots = self.set.roots().map(|meta| (meta, false));
        for (meta, detached) in roots.chain(self.set.detached().map(|meta| (meta, true))) {
            let session = self.sessions.get(meta.id()).ok_or(RichRootSetError::UnknownRoot)?;
            let typing = session.typing_history_enabled();
            let checkpoint = if typing {
                RichTypingSessionJsonCodec::new(self.context.clone()).encode(session)
            } else {
                RichSessionJsonCodec::new(self.context.clone()).encode(session)
            }
            .map_err(|_| RichRootSetError::CheckpointRejected)?;
            parts.push(RichRootCheckpointPart {
                id: meta.id().clone(),
                detached,
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
