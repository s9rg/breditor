//! Delete logical ranges through their original source intervals, never through copied text.
use super::index::Index;
use crate::{Error, anchor::event_offset};
use loro::LoroDoc;

/// Delete a logical range, reversing source coordinates so earlier slices cannot shift later ones.
/// # Errors
/// Invalid/half-scalar ranges reject before writing; later engine failures require discarding the staged owner.
pub fn delete(doc: &LoroDoc, block: &str, offset: u32, length: u32) -> Result<(), Error> {
    let mut chunks = Index::read(doc)?.intervals(block, offset, length)?;
    chunks.sort_by(|a, b| (&a.source, a.start).cmp(&(&b.source, b.start)).reverse());
    for chunk in &chunks {
        let text = super::super::model::existing_text(doc, &chunk.source).ok_or(Error::Anchor)?;
        event_offset(&text, chunk.start)?;
        event_offset(&text, chunk.start + chunk.length)?;
    }
    for chunk in chunks {
        super::super::model::existing_text(doc, &chunk.source).ok_or(Error::Anchor)?.delete_utf16(
            usize::try_from(chunk.start).map_err(|_| Error::Offset)?,
            usize::try_from(chunk.length).map_err(|_| Error::Offset)?,
        )?;
    }
    Ok(())
}
