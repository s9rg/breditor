//! Explicit native engine groups with retained per-input forward records and stable UI recipes.
use super::{
    RichReplica,
    selection::TextPoint,
    session::{Entry, Journal},
};
use crate::Error;
use breditor_core::rich_content::{RICH_TYPING_GROUP_MAX_STEPS, RICH_TYPING_GROUP_WINDOW_MS};
use serde_json::Value;

pub(super) const JOURNAL_FORMAT: &str = "breditor/rich-replica-typing-journal";
pub(super) const JOURNAL_VERSION: u32 = 1;
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Kind {
    Insert,
    Backward,
    Forward,
}
pub(super) struct Continuation {
    pub key: String,
    pub kind: Kind,
    pub clock: u64,
    pub caret: TextPoint,
    pub formats: Vec<Value>,
}
pub(super) struct TypingHistory {
    pub joins: Vec<u32>,
    pub continuation: Option<Continuation>,
}
pub(super) struct Request {
    pub join: bool,
    pub kind: Kind,
    pub clock: u64,
    pub formats: Vec<Value>,
    pub isolated: bool,
}
pub(super) fn separator(text: &str) -> bool {
    text.contains(['\r', '\n', '\u{2028}', '\u{2029}'])
}
impl TypingHistory {
    pub fn validate(&self, journal: &Journal) -> Result<(), Error> {
        if self.joins.len() > super::session::MAX_ENTRIES {
            return Err(Error::Limit("shared typing join records"));
        }
        let mut previous = 0;
        let mut steps = 1;
        for (ordinal, index) in self.joins.iter().copied().enumerate() {
            let at = index as usize;
            if at == 0
                || at >= journal.entries.len()
                || (ordinal > 0 && index <= previous)
                || !matches!(journal.entries[at], Entry::Local { .. })
                || !journal.entries[at - 1].authored()
            {
                return Err(Error::Contract("shared typing join partition"));
            }
            steps = if ordinal > 0 && index == previous + 1 { steps + 1 } else { 2 };
            if steps > RICH_TYPING_GROUP_MAX_STEPS {
                return Err(Error::Limit("shared typing group steps"));
            }
            previous = index;
        }
        Ok(())
    }
}
impl RichReplica {
    /// Whether this owner explicitly uses native natural typing groups.
    #[must_use]
    pub const fn typing_history_enabled(&self) -> bool {
        self.typing.is_some()
    }
    /// Original input contributions retained on the native Undo/Redo stacks, not group count.
    #[must_use]
    pub fn history_step_count(&self) -> usize {
        self.history_keys.steps()
    }
    pub(super) fn typing_before(&self, kind: Kind, clock: u64) -> Result<Request, Error> {
        let history =
            self.typing.as_ref().ok_or(Error::Contract("shared typing history disabled"))?;
        let selection = self.selection()?.ok_or(Error::Contract("shared typing requires caret"))?;
        let caret = selection.caret().ok_or(Error::Contract("shared typing requires caret"))?;
        let formats = self.effective_formats(&selection)?;
        let join = history.continuation.as_ref().is_some_and(|prior| {
            prior.kind == kind
                && prior.caret == *caret
                && prior.formats == formats
                && clock
                    .checked_sub(prior.clock)
                    .is_some_and(|gap| gap <= RICH_TYPING_GROUP_WINDOW_MS)
                && self.history_keys.undo.last().is_some_and(|item| {
                    item.key == prior.key && item.steps < RICH_TYPING_GROUP_MAX_STEPS
                })
        });
        Ok(Request { join, kind, clock, formats, isolated: false })
    }
    pub(super) fn typing_after(&mut self, request: Request) -> Result<(), Error> {
        let continuation = if request.isolated {
            None
        } else {
            let caret = self
                .selection()?
                .and_then(|selection| selection.caret().cloned())
                .ok_or(Error::Contract("shared typing result caret"))?;
            let key = self.history_keys.undo.last().ok_or(Error::ReplayMismatch)?.key.clone();
            Some(Continuation {
                key,
                kind: request.kind,
                clock: request.clock,
                caret,
                formats: request.formats,
            })
        };
        self.typing
            .as_mut()
            .ok_or(Error::Contract("shared typing history disabled"))?
            .continuation = continuation;
        Ok(())
    }
}
