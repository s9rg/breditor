//! Retain minimal admitted causal input in explicit semantic history, not cumulative transport echoes.
use super::RichReplica;
use crate::Error;
use loro::{ExportMode, LoroDoc, VersionVector};

impl RichReplica {
    /// Called only after staged native import. Original replay preserves its exact input bytes.
    /// Semantic replay records new operations in the existing Remote byte record. If any source
    /// operation remains causally pending, retain the original blob so later dependencies can
    /// still complete it. An entirely known, fully admitted blob is an exact no-op: do not add
    /// a publication, cursor change, typing boundary or journal record for a transport echo.
    /// This changes no stored family, record grammar, remote authorization or resource ceiling.
    pub(super) fn semantic_remote_record_v1(
        &self,
        before: &VersionVector,
        applied_before: &VersionVector,
        pending: bool,
        original: Vec<u8>,
    ) -> Result<Option<Vec<u8>>, Error> {
        if !self.general_ranges_enabled() || pending {
            return Ok(Some(original));
        }
        let metadata = LoroDoc::decode_import_blob_meta(&original, true)?;
        let after = self.doc.oplog_vv();
        let applied = self.doc.state_vv();
        if metadata
            .partial_end_vv
            .iter()
            .any(|(writer, end)| applied.get(writer).copied().unwrap_or(0) < *end)
        {
            return Ok(Some(original));
        }
        if *before == after && *applied_before == applied {
            return Ok(None);
        }
        let delta = self.doc.export(ExportMode::updates(before))?;
        if delta.is_empty() {
            return Err(Error::Contract("nonempty admitted remote delta"));
        }
        // The original already passed the unchanged update budget. Never expand a
        // valid input or add a tighter incidental limit through re-encoding.
        Ok(Some(if delta.len() < original.len() { delta } else { original }))
    }
}
