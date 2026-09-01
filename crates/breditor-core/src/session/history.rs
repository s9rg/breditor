use std::{
    collections::{VecDeque, vec_deque},
    iter::FusedIterator,
};

use crate::{
    identity::QualifiedName,
    state::EditorState,
    transaction::{Commit, HistoryIntent, ReplayDirection},
};

use super::{
    capacity::HistoryCapacity,
    history_entry::{HistoryEntry, same_replay_result},
};

/// Bounded branch-local event storage. The back of each deque is nearest the
/// current cursor.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct LinearHistory {
    capacity: HistoryCapacity,
    undo: VecDeque<HistoryEntry>,
    redo: VecDeque<HistoryEntry>,
    open_merge_group: Option<QualifiedName>,
}

/// Exhaustive borrowed view of one complete linear history checkpoint.
pub(crate) struct LinearHistoryCheckpointParts<'a> {
    pub(crate) capacity: HistoryCapacity,
    pub(crate) cursor: u32,
    pub(crate) entry_count: u32,
    pub(crate) entries: ChronologicalHistoryEntries<'a>,
    pub(crate) open_merge_group: Option<&'a QualifiedName>,
}

/// Borrowed retained entries in canonical oldest-to-newest logical order.
///
/// Undo storage already uses that order. Redo storage keeps its nearest entry
/// at the back, so this iterator reverses redo before joining the two branches.
#[derive(Clone)]
pub(crate) struct ChronologicalHistoryEntries<'a> {
    undo: vec_deque::Iter<'a, HistoryEntry>,
    redo: std::iter::Rev<vec_deque::Iter<'a, HistoryEntry>>,
}

impl<'a> Iterator for ChronologicalHistoryEntries<'a> {
    type Item = &'a HistoryEntry;

    fn next(&mut self) -> Option<Self::Item> {
        self.undo.next().or_else(|| self.redo.next())
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let length = self.len();
        (length, Some(length))
    }
}

impl ExactSizeIterator for ChronologicalHistoryEntries<'_> {
    fn len(&self) -> usize {
        self.undo.len().saturating_add(self.redo.len())
    }
}

impl FusedIterator for ChronologicalHistoryEntries<'_> {}

/// Which replay recipe violates a restored entry's operation ceiling.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum HistoryRecipeDirection {
    Forward,
    Inverse,
}

/// Why proved chronological entries cannot form one runtime linear history.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum HistoryCheckpointInvariantError {
    EntryLimit {
        actual: u64,
        capacity: HistoryCapacity,
    },
    CursorOutOfBounds {
        cursor: u32,
        entry_count: u64,
    },
    InvalidOpenMergeGroup,
    EmptyEntry {
        entry_index: u32,
    },
    OperationCountMismatch {
        entry_index: u32,
        forward: u64,
        inverse: u64,
    },
    OperationLimit {
        entry_index: u32,
        direction: HistoryRecipeDirection,
        actual: u64,
        maximum: u32,
    },
    ContextMismatch {
        entry_index: u32,
    },
    LineageMismatch {
        entry_index: u32,
    },
    DisconnectedEntries {
        left_entry_index: u32,
    },
    CurrentBoundaryMismatch,
}

impl LinearHistory {
    pub(crate) fn new(capacity: HistoryCapacity) -> Self {
        Self { capacity, undo: VecDeque::new(), redo: VecDeque::new(), open_merge_group: None }
    }

