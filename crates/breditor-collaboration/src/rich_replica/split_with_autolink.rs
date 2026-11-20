//! Enter at a caret plus the optional typed autolink, inside one exclusive owner call.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    selection::TextPoint,
};
use crate::Error;
use breditor_core::rich_content::RichInputRuleOutcome;

impl RichReplica {
    /// Retain one caret split, then link a URL candidate that now ends its left block.
    ///
    /// The request must be exactly one `split_text_block`, `split_list_item` or
    /// `split_task_item` at the current collapsed caret. The split is its own
    /// ordinary history group; a conversion adds one isolated group, so one Undo
    /// removes only the link and keeps the split. `Refused` retains the split.
    /// # Errors
    /// Stale/read-only owners, other command shapes or a rejected split publish nothing.
    pub fn split_with_autolink_guarded(
        &mut self,
        observed: &SharedObservation,
        commands: Vec<Command>,
        selection: SelectionUpdate,
        pending: PendingFormatsUpdate,
    ) -> Result<RichInputRuleOutcome, Error> {
        self.check(observed)?;
        self.require_writable()?;
        if self.journal.ui.document_selected() {
            return Err(Error::Contract("autolink split requires caret"));
        }
        let caret = self
            .selection()?
            .as_ref()
            .and_then(super::selection::Selection::caret)
            .cloned()
            .ok_or(Error::Contract("autolink split requires caret"))?;
        let [command] = commands.as_slice() else {
            return Err(Error::Contract("autolink split requires one split"));
        };
        let (block, offset) = match command {
            Command::SplitTextBlock(value) => (&value.block, value.offset),
            Command::SplitListItem(value) => (&value.block, value.offset),
            Command::SplitTaskItem(value) => (&value.block, value.offset),
            _ => return Err(Error::Contract("autolink split requires one split")),
        };
        if *block != caret.block || offset != caret.offset {
            return Err(Error::Contract("autolink split must be at the caret"));
        }
        let end = TextPoint { block: caret.block, offset: caret.offset, affinity: caret.affinity };
        if !self.apply_guarded(observed, commands, selection, pending)? {
            return Ok(RichInputRuleOutcome::Unchanged);
        }
        // Read after the accepted split: any later failure is a refusal, never a rollback.
        let observed = if self.document_selection_enabled() {
            self.observe_document()
        } else {
            self.observe()
        };
        Ok(match observed.and_then(|o| self.apply_paragraph_autolink_guarded(&o, &end)) {
            Ok(true) => RichInputRuleOutcome::Applied,
            Ok(false) => RichInputRuleOutcome::Inserted,
            Err(_) => RichInputRuleOutcome::Refused,
        })
    }
}
