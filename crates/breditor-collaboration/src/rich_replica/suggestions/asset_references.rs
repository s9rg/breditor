//! Native source-and-intent dependency closure; proposed edits never enter the accepted owner.
use super::{
    source_evaluation::{SourceEvaluation, evaluate_source},
    verify_suggestion_revision::{RevisionEvaluation, evaluate_revision},
};
use crate::{
    Error,
    rich_replica::{
        PacketAssetIdentity, PacketAssetOutcome, PacketAssetReferences, RichReplica,
        SharedObservation,
        packet_asset_references::{self, admission},
        retained_asset_references::collect_causal_asset_references,
    },
};
impl RichReplica {
    /// Read conservative source-and-intent bindings from an original native proposal evaluation.
    /// Missing historical dependencies remain Pending, never an empty complete reference list.
    /// # Errors
    /// Stale/foreign guards, invalid native intents/cuts or complete causal/count budgets reject.
    pub fn document_suggestion_asset_references_guarded(
        &self,
        observed: &SharedObservation,
        input: &str,
    ) -> Result<PacketAssetReferences, Error> {
        self.check(observed)?;
        let (info, outcome) = match admission(evaluate_source(self, input))? {
            SourceEvaluation::Pending { info, missing } => {
                (info, PacketAssetOutcome::Pending { missing })
            }
            SourceEvaluation::Verified { info, native, .. } => {
                let pairs = collect_causal_asset_references(&native.doc, &native.document)?;
                (info, packet_asset_references::ready(pairs)?)
            }
        };
        Ok(PacketAssetReferences {
            packet: PacketAssetIdentity::Suggestion { id: info.id },
            outcome,
        })
    }
    /// Encode the guarded original proposal dependency result without accepting or publishing it.
    /// # Errors
    /// Native source/intent/guard checks and complete output limits reject before returning text.
    pub fn document_suggestion_asset_references_json_guarded(
        &self,
        observed: &SharedObservation,
        input: &str,
    ) -> Result<String, Error> {
        packet_asset_references::encode(
            self,
            &self.document_suggestion_asset_references_guarded(observed, input)?,
        )
    }
    /// Read both predecessor and replacement dependencies after native revision-lineage evaluation.
    /// Neither proposal's accepted/server status or author authenticity is inferred by this read.
    /// # Errors
    /// Stale guards, invalid ancestry/intents, unsupported causal metadata or read budgets reject.
    pub fn document_suggestion_revision_asset_references_guarded(
        &self,
        observed: &SharedObservation,
        previous: &str,
        input: &str,
    ) -> Result<PacketAssetReferences, Error> {
        self.check(observed)?;
        let (revision, outcome) = match admission(evaluate_revision(self, previous, input))? {
            RevisionEvaluation::Pending { revision, missing } => {
                (revision, PacketAssetOutcome::Pending { missing })
            }
            RevisionEvaluation::Verified { revision, parent, child, .. } => {
                let pairs = collect_causal_asset_references(&parent.doc, &parent.document)?
                    .into_iter()
                    .chain(collect_causal_asset_references(&child.doc, &child.document)?);
                (revision, packet_asset_references::ready(pairs)?)
            }
        };
        Ok(PacketAssetReferences {
            packet: PacketAssetIdentity::SuggestionRevision {
                id: revision.id,
                previous_suggestion_id: revision.previous_suggestion_id,
                suggestion_id: revision.suggestion.id,
            },
            outcome,
        })
    }
    /// Encode exact predecessor/replacement dependency metadata in the independent packet-read family.
    /// # Errors
    /// Native guard/admission/source checks and complete JSON limits reject without a prefix.
    pub fn document_suggestion_revision_asset_references_json_guarded(
        &self,
        observed: &SharedObservation,
        previous: &str,
        input: &str,
    ) -> Result<String, Error> {
        packet_asset_references::encode(
            self,
            &self
                .document_suggestion_revision_asset_references_guarded(observed, previous, input)?,
        )
    }
}
