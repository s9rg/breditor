//! Preflight local replacement, real UI mapping and bidirectional replay before one commit.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalState,
    history_recipe::HistoryRecipe, local_rewrite::LocalRewrite, typing_state,
};
use crate::rich_content::RichSearchReplacePlan;

impl RichLocalSession {
    pub(super) fn replace_search_plan(
        &mut self,
        plan: &RichSearchReplacePlan,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        if plan.edits().is_empty() {
            return Ok(RichLocalOutcome::Unchanged);
        }
        let (document, selection) = plan
            .preview_with_selection(
                &self.context,
                &self.state.document,
                self.state.selection.as_ref(),
            )?
            .into_parts();
        if document.document() == self.state.document.document() {
            return Ok(RichLocalOutcome::Unchanged);
        }
        // Search never changes block kinds or effective caret policy. Only a
        // mapped caret can retain its explicit pending format override.
        let pending_formats =
            typing_state::caret(selection.as_ref()).and(self.state.pending_formats.clone());
        typing_state::validate(
            &self.context,
            &document,
            selection.as_ref(),
            pending_formats.as_ref(),
        )?;
        let forward = LocalRewrite::between(&self.state.document, &document);
        let inverse = forward.inverse();
        if forward.apply(&self.context, &self.state.document)?.document() != document.document()
            || inverse.apply(&self.context, &document)?.document() != self.state.document.document()
        {
            return Err(RichLocalSessionError::HistoryMismatch);
        }
        let candidate = RichLocalState {
            document,
            selection,
            pending_formats,
            revision: self.state.revision.successor()?,
        };
        self.commit_content(
            candidate,
            HistoryRecipe::Recovered(forward),
            HistoryRecipe::Recovered(inverse),
        )
    }
}
