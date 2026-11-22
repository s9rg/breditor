//! One global Undo journal over independently owned root histories.
//!
//! Invariant after every successful call, for every attached root `R`:
//! the number of `R` entries before the cursor equals `R.undo_depth()`, and the
//! number after it is at most `R.redo_depth()`. A root may hold more redo units
//! than the journal tracks: when a new edit in another root clears the global
//! redo branch, those units become unreachable through global Redo (exactly
//! like a single-document editor discarding its redo branch) and disappear at
//! that root's next commit.

use super::{RICH_ROOTS_MAX, RichRootId, RichRootMeta, RichRootSetError};
use crate::rich_content::{RichHistoryProbe, RichLocalSession};
use std::collections::BTreeMap;

#[derive(Clone, Debug)]
struct Root {
    meta: RichRootMeta,
    // None until a restored root owner is attached and verified.
    seen: Option<RichHistoryProbe>,
}

/// Outcome of one reconciliation.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RichRootSetChange {
    /// New global Undo units recorded for the root.
    pub opened: u32,
    /// Global undo moves observed in the root.
    pub undone: u32,
    /// Global redo moves observed in the root.
    pub redone: u32,
    /// Whether the global redo branch was cleared by a new edit.
    pub redo_cleared: bool,
}

/// Ordered roots, active root and the single global Undo/Redo order.
#[derive(Clone, Debug, Default)]
pub struct RichRootSet {
    roots: Vec<Root>,
    journal: Vec<RichRootId>,
    cursor: usize,
    active: Option<RichRootId>,
    revision: u64,
}

impl RichRootSet {
    /// An empty set.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    /// Root metadata in shared document order.
    pub fn roots(&self) -> impl Iterator<Item = &RichRootMeta> {
        self.roots.iter().map(|root| &root.meta)
    }
    /// Metadata of one root.
    #[must_use]
    pub fn meta(&self, id: &RichRootId) -> Option<&RichRootMeta> {
        self.roots.iter().find(|root| root.meta.id() == id).map(|root| &root.meta)
    }
    /// Root receiving focus-routed commands; the only root that may hold a selection highlight.
    #[must_use]
    pub const fn active(&self) -> Option<&RichRootId> {
        self.active.as_ref()
    }
    /// Global chronological unit order; entries before [`Self::cursor`] are undoable.
    #[must_use]
    pub fn journal(&self) -> &[RichRootId] {
        &self.journal
    }
    /// Global history cursor.
    #[must_use]
    pub const fn cursor(&self) -> usize {
        self.cursor
    }
    /// Global undoable units across all roots.
    #[must_use]
    pub fn undo_depth(&self) -> u32 {
        u32::try_from(self.cursor).unwrap_or(u32::MAX)
    }
    /// Global redoable units across all roots.
    #[must_use]
    pub fn redo_depth(&self) -> u32 {
        u32::try_from(self.journal.len() - self.cursor).unwrap_or(u32::MAX)
    }
    /// Root owning the next global Undo unit.
    #[must_use]
    pub fn undo_target(&self) -> Option<&RichRootId> {
        self.cursor.checked_sub(1).map(|index| &self.journal[index])
    }
    /// Root owning the next global Redo unit.
    #[must_use]
    pub fn redo_target(&self) -> Option<&RichRootId> {
        self.journal.get(self.cursor)
    }
    /// Process-local set publication counter (structure, focus or journal changes).
    #[must_use]
    pub const fn revision(&self) -> u64 {
        self.revision
    }
    /// Whether every restored root owner has been attached and verified.
    #[must_use]
    pub fn is_complete(&self) -> bool {
        self.roots.iter().all(|root| root.seen.is_some())
    }

    fn index(&self, id: &RichRootId) -> Result<usize, RichRootSetError> {
        self.roots.iter().position(|root| root.meta.id() == id).ok_or(RichRootSetError::UnknownRoot)
    }
    fn bump(&mut self) {
        self.revision = self.revision.wrapping_add(1);
    }
    fn count(&self, id: &RichRootId, range: std::ops::Range<usize>) -> usize {
        self.journal[range].iter().filter(|entry| *entry == id).count()
    }

    /// Add a root with empty history at `index` (default: last). Not an Undo unit.
    ///
    /// # Errors
    /// Rejects duplicate ids, too many roots, an out-of-range index or a root with history.
    pub fn add_root(
        &mut self,
        meta: RichRootMeta,
        session: &RichLocalSession,
        index: Option<usize>,
    ) -> Result<(), RichRootSetError> {
        if self.roots.iter().any(|root| root.meta.id() == meta.id()) {
            return Err(RichRootSetError::DuplicateRoot);
        }
        if self.roots.len() >= RICH_ROOTS_MAX {
            return Err(RichRootSetError::TooManyRoots);
        }
        let index = index.unwrap_or(self.roots.len());
        if index > self.roots.len() {
            return Err(RichRootSetError::UnknownRoot);
        }
        if session.undo_depth() != 0 || session.redo_depth() != 0 {
            return Err(RichRootSetError::HistoryNotEmpty);
        }
        if self.active.is_none() {
            self.active = Some(meta.id().clone());
        }
        self.roots.insert(index, Root { meta, seen: Some(session.history_probe()) });
        self.bump();
        Ok(())
    }
    /// Detach a root and drop its units from the global order. Not an Undo unit.
    ///
    /// # Errors
    /// Rejects unknown roots.
    pub fn remove_root(&mut self, id: &RichRootId) -> Result<RichRootMeta, RichRootSetError> {
        let index = self.index(id)?;
        let before = self.count(id, 0..self.cursor);
        self.journal.retain(|entry| entry != id);
        self.cursor -= before;
        let root = self.roots.remove(index);
        if self.active.as_ref() == Some(id) {
            self.active = self
                .roots
                .get(index.min(self.roots.len().saturating_sub(1)))
                .map(|root| root.meta.id().clone());
        }
        self.bump();
        Ok(root.meta)
    }
    /// Replace one root's host attributes. Not an Undo unit.
    ///
    /// # Errors
    /// Rejects unknown roots or unbounded attributes.
    pub fn set_attributes(
        &mut self,
        id: &RichRootId,
        attributes: BTreeMap<String, String>,
    ) -> Result<(), RichRootSetError> {
        let index = self.index(id)?;
        self.roots[index].meta.set_attributes(attributes)?;
        self.bump();
        Ok(())
    }
    /// Make `id` the active root. Returns whether it changed.
    ///
    /// # Errors
    /// Rejects unknown roots.
    pub fn focus(&mut self, id: &RichRootId) -> Result<bool, RichRootSetError> {
        self.index(id)?;
        if self.active.as_ref() == Some(id) {
            return Ok(false);
        }
        self.active = Some(id.clone());
        self.bump();
        Ok(true)
    }

