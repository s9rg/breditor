//! Opt-in review metadata: independent history, explicit authority and immutable causal events.
//!
//! This is not another document tree. Native editor adapters validate durable anchors and
//! own atomic document/review publication. Authenticated hosts supply actor policy separately;
//! restored data never grants permission to author new events.
pub mod actions;
mod codec;
mod event;
mod identity;
mod materialize;
mod recovery_origin;
mod session;
mod types;

pub use codec::{
    PreparedReviewBatch, ReviewBatchPreparation, ReviewBatchReceipt, ReviewWriterClock,
};
pub use identity::{
    ReviewActorId, ReviewEventId, ReviewMessageId, ReviewPrincipalId, ReviewThreadId,
};
pub use session::{ReviewImportOutcome, ReviewObservation, ReviewSession};
pub use types::{
    ReviewAccess, ReviewActorPolicy, ReviewBinding, ReviewError, ReviewMessageView, ReviewOutcome,
    ReviewTextVersion, ReviewThreadState, ReviewThreadView, ReviewView,
};
