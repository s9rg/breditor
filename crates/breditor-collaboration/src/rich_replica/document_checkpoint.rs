//! Explicit shared document-selection recovery families; no original/general journal is widened.
use super::{
    RichReplica, SharedRichProfile,
    general_history::ReplayContract,
    session::{Entry, Journal, MAX_JOURNAL_BYTES},
};
use crate::Error;
pub(super) const JOURNAL: &str = "breditor/rich-replica-document-journal";
pub(super) const TYPING_JOURNAL: &str = "breditor/rich-replica-document-typing-journal";
pub(super) const TYPING_ENVELOPE: &str = "breditor/shared-document-typing-session";
pub(super) fn validate_journal_scope(
    journal: &Journal,
    contract: ReplayContract,
) -> Result<(), Error> {
    let document = contract == ReplayContract::DocumentV1;
    let check = |ui: &super::ui_state::UiState| -> Result<(), Error> {
        if ui.document_selected() {
            if !document {
                return Err(Error::Contract("document selection requires explicit history family"));
            }
            ui.validate_document()?;
        }
        Ok(())
    };
    check(&journal.ui)?;
    for entry in &journal.entries {
        match entry {
            Entry::Local { commands, before_ui, after_ui, .. } => {
                if !document
                    && commands
                        .iter()
                        .any(|c| matches!(c, super::Command::ReplaceDocumentPlainTextV1(_)))
                {
                    return Err(Error::Contract(
                        "document command requires explicit history family",
                    ));
                }
                check(before_ui)?;
                check(after_ui)?;
            }
            Entry::GeneralRangeV1 { before_ui, after_ui, .. }
            | Entry::Undo { before_ui, after_ui, .. }
            | Entry::Redo { before_ui, after_ui, .. } => {
                check(before_ui)?;
                check(after_ui)?;
            }
            Entry::Remote { .. } => {}
        }
    }
    Ok(())
}
impl RichReplica {
    /// Whether this owner explicitly bound document-selection and general-range selective history.
    #[must_use]
    pub const fn document_selection_enabled(&self) -> bool {
        matches!(self.replay_contract, ReplayContract::DocumentV1)
    }
    /// Save only the explicit document-selection ordinary-history family.
    /// # Errors
    /// Wrong mode/history, invalid scope metadata or the unchanged save budget rejects.
    pub fn document_checkpoint(&self) -> Result<String, Error> {
        if !self.document_selection_enabled() || self.typing.is_some() {
            return Err(Error::Contract("explicit document selection checkpoint required"));
        }
        validate_journal_scope(&self.journal, self.replay_contract)?;
        self.encode_explicit_journal()
    }
    /// Save only the document-selection natural-history family, retaining the exact native partition.
    /// # Errors
    /// Wrong mode/history, invalid partition/scope metadata or active budgets reject.
    pub fn document_typing_checkpoint(&self) -> Result<String, Error> {
        if !self.document_selection_enabled() {
            return Err(Error::Contract("document selection typing checkpoint required"));
        }
        validate_journal_scope(&self.journal, self.replay_contract)?;
        self.encode_typing_checkpoint(TYPING_ENVELOPE)
    }
}
impl SharedRichProfile {
    /// Restore only the explicitly selected document-selection ordinary-history family.
    /// # Errors
    /// Wrong family/room/profile, altered replay, scope metadata and resource failures reject.
    pub fn restore_document(&self, room: &str, input: &str) -> Result<RichReplica, Error> {
        if input.len() > MAX_JOURNAL_BYTES {
            return Err(Error::Limit("document selection journal bytes"));
        }
        let journal: Journal = serde_json::from_str(input)?;
        if journal.document != room {
            return Err(Error::Contract("document selection journal room"));
        }
        RichReplica::from_journal_contract_parts(
            self.codec.clone(),
            journal,
            None,
            false,
            ReplayContract::DocumentV1,
        )
    }
    /// Restore only the document-selection natural-history family and exact selective Undo/Redo.
    /// # Errors
    /// Wrong family/room/profile, altered replay, invalid groups/scope and resource failures reject.
    pub fn restore_document_typing(&self, room: &str, input: &str) -> Result<RichReplica, Error> {
        RichReplica::restore_typing_contract_bound(
            self.codec.clone(),
            room,
            input,
            ReplayContract::DocumentV1,
        )
    }
}
