//! Pure capture of a directional original-character range without selection or history mutation.
use super::{
    MAX_BYTES,
    packet::{self, Data, Packet},
    source,
};
use crate::{
    Error,
    rich_replica::{ReviewAnchorTarget, RichReplica, SharedObservation, selection::Selection},
};
impl RichReplica {
    /// Capture source-proven text identities across ordinary flow, base cells and captions. This
    /// primitive selects characters only: structural consequences need a separate native planner.
    /// # Errors
    /// Stale guards, non-text scope, invalid scalar boundaries, malformed flows or limits refuse.
    pub fn capture_affine_text_range_guarded(
        &self,
        observed: &SharedObservation,
        selection: &Selection,
    ) -> Result<String, Error> {
        self.check(observed)?;
        if !matches!(selection, Selection::TextRange { .. }) {
            return Err(Error::Contract("affine range requires explicit text selection"));
        }
        source::capture(&self.doc, &self.document, selection)?;
        let data = Data {
            format: "breditor/shared-affine-text-range".into(),
            format_version: 1,
            source_anchor_json: self
                .capture_review_anchor_guarded(observed, &ReviewAnchorTarget::Document)?,
            source_document_digest: packet::document_digest(self.document_json())?,
            selection: selection.clone(),
        };
        let packet = Packet { id: packet::digest(&data)?, data };
        let encoded = serde_json::to_string(&packet)?;
        if encoded.len() > MAX_BYTES {
            return Err(Error::Limit("affine range packet bytes"));
        }
        Ok(encoded)
    }
}
