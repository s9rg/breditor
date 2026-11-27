//! One global Undo journal over independently owned root histories.
//!
//! Invariant after every successful call, for every attached or retained
//! detached root `R`: the number of `Unit(R)` entries before the cursor equals
//! `R.undo_depth()`, and the number after it is at most `R.redo_depth()`. A root
//! may hold more redo units than the journal tracks: when a new edit in another
//! root clears the global redo branch, those units become unreachable through
//! global Redo (exactly like a single-document editor discarding its redo branch)
//! and disappear at that root's next commit.
//!
//! Undoable structure steps (`structure.rs`) share the same order. A detached root
//! is retained (metadata, probe and journal units) while a `Remove` step before the
//! cursor or an `Add` step after it can still bring it back; once no step can, it
//! is released and the host drops its owner.

use super::{
    RICH_ROOTS_MAX, RichRootId, RichRootJournalEntry, RichRootMeta, RichRootSetError,
    RichRootStructureStep,
};
use crate::rich_content::{RichHistoryProbe, RichLocalSession};

/// Maximum undoable structure steps kept in the global order; the oldest undoable
/// step leaves history first (a removed root it retained is then released).
pub const RICH_ROOT_STRUCTURE_STEPS_MAX: usize = 256;

#[derive(Clone, Debug)]
pub(super) struct Root {
    pub(super) meta: RichRootMeta,
    // None until a restored root owner is attached and verified.
    pub(super) seen: Option<RichHistoryProbe>,
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

/// Ordered roots, retained detached roots, active root and the single global Undo/Redo order.
#[derive(Clone, Debug, Default)]
pub struct RichRootSet {
    pub(super) roots: Vec<Root>,
    pub(super) detached: Vec<Root>,
    pub(super) journal: Vec<RichRootJournalEntry>,
    pub(super) cursor: usize,
    pub(super) active: Option<RichRootId>,
    pub(super) revision: u64,
}

pub(super) fn is_remove(entry: &RichRootJournalEntry, id: &RichRootId) -> bool {
    matches!(entry, RichRootJournalEntry::Structure(RichRootStructureStep::Remove { id: root, .. }) if root == id)
}
pub(super) fn is_add(entry: &RichRootJournalEntry, id: &RichRootId) -> bool {
    matches!(entry, RichRootJournalEntry::Structure(RichRootStructureStep::Add { id: root, .. }) if root == id)
}
fn is_unit(entry: &RichRootJournalEntry, id: &RichRootId) -> bool {
    matches!(entry, RichRootJournalEntry::Unit(root) if root == id)
}

impl RichRootSet {
    /// An empty set.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    /// Attached root metadata in shared document order.
    pub fn roots(&self) -> impl Iterator<Item = &RichRootMeta> {
        self.roots.iter().map(|root| &root.meta)
    }
    /// Detached roots still reachable through global Undo/Redo (their owners must be kept).
    pub fn detached(&self) -> impl Iterator<Item = &RichRootMeta> {
        self.detached.iter().map(|root| &root.meta)
    }
    /// Metadata of one attached root.
    #[must_use]
    pub fn meta(&self, id: &RichRootId) -> Option<&RichRootMeta> {
        self.roots.iter().find(|root| root.meta.id() == id).map(|root| &root.meta)
    }
    /// Whether `id` names an attached or a retained detached root (its owner must be kept).
    #[must_use]
    pub fn retains(&self, id: &RichRootId) -> bool {
        self.roots.iter().chain(&self.detached).any(|root| root.meta.id() == id)
    }
    /// Root receiving focus-routed commands; the only root that may hold a selection highlight.
    #[must_use]
    pub const fn active(&self) -> Option<&RichRootId> {
        self.active.as_ref()
    }
    /// Global chronological order; entries before [`Self::cursor`] are undoable.
    #[must_use]
    pub fn journal(&self) -> &[RichRootJournalEntry] {
        &self.journal
    }
    /// Global history cursor.
    #[must_use]
    pub const fn cursor(&self) -> usize {
        self.cursor
    }
    /// Global undoable steps across all roots and the set structure.
    #[must_use]
    pub fn undo_depth(&self) -> u32 {
        u32::try_from(self.cursor).unwrap_or(u32::MAX)
    }
    /// Global redoable steps across all roots and the set structure.
    #[must_use]
    pub fn redo_depth(&self) -> u32 {
        u32::try_from(self.journal.len() - self.cursor).unwrap_or(u32::MAX)
    }
    /// Next global Undo step.
    #[must_use]
    pub fn undo_step(&self) -> Option<&RichRootJournalEntry> {
        self.cursor.checked_sub(1).map(|index| &self.journal[index])
    }
    /// Next global Redo step.
    #[must_use]
    pub fn redo_step(&self) -> Option<&RichRootJournalEntry> {
        self.journal.get(self.cursor)
    }
    /// Root the next global Undo step belongs to.
    #[must_use]
    pub fn undo_target(&self) -> Option<&RichRootId> {
        self.undo_step().map(RichRootJournalEntry::root)
    }
    /// Root the next global Redo step belongs to.
    #[must_use]
    pub fn redo_target(&self) -> Option<&RichRootId> {
        self.redo_step().map(RichRootJournalEntry::root)
    }
    /// Process-local set publication counter (structure, focus or journal changes).
    #[must_use]
    pub const fn revision(&self) -> u64 {
        self.revision
    }
    /// Refuse a request prepared from another publication of this set.
    ///
    /// # Errors
    /// [`RichRootSetError::StaleRevision`] when `expected` is not [`Self::revision`].
    pub const fn check_revision(&self, expected: u64) -> Result<(), RichRootSetError> {
        if expected == self.revision { Ok(()) } else { Err(RichRootSetError::StaleRevision) }
    }
    /// Whether every restored owner (attached or retained detached) has been attached and verified.
    #[must_use]
    pub fn is_complete(&self) -> bool {
        self.roots.iter().chain(&self.detached).all(|root| root.seen.is_some())
    }

