//! Undoable set-structure steps: add, remove (detach and retain), move, and root attributes.
//!
//! Each step is one entry in the same global order as root content units. Doing a
//! step clears the global redo branch like any new edit. Global Undo/Redo applies
//! the step's exact inverse/forward form with strict preconditions: a step whose
//! recorded position or attributes no longer match is refused with
//! [`RichRootSetError::HistoryMismatch`] and changes nothing.

use super::{
    RICH_ROOT_STRUCTURE_STEPS_MAX, RICH_ROOTS_MAX, RichRootId, RichRootJournalEntry, RichRootMeta,
    RichRootSet, RichRootSetError, RichRootStructureStep,
    journal::{Root, is_add, is_remove},
};
use crate::rich_content::RichLocalSession;
use std::collections::BTreeMap;

impl RichRootSet {
    /// Push a just-applied step (after [`Self::clear_redo`]) and bound structural history.
    fn record(&mut self, step: RichRootStructureStep) {
        self.journal.push(RichRootJournalEntry::Structure(step));
        self.cursor = self.journal.len();
        while self.journal.iter().filter(|entry| entry.is_structure()).count()
            > RICH_ROOT_STRUCTURE_STEPS_MAX
            || self.detached.len() > RICH_ROOTS_MAX
        {
            // The oldest step leaves history; positions of every newer step stay exact.
            let Some(first) =
                self.journal[..self.cursor].iter().position(RichRootJournalEntry::is_structure)
            else {
                break;
            };
            self.journal.remove(first);
            self.cursor -= 1;
            self.release_unreachable();
        }
        self.bump();
    }

    /// Add a root with empty history at `index` (default last) as one global Undo step.
    ///
    /// The new root becomes active. Undo detaches it and retains its owner; Redo
    /// re-attaches the same owner at the same position.
    ///
    /// # Errors
    /// Rejects an empty set (the first root is composed with [`Self::add_root`]), ids
    /// that are attached or retained by an undoable removal, too many roots, an
    /// out-of-range index or a root with history.
    pub fn add_root_undoable(
        &mut self,
        meta: RichRootMeta,
        session: &RichLocalSession,
        index: Option<usize>,
    ) -> Result<(), RichRootSetError> {
        if self.roots.is_empty() {
            return Err(RichRootSetError::LastRoot);
        }
        let index = self.admit(&meta, session, index, true)?;
        self.clear_redo();
        let id = meta.id().clone();
        self.roots.insert(index, Root { meta, seen: Some(session.history_probe()) });
        self.active = Some(id.clone());
        self.record(RichRootStructureStep::Add { id, index });
        Ok(())
    }

    /// Detach a root as one global Undo step, retaining its owner, history and journal units.
    ///
    /// Undo re-attaches the same root (same id, document and history) at the same
    /// position. The owner is released once no Undo/Redo step can bring it back.
    ///
    /// # Errors
    /// Rejects unknown roots and the last root.
    pub fn remove_root_undoable(
        &mut self,
        id: &RichRootId,
    ) -> Result<RichRootMeta, RichRootSetError> {
        let index = self.index(id)?;
        if self.roots.len() == 1 {
            return Err(RichRootSetError::LastRoot);
        }
        self.clear_redo();
        let root = self.roots.remove(index);
        let meta = root.meta.clone();
        self.detached.push(root);
        self.neighbour(id, index);
        self.record(RichRootStructureStep::Remove { id: id.clone(), index });
        Ok(meta)
    }

    /// Move a root to set-order position `to` as one global Undo step; returns whether it moved.
    ///
    /// # Errors
    /// Rejects unknown roots and an out-of-range position.
    pub fn move_root(&mut self, id: &RichRootId, to: usize) -> Result<bool, RichRootSetError> {
        let from = self.index(id)?;
        if to >= self.roots.len() {
            return Err(RichRootSetError::IndexOutOfRange);
        }
        if from == to {
            return Ok(false);
        }
        self.clear_redo();
        let root = self.roots.remove(from);
        self.roots.insert(to, root);
        self.active = Some(id.clone());
        self.record(RichRootStructureStep::Move { id: id.clone(), from, to });
        Ok(true)
    }

