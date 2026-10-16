//! Whole-document layout is one native action; unchanged ordinary-scope contracts keep their limits.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::ChangeDocumentLayoutV1,
};
use crate::Error;
impl RichReplica {
    /// Patch native document coverage atomically with independently owned fields and exact before-UI.
    /// # Errors
    /// Stale/read-only/family/profile/strict JSON and any native admission/lowering/replay failure are atomic.
    pub fn change_document_selection_layout_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        self.document_tool_selection()?;
        if !self.document_selected() {
            return self.change_selection_layout_json_guarded(observation, input);
        }
        if input.len() > 1024 * 1024 {
            return Err(Error::Limit("document layout intent bytes"));
        }
        let action = ChangeDocumentLayoutV1 { patch_json: input.into() };
        let Some(plan) = action.plan(&self.codec, &self.document)? else {
            return Ok(false);
        };
        self.apply_with_state_inner(
            vec![Command::ChangeDocumentLayoutV1(action)],
            SelectionUpdate::Map,
            PendingFormatsUpdate::Map,
            None,
            Some(&plan.document),
        )
    }
}