    pub(super) fn index(&self, id: &RichRootId) -> Result<usize, RichRootSetError> {
        self.roots.iter().position(|root| root.meta.id() == id).ok_or(RichRootSetError::UnknownRoot)
    }
    pub(super) fn bump(&mut self) {
        self.revision = self.revision.wrapping_add(1);
    }
    fn count(&self, id: &RichRootId, range: std::ops::Range<usize>) -> usize {
        self.journal[range].iter().filter(|entry| is_unit(entry, id)).count()
    }
    /// Whether `id` is attached, or detached but still restorable by global Undo.
    pub(super) fn held(&self, id: &RichRootId) -> bool {
        self.index(id).is_ok()
            || (self.detached.iter().any(|root| root.meta.id() == id)
                && self.journal[..self.cursor].iter().any(|entry| is_remove(entry, id)))
    }
    /// Remove every entry matching `drop`, keeping the cursor on the same logical position.
    pub(super) fn drop_entries(&mut self, drop: impl Fn(&RichRootJournalEntry) -> bool) {
        let before = self.journal[..self.cursor].iter().filter(|entry| drop(entry)).count();
        self.journal.retain(|entry| !drop(entry));
        self.cursor -= before;
    }
    /// Release detached roots no Undo/Redo step can bring back, with all their entries.
    pub(super) fn release_unreachable(&mut self) {
        let (undo, redo) = self.journal.split_at(self.cursor);
        let released: Vec<RichRootId> = self
            .detached
            .iter()
            .map(|root| root.meta.id().clone())
            .filter(|id| {
                !undo.iter().any(|entry| is_remove(entry, id))
                    && !redo.iter().any(|entry| is_add(entry, id))
            })
            .collect();
        for id in released {
            self.drop_entries(|entry| entry.root() == &id);
            self.detached.retain(|root| root.meta.id() != &id);
        }
    }
    /// Clear the global redo branch (a new edit) and release what only it could restore.
    pub(super) fn clear_redo(&mut self) -> bool {
        let cleared = self.journal.len() > self.cursor;
        self.journal.truncate(self.cursor);
        self.release_unreachable();
        cleared
    }
    /// A change outside history: drop every positional step so recorded positions stay exact.
    fn barrier(&mut self) {
        self.drop_entries(
            |entry| matches!(entry, RichRootJournalEntry::Structure(step) if step.is_positional()),
        );
        self.release_unreachable();
    }
    /// Move the active root to a neighbour when `id`, detached from `index`, was active.
    pub(super) fn neighbour(&mut self, id: &RichRootId, index: usize) {
        if self.active.as_ref() == Some(id) {
            self.active = self
                .roots
                .get(index.min(self.roots.len().saturating_sub(1)))
                .map(|root| root.meta.id().clone());
        }
    }

