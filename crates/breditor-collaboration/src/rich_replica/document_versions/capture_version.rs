//! Capture admitted semantic content without copying writer credentials, Undo or review metadata.
use super::packet::{self, Data, Packet};
use crate::{
    Error,
    rich_replica::{ReviewAnchorTarget, RichReplica, SharedObservation},
};
use breditor_core::rich_content::review::ReviewPrincipalId;
impl RichReplica {
    /// Capture an immutable named version under an exact document observation, including read-only.
    /// The host must authenticate authorship and persist/share the returned content separately.
    /// # Errors
    /// Stale guards, invalid labels/timestamps or the separate 4 MiB envelope budget reject purely.
    pub fn capture_document_version_guarded(
        &self,
        observed: &SharedObservation,
        name: &str,
        author: ReviewPrincipalId,
        created_at_ms: &str,
    ) -> Result<String, Error> {
        self.check(observed)?;
        packet::label(name, created_at_ms)?;
        let data = Data {
            format: "breditor/document-version".into(),
            format_version: 1,
            name: name.into(),
            author,
            created_at_ms: created_at_ms.into(),
            source_anchor_json: self
                .capture_review_anchor_guarded(observed, &ReviewAnchorTarget::Document)?,
            document_json: self.document_json().into(),
        };
        let result = serde_json::to_string(&Packet { id: packet::digest(&data)?, data })?;
        if result.len() > packet::MAX_BYTES {
            return Err(Error::Limit("document version bytes"));
        }
        Ok(result)
    }
}
