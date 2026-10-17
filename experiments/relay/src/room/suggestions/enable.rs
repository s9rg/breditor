//! Explicit durable lane activation with an independently reserved host effect writer.
use super::{DocumentSuggestionsDescriptor, EFFECT_WRITER, Room, SuggestionsState};
use crate::{Error, Result, credentials, log::Event};
use std::collections::BTreeMap;
impl Room {
    pub(super) fn new_suggestions_state(
        &self,
        binding: &str,
        enabled_at: u64,
    ) -> Result<SuggestionsState> {
        if !self.atomic_transport_v2 {
            return Err(Error::Contract("suggestions require explicit writer transport V2"));
        }
        self.check_suggestion_author_budget(0)?;
        credentials::hash(binding)?;
        if self.replica.writer_clock_v2(EFFECT_WRITER)?.through != "0" {
            return Err(Error::Contract("suggestion effect writer already occupied"));
        }
        let mut effect_owner = self.profile.join_frame(
            self.replica.document_id().into(),
            EFFECT_WRITER.into(),
            &self.replica.update_frame()?,
        )?;
        effect_owner.enable_document_selection_guarded(&effect_owner.observe()?)?;
        effect_owner.document_checkpoint()?;
        Ok(SuggestionsState {
            binding: binding.into(),
            enabled_at,
            bytes: 0,
            roles: BTreeMap::new(),
            proposals: BTreeMap::new(),
            updates: BTreeMap::new(),
            effect_owner,
            revisions: None,
        })
    }
    /// Enable the separate proposal/decision lane once. Existing V1-transport rooms are refused,
    /// not migrated. The host effect writer never receives an ordinary client writer lease.
    /// # Errors
    /// Non-owner access, wrong transport, occupied reserved writer, native budgets or I/O rejects.
    pub fn enable_document_suggestions(
        &mut self,
        principal: &str,
    ) -> Result<DocumentSuggestionsDescriptor> {
        self.reader(principal)?;
        if principal != self.owner {
            return Err(Error::Permission);
        }
        if self.suggestions.is_none() {
            let binding = credentials::issue()?;
            let mut state = self.new_suggestions_state(&binding, 0)?;
            state.enabled_at = self.log.append(Event::EnableDocumentSuggestionsV1 {
                actor: principal.into(),
                binding,
                effect_writer: EFFECT_WRITER.into(),
            })?;
            self.suggestions = Some(state);
        }
        self.document_suggestions_descriptor(principal)
    }
    /// Read this lane's exact identity under current document-read permission.
    /// # Errors
    /// Denied readers, disabled lanes and uncertain storage reject.
    pub fn document_suggestions_descriptor(
        &self,
        principal: &str,
    ) -> Result<DocumentSuggestionsDescriptor> {
        self.reader(principal)?;
        Ok(DocumentSuggestionsDescriptor {
            format: "breditor/relay-document-suggestions",
            format_version: 1,
            document: self.replica.document_id().into(),
            binding: self.suggestions_state()?.binding.clone(),
            effect_writer: EFFECT_WRITER.into(),
        })
    }
}
