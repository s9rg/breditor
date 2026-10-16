//! Pure, bounded external-adapter admission through the existing node record grammar.
//!
//! No new persisted document or clipboard protocol is introduced. Foreign markup
//! parsers provide only a neutral root; native validation supplies the receiving
//! schema proof. Copy/paste history, identity allocation and asset resolution stay
//! outside this construction boundary.

use super::{
    DocumentV2CodecError, JsonFailure, RichClipboardCodecError, document_json::RecordBuilder,
    document_preflight::preflight_document_root,
};
use crate::{
    document::Document,
    record::NodeRecordV1,
    rich_content::{RichClipboardFragment, RichClipboardKind},
    state::EditorContext,
};

pub(super) fn admit_root(
    context: &EditorContext,
    maximum: usize,
    kind: RichClipboardKind,
    root_json: &str,
) -> Result<RichClipboardFragment, RichClipboardCodecError> {
    if root_json.len() > maximum || root_json.len() > context.limits().max_json_bytes() {
        return Err(RichClipboardCodecError::Limit);
    }
    // Perform allocation preflight before deserializing owned strings/vectors.
    // Keep serde's unchanged recursion ceiling as another independent limit.
    preflight_document_root(root_json, context.limits())
        .map_err(|error| JsonFailure::from_serde(&error))?;
    let record: NodeRecordV1 =
        serde_json::from_str(root_json).map_err(|error| JsonFailure::from_serde(&error))?;
    let root = RecordBuilder::new().build_root(&record).map_err(DocumentV2CodecError::from)?;
    let document = Document::try_new(context.schema(), root, context.limits())
        .map_err(DocumentV2CodecError::from)?;
    let fragment = RichClipboardFragment::try_admit(context, kind, document)?;
    // Admission also guarantees the complete fingerprint-bearing envelope fits,
    // not just its input root. Do not return a fragment that cannot be copied.
    super::RichClipboardJsonCodec::new(context.clone())
        .with_max_json_bytes(maximum)
        .encode(&fragment)?;
    Ok(fragment)
}