    /// Replace one root's host attributes as one global Undo step; returns whether they changed.
    ///
    /// # Errors
    /// Rejects unknown roots or unbounded attributes.
    pub fn set_attributes(
        &mut self,
        id: &RichRootId,
        attributes: BTreeMap<String, String>,
    ) -> Result<bool, RichRootSetError> {
        let index = self.index(id)?;
        let mut meta = self.roots[index].meta.clone();
        let before = meta.attributes().clone();
        meta.set_attributes(attributes)?;
        if meta.attributes() == &before {
            return Ok(false);
        }
        let after = meta.attributes().clone();
        self.clear_redo();
        // `clear_redo` only touches detached roots, so `index` still names `id`.
        self.roots[index].meta = meta;
        self.active = Some(id.clone());
        self.record(RichRootStructureStep::Attributes { id: id.clone(), before, after });
        Ok(true)
    }

    /// Set one attribute as one global Undo step; returns whether it changed.
    ///
    /// # Errors
    /// Rejects unknown roots, invalid keys/values or too many attributes.
    pub fn set_attribute(
        &mut self,
        id: &RichRootId,
        key: &str,
        value: &str,
    ) -> Result<bool, RichRootSetError> {
        let mut attributes =
            self.meta(id).ok_or(RichRootSetError::UnknownRoot)?.attributes().clone();
        attributes.insert(key.to_owned(), value.to_owned());
        self.set_attributes(id, attributes)
    }

    /// Remove one attribute as one global Undo step; returns whether it existed.
    ///
    /// # Errors
    /// Rejects unknown roots.
    pub fn remove_attribute(
        &mut self,
        id: &RichRootId,
        key: &str,
    ) -> Result<bool, RichRootSetError> {
        let mut attributes =
            self.meta(id).ok_or(RichRootSetError::UnknownRoot)?.attributes().clone();
        if attributes.remove(key).is_none() {
            return Ok(false);
        }
        self.set_attributes(id, attributes)
    }

    /// Undo the newest global step when it is a structure step; returns that step.
    ///
    /// # Errors
    /// [`RichRootSetError::NoStructureStep`] when the newest step is a root content
    /// unit (route it to that root instead) or there is none; `HistoryMismatch` when
    /// the recorded step no longer matches the set. Nothing changes on failure.
    pub fn undo_structure(&mut self) -> Result<RichRootStructureStep, RichRootSetError> {
        let Some(RichRootJournalEntry::Structure(step)) = self.undo_step().cloned() else {
            return Err(RichRootSetError::NoStructureStep);
        };
        self.apply(&step, false)?;
        self.cursor -= 1;
        self.bump();
        Ok(step)
    }

    /// Redo the next global step when it is a structure step; returns that step.
    ///
    /// # Errors
    /// As [`Self::undo_structure`].
    pub fn redo_structure(&mut self) -> Result<RichRootStructureStep, RichRootSetError> {
        let Some(RichRootJournalEntry::Structure(step)) = self.redo_step().cloned() else {
            return Err(RichRootSetError::NoStructureStep);
        };
        self.apply(&step, true)?;
        self.cursor += 1;
        self.bump();
        Ok(step)
    }