    /// Record every history event of `session` since the last reconciliation of root `id`.
    ///
    /// Call after any dispatch on that root. Undo/redo moves that did not target the
    /// global top are re-ordered so the invariant holds; normal routing never needs that.
    ///
    /// # Errors
    /// Rejects unknown or not-yet-attached roots; the set is then unchanged.
    pub fn reconcile(
        &mut self,
        id: &RichRootId,
        session: &RichLocalSession,
    ) -> Result<RichRootSetChange, RichRootSetError> {
        let index = self.index(id)?;
        let Some(seen) = self.roots[index].seen else {
            return Err(RichRootSetError::Incomplete);
        };
        let now = session.history_probe();
        if now == seen {
            return Ok(RichRootSetChange::default());
        }
        let mut change = RichRootSetChange::default();
        for _ in 0..now.undos.wrapping_sub(seen.undos) {
            if let Some(position) =
                self.journal[..self.cursor].iter().rposition(|entry| entry == id)
            {
                let entry = self.journal.remove(position);
                self.journal.insert(self.cursor - 1, entry);
                self.cursor -= 1;
                change.undone += 1;
            }
        }
        for _ in 0..now.redos.wrapping_sub(seen.redos) {
            let entry = match self.journal[self.cursor..].iter().position(|entry| entry == id) {
                Some(offset) => self.journal.remove(self.cursor + offset),
                None => id.clone(),
            };
            self.journal.insert(self.cursor, entry);
            self.cursor += 1;
            change.redone += 1;
        }
        let commits = now.commits.wrapping_sub(seen.commits);
        if commits > 0 {
            change.redo_cleared = self.journal.len() > self.cursor;
            self.journal.truncate(self.cursor);
            for _ in 0..commits.saturating_sub(now.joins.wrapping_sub(seen.joins)) {
                self.journal.push(id.clone());
                change.opened += 1;
            }
            self.cursor = self.journal.len();
        }
        // Capacity eviction and grouping never leave more tracked units than the root holds.
        let undo = session.undo_depth() as usize;
        let mut tracked = self.count(id, 0..self.cursor);
        while tracked > undo {
            let first = self.journal.iter().position(|entry| entry == id).unwrap_or_default();
            self.journal.remove(first);
            self.cursor -= 1;
            tracked -= 1;
            change.opened = change.opened.saturating_sub(1);
        }
        while tracked < undo {
            self.journal.insert(0, id.clone());
            self.cursor += 1;
            tracked += 1;
        }
        let redo = session.redo_depth() as usize;
        let mut pending = self.count(id, self.cursor..self.journal.len());
        while pending > redo {
            if let Some(last) = self.journal.iter().rposition(|entry| entry == id) {
                self.journal.remove(last);
            }
            pending -= 1;
        }
        self.roots[index].seen = Some(now);
        self.active = Some(id.clone());
        self.bump();
        Ok(change)
    }

    /// Verify and attach a restored root owner against the decoded journal.
    ///
    /// # Errors
    /// Rejects unknown, already attached or history-mismatched roots.
    pub fn attach(
        &mut self,
        id: &RichRootId,
        session: &RichLocalSession,
    ) -> Result<(), RichRootSetError> {
        let index = self.index(id)?;
        if self.roots[index].seen.is_some() {
            return Err(RichRootSetError::DuplicateRoot);
        }
        if self.count(id, 0..self.cursor) != session.undo_depth() as usize
            || self.count(id, self.cursor..self.journal.len()) > session.redo_depth() as usize
        {
            return Err(RichRootSetError::HistoryMismatch);
        }
        self.roots[index].seen = Some(session.history_probe());
        self.bump();
        Ok(())
    }

    /// Unattached set from decoded checkpoint parts; every root must then be attached.
    pub(super) fn pending(
        roots: Vec<RichRootMeta>,
        journal: Vec<RichRootId>,
        cursor: usize,
        active: Option<RichRootId>,
    ) -> Result<Self, RichRootSetError> {
        let rejected = RichRootSetError::CheckpointRejected;
        if roots.len() > RICH_ROOTS_MAX || cursor > journal.len() {
            return Err(rejected);
        }
        let mut ids = std::collections::BTreeSet::new();
        if !roots.iter().all(|meta| ids.insert(meta.id().clone()))
            || !journal.iter().all(|entry| ids.contains(entry))
            || active.as_ref().is_some_and(|active| !ids.contains(active))
            || (active.is_none() && !roots.is_empty())
        {
            return Err(rejected);
        }
        Ok(Self {
            roots: roots.into_iter().map(|meta| Root { meta, seen: None }).collect(),
            journal,
            cursor,
            active,
            revision: 0,
        })
    }
}
