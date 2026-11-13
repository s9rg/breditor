//! Prepare one real native edit without publishing it or making a review decision.
use super::{DocumentSuggestionEdit, DocumentSuggestionPreview, DocumentSuggestionScope};
use crate::{
    Error,
    rich_replica::{
        PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation, WriterReceipt,
    },
};
use serde::{Deserialize, Serialize};
mod checkpoint_segmented_history;

/// Native authored effect identity, not a decision receipt or permission credential.
/// The host must bind this to its authenticated, exactly-once review decision and durably append
/// the complete candidate before publication. Importing this writer's group does not transfer
/// its Undo history to a different accepting user's writer.
#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentSuggestionEffect {
    /// Immutable original proposal identity.
    pub suggestion_id: String,
    /// Exact version-two action window, including permanent preparation outside Undo.
    pub writer_group: WriterReceipt,
    /// First semantic operation in that window. The end is `writer_group.through`.
    /// Preparation before this counter must never be included in a selective inverse.
    pub semantic_from: String,
}

/// Exclusive source-guarded candidate. Dropping it leaves the source unchanged, including an open
/// natural typing group. No public mutable candidate, unchecked inverse or alternate writer exists.
pub struct PreparedDocumentSuggestionEffect {
    pub(super) basis: SharedObservation,
    pub(super) candidate: RichReplica,
    pub(super) effect: DocumentSuggestionEffect,
    group_json: String,
}
impl PreparedDocumentSuggestionEffect {
    /// Native effect bounds and lineage; preparation is not durable acceptance.
    #[must_use]
    pub const fn effect(&self) -> &DocumentSuggestionEffect {
        &self.effect
    }
    /// One complete original version-two action group for ordinary authenticated admission.
    #[must_use]
    pub fn writer_group_json(&self) -> &str {
        &self.group_json
    }
    /// Fully admitted staged result; the accepted source has not changed yet.
    #[must_use]
    pub fn document_json(&self) -> &str {
        self.candidate.document_json()
    }
    /// Exact source-selected recovery family, including local UI, history and grouping.
    /// No automatic upgrade or migration is performed.
    /// # Errors
    /// Existing full checkpoint and resource admission applies before a host can append.
    pub fn checkpoint(&self) -> Result<String, Error> {
        if self.candidate.search_history_enabled() {
            return self.candidate.search_checkpoint();
        }
        if self.candidate.reviewed_history_enabled() {
            return self.candidate.reviewed_checkpoint();
        }
        match (
            self.candidate.document_selection_enabled(),
            self.candidate.general_ranges_enabled(),
            self.candidate.typing.is_some(),
        ) {
            (true, _, true) => self.candidate.document_typing_checkpoint(),
            (true, _, false) => self.candidate.document_checkpoint(),
            (false, true, true) => self.candidate.general_typing_checkpoint(),
            (false, true, false) => self.candidate.general_checkpoint(),
            (false, false, true) => self.candidate.typing_checkpoint(),
            (false, false, false) => self.candidate.checkpoint(),
        }
    }
    /// Candidate catchup frame. A host broadcasts it only after durable decision publication.
    /// # Errors
    /// Existing full-state frame budgets and engine encoding apply.
    pub fn update_frame(&self) -> Result<String, Error> {
        self.candidate.update_frame()
    }
}
impl RichReplica {
    /// Stage the exact still-current preview as one ordinary native writer action. The caller owns
    /// an exclusive writer and separately authenticates permission, proposal attribution and assets.
    /// This primitive makes no Accept/Reject decision and does not reserve another writer's counters.
    /// Document-scoped drafts explicitly select that scope on the candidate; ordinary native
    /// document-selection and history recipes remain intact, independent of the source's caret.
    /// The host must serialize prepare, durable append and commit under its room lock.
    /// # Errors
    /// Stale/foreign previews, read-only policy, disabled history/scope families, invalid native
    /// lowering, non-atomic groups, or checkpoint/transport budgets leave the source unchanged.
    pub fn prepare_document_suggestion_effect(
        &self,
        preview: &DocumentSuggestionPreview,
    ) -> Result<PreparedDocumentSuggestionEffect, Error> {
        self.check(&preview.observed)?;
        self.require_writable()?;
        let writer = self.doc.peer_id();
        let from = self.doc.state_vv().get(&writer).copied().unwrap_or(0);
        let mut candidate = self.staged()?;
        let undo = candidate.undo_count();
        let (selection, pending) = if preview.draft.scope == DocumentSuggestionScope::Document {
            // Explicit intent, not an absent caret. Never silently enable a recovery family.
            candidate.select_document_guarded(&candidate.observe_document()?)?;
            (SelectionUpdate::Map, PendingFormatsUpdate::Set(None))
        } else {
            (SelectionUpdate::Map, PendingFormatsUpdate::Map)
        };
        let changed = match &preview.draft.edit {
            DocumentSuggestionEdit::Commands(commands) => {
                candidate.apply_with_state(commands.clone(), selection, pending)?
            }
            DocumentSuggestionEdit::GeneralText(action) => {
                let expected = candidate
                    .codec
                    .decode(preview.document_json())
                    .map_err(|_| Error::Contract("suggestion effect document decoding"))?;
                let expected = breditor_core::rich_content::RichDocument::try_admit(
                    candidate.codec.schema(),
                    expected,
                    candidate.codec.limits(),
                )
                .map_err(|_| Error::Contract("suggestion effect document admission"))?;
                candidate.apply_general_range_with_state(
                    action.clone(),
                    selection,
                    pending,
                    &expected,
                    None,
                )?
            }
        };
        if !changed
            || candidate.document_json() != preview.document_json()
            || candidate.undo_count() != undo + 1
            || candidate.redo_count() != 0
        {
            return Err(Error::Contract(
                "suggestion effect differs from native preview or grouping",
            ));
        }
        let key = &candidate.history_keys.undo.last().ok_or(Error::ReplayMismatch)?.key;
        let (before, after) = candidate.cursors.latest_authored(key)?;
        let before = candidate.doc.frontiers_to_vv(before).ok_or(Error::ReplayMismatch)?;
        let after = candidate.doc.frontiers_to_vv(after).ok_or(Error::ReplayMismatch)?;
        let semantic_from = before.get(&writer).copied().unwrap_or(0);
        let through = candidate.doc.state_vv().get(&writer).copied().unwrap_or(0);
        if semantic_from < from
            || semantic_from >= through
            || after != candidate.doc.state_vv()
            || after.iter().any(|(peer, count)| {
                *peer != writer && before.get(peer).copied().unwrap_or(0) != *count
            })
        {
            return Err(Error::Contract("suggestion effect semantic span"));
        }
        let (group_json, writer_group) = candidate.last_authored_group_v2(from)?;
        let prepared = PreparedDocumentSuggestionEffect {
            basis: preview.observed.clone(),
            candidate,
            effect: DocumentSuggestionEffect {
                suggestion_id: preview.info().id.clone(),
                writer_group,
                semantic_from: semantic_from.to_string(),
            },
            group_json,
        };
        // Fail before the host can persist a decision whose exact native recovery is too large.
        if self.segmented_history_enabled() {
            prepared.candidate.check_segmented_checkpoint_budget()?;
        } else {
            prepared.checkpoint()?;
        }
        prepared.update_frame()?;
        Ok(prepared)
    }
}
