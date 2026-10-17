//! Resolve sparse removal intent from the admitted historical document, without a new wire family.
use super::{
    resolve_range::{NativeResolution, resolve_original_selection},
    source,
};
use crate::{
    Error,
    rich_replica::{RichReplica, actions::MaskedTextSpanV1, selection::Selection},
};
use breditor_core::rich_content::RichDocument;
use loro::LoroDoc;

pub(in crate::rich_replica) fn resolve_source_masked_selection(
    owner: &RichReplica,
    source_doc: &LoroDoc,
    source_document: &RichDocument,
    selection: &Selection,
    spans: &[MaskedTextSpanV1],
) -> Result<NativeResolution, Error> {
    let original = source::capture_masked(source_doc, source_document, selection, spans)?;
    resolve_original_selection(owner, source_doc, source_document, selection, original)
}
