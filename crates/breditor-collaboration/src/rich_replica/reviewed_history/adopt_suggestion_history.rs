//! Adopt an authenticated original device-owned effect once, never re-execute it on the live owner.
use super::{Item, OwnedSuggestionAcceptance};
use crate::{
    Error,
    rich_replica::{
        RichReplica, VerifiedDocumentSuggestionEffect, history_metadata::Recipe, session::Entry,
    },
};
impl RichReplica {
    pub(in crate::rich_replica) fn replay_owned_suggestion(
        &mut self,
        packet: &str,
        acceptance: &OwnedSuggestionAcceptance,
        before_ui: &super::super::ui_state::UiState,
        after_ui: &super::super::ui_state::UiState,
    ) -> Result<(), Error> {
        self.journal.ui.clone_from(before_ui);
        self.validate_ui()?;
        let observed = if self.document_selection_enabled() {
            self.observe_document()?
        } else {
            self.observe()?
        };
        let super::super::DocumentSuggestionEffectVerification::Verified(proof) =
            self.verify_document_suggestion_effect_guarded(&observed, packet, &acceptance.effect)?
        else {
            return Err(Error::ReplayMismatch);
        };
        if !self.record_owned_suggestion(&proof, acceptance.clone())?
            || self.journal.ui != *after_ui
        {
            return Err(Error::ReplayMismatch);
        }
        Ok(())
    }
    pub(in crate::rich_replica) fn record_owned_suggestion(
        &mut self,
        proof: &VerifiedDocumentSuggestionEffect,
        acceptance: OwnedSuggestionAcceptance,
    ) -> Result<bool, Error> {
        let history =
            self.reviewed_history.as_ref().ok_or(Error::Contract("reviewed history required"))?;
        acceptance.check(&history.identity, self.writer())?;
        if proof.effect() != &acceptance.effect {
            return Err(Error::Contract("reviewed receipt differs from native proof"));
        }
        let id = &acceptance.effect.suggestion_id;
        if let Some(known) = history.adopted.get(id) {
            if known != &acceptance {
                return Err(Error::Contract("reviewed original acceptance differs"));
            }
            return Ok(false);
        }
        let from = acceptance
            .effect
            .writer_group
            .from
            .parse::<i32>()
            .map_err(|_| Error::ReplayMismatch)?;
        let through = acceptance
            .effect
            .writer_group
            .through
            .parse::<i32>()
            .map_err(|_| Error::ReplayMismatch)?;
        for known in history.adopted.values() {
            let first =
                known.effect.writer_group.from.parse::<i32>().map_err(|_| Error::ReplayMismatch)?;
            let last = known
                .effect
                .writer_group
                .through
                .parse::<i32>()
                .map_err(|_| Error::ReplayMismatch)?;
            if known.sequence == acceptance.sequence || from < last && first < through {
                return Err(Error::Contract(
                    "reviewed duplicate decision order or overlapping effect",
                ));
            }
        }
        let key = format!("reviewed:{id}");
        let (before, after) = proof.semantic_frontiers();
        let meta = self.journal.ui.engine_meta(&self.doc, &key)?;
        self.recipes.insert(
            key.clone(),
            Recipe { before: self.journal.ui.clone(), after: self.journal.ui.clone() },
        );
        let history = self.reviewed_history.as_mut().ok_or(Error::ReplayMismatch)?;
        history.cursors.owned(&self.doc, key.clone(), before.clone(), after.clone(), meta)?;
        history.undo.push(Item {
            key,
            steps: 1,
            before: before.clone(),
            after: after.clone(),
            ui_basis: self.doc.state_frontiers(),
        });
        history.redo.clear();
        history.adopted.insert(id.clone(), acceptance);
        if let Some(typing) = &mut self.typing {
            typing.continuation = None;
        }
        Ok(true)
    }
    /// Add the already received effect to THIS exact accepting device's local ordered history.
    /// The caller must authenticate the original server decision first; matching strings are not
    /// authority. A native effect proof is required and no document operation is authored here.
    /// Repeated original receipts remain idempotent after Undo/Redo and discarded Redo branches.
    /// Read-only owners may retain past authenticated ownership; Undo/Redo still require writable.
    /// # Errors
    /// Disabled history, stale/foreign proof, wrong device/account/lane, conflicting receipts,
    /// overlapping ranges or save/resource failures leave document, UI and both stacks unchanged.
    pub fn adopt_suggestion_history_guarded(
        &mut self,
        proof: &VerifiedDocumentSuggestionEffect,
        packet: &str,
        acceptance: OwnedSuggestionAcceptance,
    ) -> Result<bool, Error> {
        self.check_document_suggestion_effect_proof(proof)?;
        if self.read_document_suggestion(packet)?.id != proof.info().id {
            return Err(Error::Contract("reviewed adoption packet differs"));
        }
        let mut candidate = self.staged()?;
        let before_ui = candidate.journal.ui.clone();
        if !candidate.record_owned_suggestion(proof, acceptance.clone())? {
            return Ok(false);
        }
        candidate.journal.entries.push(Entry::AdoptSuggestionV1 {
            packet: packet.into(),
            acceptance,
            before_ui,
            after_ui: candidate.journal.ui.clone(),
        });
        self.adopt(candidate)?;
        Ok(true)
    }
}
