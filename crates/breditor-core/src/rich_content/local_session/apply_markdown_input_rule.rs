//! Separate exact-history automatic transformation; literal input was already retained normally.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::FormatSet,
    rich_content::{
        RichInputRuleKind, RichInputRulePlan, RichInputRuleSet, RichSelectionKind, RichTextPoint,
        plan_rich_input_rule, plan_rich_paragraph_autolink_input_rule,
    },
};

impl RichLocalSession {
    /// Apply an explicitly selected Markdown shortcut after ordinary local plain input.
    ///
    /// No match leaves Redo, typing continuation, selection and publication exact.
    /// One native action group records admitted edits, not the recognition rule;
    /// one Undo restores the complete already retained literal shortcut.
    /// # Errors
    /// Stale/read-only observations, invalid identities, bounds or receiving admission reject atomically.
    pub fn apply_markdown_input_rule(
        &mut self,
        snapshot: &RichLocalSnapshot,
        trigger: &str,
        namespace: &str,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.apply_input_rule(snapshot, trigger, namespace, RichInputRuleSet::MARKDOWN_V1)
    }

    /// Apply an explicitly selected rule set after ordinary local plain input.
    ///
    /// Same exact history contract as [`Self::apply_markdown_input_rule`]: a
    /// nonmatch changes nothing, and a conversion is one isolated Undo group that
    /// keeps the already retained literal input (including its trigger).
    /// # Errors
    /// Stale/read-only observations, invalid identities, bounds or receiving admission reject atomically.
    pub fn apply_input_rule(
        &mut self,
        snapshot: &RichLocalSnapshot,
        trigger: &str,
        namespace: &str,
        rules: RichInputRuleSet,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let plan = plan_rich_input_rule(
            &self.context,
            &self.state.document,
            self.state.selection.as_ref(),
            trigger,
            namespace,
            rules,
        )?;
        self.apply_input_rule_plan(snapshot, plan)
    }

    /// Apply the optional `autolink-v1` rule after a retained Enter split.
    ///
    /// `end` is the pre-split caret, now the end of its retained left block. The
    /// post-split caret and pending formats stay exact; one isolated Undo group
    /// removes only the link, never the split.
    /// # Errors
    /// Stale/read-only observations, invalid points, bounds or receiving admission reject atomically.
    pub fn apply_paragraph_autolink_input_rule(
        &mut self,
        snapshot: &RichLocalSnapshot,
        end: &RichTextPoint,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let plan = plan_rich_paragraph_autolink_input_rule(
            &self.context,
            &self.state.document,
            self.state.selection.as_ref(),
            end,
        )?;
        self.apply_input_rule_plan(snapshot, plan)
    }

    fn apply_input_rule_plan(
        &mut self,
        snapshot: &RichLocalSnapshot,
        plan: Option<RichInputRulePlan>,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        let Some(plan) = plan else {
            return Ok(RichLocalOutcome::Unchanged);
        };
        // Code is explicitly plain; a code exit derives the fresh paragraph's styles afresh.
        let pending = match plan.kind() {
            RichInputRuleKind::Code(_) => Some(FormatSet::default()),
            RichInputRuleKind::CodeExit => None,
            _ => Some(self.state.effective_caret_formats()?),
        };
        let caret = plan.caret().clone();
        self.dispatch_with_pending_formats(
            snapshot,
            plan.actions(),
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: caret.clone(),
                focus: caret,
            })),
            RichPendingFormatsUpdate::Set(pending),
        )
    }
}
