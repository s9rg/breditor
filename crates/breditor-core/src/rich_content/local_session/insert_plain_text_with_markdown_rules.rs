//! Exclusive literal typing followed by an optional separately undoable shortcut.
use super::{RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot};
use crate::rich_content::{RichInputRuleOutcome, RichInputRuleSet};

impl RichLocalSession {
    /// Retain collapsed-caret plain input and attempt its shortcut before returning.
    ///
    /// No host callback can retarget recognition between the two native commits.
    /// A matching conversion is its own Undo group, restoring the literal trigger.
    /// `Refused` retains input exactly; the host must not retry it. Use ordinary
    /// APIs for paste, composition, replacements and programmatic edits instead.
    /// # Errors
    /// Only literal typing can fail the call; an error publishes nothing.
    pub fn insert_plain_text_with_markdown_rules(
        &mut self,
        snapshot: &RichLocalSnapshot,
        text: &str,
        namespace: &str,
    ) -> Result<RichInputRuleOutcome, RichLocalSessionError> {
        self.insert_plain_text_with_input_rules(
            snapshot,
            text,
            namespace,
            RichInputRuleSet::MARKDOWN_V1,
        )
    }

    /// Like [`Self::insert_plain_text_with_markdown_rules`] under an explicit rule set.
    ///
    /// `autolink-v1` converts a URL candidate before a typed ASCII space into one
    /// safe link; one Undo removes only that link and keeps the space.
    /// # Errors
    /// Only literal typing can fail the call; an error publishes nothing.
    pub fn insert_plain_text_with_input_rules(
        &mut self,
        snapshot: &RichLocalSnapshot,
        text: &str,
        namespace: &str,
        rules: RichInputRuleSet,
    ) -> Result<RichInputRuleOutcome, RichLocalSessionError> {
        let outcome = self.insert_plain_text(snapshot, text)?;
        Ok(self.finish_input_rule(outcome, text, namespace, rules))
    }

    pub(super) fn finish_input_rule(
        &mut self,
        typed: RichLocalOutcome,
        text: &str,
        namespace: &str,
        rules: RichInputRuleSet,
    ) -> RichInputRuleOutcome {
        if typed != RichLocalOutcome::ContentCommitted {
            return RichInputRuleOutcome::Unchanged;
        }
        if !rules.is_trigger(text) {
            return RichInputRuleOutcome::Inserted;
        }
        match self.apply_input_rule(&self.snapshot(), text, namespace, rules) {
            Ok(RichLocalOutcome::ContentCommitted) => RichInputRuleOutcome::Applied,
            Ok(_) => RichInputRuleOutcome::Inserted,
            Err(_) => RichInputRuleOutcome::Refused,
        }
    }
}
