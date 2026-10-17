//! Internal bridge from a natively admitted historical intent, never caller-provided scalar IDs.
use super::{
    AffineTextRangeResolution,
    packet::{self, Data, Packet},
};
use crate::{
    Error,
    rich_replica::{RichReplica, selection::Selection},
};

pub(in crate::rich_replica) fn resolve_source_selection(
    owner: &RichReplica,
    source_anchor_json: &str,
    source_canonical: &str,
    selection: Selection,
) -> Result<AffineTextRangeResolution, Error> {
    let data = Data {
        format: "breditor/shared-affine-text-range".into(),
        format_version: 1,
        source_anchor_json: source_anchor_json.into(),
        source_document_digest: packet::document_digest(source_canonical)?,
        selection,
    };
    // The public resolver re-proves the original document and coordinates at this exact cut.
    // No private resolved segments or supplied witnesses can bypass that proof.
    let packet = Packet { id: packet::digest(&data)?, data };
    owner.resolve_affine_text_range(&serde_json::to_string(&packet)?)
}
