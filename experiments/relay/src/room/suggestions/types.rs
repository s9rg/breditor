//! Closed service DTOs. Stored attribution and effect receipts never grant live account rights.
use crate::Receipt;
use breditor_collab_feasibility::rich_replica::{
    DocumentSuggestionInfo, SuggestionConflictTarget, WriterDependency,
};
use serde::{Deserialize, Serialize};

/// Explicit suggestion rights independent of both document roles and threaded comment roles.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SuggestionRole {
    /// Publish attributed proposals, but never finalize accepted document changes.
    Propose,
    /// Also finalize proposals; Accept additionally requires current document Editor permission.
    Review,
}
/// Live capabilities, computed under current room roles rather than restored from a payload.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionPermissions {
    /// Independent current suggestion role.
    pub role: Option<SuggestionRole>,
    /// Publish proposals attributed to this account.
    pub can_propose: bool,
    /// Review role plus document editing permission.
    pub can_accept: bool,
    /// Review role; Reject never changes accepted document content.
    pub can_reject: bool,
}
/// Explicit opt-in durable lane identity; not a credential.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSuggestionsDescriptor {
    /// Separate server capability family.
    pub format: &'static str,
    /// Exact original decision contract.
    pub format_version: u32,
    /// Native document identity.
    pub document: String,
    /// Random identity of this particular durable lane.
    pub binding: String,
    /// Reserved, exclusively host-owned effect writer, never an accepting user's stream.
    pub effect_writer: String,
}
/// Original durable proposal publication, separate from its later decision.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSuggestionPublication {
    /// First authenticated publication's canonical room-log sequence.
    pub sequence: String,
    /// Native-validated intent identity and authenticated attribution.
    pub suggestion: DocumentSuggestionInfo,
}
/// One final choice. There is no second Accept, overwritten decision or snapshot fallback.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SuggestionDecision {
    /// Apply the source-checked native intent once.
    Accept,
    /// Finalize without changing accepted content.
    Reject,
}
/// Explicit queued choice against an immutable proposal in one exact server lane.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SuggestionDecisionRequest {
    /// Descriptor binding prevents cross-log decisions, even for byte-identical documents.
    pub binding: String,
    /// Immutable native content-addressed proposal.
    pub suggestion_id: String,
    /// Original desired outcome; an already finalized proposal returns its ORIGINAL outcome.
    pub decision: SuggestionDecision,
}
/// Canonical native effect admitted in the same durable record as Accept.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SuggestionEffect {
    /// Exact version-two host writer range and canonical lineage.
    pub writer_group: Receipt,
    /// First semantic counter. Immutable preparation before it must not enter selective Undo.
    pub semantic_from: String,
}
/// Immutable original finalization in server order; replay proves its original live authorization.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSuggestionDecision {
    /// Single finalization's canonical room-log sequence.
    pub sequence: String,
    /// Exact immutable proposal.
    pub suggestion_id: String,
    /// Server-authenticated deciding account at this sequence.
    pub principal: String,
    /// Exact registered document stream authenticated for an owned Accept. None for Reject or an
    /// explicitly unowned administrative decision. Another device on the same account cannot
    /// infer that it owns ordinary Undo merely from matching `principal`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accepting_writer: Option<String>,
    /// Original final choice, never replaced by a later retry.
    pub decision: SuggestionDecision,
    /// Present only for Accept; does not transfer this effect writer's Undo to the accepting user.
    pub effect: Option<SuggestionEffect>,
}
/// Current explicit state read. Pending proposals have no final decision.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSuggestionEntry {
    /// Immutable original publication.
    pub publication: DocumentSuggestionPublication,
    /// Original final decision, if one has been durably committed.
    pub decision: Option<StoredSuggestionDecision>,
}
/// Durable publication receipt, safe only after append/fsync or exact known retry.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurableDocumentSuggestion {
    /// Authenticated lane binding.
    pub descriptor: DocumentSuggestionsDescriptor,
    /// Original native-validated publication.
    pub publication: DocumentSuggestionPublication,
    /// Known packet retry, without another append or changed original packet bytes.
    pub duplicate: bool,
}
/// Proposal publication never imports its proposed content as document operations.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DocumentSuggestionAdmission {
    /// Durably published or already published.
    Durable(DurableDocumentSuggestion),
    /// Original document history is still client-owned; no publication has been appended.
    Pending {
        /// Required native exclusive document ends.
        missing: Vec<WriterDependency>,
    },
}
/// Original server finalization, returned unchanged even when a later reviewer requested the opposite.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurableSuggestionDecision {
    /// Exact enabled lane.
    pub descriptor: DocumentSuggestionsDescriptor,
    /// Single final decision and its accepted native effect identity.
    pub decision: StoredSuggestionDecision,
    /// An existing finalization won; the requested choice may differ from the returned choice.
    pub duplicate: bool,
}
/// Missing/conflicting targets never become a final decision or acknowledged accepted edit.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DocumentSuggestionDecisionAdmission {
    /// Original durable finalization.
    Durable(Box<DurableSuggestionDecision>),
    /// Retained original source is not yet complete; nothing is appended.
    Pending {
        /// Required native exclusive ends.
        missing: Vec<WriterDependency>,
    },
    /// Original targets changed. The proposal stays pending for explicit revision or Reject.
    Conflict {
        /// Native source dependencies, not guessed replacement offsets.
        targets: Vec<SuggestionConflictTarget>,
    },
}
/// One immutable event in the lane's filtered room-log order.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", content = "data", rename_all = "camelCase")]
pub enum SuggestionUpdate {
    /// A new immutable proposal was published; no accepted document change occurred.
    Published(DocumentSuggestionPublication),
    /// Its single final decision, atomically paired with an effect for Accept.
    Decided(StoredSuggestionDecision),
}
/// Frozen immutable lane interval, not a capability or freely chosen room-log offset.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentSuggestionsCursor {
    /// Exact lane identity.
    pub binding: String,
    /// Last consumed lane event or activation sequence.
    pub after: String,
    /// Frozen terminal event captured at the beginning of paging.
    pub through: String,
}
/// Bounded immutable updates; packet bytes are retrieved separately under current read permission.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSuggestionsPage {
    /// Explicit lane identity.
    pub descriptor: DocumentSuggestionsDescriptor,
    /// Complete ordered publication/decision events, at most 64.
    pub updates: Vec<SuggestionUpdate>,
    /// Advanced frozen event interval.
    pub cursor: DocumentSuggestionsCursor,
    /// More immutable events exist in this interval.
    pub more: bool,
    /// Current capabilities, independent of every historical event's original grant.
    pub permissions: SuggestionPermissions,
}
