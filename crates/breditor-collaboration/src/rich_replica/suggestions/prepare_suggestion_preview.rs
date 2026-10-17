//! Prepare a native proposed result after checking its captured source dependencies, never Accept.
use super::{
    DocumentSuggestionInfo, evaluate_commands,
    packet::Packet,
    read_set::{ReadSet, SuggestionConflictTarget},
};
use crate::{
    Error,
    rich_replica::{
        RichReplica, SharedObservation, VersionAssetReference, VersionBlockChange, WriterDependency,
    },
};

/// Disposable immutable suggestion preview. No live owner or journal is exposed or checked out.
pub struct DocumentSuggestionPreview {
    pub(super) observed: SharedObservation,
    pub(super) draft: Box<super::DocumentSuggestionDraft>,
    info: Box<DocumentSuggestionInfo>,
    document_json: String,
    changes: Vec<VersionBlockChange>,
    before_assets: Vec<VersionAssetReference>,
    after_assets: Vec<VersionAssetReference>,
}
impl DocumentSuggestionPreview {
    /// Original descriptive creator/title; actual host attribution is a separate check.
    #[must_use]
    pub fn info(&self) -> &DocumentSuggestionInfo {
        &self.info
    }
    /// Fully admitted proposed tree on the observed current source, not accepted document state.
    #[must_use]
    pub fn document_json(&self) -> &str {
        &self.document_json
    }
    /// Native semantic effects in deterministic stable-target order.
    #[must_use]
    pub fn changes(&self) -> &[VersionBlockChange] {
        &self.changes
    }
    /// Immutable asset references currently present; no bytes are fetched.
    #[must_use]
    pub fn before_assets(&self) -> &[VersionAssetReference] {
        &self.before_assets
    }
    /// Immutable asset references required by the preview; the host owns retention and admission.
    #[must_use]
    pub fn after_assets(&self) -> &[VersionAssetReference] {
        &self.after_assets
    }
}
/// Native readiness is explicit; a conflict or pending source never becomes an applicable edit.
pub enum DocumentSuggestionPreparation {
    /// Original source operations are still missing.
    Pending {
        /// Exclusive captured document operation ends in native numeric writer order.
        missing: Vec<WriterDependency>,
    },
    /// Some original semantic dependencies changed; a fresh proposal/preview is needed.
    Conflict {
        /// Exact dependencies, not a guessed nearest surviving caret.
        targets: Vec<SuggestionConflictTarget>,
    },
    /// Pure source-checked preview. This variant does not authorize acceptance or publish an edit.
    Ready(DocumentSuggestionPreview),
}
impl RichReplica {
    /// Preview an original proposal against the exact observed current source, including in
    /// read-only mode. Source commands are re-proved natively; current read dependencies must
    /// remain equal. Unrelated content is retained. No live selection/counter/history changes.
    /// # Errors
    /// Stale/foreign guard, forged/malformed source, invalid command/schema or resource limit rejects.
    pub fn prepare_document_suggestion_guarded(
        &self,
        observed: &SharedObservation,
        input: &str,
    ) -> Result<DocumentSuggestionPreparation, Error> {
        self.check(observed)?;
        let packet = Packet::read(self, input)?;
        let Some(source) = self.historical_review_document(&packet.data.source_anchor_json)? else {
            return Ok(DocumentSuggestionPreparation::Pending {
                missing: self
                    .review_anchor_missing_dependencies(&packet.data.source_anchor_json)?,
            });
        };
        let original = evaluate_commands::evaluate(
            self,
            &source.doc,
            &source.document,
            &source.canonical,
            &packet.data.draft,
        )?;
        if original == source.canonical {
            return Err(Error::Contract("suggestion has no source effect"));
        }
        let source_raw: serde_json::Value = serde_json::from_str(&source.canonical)?;
        let current_raw: serde_json::Value = serde_json::from_str(self.document_json())?;
        let conflicts = ReadSet::capture(
            &source_raw["root"],
            &source.document,
            &source.doc,
            &self.codec,
            &packet.data.draft,
        )?
        .conflicts(&current_raw["root"], &self.doc)?;
        if !conflicts.is_empty() {
            return Ok(DocumentSuggestionPreparation::Conflict { targets: conflicts });
        }
        let document_json = evaluate_commands::evaluate(
            self,
            &self.doc,
            &self.document,
            self.document_json(),
            &packet.data.draft,
        )?;
        let comparison = super::super::document_versions::compare_documents(
            packet.id.clone(),
            self.document_json(),
            &document_json,
        )?;
        Ok(DocumentSuggestionPreparation::Ready(DocumentSuggestionPreview {
            observed: observed.clone(),
            info: Box::new(packet.info()),
            draft: Box::new(packet.data.draft),
            document_json,
            changes: comparison.changes,
            before_assets: comparison.version_assets,
            after_assets: comparison.current_assets,
        }))
    }
}
