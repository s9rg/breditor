//! Stable character cursors survive fragment splits, subtree joins and reordering.
use super::{Point, index::Index};
use crate::{
    Error,
    anchor::{Affinity, TextAnchor},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// A text-flow selection anchor with separate logical, source and fragment identities.
///
/// This is part of the private shared journal V5. Browser read selections expose
/// admitted logical block coordinates; sources and fragment identities stay Rust-owned.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FlowAnchor {
    pub(super) point: Point,
    pub(super) anchor: TextAnchor,
    pub(super) end_binding: Option<TextAnchor>,
    seen: BTreeMap<String, String>,
}
impl FlowAnchor {
    /// Capture a scalar-aligned source cursor without activating any engine state.
    /// # Errors
    /// Rejects invalid logical coordinates, malformed graphs or missing source history.
    pub fn capture(
        doc: &LoroDoc,
        block: &str,
        offset: u32,
        affinity: Affinity,
    ) -> Result<Self, Error> {
        let point = if super::prepared(doc, block) {
            super::point(doc, block, offset, affinity)?
        } else {
            if offset != 0 {
                return Err(Error::Offset);
            }
            Point {
                block: block.into(),
                source: block.into(),
                offset,
                fragment: super::graph::empty(block),
                affinity,
                empty: true,
            }
        };
        let text = super::super::model::existing_text(doc, &point.source);
        let end_binding = if !point.empty
            && affinity == Affinity::After
            && offset == super::view(doc, block)?.len()?
        {
            Some(TextAnchor::capture(
                text.as_ref().ok_or(Error::Anchor)?,
                point.offset,
                Affinity::Before,
            )?)
        } else {
            None
        };
        Ok(Self {
            anchor: text.as_ref().map_or_else(
                || Ok(TextAnchor::empty(super::super::model::text_id(&point.source), affinity)),
                |text| TextAnchor::capture(text, point.offset, affinity),
            )?,
            point,
            seen: super::cuts::witness(doc),
            end_binding,
        })
    }
    /// Resolve to the current top paragraph and its logical UTF-16 coordinate.
    /// # Errors
    /// Rejects unavailable causal history or malformed routing rather than guessing by text diff.
    pub fn resolve(&self, doc: &LoroDoc) -> Result<(String, u32), Error> {
        if !super::prepared(doc, &self.point.block) {
            let offset =
                if let Some(text) = super::super::model::existing_text(doc, &self.point.source) {
                    self.anchor.resolve(doc, &text)?
                } else {
                    let cursor = self.anchor.engine_cursor()?;
                    if cursor.container != super::super::model::text_id(&self.point.source)
                        || cursor.id.is_some()
                    {
                        return Err(Error::Anchor);
                    }
                    0
                };
            return Ok((self.point.block.clone(), offset));
        }
        let index = Index::read(doc)?;
        let text =
            super::super::model::existing_text(doc, &self.point.source).ok_or(Error::Anchor)?;
        let offset = self.anchor.resolve(doc, &text)?;
        let cursor = self.anchor.engine_cursor()?;
        if self.point.affinity == Affinity::After
            && (self.point.empty || cursor.id.is_none() || self.end_binding.is_some())
            && let Some(right) =
                super::cuts::follow(doc, &self.point.block, &self.point.source, offset, &self.seen)?
        {
            return index.fragment_end(&super::graph::empty(&right));
        }
        if self.point.empty {
            return index.fragment_point(&self.point.fragment, offset);
        }
        if let Some(binding) = &self.end_binding {
            let reference = binding.resolve(doc, &text)?;
            let fragment = index.source_fragment(
                &self.point.source,
                reference,
                Affinity::Before,
                &self.point.fragment,
            )?;
            return index.fragment_point(&fragment, offset);
        }
        if !index.chunks.contains_key(&self.point.fragment)
            && index.chunks.values().flatten().all(|chunk| chunk.source != self.point.source)
        {
            return index.empty_point(&self.point.fragment);
        }
        index.source_point(&self.point.source, offset, self.point.affinity, &self.point.fragment)
    }
    /// Original canonical source identity; paragraph changes never rewrite it.
    #[must_use]
    pub fn source(&self) -> &str {
        &self.point.source
    }
}
