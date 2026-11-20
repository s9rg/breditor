//! Native natural typing and shortcut conversion without an intervening host callback.
use super::{RichReplica, SharedObservation};
use crate::Error;
use breditor_core::rich_content::{RichInputRuleOutcome, RichInputRuleSet};

impl RichReplica {
    /// Retain grouped local input and optionally add one isolated conversion group.
    ///
    /// A nonmatch retains natural typing continuation. `Refused` preserves literal
    /// input; report the refusal separately and never retry the keystroke.
    /// # Errors
    /// A rejected literal insertion publishes nothing, including on disabled history.
    pub fn insert_typing_text_with_markdown_rules_guarded(
        &mut self,
        observed: &SharedObservation,
        text: &str,
        clock_ms: u64,
        namespace: &str,
    ) -> Result<RichInputRuleOutcome, Error> {
        self.check(observed)?;
        self.require_writable()?;
        if self.journal.ui.document_selected() {
            return Err(Error::Contract("input rule typing requires caret"));
        }
        self.insert_typing_text_with_input_rules_guarded(
            observed,
            text,
            clock_ms,
            namespace,
            RichInputRuleSet::MARKDOWN_V1,
        )
    }

    /// Like [`Self::insert_typing_text_with_markdown_rules_guarded`] under an explicit rule set.
    /// # Errors
    /// A rejected literal insertion publishes nothing, including on disabled history.
    pub fn insert_typing_text_with_input_rules_guarded(
        &mut self,
        observed: &SharedObservation,
        text: &str,
        clock_ms: u64,
        namespace: &str,
        rules: RichInputRuleSet,
    ) -> Result<RichInputRuleOutcome, Error> {
        self.check(observed)?;
        self.require_writable()?;
        if self.journal.ui.document_selected() {
            return Err(Error::Contract("input rule typing requires caret"));
        }
        let changed = self.insert_typing_text_guarded(observed, text, clock_ms)?;
        Ok(self.finish_input_rule(changed, text, namespace, rules))
    }
}
