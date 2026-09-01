use std::collections::VecDeque;

use crate::{
    identity::QualifiedName,
    state::EditorState,
    transaction::{Commit, HistoryIntent},
};

use super::{capacity::HistoryCapacity, history_entry::HistoryEntry};

/// Bounded branch-local event storage. The back of each deque is nearest the
/// current cursor.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct LinearHistory {
    capacity: HistoryCapacity,
    undo: VecDeque<HistoryEntry>,
    redo: VecDeque<HistoryEntry>,
    open_merge_group: Option<QualifiedName>,
}

impl LinearHistory {
    pub(crate) fn new(capacity: HistoryCapacity) -> Self {
        Self { capacity, undo: VecDeque::new(), redo: VecDeque::new(), open_merge_group: None }
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

    pub(crate) fn undo_entry(&self) -> Option<&HistoryEntry> {
        self.undo.back()
    }

    pub(crate) fn redo_entry(&self) -> Option<&HistoryEntry> {
        self.redo.back()
    }

    pub(crate) fn observe_commit(&mut self, commit: &Commit, maximum_operations: usize) {
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
