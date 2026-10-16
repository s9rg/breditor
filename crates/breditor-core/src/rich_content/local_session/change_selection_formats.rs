//! Native selection coverage chooses every format target; callers supply no JS interval list.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichSelectionUpdate,
};
use crate::rich_content::{
    RichSelectionCoverage, RichSelectionError, RichSelectionFormatChange,
    actions::{RichAction, RichActionError, SetInlineFormat},
};
impl RichLocalSession {
    /// Apply simultaneous typed changes to the complete current text/node/grid selection.
    ///
    /// Coverage retains domains and merged source bodies. Code rejects the whole
    /// request rather than losing styles or skipping selected code. A caret
    /// changes pending formats only; empty non-caret text contributes no action.
    /// One original action per nonempty block retains exact grouped recovery.
    /// # Errors
    /// Stale/read-only, invalid/duplicate changes, code, resource limits and any late failure are atomic.
    pub fn change_selection_formats(
        &mut self,
        snapshot: &RichLocalSnapshot,
        changes: &[RichSelectionFormatChange],
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        super::super::selection_format_change::admit(&self.context, changes)?;
        let selection = self.state.selection.as_ref().ok_or(RichSelectionError::TargetKind)?;
        let coverage = RichSelectionCoverage::capture(&self.state.document, selection)?;
        if coverage.text().iter().any(|s| s.kind().as_str() == "breditor/code-block") {
            return Err(RichActionError::TextTarget.into());
        }
        if super::typing_state::caret(Some(selection)).is_some() {
            let formats = super::super::selection_format_change::pending(
                &self.state.effective_caret_formats()?,
                changes,
            )?;
            return self.set_pending_formats(snapshot, Some(formats));
        }
        let count = coverage.text().iter().filter(|s| s.start() < s.end()).count();
        if count
            > usize::try_from(self.context.max_operations_per_transaction()).unwrap_or(usize::MAX)
        {
            return Err(RichActionError::TooManyActions.into());
        }
        let changes =
            changes.iter().map(RichSelectionFormatChange::local_change).collect::<Vec<_>>();
        let actions = coverage
            .text()
            .iter()
            .filter(|s| s.start() < s.end())
            .map(|span| {
                Ok(RichAction::SetInlineFormat(SetInlineFormat::capture_changes(
                    &self.state.document,
                    span.block(),
                    span.start(),
                    span.end(),
                    &changes,
                )?))
            })
            .collect::<Result<Vec<_>, RichActionError>>()?;
        self.dispatch(snapshot, &actions, RichSelectionUpdate::Map)
    }
}