    fn at(&self, index: usize, id: &RichRootId) -> bool {
        self.roots.get(index).is_some_and(|root| root.meta.id() == id)
    }
    fn detach_at(&mut self, index: usize, id: &RichRootId) -> Result<(), RichRootSetError> {
        if !self.at(index, id) || self.roots.len() == 1 {
            return Err(RichRootSetError::HistoryMismatch);
        }
        let root = self.roots.remove(index);
        self.detached.push(root);
        self.neighbour(id, index);
        Ok(())
    }
    fn reattach_at(&mut self, index: usize, id: &RichRootId) -> Result<(), RichRootSetError> {
        let position = self.detached.iter().position(|root| root.meta.id() == id);
        let (Some(position), true) = (position, index <= self.roots.len()) else {
            return Err(RichRootSetError::HistoryMismatch);
        };
        let root = self.detached.remove(position);
        self.roots.insert(index, root);
        self.active = Some(id.clone());
        Ok(())
    }
    fn shift(&mut self, id: &RichRootId, from: usize, to: usize) -> Result<(), RichRootSetError> {
        if !self.at(from, id) || to >= self.roots.len() {
            return Err(RichRootSetError::HistoryMismatch);
        }
        let root = self.roots.remove(from);
        self.roots.insert(to, root);
        self.active = Some(id.clone());
        Ok(())
    }
    fn replace(
        &mut self,
        id: &RichRootId,
        expected: &BTreeMap<String, String>,
        next: &BTreeMap<String, String>,
    ) -> Result<(), RichRootSetError> {
        let index = self.index(id).map_err(|_| RichRootSetError::HistoryMismatch)?;
        if self.roots[index].meta.attributes() != expected {
            return Err(RichRootSetError::HistoryMismatch);
        }
        self.roots[index].meta.set_attributes(next.clone())?;
        self.active = Some(id.clone());
        Ok(())
    }
    /// Apply a step forward (Redo) or backward (Undo); exact preconditions, no change on failure.
    fn apply(
        &mut self,
        step: &RichRootStructureStep,
        forward: bool,
    ) -> Result<(), RichRootSetError> {
        match (step, forward) {
            (RichRootStructureStep::Add { id, index }, true)
            | (RichRootStructureStep::Remove { id, index }, false) => self.reattach_at(*index, id),
            (RichRootStructureStep::Add { id, index }, false)
            | (RichRootStructureStep::Remove { id, index }, true) => self.detach_at(*index, id),
            (RichRootStructureStep::Move { id, from, to }, true) => self.shift(id, *from, *to),
            (RichRootStructureStep::Move { id, from, to }, false) => self.shift(id, *to, *from),
            (RichRootStructureStep::Attributes { id, before, after }, true) => {
                self.replace(id, before, after)
            }
            (RichRootStructureStep::Attributes { id, before, after }, false) => {
                self.replace(id, after, before)
            }
        }
    }

    /// Re-verify a decoded journal: walk every step back to the start and forward to the end.
    ///
    /// Every content unit must belong to a root attached at that point, every
    /// structure step must apply exactly, the walk must return to the decoded set,
    /// and every detached root must still be reachable.
    pub(super) fn verify_structure(&self) -> Result<(), RichRootSetError> {
        let rejected = |_| RichRootSetError::CheckpointRejected;
        if self.detached.is_empty() && !self.journal.iter().any(RichRootJournalEntry::is_structure)
        {
            return Ok(());
        }
        let (undo, redo) = self.journal.split_at(self.cursor);
        if self.detached.iter().any(|root| {
            let id = root.meta.id();
            !undo.iter().any(|entry| is_remove(entry, id))
                && !redo.iter().any(|entry| is_add(entry, id))
        }) {
            return Err(RichRootSetError::CheckpointRejected);
        }
        let mut probe = self.clone();
        let step = |probe: &mut Self, position: usize, forward: bool| match &self.journal[position]
        {
            RichRootJournalEntry::Unit(id) => probe.index(id).map(|_| ()),
            RichRootJournalEntry::Structure(step) => probe.apply(step, forward),
        };
        for position in (0..self.cursor).rev() {
            step(&mut probe, position, false).map_err(rejected)?;
        }
        for position in 0..self.journal.len() {
            step(&mut probe, position, true).map_err(rejected)?;
            if position + 1 == self.cursor && !probe.same_layout(self) {
                return Err(RichRootSetError::CheckpointRejected);
            }
        }
        // Undo the redo branch again so the probe ends at the decoded cursor.
        for position in (self.cursor..self.journal.len()).rev() {
            step(&mut probe, position, false).map_err(rejected)?;
        }
        if probe.same_layout(self) { Ok(()) } else { Err(RichRootSetError::CheckpointRejected) }
    }
    fn same_layout(&self, other: &Self) -> bool {
        fn detached(roots: &[Root]) -> BTreeMap<&RichRootId, &RichRootMeta> {
            roots.iter().map(|root| (root.meta.id(), &root.meta)).collect()
        }
        self.roots.iter().map(|root| &root.meta).eq(other.roots.iter().map(|root| &root.meta))
            && detached(&self.detached) == detached(&other.detached)
    }
}
