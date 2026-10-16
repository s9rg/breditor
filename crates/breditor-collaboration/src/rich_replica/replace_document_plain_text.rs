//! Guarded whole-scope replacement preserves actual before-UI and one selective history unit.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::ReplaceDocumentPlainTextV1,
};
use crate::Error;
impl RichReplica {
    /// Replace an explicitly selected complete document using native Core policy and owned shared edits.
    /// # Errors
    /// Stale/read-only/wrong mode/scope reject before parsing; closed DTO, native admission,
    /// historical-ID, lowering or replay/save failures retain content, UI, history and observation.
    pub fn replace_document_plain_text_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if !self.document_selection_enabled() || !self.document_selected() {
            return Err(Error::Contract("explicit document selection required"));
        }
        if input.len() > 1024 * 1024 {
            return Err(Error::Limit("document replacement input bytes"));
        }
        let action: ReplaceDocumentPlainTextV1 = serde_json::from_str(input)?;
        self.apply_document_plain_action(action, None)
    }
    pub(super) fn apply_document_plain_action(
        &mut self,
        action: ReplaceDocumentPlainTextV1,
        typing: Option<super::typing_history::Request>,
    ) -> Result<bool, Error> {
        let mut native = self.general_range_preview()?;
        native
            .replace_document_plain_text(
                &native.snapshot(),
                &super::paragraphs::id(&action.paragraph)?,
                &action.text,
            )
            .map_err(|_| Error::Contract("document replacement native admission"))?;
        let selection = SelectionUpdate::Set(Some(super::atom_edit::selection(
            native.state().selection().ok_or(Error::Contract("document resulting caret"))?.kind(),
        )?));
        self.apply_with_state_inner(
            vec![Command::ReplaceDocumentPlainTextV1(action)],
            selection,
            PendingFormatsUpdate::Set(Some(vec![])),
            typing,
            Some(native.state().document()),
        )
    }
}
