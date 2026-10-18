//! Certified physical-coordinate lowering for an entirely plain birth source.
//!
//! A search group visits original ranges in descending order. If a block's
//! complete visible body is its own contiguous birth source and the raw source
//! has only provenance attributes, lower ranges keep their original physical
//! coordinates. No fragment or format resolution is needed between splices.
//! Every other source uses the ordinary logical text-flow implementation.
//!
//! This is a disposable-group optimization, not a saved recipe or public API.
//! It never rewrites unmatched characters and uses the same provenance marks,
//! insertion chunks and commits as ordinary plain insertion.
use super::{graph, index::Index, provenance};
use crate::{Error, anchor::event_offset, register::Stamp};
use loro::{LoroDoc, LoroText, TextDelta};
use std::{
    collections::{BTreeMap, BTreeSet},
    ops::Range,
};

pub(in crate::rich_replica) struct PlainSearchSplices {
    sources: BTreeMap<String, (LoroText, u32)>,
}

impl PlainSearchSplices {
    pub(in crate::rich_replica) fn capture<'a>(
        doc: &LoroDoc,
        blocks: impl IntoIterator<Item = &'a str>,
    ) -> Result<Self, Error> {
        let index = Index::read(doc)?;
        let mut sources = BTreeMap::new();
        for block in blocks.into_iter().collect::<BTreeSet<_>>() {
            let view = index.view(block)?;
            let text = super::super::model::existing_text(doc, block).ok_or(Error::Anchor)?;
            let mut position = 0u32;
            let plain = view.owner == block
                && view.chunks.iter().all(|chunk| {
                    let start = position;
                    position += chunk.length;
                    chunk.source == block
                        && chunk.fragment == graph::birth(block)
                        && chunk.start == start
                        && chunk.formats.is_empty()
                });
            if !plain
                || position == 0
                || usize::try_from(position).map_err(|_| Error::Offset)? != text.len_utf16()
            {
                continue;
            }
            // Visible empty formats are insufficient: a disabled format or
            // observed routing marker could still be inherited by new text.
            let plain_attributes = text.to_delta().into_iter().all(|run| match run {
                TextDelta::Insert { attributes, .. } => {
                    attributes.unwrap_or_default().keys().all(|key| provenance::internal(key))
                }
                _ => false,
            });
            if plain_attributes {
                sources.insert(block.into(), (text, position));
            }
        }
        Ok(Self { sources })
    }

    /// Return false without writing when this block needs logical lowering.
    /// The caller must use this only for format-free inserted text, in descending
    /// original range order, without any intervening edits to the staged engine.
    pub(in crate::rich_replica) fn replace(
        &mut self,
        doc: &LoroDoc,
        block: &str,
        range: Range<u32>,
        content: &str,
    ) -> Result<bool, Error> {
        let Some((text, next_end)) = self.sources.get_mut(block) else { return Ok(false) };
        if range.start > range.end || range.end > *next_end {
            return Err(Error::Contract("plain search descending original range"));
        }
        // Ordinary insertion into an empty body owns its empty fragment, not
        // the birth fragment. Preserve that exact routing/activation stream.
        if range.start == 0
            && usize::try_from(range.end).map_err(|_| Error::Offset)? == text.len_utf16()
            && !content.is_empty()
        {
            self.sources.remove(block);
            return Ok(false);
        }
        event_offset(text, range.start)?;
        event_offset(text, range.end)?;
        if range.start != range.end {
            text.delete_utf16(
                usize::try_from(range.start).map_err(|_| Error::Offset)?,
                usize::try_from(range.end - range.start).map_err(|_| Error::Offset)?,
            )?;
        }
        doc.commit();
        let mut offset = range.start;
        let mut remaining = content;
        while !remaining.is_empty() {
            let mut end = remaining.len().min(64 * 1024);
            while !remaining.is_char_boundary(end) {
                end -= 1;
            }
            let chunk = &remaining[..end];
            let stamp = Stamp::next(doc)?;
            text.insert_utf16(usize::try_from(offset).map_err(|_| Error::Offset)?, chunk)?;
            let length = u32::try_from(chunk.encode_utf16().count()).map_err(|_| Error::Offset)?;
            provenance::mark(text, offset, length, None, stamp)?;
            doc.commit();
            offset = offset.checked_add(length).ok_or(Error::Offset)?;
            remaining = &remaining[end..];
        }
        *next_end = range.start;
        Ok(true)
    }
}
