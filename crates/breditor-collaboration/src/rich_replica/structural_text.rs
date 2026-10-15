//! Writer-owned style removal preserves source identity and selective Undo.
use crate::{Error, register::Stamp};
use loro::LoroDoc;

/// Disable each observed effective annotation, not the underlying foreign slot.
/// Projection alone is insufficient: styles must not resurrect on later prose conversion.
pub(super) fn remove_observed_formats(
    doc: &LoroDoc,
    block: &str,
    stamp: Stamp,
) -> Result<(), Error> {
    let chunks = super::text_flow::view(doc, block)?.chunks;
    let mut ordinal = 0usize;
    for chunk in chunks {
        for format in chunk.formats {
            if ordinal > 100_000 {
                return Err(Error::Limit("shared code format removals"));
            }
            super::text::mark(
                doc,
                &chunk.source,
                chunk.start,
                chunk.length,
                &super::text::Annotation { format, enabled: false },
                stamp,
                ordinal,
            )?;
            ordinal += 1;
        }
    }
    Ok(())
}
