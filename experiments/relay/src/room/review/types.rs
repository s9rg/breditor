//! Closed service DTOs; leases and cursors are separate from portable metadata checkpoints.
use breditor_collab_feasibility::{
    review::{ReviewAccess, ReviewActorId, ReviewBatchReceipt, ReviewEventId, ReviewPrincipalId},
    rich_replica::WriterDependency,
};
use serde::{Deserialize, Serialize};

/// Comment capabilities independent of document Reader/Editor roles.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReviewRole {
    /// Create/reply, edit own messages, resolve/reopen; cannot edit another author's message.
    Comment,
    /// Also moderate other authors' messages and discussion anchors, with native attribution.
    Moderator,
}
impl ReviewRole {
    pub(super) const fn access(self) -> ReviewAccess {
        match self {
            Self::Comment => ReviewAccess::Comment,
            Self::Moderator => ReviewAccess::Moderate,
        }
    }
}
/// Historical admission authority derived by the server at this exact durable sequence.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewSource {
    /// Registered exclusive metadata actor, not a document writer.
    pub actor: ReviewActorId,
    /// Authenticated account, not the payload's display label.
    pub principal: ReviewPrincipalId,
    /// Original verified rights; revocation does not erase accepted historical contributions.
    pub role: ReviewRole,
}
/// Ephemeral metadata connection fence. Never place this in portable document/review recovery.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewLease {
    /// Registered review writer.
    pub actor: ReviewActorId,
    /// Random active fence; resume/revocation/restart invalidates the old one.
    pub token: String,
}
/// Registration secret must be saved separately before the client authors with this actor.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRegistration {
    /// Active initial lease.
    pub lease: ReviewLease,
    /// Account-bound opaque resume credential, shown only at allocation.
    pub credential: String,
}
/// Receipt sent only AFTER the server has synced acceptance to its private durable log.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurableReviewReceipt {
    /// Original durable sequence that first accepted the supplied terminal event.
    pub sequence: String,
    /// Canonical exact supplied batch, with inclusive positive event counters.
    pub receipt: ReviewBatchReceipt,
    /// No new record was appended for an all-known batch.
    pub duplicate: bool,
}
/// Empty or pending review submissions are never durable acknowledgements.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ReviewAdmission {
    /// Durably accepted or exact canonical already-accepted events.
    Durable(DurableReviewReceipt),
    /// No events supplied; no receipt or publication.
    Empty,
    /// Missing causal review events; original batch stays client-owned for retry.
    Pending {
        /// Native causal event heads needed before admission.
        missing: Vec<ReviewEventId>,
    },
    /// The comment references document edits this host has not accepted yet.
    PendingDocument {
        /// Native document operation dependencies, using their existing exclusive ends.
        missing: Vec<WriterDependency>,
    },
}
/// Public lane identity, not a secret and not interchangeable with document identity alone.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewDescriptor {
    /// Explicit opt-in wire family.
    pub format: &'static str,
    /// Exact metadata transport version.
    pub format_version: u32,
    /// Random durable log binding prevents reusing progress from an identical separate seed.
    pub binding: String,
}
/// Resume cursor pinned to one durable metadata log. It is progress, never account authority.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewCursor {
    /// Exact authenticated descriptor binding.
    pub binding: String,
    /// Last consumed durable review sequence (canonical unsigned decimal).
    pub after: String,
}
/// One original ordered server acceptance, including its original independently verified grant.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredReviewBatch {
    /// Original durable record sequence.
    pub sequence: String,
    /// Server-verified historical source, not authority claimed by the frame.
    pub source: ReviewSource,
    /// Closed native single-actor metadata frame.
    pub frame: String,
    /// Regenerated during recovery; replay rejects mismatch.
    pub receipt: ReviewBatchReceipt,
}
/// Bounded ordered page; persist paired native state before persisting this cursor.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCatchup {
    /// Explicit authenticated lane identity.
    pub descriptor: ReviewDescriptor,
    /// Exact cursor through the returned complete events.
    pub cursor: ReviewCursor,
    /// More batches existed at the moment this serialized page was read.
    pub more: bool,
    /// Original acceptance order; never arbitrary full-state imports or invented role grants.
    pub batches: Vec<StoredReviewBatch>,
    /// Current account capability, separate from every original historical source grant.
    pub current_role: Option<ReviewRole>,
}
/// Proof that a restored cursor does not skip missing or divergent native metadata prefixes.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCursorProof {
    /// Exact durable log and accepted review sequence.
    pub cursor: ReviewCursor,
    /// One canonical accepted prefix per actor through this sequence, including source principal.
    pub prefixes: Vec<ReviewPrefixProof>,
}
/// Historical accepted actor prefix; independent of the account's current access.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewPrefixProof {
    /// Account bound to the registered exclusive actor.
    pub principal: ReviewPrincipalId,
    /// Canonical native prefix, never a browser-reconstructed hash.
    pub clock: breditor_collab_feasibility::review::ReviewWriterClock,
}
