//! Apply typed formats to all original source intervals of a logical range.
use super::index::Index;
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde_json::Value;

/// Own one format over a logical range without replacing text or its routing markers.
///
/// The coordinator must first admit this literal against the active schema.
/// # Errors
/// Rejects empty/invalid scalar ranges; engine failures require discarding the staged owner.
pub fn set_format(
    doc: &LoroDoc,
    block: &str,
    offset: u32,
    length: u32,
    format: Value,
    enabled: bool,
) -> Result<(), Error> {
    if length == 0 {
        return Err(Error::Contract("empty text-flow format range"));
    }
    let chunks = Index::read(doc)?.intervals(block, offset, length)?;
    let stamp = Stamp::next(doc)?;
    let annotation = super::super::text::Annotation { format, enabled };
    for chunk in chunks {
        super::super::text::mark(
            doc,
            &chunk.source,
            chunk.start,
            chunk.length,
            &annotation,
            stamp,
            0,
        )?;
    }
    Ok(())
}
