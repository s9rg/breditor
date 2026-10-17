//! Capture one explicit durable target under the current native observation, without publication.
use super::{
    ReviewAnchorTarget,
    packet::{Anchors, MAX_BYTES, Packet},
};
use crate::{
    Error,
    rich_replica::{RichReplica, SharedObservation, selection::Selection, text_flow::FlowAnchor},
};

impl RichReplica {
    /// Capture a bounded durable review anchor without changing selection, document or history.
    /// Read-only hosts may capture targets; this does not grant permission to create a comment.
    /// # Errors
    /// Stale/foreign observations, invalid scalar coordinates, unavailable targets or budgets reject.
    pub fn capture_review_anchor_guarded(
        &self,
        observation: &SharedObservation,
        target: &ReviewAnchorTarget,
    ) -> Result<String, Error> {
        self.check(observation)?;
        let anchors = match target {
            ReviewAnchorTarget::Document => Anchors::Document,
            ReviewAnchorTarget::Selection(selection) => {
                selection.admit(&self.document)?;
                match selection {
                    Selection::TextRange { anchor, focus } => Anchors::Text {
                        anchor: Box::new(FlowAnchor::capture(
                            &self.doc,
                            &anchor.block,
                            anchor.offset,
                            anchor.affinity,
                        )?),
                        focus: Box::new(FlowAnchor::capture(
                            &self.doc,
                            &focus.block,
                            focus.offset,
                            focus.affinity,
                        )?),
                        was_range: anchor.block != focus.block || anchor.offset != focus.offset,
                    },
                    Selection::Node { block } => Anchors::Node { block: block.clone() },
                    Selection::Grid { anchor, focus } => {
                        Anchors::Grid { anchor: anchor.clone(), focus: focus.clone() }
                    }
                }
            }
        };
        let packet = Packet::capture(self, anchors);
        packet.ready(self)?;
        let json = serde_json::to_string(&packet)?;
        if json.len() > MAX_BYTES {
            return Err(Error::Limit("review anchor bytes"));
        }
        Ok(json)
    }
}