    /// Add a root with empty history at `index` (default: last) outside history.
    ///
    /// This is initial composition (or a host change it does not want undoable). It
    /// is a barrier: undoable add/remove/move steps already in history leave it, and
    /// removed roots only they retained are released.
    ///
    /// # Errors
    /// Rejects duplicate ids, too many roots, an out-of-range index or a root with history.
    pub fn add_root(
        &mut self,
        meta: RichRootMeta,
        session: &RichLocalSession,
        index: Option<usize>,
    ) -> Result<(), RichRootSetError> {
        let index = self.admit(&meta, session, index, false)?;
        self.barrier();
        if self.active.is_none() {
            self.active = Some(meta.id().clone());
        }
        self.roots.insert(index, Root { meta, seen: Some(session.history_probe()) });
        self.bump();
        Ok(())
    }
    pub(super) fn admit(
        &self,
        meta: &RichRootMeta,
        session: &RichLocalSession,
        index: Option<usize>,
        undoable: bool,
    ) -> Result<usize, RichRootSetError> {
        let duplicate = if undoable { self.held(meta.id()) } else { self.index(meta.id()).is_ok() };
        if duplicate {
            return Err(RichRootSetError::DuplicateRoot);
        }
        if self.roots.len() >= RICH_ROOTS_MAX {
            return Err(RichRootSetError::TooManyRoots);
        }
        let index = index.unwrap_or(self.roots.len());
        if index > self.roots.len() {
            return Err(RichRootSetError::IndexOutOfRange);
        }
        if session.undo_depth() != 0 || session.redo_depth() != 0 {
            return Err(RichRootSetError::HistoryNotEmpty);
        }
        Ok(index)
    }
    /// Detach a root outside history and drop all its entries from the global order.
    ///
    /// A barrier like [`Self::add_root`]; the root's owner is no longer retained.
    ///
    /// # Errors
    /// Rejects unknown roots and the last root.
    pub fn remove_root(&mut self, id: &RichRootId) -> Result<RichRootMeta, RichRootSetError> {
        let index = self.index(id)?;
        if self.roots.len() == 1 {
            return Err(RichRootSetError::LastRoot);
        }
        let root = self.roots.remove(index);
        self.drop_entries(|entry| entry.root() == id);
        self.barrier();
        self.neighbour(id, index);
        self.bump();
        Ok(root.meta)
    }
    /// Make `id` the active root. Returns whether it changed.
    ///
    /// # Errors
    /// Rejects unknown (including detached) roots.
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
    /// Rejects unknown, detached or not-yet-attached roots; the set is then unchanged.
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
                self.journal[..self.cursor].iter().rposition(|entry| is_unit(entry, id))
            {
                let entry = self.journal.remove(position);
                self.journal.insert(self.cursor - 1, entry);
                self.cursor -= 1;
                change.undone += 1;
            }
        }
        for _ in 0..now.redos.wrapping_sub(seen.redos) {
            let entry =
                match self.journal[self.cursor..].iter().position(|entry| is_unit(entry, id)) {
                    Some(offset) => self.journal.remove(self.cursor + offset),
                    None => RichRootJournalEntry::Unit(id.clone()),
                };
            self.journal.insert(self.cursor, entry);
            self.cursor += 1;
            change.redone += 1;
        }
        let commits = now.commits.wrapping_sub(seen.commits);
        if commits > 0 {
            change.redo_cleared = self.clear_redo();
            for _ in 0..commits.saturating_sub(now.joins.wrapping_sub(seen.joins)) {
                self.journal.push(RichRootJournalEntry::Unit(id.clone()));
                change.opened += 1;
            }
            self.cursor = self.journal.len();
        }
        // Capacity eviction and grouping never leave more tracked units than the root holds.
        let undo = session.undo_depth() as usize;
        let mut tracked = self.count(id, 0..self.cursor);
        while tracked > undo {
            let first =
                self.journal.iter().position(|entry| is_unit(entry, id)).unwrap_or_default();
            self.journal.remove(first);
            self.cursor -= 1;
            tracked -= 1;
            change.opened = change.opened.saturating_sub(1);
        }
        // Repair only: an untracked unit goes right after the step that attached the root.
        let floor = self.journal[..self.cursor]
            .iter()
            .rposition(|entry| is_add(entry, id))
            .map_or(0, |position| position + 1);
        while tracked < undo {
            self.journal.insert(floor, RichRootJournalEntry::Unit(id.clone()));
            self.cursor += 1;
            tracked += 1;
        }
        let redo = session.redo_depth() as usize;
        let mut pending = self.count(id, self.cursor..self.journal.len());
        while pending > redo {
            if let Some(last) = self.journal.iter().rposition(|entry| is_unit(entry, id)) {
                self.journal.remove(last);
            }
            pending -= 1;
        }
        self.roots[index].seen = Some(now);
        self.active = Some(id.clone());
        self.bump();
        Ok(change)
    }

    /// Verify and attach a restored owner (attached or retained detached root) against the journal.
    ///
    /// # Errors
    /// Rejects unknown, already attached or history-mismatched roots.
    pub fn attach(
        &mut self,
        id: &RichRootId,
        session: &RichLocalSession,
    ) -> Result<(), RichRootSetError> {
        let undo = self.count(id, 0..self.cursor);
        let redo = self.count(id, self.cursor..self.journal.len());
        let root = self
            .roots
            .iter_mut()
            .chain(&mut self.detached)
            .find(|root| root.meta.id() == id)
            .ok_or(RichRootSetError::UnknownRoot)?;
        if root.seen.is_some() {
            return Err(RichRootSetError::DuplicateRoot);
        }
        if undo != session.undo_depth() as usize || redo > session.redo_depth() as usize {
            return Err(RichRootSetError::HistoryMismatch);
        }
        root.seen = Some(session.history_probe());
        self.bump();
        Ok(())
    }

    /// Unattached set from decoded checkpoint parts; every root must then be attached.
    pub(super) fn pending(
        roots: Vec<RichRootMeta>,
        detached: Vec<RichRootMeta>,
        journal: Vec<RichRootJournalEntry>,
        cursor: usize,
        active: Option<RichRootId>,
    ) -> Result<Self, RichRootSetError> {
        let rejected = RichRootSetError::CheckpointRejected;
        if roots.len() > RICH_ROOTS_MAX
            || detached.len() > RICH_ROOTS_MAX
            || cursor > journal.len()
            || journal.iter().filter(|entry| entry.is_structure()).count()
                > RICH_ROOT_STRUCTURE_STEPS_MAX
        {
            return Err(rejected);
        }
        let mut ids = std::collections::BTreeSet::new();
        if !roots.iter().chain(&detached).all(|meta| ids.insert(meta.id().clone()))
            || !journal.iter().all(|entry| ids.contains(entry.root()))
            || active.as_ref().is_some_and(|active| !roots.iter().any(|meta| meta.id() == active))
            || (active.is_none() && !roots.is_empty())
        {
            return Err(rejected);
        }
        let root = |meta| Root { meta, seen: None };
        let set = Self {
            roots: roots.into_iter().map(root).collect(),
            detached: detached.into_iter().map(root).collect(),
            journal,
            cursor,
            active,
            revision: 0,
        };
        set.verify_structure()?;
        Ok(set)
    }
}
