//! Closed metadata and view types. Permissions are live host policy, never checkpoint authority.
use super::{ReviewActorId, ReviewEventId, ReviewMessageId, ReviewPrincipalId, ReviewThreadId};
use crate::{rich_content::DocumentId, schema::SchemaFingerprint};
use serde::{Deserialize, Serialize};

/// A native review contract failure without arbitrary user text in its diagnostic.
#[derive(Debug, thiserror::Error)]
pub enum ReviewError {
    /// An identity or exact counter is malformed.
    #[error("invalid review identity")]
    Identity,
    /// Another owner or an older publication was supplied.
    #[error("stale or foreign review observation")]
    Stale,
    /// The live authenticated host policy does not permit this action.
    #[error("review action not permitted")]
    Permission,
    /// A closed request, dependency, target or recovery invariant is invalid.
    #[error("invalid review contract: {0}")]
    Contract(&'static str),
    /// A bounded metadata resource limit was reached.
    #[error("review resource limit: {0}")]
    Limit(&'static str),
    /// A writer attempted to alter an already identified immutable event.
    #[error("review writer history fork")]
    Fork,
    /// An input would extend this owner's exclusively retained writer.
    #[error("review update extends locally owned writer")]
    WriterCollision,
    /// The input is not a closed review envelope.
    #[error("invalid review JSON")]
    Json,
}
impl From<serde_json::Error> for ReviewError {
    fn from(_: serde_json::Error) -> Self {
        Self::Json
    }
}

/// Exact document/schema binding for a separate review sidecar.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ReviewBinding {
    pub(super) document: String,
    pub(super) schema_fingerprint: String,
}
impl ReviewBinding {
    /// Bind to admitted native identities; this is not an account or room authorization.
    #[must_use]
    pub fn new(document: &DocumentId, fingerprint: SchemaFingerprint) -> Self {
        Self { document: document.as_str().into(), schema_fingerprint: fingerprint.to_string() }
    }
    pub(super) fn validate(&self) -> Result<(), ReviewError> {
        DocumentId::try_new(&self.document).map_err(|_| ReviewError::Identity)?;
        self.schema_fingerprint
            .parse::<SchemaFingerprint>()
            .map_err(|_| ReviewError::Contract("schema fingerprint"))?;
        Ok(())
    }
}
/// Host-verified capabilities for newly admitted actions, not claims read from review content.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReviewAccess {
    /// Reads and synchronization only.
    ReadOnly,
    /// Create/reply, edit own messages, and resolve/reopen threads.
    Comment,
    /// Also edit/retract other authors' messages and reanchor their threads, with attribution.
    Moderate,
}
/// Live admission authority supplied by the authenticated host outside serialized data.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReviewActorPolicy {
    /// Durably exclusive operation writer.
    pub actor: ReviewActorId,
    /// Exact authenticated account identity, not a display name.
    pub principal: ReviewPrincipalId,
    /// Host-verified rights for this admission; old receipts require their verified historical grant.
    pub access: ReviewAccess,
}
/// One newly authored original action or history visibility operation.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", content = "event", rename_all = "snake_case")]
pub enum ReviewOutcome {
    /// No content, history or observation token changed.
    Unchanged,
    /// One immutable review event was admitted.
    Committed(ReviewEventId),
}
/// A causal message value; concurrent versions remain distinct instead of silently overwriting.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewTextVersion {
    /// Operation that authored this value.
    pub event: ReviewEventId,
    /// Actual author/editor, including a moderator when different from the message creator.
    pub principal: ReviewPrincipalId,
    /// Plain text, or an explicit retraction. Input is never interpreted as HTML.
    pub text: Option<String>,
}
/// Independent current resolution state, including concurrent opposing decisions.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewThreadState {
    /// No active resolve or an observed reopen.
    Open,
    /// All remaining causal heads agree on resolved.
    Resolved,
    /// Concurrent open and resolved heads need an explicit new decision.
    Conflicted,
}
/// Materialized message without granting any authoring authority.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewMessageView {
    /// Immutable birth identity.
    pub id: ReviewMessageId,
    /// Original message author.
    pub author: ReviewPrincipalId,
    /// Every concurrent current body/retraction, in deterministic event order.
    pub versions: Vec<ReviewTextVersion>,
}
/// One discussion; anchor resolution remains the native document owner's responsibility.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewThreadView {
    /// Immutable thread birth.
    pub id: ReviewThreadId,
    /// Original creator.
    pub author: ReviewPrincipalId,
    /// Current concurrent opaque native anchors. They contain content, not log-safe diagnostics.
    pub anchors: Vec<String>,
    /// Independent resolution register.
    pub state: ReviewThreadState,
    /// Causally materialized messages, including explicit retractions.
    pub messages: Vec<ReviewMessageView>,
    /// No active visible message remains; history and peer replies are never deleted implicitly.
    pub hidden: bool,
}
/// Read-only review projection, separate from accepted document content and document Undo.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewView {
    /// All retained discussions in deterministic birth order.
    pub threads: Vec<ReviewThreadView>,
    /// This owner's currently undoable original review contributions.
    pub undo_depth: usize,
    /// This owner's currently redoable review contributions.
    pub redo_depth: usize,
}
