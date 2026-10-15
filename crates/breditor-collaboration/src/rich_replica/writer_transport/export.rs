//! Bounded read-only export of complete authored windows, excluding remote authors and local UI.
use super::{
    super::{RichReplica, SharedObservation, session::writer_id},
    digest, frame,
};
use crate::Error;
use serde::Serialize;
/// Applied single-writer head and canonical operation lineage; not an authorization credential.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriterClock {
    /// Exact writer identity.
    pub writer: String,
    /// Applied exclusive counter end.
    pub through: String,
    /// Canonical history digest through this end.
    pub prefix_digest: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Batch {
    format: &'static str,
    format_version: u32,
    writer: String,
    from: String,
    through: String,
    has_more: bool,
    groups: Vec<String>,
}
impl RichReplica {
    /// Inspect an applied author's exact head without changing content, history or observations.
    /// # Errors
    /// Rejects a noncanonical writer or serialization failure.
    pub fn writer_clock(&self, writer: &str) -> Result<WriterClock, Error> {
        let id = writer_id(writer)?;
        let through = self.doc.state_vv().get(&id).copied().unwrap_or(0);
        Ok(WriterClock {
            writer: writer.into(),
            through: through.to_string(),
            prefix_digest: digest::operations(self, id, 0, through)?,
        })
    }
    /// Export complete local action/Undo/Redo groups from a previously acknowledged boundary.
    ///
    /// Opaque group strings retain strict inner JSON decoding. Genesis is explicitly tagged
    /// for a separate room-creation handshake; an existing relay does not admit another seed.
    /// # Errors
    /// A stale observation rejects first. Mid-group, future or over-budget cursors reject
    /// without changing the owner. Batches cap 64 groups and 8 MiB, with explicit continuation.
    pub fn writer_groups_guarded(
        &self,
        observation: &SharedObservation,
        after: &str,
    ) -> Result<String, Error> {
        self.check(observation)?;
        let from = frame::counter(after)?;
        let writer = writer_id(self.writer())?;
        let current = self.doc.state_vv().get(&writer).copied().unwrap_or(0);
        let start = if from == current {
            self.writer_windows.len()
        } else {
            self.writer_windows
                .iter()
                .position(|w| w.from == from)
                .ok_or(Error::Contract("shared writer group boundary"))?
        };
        let mut groups = Vec::new();
        let mut bytes = 1024usize;
        let mut through = from;
        let mut index = start;
        for window in self.writer_windows.iter().skip(start).take(super::MAX_GROUPS) {
            let json = frame::encode(self, window)?;
            let encoded = serde_json::to_string(&json)?.len() + 1;
            if bytes + encoded > super::MAX_BATCH_BYTES {
                break;
            }
            bytes += encoded;
            through = window.through;
            groups.push(json);
            index += 1;
        }
        if index == start && index < self.writer_windows.len() {
            return Err(Error::Limit("shared writer batch bytes"));
        }
        let batch = Batch {
            format: "breditor/shared-writer-groups",
            format_version: 1,
            writer: self.writer().into(),
            from: from.to_string(),
            through: through.to_string(),
            has_more: index < self.writer_windows.len(),
            groups,
        };
        let json = serde_json::to_string(&batch)?;
        if json.len() > super::MAX_BATCH_BYTES {
            return Err(Error::Limit("shared writer batch bytes"));
        }
        Ok(json)
    }
}
