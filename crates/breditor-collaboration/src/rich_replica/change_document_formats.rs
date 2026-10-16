//! Document-specific formatting publication, with the original route retained for ordinary scopes.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::ChangeDocumentFormatsV1,
};
use crate::Error;
impl RichReplica {
    /// Apply one whole-document native format action, or the unchanged old action at an ordinary scope.
    /// # Errors
    /// Guard/write/family checks precede parsing. Invalid code/format/resource/lowering/replay is atomic.
    pub fn change_document_selection_formats_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        self.document_tool_selection()?;
        if !self.document_selected() {
            return self.change_selection_formats_json_guarded(observation, input);
        }
        if input.len() > 1024 * 1024 {
            return Err(Error::Limit("document format intent bytes"));
        }
        let action = ChangeDocumentFormatsV1 { changes_json: input.into() };
        let Some((expected, _)) = action.plan(&self.codec, &self.document)? else {
            return Ok(false);
        };
        self.apply_with_state_inner(
            vec![Command::ChangeDocumentFormatsV1(action)],
            SelectionUpdate::Map,
            PendingFormatsUpdate::Map,
            None,
            Some(&expected),
        )
    }
}
