//! Pure namespace planning for the existing protected-range proposal intent.
use super::{DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope};
use crate::{
    Error,
    rich_replica::{
        RichReplica, SharedObservation, actions::ReplaceGeneralTextRangeV1,
        general_range_input_json, general_range_plan, selection::Selection,
    },
};
use breditor_core::{
    document::TextFragment,
    rich_content::{actions::RichGeneralRangePlan, allocate_general_range_paragraphs},
};

impl RichReplica {
    /// Plan an explicit rich text proposal using native partial-structure coverage and exact floors.
    /// The host must permanently reserve `prefix`, including after refusal or discarded proposals.
    /// This pure read is available in every history family and to read-only owners: it neither
    /// restages selection nor enables general history, consumes writer counters or captures a packet.
    /// The returned draft uses the original V1 intent; capture must use this same observation.
    /// # Errors
    /// Stale/foreign observations, invalid targets/runs/namespaces, reused IDs, no semantic effect
    /// or original native limits reject without changing document, selection, history or transport.
    pub fn plan_suggestion_general_text_guarded(
        &self,
        observed: &SharedObservation,
        target: &Selection,
        inserted: &TextFragment,
        prefix: &str,
    ) -> Result<DocumentSuggestionDraft, Error> {
        self.check(observed)?;
        let plan =
            RichGeneralRangePlan::capture(&self.document, &target.admit(&self.document)?, inserted)
                .map_err(|_| Error::Contract("suggestion general text plan"))?;
        let empty = allocate_general_range_paragraphs(prefix, plan.empty_blocks().len())
            .map_err(|_| Error::Contract("suggestion general text namespace"))?;
        let draft = DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::GeneralText(ReplaceGeneralTextRangeV1 {
                range: general_range_plan::request(&self.codec, target, inserted)?,
                empty: empty.iter().map(|id| id.as_str().into()).collect(),
            }),
        };
        // Full original causal preparation catches hidden historical identities too. A tree-only
        // check could approve a reused birth absent from today's projection but retained by Undo.
        let after = super::evaluate_commands::evaluate(
            self,
            &self.doc,
            &self.document,
            self.document_json(),
            &draft,
        )?;
        if after == self.document_json() {
            return Err(Error::Contract("suggestion has no semantic effect"));
        }
        Ok(draft)
    }

    /// Closed JSON bridge for pure rich-run planning; unlike ordinary general input it needs no
    /// write grant or enabled general journal. Existing mutation request meanings are unchanged.
    /// # Errors
    /// Rejects stale guards before decoding, unknown fields, malformed literals and native limits.
    pub fn plan_suggestion_general_text_namespace_json_guarded(
        &self,
        observed: &SharedObservation,
        input: &str,
    ) -> Result<DocumentSuggestionDraft, Error> {
        self.check(observed)?;
        let request: general_range_input_json::Rich = general_range_input_json::decode(input)?;
        let inserted = general_range_input_json::fragment(&self.codec, request.runs)?;
        self.plan_suggestion_general_text_guarded(
            observed,
            &request.selection,
            &inserted,
            &request.prefix,
        )
    }
}
