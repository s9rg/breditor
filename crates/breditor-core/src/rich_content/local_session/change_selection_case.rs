//! Native letter-case change of the selection: one candidate, one Undo step.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState,
    history_recipe::HistoryRecipe, local_rewrite::LocalRewrite, typing_state,
};
use crate::rich_content::{
    RichCaseChangePlan, RichCaseRequest, RichSelectionError, plan_rich_case_change,
};

impl RichLocalSession {
    /// Change the letter case of the selected text (a caret changes its whole block).
    ///
    /// Formats, property maps, block identities and structure are preserved; mention
    /// text is never altered. A request that changes no scalar is `Unchanged` and
    /// publishes nothing. Undo/Redo replay the recorded rewrite, never the mapping.
    /// # Errors
    /// Stale/read-only owners, a missing selection, budget and admission failures.
    pub fn change_selection_case(
        &mut self,
        snapshot: &RichLocalSnapshot,
        request: &RichCaseRequest,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let selection = self.state.selection.as_ref().ok_or(RichSelectionError::TargetKind)?;
        let Some(plan) =
            plan_rich_case_change(&self.context, &self.state.document, selection, request)?
        else {
            return Ok(RichLocalOutcome::Unchanged);
        };
        self.commit_case_change(&plan)
    }

    fn commit_case_change(
        &mut self,
        plan: &RichCaseChangePlan,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        let document = plan.document().clone();
        let selection = Some(plan.selection().clone());
        // Only a caret keeps its explicit pending typing formats (as for search).
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
        Ok(self.commit_content(
            candidate,
            HistoryRecipe::Recovered(forward),
            HistoryRecipe::Recovered(inverse),
        ))
    }
}
