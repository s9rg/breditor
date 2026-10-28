//! Detached original acceptance rights. Current account roles are not historical authority.
use super::super::{ReviewDescriptor, ReviewSource};
use breditor_collab_feasibility::review::{ReviewActorId, ReviewPrincipalId};
use serde::{Deserialize, Serialize};

/// One positive inclusive native actor range, selected independently of an incoming checkpoint.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewOriginalAuthorizationRange {
    /// Registered review actor, not a document writer.
    pub actor: ReviewActorId,
    /// Original account bound to this actor.
    pub principal: ReviewPrincipalId,
    /// Inclusive positive canonical decimal event counter.
    pub from: String,
    /// Inclusive positive canonical decimal event counter.
    pub through: String,
}
/// Exact original role over a contiguous accepted range, with a native lineage witness.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewOriginalAuthorizationWindow {
    /// First durable acceptance authority; later overlapping batches cannot upgrade it.
    pub source: ReviewSource,
    /// Inclusive positive canonical decimal event counter.
    pub from: String,
    /// Inclusive positive canonical decimal event counter.
    pub through: String,
    /// Native actor prefix at through, including document and account binding.
    pub prefix_digest: String,
}
/// Why a requested original range cannot be authenticated at the selected server cut.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ReviewOriginalAuthorizationPendingReason {
    /// The actor is not registered at this cut; do not infer its account or role.
    UnknownActor,
    /// A permanent observer cannot supply an authored event range.
    Observer,
    /// Some requested events remain unaccepted offline input.
    Unaccepted,
}
/// An unresolved whole range. Accepted prefixes never authorize an unknown suffix.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewOriginalAuthorizationPending {
    /// Original requested range, without silently shortening its end.
    pub range: ReviewOriginalAuthorizationRange,
    /// Current accepted native head, or zero for an unknown actor.
    pub accepted_through: String,
    /// Explicit unresolved condition.
    pub reason: ReviewOriginalAuthorizationPendingReason,
}
/// Whole-request status, not a source owner, reusable permission or serving grant.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ReviewOriginalAuthorizationStatus {
    /// Every requested event has original native acceptance and lineage.
    Covered,
    /// At least one range is unresolved; windows is deliberately empty.
    Pending,
}
/// Original accepted rights for every requested range, without changing any native lane.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewOriginalAuthorizationRead {
    /// Closed family, breditor/relay-review-original-authorizations.
    pub format: &'static str,
    /// Closed revision, currently one.
    pub format_version: u32,
    /// Exact durable review namespace, independently selected by the host.
    pub descriptor: ReviewDescriptor,
    /// Exact complete ordered request; no missing range is omitted.
    pub ranges: Vec<ReviewOriginalAuthorizationRange>,
    /// Whole-request coverage.
    pub kind: ReviewOriginalAuthorizationStatus,
    /// Complete role windows only when covered; always empty when pending.
    pub windows: Vec<ReviewOriginalAuthorizationWindow>,
    /// All unresolved requested ranges, without partial authorization.
    pub pending: Vec<ReviewOriginalAuthorizationPending>,
}
