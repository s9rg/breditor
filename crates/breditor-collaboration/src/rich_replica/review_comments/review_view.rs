//! Native comment projection with strict live target resolution, not a browser materializer.
use super::{Error, ReviewAnchorResolution, ReviewSession, RichReplica};
use crate::rich_replica::SharedObservation;
use breditor_core::rich_content::review::ReviewThreadView;
use serde::Serialize;
/// One retained native anchor with its current engine-derived status.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedReviewAnchor {
    /// Original opaque packet; retain it even while its target is pending or orphaned.
    pub packet: String,
    /// Exact target, pending dependency or explicit orphan reason.
    pub resolution: ReviewAnchorResolution,
}
/// Discussion and every concurrent anchor value, with no inferred replacement target.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedReviewThread {
    /// Native attributed metadata projection.
    pub thread: ReviewThreadView,
    /// Backend-resolved targets in the same order as the metadata anchor register.
    pub targets: Vec<ResolvedReviewAnchor>,
}
/// Document-bound native comments and an independent history lane.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedReviewView {
    /// All retained discussions, including hidden, conflicted and orphaned records.
    pub threads: Vec<ResolvedReviewThread>,
    /// This review writer's Undo depth, independent of accepted edits.
    pub undo_depth: usize,
    /// This review writer's Redo depth, independent of accepted edits.
    pub redo_depth: usize,
}
impl RichReplica {
    /// Read comments and current strict native targets without mutating either owner.
    /// # Errors
    /// A stale document guard, mismatched binding or invalid retained native anchor rejects.
    pub fn review_view_guarded(
        &self,
        observed: &SharedObservation,
        review: &ReviewSession,
    ) -> Result<ResolvedReviewView, Error> {
        self.check(observed)?;
        self.check_review_session(review)?;
        let view = review.view()?;
        let threads = view
            .threads
            .into_iter()
            .map(|thread| {
                let targets = thread
                    .anchors
                    .iter()
                    .map(|packet| {
                        Ok(ResolvedReviewAnchor {
                            packet: packet.clone(),
                            resolution: self.resolve_review_anchor(packet)?,
                        })
                    })
                    .collect::<Result<Vec<_>, Error>>()?;
                Ok(ResolvedReviewThread { thread, targets })
            })
            .collect::<Result<Vec<_>, Error>>()?;
        Ok(ResolvedReviewView { threads, undo_depth: view.undo_depth, redo_depth: view.redo_depth })
    }
}
