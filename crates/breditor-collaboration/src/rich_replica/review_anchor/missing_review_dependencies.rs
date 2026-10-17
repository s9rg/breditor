//! Pure causal requirements for server admission; no document operations are imported from a comment.
use super::packet::{MAX_BYTES, Packet};
use crate::{
    Error,
    rich_replica::{RichReplica, WriterDependency},
};
impl RichReplica {
    /// Read missing accepted-document dependencies after complete anchor binding/encoding checks.
    /// A relay must defer acceptance until these exist, rather than acknowledging an unreachable target.
    /// Client catchup may still retain valid pending anchors through its separate receive API.
    /// # Errors
    /// Wrong document/profile/engine, malformed cursors/clocks or budgets reject purely.
    pub fn review_anchor_missing_dependencies(
        &self,
        input: &str,
    ) -> Result<Vec<WriterDependency>, Error> {
        if input.len() > MAX_BYTES {
            return Err(Error::Limit("review anchor bytes"));
        }
        let packet: Packet = serde_json::from_str(input)?;
        packet.missing(self)
    }
}
