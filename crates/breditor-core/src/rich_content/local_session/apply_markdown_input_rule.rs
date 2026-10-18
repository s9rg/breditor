//! Separate exact-history automatic transformation; literal input was already retained normally.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::FormatSet,
    rich_content::{RichInputRuleKind, RichSelectionKind, plan_rich_markdown_input_rule},
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
        self.check(snapshot)?;
        self.require_writable()?;
        let Some(plan) = plan_rich_markdown_input_rule(
            &self.context,
            &self.state.document,
            self.state.selection.as_ref(),
            trigger,
            namespace,
        )?
        else {
            return Ok(RichLocalOutcome::Unchanged);
        };
        let pending = if matches!(plan.kind(), RichInputRuleKind::Code(_)) {
            Some(FormatSet::default())
        } else {
            Some(self.state.effective_caret_formats()?)
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
