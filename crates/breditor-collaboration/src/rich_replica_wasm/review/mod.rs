//! Explicit optional comment lane. Original document views, journals and constructor exports stay closed.
mod batch_receipt;
mod capture_anchor;
mod continue_read_only_review_history;
mod continue_review_history;
mod dispatch_review;
mod enable_continued_review;
mod enable_observer_review_segmented_history;
mod enable_read_only_review_segmented_history;
mod enable_review;
mod enable_review_segmented_history;
mod enable_segmented_review;
mod export_review;
mod read_quote;
mod receive_review;
mod redo_review;
mod review_checkpoint;
mod review_continued_checkpoint;
mod review_segmented_checkpoint;
mod review_view;
mod seal_observer_review_history_generation;
mod seal_read_only_review_history_generation;
mod seal_review_history_generation;
mod set_review_access;
mod undo_review;
mod writer_clock;
use super::{RichReplicaProbe, RichSharedObservation, error};
use crate::{Error, rich_replica::SharedObservation};
use breditor_core::rich_content::review::{
    ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewObservation, ReviewPrincipalId,
    ReviewSession,
};
use serde::{Deserialize, de::DeserializeOwned};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct HostPolicy {
    actor: ReviewActorId,
    principal: ReviewPrincipalId,
    access: String,
}
fn access(value: &str) -> Result<ReviewAccess, JsValue> {
    match value {
        "read_only" => Ok(ReviewAccess::ReadOnly),
        "comment" => Ok(ReviewAccess::Comment),
        "moderate" => Ok(ReviewAccess::Moderate),
        _ => Err(error(Error::Contract("host review access"))),
    }
}
fn policy(input: &str) -> Result<ReviewActorPolicy, JsValue> {
    let host: HostPolicy = decode(input, 2048)?;
    Ok(ReviewActorPolicy {
        actor: host.actor,
        principal: host.principal,
        access: access(&host.access)?,
    })
}
fn decode<T: DeserializeOwned>(input: &str, max: usize) -> Result<T, JsValue> {
    if input.len() > max {
        return Err(error(Error::Limit("review request bytes")));
    }
    serde_json::from_str(input).map_err(error)
}
impl RichReplicaProbe {
    pub(super) fn with_review_observation(
        &self,
        inner: SharedObservation,
    ) -> RichSharedObservation {
        self.initial_read_only.seal();
        RichSharedObservation { inner, review: self.review.as_ref().map(ReviewSession::observe) }
    }
    fn check_review<'a>(
        &self,
        observed: &'a RichSharedObservation,
    ) -> Result<&'a ReviewObservation, JsValue> {
        self.inner.check(&observed.inner).map_err(error)?;
        let review = self
            .review
            .as_ref()
            .ok_or_else(|| error(Error::Contract("explicit review lane required")))?;
        let token = observed
            .review
            .as_ref()
            .ok_or_else(|| error(Error::Contract("observation predates review lane")))?;
        review.check(token).map_err(error)?;
        Ok(token)
    }
}
