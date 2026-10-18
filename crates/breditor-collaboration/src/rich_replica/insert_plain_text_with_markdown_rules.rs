//! Guarded literal caret input and optional conversion inside one exclusive owner call.
use super::{RichReplica, SharedObservation};
use crate::Error;
use breditor_core::rich_content::RichInputRuleOutcome;

impl RichReplica {
    /// Retain local caret input, then recognize without a host or remote interleave.
    ///
    /// Unlike general plain insertion this never replaces a range. A matching
    /// shortcut uses one additional original selective-history group. `Refused`
    /// retains literal input exactly and is not permission to retry it.
    /// # Errors
    /// Only failures before literal input commits reject the call atomically.
    pub fn insert_plain_text_with_markdown_rules_guarded(
        &mut self,
        observed: &SharedObservation,
        text: &str,
        namespace: &str,
    ) -> Result<RichInputRuleOutcome, Error> {
        self.check(observed)?;
        self.require_writable()?;
        if self.journal.ui.document_selected()
            || self.selection()?.as_ref().and_then(super::selection::Selection::caret).is_none()
        {
            return Err(Error::Contract("input rule typing requires caret"));
        }
        let changed = self.insert_plain_text_guarded(observed, text)?;
        Ok(self.finish_markdown_input_rule(changed, text, namespace))
    }

    pub(super) fn finish_markdown_input_rule(
        &mut self,
        changed: bool,
        text: &str,
        namespace: &str,
    ) -> RichInputRuleOutcome {
        if !changed {
            return RichInputRuleOutcome::Unchanged;
        }
        // Even a fallible observation read happens after accepted input. It must
        // therefore be reported as a refusal, never as a rolled-back keystroke.
        let observed = if self.document_selection_enabled() {
            self.observe_document()
        } else {
            self.observe()
        };
        match observed.and_then(|o| self.apply_markdown_input_rule_guarded(&o, text, namespace)) {
            Ok(true) => RichInputRuleOutcome::Applied,
            Ok(false) => RichInputRuleOutcome::Inserted,
            Err(_) => RichInputRuleOutcome::Refused,
        }
    }
}