    /// Returns every retained history field in canonical logical order.
    pub(crate) fn checkpoint_parts(&self) -> LinearHistoryCheckpointParts<'_> {
        let Self { capacity, undo, redo, open_merge_group } = self;
        let entry_count = undo.len().saturating_add(redo.len());
        LinearHistoryCheckpointParts {
            capacity: *capacity,
            cursor: usize_to_u32(undo.len()),
            entry_count: usize_to_u32(entry_count),
            entries: ChronologicalHistoryEntries { undo: undo.iter(), redo: redo.iter().rev() },
            open_merge_group: open_merge_group.as_ref(),
        }
    }

    /// Reconstructs the two runtime branches from proved chronological entries.
    ///
    /// `entries` must run oldest to newest. `cursor` divides the undo prefix
    /// from the redo suffix. Historical snapshot revisions are deliberately
    /// ignored when proving boundary continuity; both boundaries adjacent to
    /// the cursor are replaced with the exact authoritative current state.
    pub(crate) fn try_from_chronological_entries(
        capacity: HistoryCapacity,
        mut entries: Vec<HistoryEntry>,
        cursor: u32,
        open_merge_group: Option<QualifiedName>,
        current: &EditorState,
    ) -> Result<Self, HistoryCheckpointInvariantError> {
        validate_checkpoint_entries(
            capacity,
            &entries,
            cursor,
            open_merge_group.as_ref(),
            current,
        )?;

        let cursor = cursor as usize;
        if let Some(entry) = cursor.checked_sub(1).and_then(|index| entries.get_mut(index)) {
            entry.update_after_boundary(current);
        }
        if let Some(entry) = entries.get_mut(cursor) {
            entry.update_before_boundary(current);
        }

        let redo_chronological = entries.split_off(cursor);
        let undo = VecDeque::from(entries);
        let redo = redo_chronological.into_iter().rev().collect();
        Ok(Self { capacity, undo, redo, open_merge_group })
    }

    pub(crate) const fn capacity(&self) -> HistoryCapacity {
        self.capacity
    }

    pub(crate) fn undo_depth(&self) -> u32 {
        u32::try_from(self.undo.len()).unwrap_or(MAX_DEPTH_FALLBACK)
    }

    pub(crate) fn redo_depth(&self) -> u32 {
        u32::try_from(self.redo.len()).unwrap_or(MAX_DEPTH_FALLBACK)
    }

    /// Returns whether no retained or behavioral history state exists.
    ///
    /// Exhaustive destructuring makes any future history field update this
    /// genesis-boundary decision before the crate can compile.
    pub(crate) fn is_genesis_empty(&self) -> bool {
        let Self { capacity: _, undo, redo, open_merge_group } = self;
        undo.is_empty() && redo.is_empty() && open_merge_group.is_none()
    }

    pub(crate) fn undo_entry(&self) -> Option<&HistoryEntry> {
        self.undo.back()
    }

    pub(crate) fn redo_entry(&self) -> Option<&HistoryEntry> {
        self.redo.back()
    }

    /// Returns the nearest replay recipe's operation count without cloning it.
    pub(crate) fn replay_operation_count(&self, direction: ReplayDirection) -> Option<usize> {
        match direction {
            ReplayDirection::Undo => self.undo_entry(),
            ReplayDirection::Redo => self.redo_entry(),
        }
        .map(|entry| entry.replay_operation_count(direction))
    }

    pub(crate) fn observe_commit(&mut self, commit: &Commit, maximum_operations: u32) {
        if commit.forward_operations().is_empty() {
            self.observe_state_only(commit.after());
            return;
        }

        match commit.metadata().history() {
            HistoryIntent::Ignore => {
                let _ = self.clear();
            }
            HistoryIntent::Record => {
                self.redo.clear();
                self.open_merge_group = None;
                self.push_undo(HistoryEntry::from_commit(commit));
            }
            HistoryIntent::Merge { group } => {
                let can_merge = self.redo.is_empty()
                    && self.open_merge_group.as_ref() == Some(group)
                    && self
                        .undo
                        .back_mut()
                        .is_some_and(|entry| entry.try_merge(commit, maximum_operations));
                self.redo.clear();
                if !can_merge {
                    self.push_undo(HistoryEntry::from_commit(commit));
                }
                self.open_merge_group = (!self.undo.is_empty()).then(|| group.clone());
            }
        }
    }

    pub(crate) fn finish_undo(&mut self, current: &EditorState) {
        if let Some(mut entry) = self.undo.pop_back() {
            entry.update_before_boundary(current);
            self.redo.push_back(entry);
        }
        self.open_merge_group = None;
    }

    pub(crate) fn finish_redo(&mut self, current: &EditorState) {
        if let Some(mut entry) = self.redo.pop_back() {
            entry.update_after_boundary(current);
            self.undo.push_back(entry);
        }
        self.open_merge_group = None;
    }

    pub(crate) fn close_merge_group(&mut self) -> bool {
        self.open_merge_group.take().is_some()
    }

    pub(crate) fn clear(&mut self) -> bool {
        let changed =
            !self.undo.is_empty() || !self.redo.is_empty() || self.open_merge_group.is_some();
        self.undo.clear();
        self.redo.clear();
        self.open_merge_group = None;
        changed
    }

    fn observe_state_only(&mut self, state: &EditorState) {
        let undo_matches = self.undo.back().is_none_or(|entry| entry.after_matches(state));
        let redo_matches = self.redo.back().is_none_or(|entry| entry.before_matches(state));
        if !undo_matches || !redo_matches {
            let _ = self.clear();
            return;
        }
        if let Some(entry) = self.undo.back_mut() {
            entry.update_after_boundary(state);
        }
        if let Some(entry) = self.redo.back_mut() {
            entry.update_before_boundary(state);
        }
        self.open_merge_group = None;
    }

    fn push_undo(&mut self, entry: HistoryEntry) {
        let capacity = self.capacity.as_usize();
        if capacity == 0 {
            self.open_merge_group = None;
            return;
        }
        if self.undo.len() == capacity {
            self.undo.pop_front();
        }
        self.undo.push_back(entry);
    }
}

