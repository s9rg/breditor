//! Reconstruct only operations belonging to a closed retained cut, not future snapshot containers.
use crate::Error;
use loro::{ExportMode, LoroDoc, VersionVector};

/// Snapshot-at-cut encoding can retain allocated mergeable containers from later history. Their
/// empty handles are not operations at the requested cut and must not make fresh IDs look used.
/// Importing only retained updates into a new arena preserves all original IDs and causal atoms.
pub(super) fn at_vector(source: &LoroDoc, vector: &VersionVector) -> Result<LoroDoc, Error> {
    let applied = source.state_vv();
    if vector.iter().any(|(peer, end)| *end <= 0 || applied.get(peer).copied().unwrap_or(0) < *end)
        || source.frontiers_to_vv(&source.vv_to_frontiers(vector)).as_ref() != Some(vector)
    {
        return Err(Error::Contract("historical operation cut is not applied and closed"));
    }
    super::review_anchor::check_source_cut(source, vector)?;
    let bytes = source.export(ExportMode::updates_till(vector))?;
    let doc = LoroDoc::new();
    super::text_flow::configure(&doc);
    doc.set_record_timestamp(false);
    let status = doc.import(&bytes)?;
    if status.pending.is_some() || doc.state_vv() != *vector || doc.oplog_vv() != *vector {
        return Err(Error::Contract("historical operations differ from requested cut"));
    }
    Ok(doc)
}
