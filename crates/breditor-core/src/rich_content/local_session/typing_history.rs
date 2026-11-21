//! Optional native history partition over unchanged explicit edit records.
//!
//! Consecutive user input may share one Undo unit, but every original revision,
//! action and inverse remains independently retained and replay-proved. Persist
//! the partition only with the separate typing-session codec, never silently
//! drop it into the original local checkpoint. Active clock/caret continuation
//! is process-local: recovery always begins a new burst.

use super::{RichLocalSession, RichLocalSessionError};
use crate::{document::FormatSet, rich_content::RichTextPoint};

/// Maximum gap between adjacent admitted user inputs in one typing burst.
pub const RICH_TYPING_GROUP_WINDOW_MS: u64 = 750;
/// Maximum original edit publications retained in one natural Undo unit.
pub const RICH_TYPING_GROUP_MAX_STEPS: u32 = 64;

/// Direction of one proved same-block, caret-adjacent user deletion.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichTypingDeleteDirection {
    /// Delete the nonempty span immediately before the actual caret.
    Backward,
    /// Delete the nonempty span immediately after the actual caret.
    Forward,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Kind {
    Insert,
    Backward,
    Forward,
}

#[derive(Clone, Debug)]
pub(super) struct Continuation {
    pub(super) kind: Kind,
    pub(super) clock: u64,
    pub(super) caret: RichTextPoint,
    pub(super) formats: FormatSet,
}

#[derive(Clone, Debug)]
pub(super) struct TypingHistory {
    pub(super) groups: Vec<u32>,
    pub(super) continuation: Option<Continuation>,
}

impl TypingHistory {
    pub(super) fn undo_depth(&self, cursor: usize) -> u32 {
        let mut end = 0usize;
        u32::try_from(
            self.groups
                .iter()
                .take_while(|size| {
                    end += **size as usize;
                    end <= cursor
                })
                .count(),
        )
        .unwrap_or(u32::MAX)
    }
    pub(super) fn append(&mut self, cursor: usize, capacity: usize) {
        let keep = self.undo_depth(cursor) as usize;
        self.groups.truncate(keep);
        self.continuation = None;
        if capacity == 0 {
            self.groups.clear();
            return;
        }
        self.groups.push(1);
        if cursor >= capacity {
            self.groups[0] -= 1;
            if self.groups[0] == 0 {
                self.groups.remove(0);
            }
        }
    }
    pub(super) fn joins(
        &self,
        kind: Kind,
        clock: u64,
        caret: &RichTextPoint,
        formats: &FormatSet,
    ) -> bool {
        self.groups.last().is_some_and(|size| *size < RICH_TYPING_GROUP_MAX_STEPS)
            && self.continuation.as_ref().is_some_and(|previous| {
                previous.kind == kind
                    && previous.caret == *caret
                    && previous.formats == *formats
                    && clock
                        .checked_sub(previous.clock)
                        .is_some_and(|gap| gap <= RICH_TYPING_GROUP_WINDOW_MS)
            })
    }
    pub(super) fn finish(&mut self, join: bool, continuation: Option<Continuation>) {
        let end = self.groups.len();
        if join && end >= 2 {
            let joined = self.groups[end - 2] + self.groups[end - 1];
            self.groups[end - 2] = joined;
            self.groups.truncate(end - 1);
        }
        self.continuation = (!self.groups.is_empty()).then_some(continuation).flatten();
    }
}

pub(super) fn separator(text: &str) -> bool {
    text.contains(['\r', '\n', '\u{2028}', '\u{2029}'])
}

impl RichLocalSession {
    /// Whether this owner uses the separately persisted natural history partition.
    #[must_use]
    pub const fn typing_history_enabled(&self) -> bool {
        self.typing_history.is_some()
    }

    /// Original retained edit count; natural groups do not raise the entry budget.
    #[must_use]
    pub fn history_step_count(&self) -> u32 {
        u32::try_from(self.entries.len()).unwrap_or(u32::MAX)
    }

    pub(crate) fn typing_partition(&self) -> Option<&[u32]> {
        self.typing_history.as_ref().map(|history| history.groups.as_slice())
    }
    pub(crate) fn restore_typing_partition(
        &mut self,
        groups: Vec<u32>,
    ) -> Result<(), RichLocalSessionError> {
        self.validate_typing_partition(&groups)?;
        self.typing_history = Some(TypingHistory { groups, continuation: None });
        Ok(())
    }
    pub(crate) fn validate_typing_partition(
        &self,
        groups: &[u32],
    ) -> Result<(), RichLocalSessionError> {
        let mut total = 0usize;
        let mut boundary = self.cursor == 0;
        for size in groups {
            if *size == 0 || *size > RICH_TYPING_GROUP_MAX_STEPS {
                return Err(RichLocalSessionError::HistoryMismatch);
            }
            total =
                total.checked_add(*size as usize).ok_or(RichLocalSessionError::HistoryMismatch)?;
            boundary |= total == self.cursor;
        }
        if total != self.entries.len() || !boundary {
            return Err(RichLocalSessionError::HistoryMismatch);
        }
        Ok(())
    }
    pub(super) fn typing_before(
        &self,
        kind: Kind,
        clock: u64,
    ) -> Result<(bool, FormatSet), RichLocalSessionError> {
        let history =
            self.typing_history.as_ref().ok_or(RichLocalSessionError::TypingHistoryDisabled)?;
        let caret = super::typing_state::caret(self.state.selection.as_ref())
            .ok_or(RichLocalSessionError::TypingCaret)?;
        let formats = self.state.effective_caret_formats()?;
        Ok((history.joins(kind, clock, caret, &formats), formats))
    }
    pub(super) fn typing_after(
        &mut self,
        join: bool,
        kind: Kind,
        clock: u64,
        formats: FormatSet,
        isolated: bool,
    ) {
        let continuation = (!isolated)
            .then(|| super::typing_state::caret(self.state.selection.as_ref()).cloned())
            .flatten()
            .map(|caret| Continuation { kind, clock, caret, formats });
        if let Some(history) = &mut self.typing_history {
            let units = history.groups.len();
            history.finish(join && !isolated, continuation);
            if history.groups.len() < units {
                self.probe.joins = self.probe.joins.wrapping_add(1);
            }
        }
    }
    pub(super) fn undo_group_start(&self) -> Result<usize, RichLocalSessionError> {
        let Some(history) = &self.typing_history else {
            return self.cursor.checked_sub(1).ok_or(RichLocalSessionError::HistoryMismatch);
        };
        let depth = history.undo_depth(self.cursor) as usize;
        let size = history
            .groups
            .get(depth.checked_sub(1).ok_or(RichLocalSessionError::HistoryMismatch)?)
            .ok_or(RichLocalSessionError::HistoryMismatch)?;
        self.cursor.checked_sub(*size as usize).ok_or(RichLocalSessionError::HistoryMismatch)
    }
    pub(super) fn redo_group_end(&self) -> Result<usize, RichLocalSessionError> {
        let Some(history) = &self.typing_history else {
            return Ok(self.cursor + 1);
        };
        let size = history
            .groups
            .get(history.undo_depth(self.cursor) as usize)
            .ok_or(RichLocalSessionError::HistoryMismatch)?;
        self.cursor
            .checked_add(*size as usize)
            .filter(|end| *end <= self.entries.len())
            .ok_or(RichLocalSessionError::HistoryMismatch)
    }
}