// This branch is unreachable because capacity is fixed below 10,001, but it
// keeps the status query total on hypothetical targets with narrower `usize`.
const MAX_DEPTH_FALLBACK: u32 = super::capacity::MAX_HISTORY_CAPACITY;

fn validate_checkpoint_entries(
    capacity: HistoryCapacity,
    entries: &[HistoryEntry],
    cursor: u32,
    open_merge_group: Option<&QualifiedName>,
    current: &EditorState,
) -> Result<(), HistoryCheckpointInvariantError> {
    let entry_count = usize_to_u64(entries.len());
    if entry_count > u64::from(capacity.get()) {
        return Err(HistoryCheckpointInvariantError::EntryLimit { actual: entry_count, capacity });
    }
    if u64::from(cursor) > entry_count {
        return Err(HistoryCheckpointInvariantError::CursorOutOfBounds { cursor, entry_count });
    }
    if open_merge_group.is_some()
        && (capacity == HistoryCapacity::DISABLED
            || entry_count == 0
            || u64::from(cursor) != entry_count)
    {
        return Err(HistoryCheckpointInvariantError::InvalidOpenMergeGroup);
    }

    let maximum_operations = current.context().max_operations_per_transaction();
    for (entry_index, entry) in entries.iter().enumerate() {
        let entry_index = usize_to_u32(entry_index);
        let parts = entry.checkpoint_parts();
        let forward_count = usize_to_u64(parts.forward_operations.len());
        let inverse_count = usize_to_u64(parts.inverse_operations.len());
        if forward_count == 0 || inverse_count == 0 {
            return Err(HistoryCheckpointInvariantError::EmptyEntry { entry_index });
        }
        if forward_count != inverse_count {
            return Err(HistoryCheckpointInvariantError::OperationCountMismatch {
                entry_index,
                forward: forward_count,
                inverse: inverse_count,
            });
        }
        for (direction, actual) in [
            (HistoryRecipeDirection::Forward, forward_count),
            (HistoryRecipeDirection::Inverse, inverse_count),
        ] {
            if actual > u64::from(maximum_operations) {
                return Err(HistoryCheckpointInvariantError::OperationLimit {
                    entry_index,
                    direction,
                    actual,
                    maximum: maximum_operations,
                });
            }
        }
        if parts.before.context() != current.context() || parts.after.context() != current.context()
        {
            return Err(HistoryCheckpointInvariantError::ContextMismatch { entry_index });
        }
        if parts.before.snapshot().lineage() != current.snapshot().lineage()
            || parts.after.snapshot().lineage() != current.snapshot().lineage()
        {
            return Err(HistoryCheckpointInvariantError::LineageMismatch { entry_index });
        }
    }

    for (left_entry_index, entries) in entries.windows(2).enumerate() {
        let left = entries[0].checkpoint_parts();
        let right = entries[1].checkpoint_parts();
        if !same_replay_result(left.after, right.before) {
            return Err(HistoryCheckpointInvariantError::DisconnectedEntries {
                left_entry_index: usize_to_u32(left_entry_index),
            });
        }
    }

    let cursor = cursor as usize;
    let undo_matches = cursor
        .checked_sub(1)
        .and_then(|index| entries.get(index))
        .is_none_or(|entry| same_replay_result(entry.checkpoint_parts().after, current));
    let redo_matches = entries
        .get(cursor)
        .is_none_or(|entry| same_replay_result(entry.checkpoint_parts().before, current));
    if !undo_matches || !redo_matches {
        return Err(HistoryCheckpointInvariantError::CurrentBoundaryMismatch);
    }
    Ok(())
}

fn usize_to_u32(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(MAX_DEPTH_FALLBACK)
}

fn usize_to_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}
