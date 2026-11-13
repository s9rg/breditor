//! Explicit revision capability; existing proposal/decision DTOs retain their exact meanings.
use super::super::{
    DocumentSuggestionEntry, DocumentSuggestionPublication, StoredSuggestionDecision,
    SuggestionPermissions,
};
use breditor_collab_feasibility::rich_replica::{DocumentSuggestionRevisionInfo, WriterDependency};
use serde::{Deserialize, Serialize};

/// Separately enabled pending-only revision contract, not an author grant or decision credential.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionRevisionsDescriptor {
    /// Separate revision protocol family.
    pub format: &'static str,
    /// Original immutable revision contract.
    pub format_version: u32,
    /// Exact native document.
    pub document: String,
    /// Independent random revision activation identity.
    pub binding: String,
    /// Exact original proposal/decision lane, whose V1 meanings are unchanged.
    pub suggestion_binding: String,
}
/// Explicit authenticated request; the native envelope has no server credential or binding claim.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SuggestionRevisionRequest {
    /// Exact separately enabled revision descriptor binding.
    pub binding: String,
    /// Existing immutable predecessor, looked up under current reader rights.
    pub previous_suggestion_id: String,
    /// Closed native relation carrying an unchanged V1 replacement packet.
    pub revision_packet: String,
}
/// Original two-record committed supersession, never a second finalization of the predecessor.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSuggestionRevision {
    /// Original proposal at the start of this chain; content is never overwritten in place.
    pub root_suggestion_id: String,
    /// Native immutable relation and same-author replacement identity.
    pub revision: DocumentSuggestionRevisionInfo,
    /// Predecessor's single final not-accepted outcome, attributed to its revising creator.
    pub previous_decision: StoredSuggestionDecision,
    /// Replacement's original publication at the immediately following room-log sequence.
    pub publication: DocumentSuggestionPublication,
}
/// Exact original committed revision, returned unchanged after lost replies or later child decisions.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurableSuggestionRevision {
    /// Separate enabled lane identity, checked independently from descriptive native attribution.
    pub descriptor: SuggestionRevisionsDescriptor,
    /// Original immutable receipt; a duplicate never closes a second predecessor or republishes.
    pub revision: StoredSuggestionRevision,
    /// Exact known revision retry, not necessarily the latest pending chain head.
    pub duplicate: bool,
}
/// A revision cannot overwrite an intervening Accept/Reject or another author's winning revision.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SuggestionRevisionAdmission {
    /// Both the predecessor's final Reject and replacement publication are committed.
    Durable(Box<DurableSuggestionRevision>),
    /// Child source is not durably accepted yet; neither record is appended.
    Pending {
        /// Native required exclusive source ends.
        missing: Vec<WriterDependency>,
    },
    /// Predecessor is already final; nothing was changed or published by this request.
    Conflict {
        /// Original published predecessor and its actual immutable winning decision.
        previous: Box<DocumentSuggestionEntry>,
        /// Original winning revision, if that caused the predecessor to close.
        successor: Option<Box<StoredSuggestionRevision>>,
    },
}
/// Frozen accepted revision interval; arbitrary room-log offsets and other lane bindings reject.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SuggestionRevisionsCursor {
    /// Exact separately activated revision lane.
    pub binding: String,
    /// Last consumed committed revision or this lane's activation sequence.
    pub after: String,
    /// Frozen last committed revision captured when paging started.
    pub through: String,
}
/// Bounded immutable revision discovery; packet bytes and current child state are separate reads.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionRevisionsPage {
    /// Exact enabled revision lane and underlying proposal binding.
    pub descriptor: SuggestionRevisionsDescriptor,
    /// At most 64 original committed relation receipts, in strict commit order.
    pub revisions: Vec<StoredSuggestionRevision>,
    /// Advanced frozen interval.
    pub cursor: SuggestionRevisionsCursor,
    /// More committed relations exist inside this same interval.
    pub more: bool,
    /// Current display rights, not historical event authorization or a future grant.
    pub permissions: SuggestionPermissions,
}
