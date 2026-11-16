//! Opt-in review metadata: independent history, explicit authority and immutable causal events.
//!
//! This is not another document tree. Native editor adapters validate durable anchors and
//! own atomic document/review publication. Authenticated hosts supply actor policy separately;
//! restored data never grants permission to author new events.
pub mod actions;
mod batch_admission;
mod causal_births;
mod codec;
mod dispatch_with_clock;
mod event;
mod generation;
mod identity;
mod materialize;
mod recovery_origin;
mod replay;
mod retained_branch;
mod session;
mod thread_history;
mod types;

pub use codec::{
    PreparedReviewBatch, ReviewBatchPreparation, ReviewBatchReceipt, ReviewWriterClock,
};
pub use event::Payload as ReviewThreadHistoryPayload;
pub use identity::{
    ReviewActorId, ReviewEventId, ReviewMessageId, ReviewPrincipalId, ReviewThreadId,
};
pub use retained_branch::PreparedReviewBranch;
pub use session::{ReviewImportOutcome, ReviewObservation, ReviewSession};
pub use thread_history::{ReviewThreadHistoryEntry, ReviewThreadHistoryPage};
pub use types::{
    ReviewAccess, ReviewActorPolicy, ReviewBinding, ReviewError, ReviewMessageView, ReviewOutcome,
    ReviewTextVersion, ReviewThreadState, ReviewThreadView, ReviewView,
};
