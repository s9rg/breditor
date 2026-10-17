//! One native flow index per traversal; original scalar identities never use text matching.
use super::index::Index;
use crate::{Error, anchor::event_offset};
use loro::{
    LoroDoc,
    cursor::{Cursor, Side},
};
use serde_json::Value;

pub(in crate::rich_replica) struct Scalar<'a> {
    pub block: &'a str,
    pub offset: u32,
    pub identity: Vec<u8>,
    pub character: char,
    pub formats: &'a [Value],
}
pub(in crate::rich_replica) fn visit_scalars(
    doc: &LoroDoc,
    blocks: &[(String, bool)],
    mut visit: impl FnMut(Scalar<'_>) -> Result<(), Error>,
) -> Result<(), Error> {
    let index = Index::read(doc)?;
    let mut total = 0usize;
    for (block, empty) in blocks {
        if *empty
            && block.starts_with(super::super::model::VIRTUAL_PREFIX)
            && !super::prepared(doc, block)
            && super::super::model::existing_text(doc, block)
                .is_none_or(|text| text.len_unicode() == 0)
        {
            continue;
        }
        let view = index.view(block)?;
        if view.owner != *block {
            return Err(Error::Contract("affine duplicate projected text owner"));
        }
        let mut logical = 0u32;
        for chunk in view.chunks {
            let text =
                super::super::model::existing_text(doc, &chunk.source).ok_or(Error::Anchor)?;
            let mut offset = chunk.start;
            for character in chunk.text.chars() {
                total += 1;
                if total > 4 * 1024 * 1024 {
                    return Err(Error::Limit("affine visited scalars"));
                }
                let cursor = text
                    .get_cursor(event_offset(&text, offset)?, Side::Middle)
                    .ok_or(Error::Anchor)?;
                if cursor.id.is_none() {
                    return Err(Error::Contract("affine scalar identity"));
                }
                visit(Scalar {
                    block,
                    offset: logical,
                    // Engine cursor bytes also contain an origin-position hint in this pinned
                    // implementation. Character identity must not change when that hint moves.
                    identity: Cursor::new(cursor.id, cursor.container, Side::Middle, 0).encode(),
                    character,
                    formats: &chunk.formats,
                })?;
                let width = u32::try_from(character.len_utf16()).map_err(|_| Error::Offset)?;
                logical = logical.checked_add(width).ok_or(Error::Offset)?;
                offset = offset.checked_add(width).ok_or(Error::Offset)?;
            }
        }
    }
    Ok(())
}
