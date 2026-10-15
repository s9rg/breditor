//! Pure source-interval indexing; body coordinates never become persistent identity.
use super::{
    graph::{self, Definition, Graph},
    markers,
};
use crate::{
    Error,
    anchor::{Affinity, event_offset},
};
use loro::{LoroDoc, TextDelta, ToJson};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

/// One scalar-aligned logical text slice, still backed by its original characters.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Chunk {
    /// Immutable source text-container key, independent of the current paragraph.
    pub source: String,
    /// UTF-16 start in that source, not in the rendered paragraph.
    pub start: u32,
    /// UTF-16 length of this slice.
    pub length: u32,
    /// Stable fragment identity used for placement, not a DOM key.
    pub fragment: String,
    /// Original characters; no synthetic separator is inserted between fragments.
    pub text: String,
    /// Canonical typed formats; ownership markers are never user-visible formats.
    pub formats: Vec<Value>,
}

/// One paragraph's ordered immutable projection, including its selected top owner.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct View {
    /// Requested paragraph root.
    pub block: String,
    /// Selected top paragraph; a joined root does not render a second AST block.
    pub owner: String,
    /// Original source slices in logical order, retaining formatting boundaries.
    pub chunks: Vec<Chunk>,
}
impl View {
    /// Concatenate logical text without copying it into a new shared container.
    #[must_use]
    pub fn text(&self) -> String {
        self.chunks.iter().map(|chunk| chunk.text.as_str()).collect()
    }
    /// Total UTF-16 body length.
    /// # Errors
    /// Rejects a view whose coordinate sum exceeds the editor's integer domain.
    pub fn len(&self) -> Result<u32, Error> {
        self.chunks
            .iter()
            .try_fold(0u32, |total, chunk| total.checked_add(chunk.length).ok_or(Error::Offset))
    }
    /// Whether the logical text is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.chunks.is_empty()
    }
}

/// A transient insertion point; capture a `FlowAnchor` for persisted selection.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Point {
    /// Logical paragraph at capture time.
    pub block: String,
    /// Stable source text container.
    pub source: String,
    /// Scalar-aligned UTF-16 coordinate inside the source.
    pub offset: u32,
    /// Preferred ordered fragment at this insertion boundary.
    pub fragment: String,
    /// Binding to the preceding or following character.
    pub affinity: Affinity,
    /// An intentionally empty paragraph boundary, not an adjacent character.
    pub empty: bool,
}

pub(super) struct Index {
    pub graph: Graph,
    pub chunks: BTreeMap<String, Vec<Chunk>>,
}
impl Index {
    pub fn read(doc: &LoroDoc) -> Result<Self, Error> {
        let graph = Graph::read(doc)?;
        let sources: BTreeSet<_> = graph
            .definitions
            .values()
            .filter_map(|value| match value {
                Definition::Fragment { source, .. } => source.clone(),
                Definition::Root { .. } => None,
            })
            .collect();
        let mut chunks: BTreeMap<String, Vec<Chunk>> = BTreeMap::new();
        let mut annotations = 0;
        let mut run_count = 0;
        let mut chunk_count = 0;
        for source in sources {
            let text = super::super::model::existing_text(doc, &source)
                .ok_or(Error::Contract("missing text-flow source"))?;
            let mut start = 0u32;
            let mut continuation = None;
            for run in text.to_delta() {
                run_count += 1;
                if run_count > 20_000 {
                    return Err(Error::Limit("text-flow source runs"));
                }
                let TextDelta::Insert { insert, attributes } = run else {
                    return Err(Error::Contract("text-flow source delta"));
                };
                let values: Vec<_> = attributes
                    .unwrap_or_default()
                    .into_iter()
                    .map(|(key, value)| (key, value.to_json_value()))
                    .collect();
                annotations += values.len();
                if annotations > 100_000 {
                    return Err(Error::Limit("text-flow annotations"));
                }
                let selected = markers::selected_with_clock(doc, &values)?;
                let fragment = selected
                    .as_ref()
                    .map_or_else(|| graph::birth(&source), |(_, fragment)| fragment.clone());
                if !matches!(graph.definitions.get(&fragment), Some(Definition::Fragment { source: own, .. }) if own.as_ref().is_none_or(|own| *own == source))
                {
                    return Err(Error::Contract("text-flow marker source identity"));
                }
                let length =
                    u32::try_from(insert.encode_utf16().count()).map_err(|_| Error::Offset)?;
                if let Some((stamp, fragment)) = selected {
                    continuation =
                        Some(super::continuation::Continuation::new(doc, stamp, fragment.clone())?);
                    push_chunk(
                        &mut chunks,
                        &source,
                        start,
                        &insert,
                        &fragment,
                        markers::formats(doc, &values)?,
                        &mut chunk_count,
                    )?;
                } else if continuation.is_some() {
                    let formats = markers::formats(doc, &values)?;
                    for segment in super::continuation::segments(
                        &mut continuation,
                        &text,
                        start,
                        &insert,
                        &graph::birth(&source),
                    )? {
                        push_chunk(
                            &mut chunks,
                            &source,
                            segment.start,
                            &segment.text,
                            &segment.fragment,
                            formats.clone(),
                            &mut chunk_count,
                        )?;
                    }
                } else {
                    push_chunk(
                        &mut chunks,
                        &source,
                        start,
                        &insert,
                        &fragment,
                        markers::formats(doc, &values)?,
                        &mut chunk_count,
                    )?;
                }
                start = start.checked_add(length).ok_or(Error::Offset)?;
            }
        }
        for values in chunks.values() {
            if let Some(first) = values.first()
                && values.iter().any(|chunk| chunk.source != first.source)
            {
                return Err(Error::Contract("a text fragment must have one source"));
            }
        }
        Ok(Self { graph, chunks })
    }
    pub fn view(&self, block: &str) -> Result<View, Error> {
        let root = graph::root(block);
        Ok(View {
            block: block.into(),
            owner: self.graph.owner(&root)?.into(),
            chunks: self
                .graph
                .fragments(&root)?
                .iter()
                .flat_map(|fragment| self.chunks.get(fragment).into_iter().flatten().cloned())
                .collect(),
        })
    }
    pub fn point(
        &self,
        doc: &LoroDoc,
        block: &str,
        offset: u32,
        affinity: Affinity,
    ) -> Result<Point, Error> {
        let view = self.view(block)?;
        if view.owner != block {
            return Err(Error::Contract("text-flow action requires top paragraph"));
        }
        let length = view.len()?;
        if offset > length {
            return Err(Error::Offset);
        }
        // Before zero is an explicit left-root boundary. It must remain there
        // even when a split moves the paragraph's entire birth fragment away.
        if length == 0 || (offset == 0 && affinity == Affinity::Before) {
            let Some(Definition::Root { .. }) = self.graph.definitions.get(&graph::root(block))
            else {
                return Err(Error::Contract("text-flow empty origin"));
            };
            return Ok(Point {
                block: block.into(),
                source: block.into(),
                offset: 0,
                fragment: graph::empty(block),
                affinity,
                empty: true,
            });
        }
        let mut start = 0;
        for (index, chunk) in view.chunks.iter().enumerate() {
            let end = start + chunk.length;
            let take = offset < end
                || (offset == end
                    && (affinity == Affinity::Before || index + 1 == view.chunks.len()));
            if take {
                let source_offset = chunk.start + (offset - start);
                event_offset(
                    &super::super::model::existing_text(doc, &chunk.source).ok_or(Error::Anchor)?,
                    source_offset,
                )?;
                return Ok(Point {
                    block: block.into(),
                    source: chunk.source.clone(),
                    offset: source_offset,
                    fragment: chunk.fragment.clone(),
                    affinity,
                    empty: false,
                });
            }
            start = end;
        }
        Err(Error::Offset)
    }
    pub fn source_point(
        &self,
        source: &str,
        offset: u32,
        affinity: Affinity,
        preferred: &str,
    ) -> Result<(String, u32), Error> {
        let (fragment, target) = self.source_chunk(source, offset, affinity, preferred)?;
        let owner = self.graph.owner(fragment)?.to_owned();
        let view = self.view(&owner)?;
        let mut logical = 0u32;
        for chunk in &view.chunks {
            if chunk.source == target.source
                && chunk.start == target.start
                && chunk.fragment == fragment
            {
                return Ok((owner, logical + offset - chunk.start));
            }
            logical += chunk.length;
        }
        Err(Error::Anchor)
    }
    pub fn source_fragment(
        &self,
        source: &str,
        offset: u32,
        affinity: Affinity,
        preferred: &str,
    ) -> Result<String, Error> {
        match self.source_chunk(source, offset, affinity, preferred) {
            Ok((fragment, _)) => Ok(fragment.into()),
            Err(Error::Anchor) if self.graph.definitions.contains_key(preferred) => {
                Ok(preferred.into())
            }
            Err(error) => Err(error),
        }
    }
    fn source_chunk<'a>(
        &'a self,
        source: &str,
        offset: u32,
        affinity: Affinity,
        preferred: &str,
    ) -> Result<(&'a str, &'a Chunk), Error> {
        let mut exact = None;
        let mut fallback = None;
        for (fragment, chunks) in &self.chunks {
            for chunk in chunks {
                if chunk.source != source
                    || offset < chunk.start
                    || offset > chunk.start + chunk.length
                {
                    continue;
                }
                if *fragment == preferred {
                    fallback = Some((fragment, chunk));
                }
                let owns = if affinity == Affinity::Before {
                    offset > chunk.start
                } else {
                    offset < chunk.start + chunk.length
                };
                if owns {
                    exact = Some((fragment, chunk));
                }
            }
        }
        exact.or(fallback).map(|(fragment, chunk)| (fragment.as_str(), chunk)).ok_or(Error::Anchor)
    }
    pub fn fragment_point(&self, fragment: &str, offset: u32) -> Result<(String, u32), Error> {
        let (owner, mut logical) = self.empty_point(fragment)?;
        for chunk in self.chunks.get(fragment).into_iter().flatten() {
            if offset <= chunk.start {
                return Ok((owner, logical));
            }
            if offset <= chunk.start + chunk.length {
                return Ok((owner, logical + offset - chunk.start));
            }
            logical = logical.checked_add(chunk.length).ok_or(Error::Offset)?;
        }
        Ok((owner, logical))
    }
    pub fn empty_point(&self, fragment: &str) -> Result<(String, u32), Error> {
        let owner = self.graph.owner(fragment)?.to_owned();
        let mut logical = 0u32;
        for candidate in self.graph.fragments(&graph::root(&owner))? {
            if candidate == fragment {
                return Ok((owner, logical));
            }
            logical = self
                .chunks
                .get(&candidate)
                .into_iter()
                .flatten()
                .try_fold(logical, |total, chunk| {
                    total.checked_add(chunk.length).ok_or(Error::Offset)
                })?;
        }
        Err(Error::Anchor)
    }
    pub fn fragment_end(&self, fragment: &str) -> Result<(String, u32), Error> {
        self.fragment_point(fragment, u32::MAX)
    }
    pub fn intervals(&self, block: &str, offset: u32, length: u32) -> Result<Vec<Chunk>, Error> {
        let view = self.view(block)?;
        if view.owner != block {
            return Err(Error::Contract("text-flow range requires top paragraph"));
        }
        let end = offset.checked_add(length).ok_or(Error::Offset)?;
        if end > view.len()? {
            return Err(Error::Offset);
        }
        let mut result = vec![];
        let mut position = 0;
        for chunk in &view.chunks {
            for boundary in [offset, end] {
                if boundary >= position && boundary <= position + chunk.length {
                    slice(&chunk.text, boundary - position, 0)?;
                }
            }
            let first = offset.max(position);
            let last = end.min(position + chunk.length);
            if first < last {
                let start = first - position;
                let count = last - first;
                let content = slice(&chunk.text, start, count)?;
                result.push(Chunk {
                    start: chunk.start + start,
                    length: count,
                    text: content,
                    ..chunk.clone()
                });
            }
            position += chunk.length;
        }
        Ok(result)
    }
}

fn push_chunk(
    chunks: &mut BTreeMap<String, Vec<Chunk>>,
    source: &str,
    start: u32,
    content: &str,
    fragment: &str,
    formats: Vec<Value>,
    count: &mut usize,
) -> Result<(), Error> {
    if content.is_empty() {
        return Ok(());
    }
    let length = u32::try_from(content.encode_utf16().count()).map_err(|_| Error::Offset)?;
    let entries = chunks.entry(fragment.into()).or_default();
    if let Some(last) = entries.last_mut()
        && last.source == source
        && last.start.checked_add(last.length) == Some(start)
        && last.formats == formats
    {
        last.text.push_str(content);
        last.length = last.length.checked_add(length).ok_or(Error::Offset)?;
        return Ok(());
    }
    *count += 1;
    if *count > 20_000 {
        return Err(Error::Limit("text-flow source chunks"));
    }
    entries.push(Chunk {
        source: source.into(),
        start,
        length,
        fragment: fragment.into(),
        text: content.into(),
        formats,
    });
    Ok(())
}

fn slice(text: &str, offset: u32, length: u32) -> Result<String, Error> {
    let mut start = None;
    let mut end = None;
    let mut position = 0u32;
    for (index, character) in text.char_indices() {
        if position == offset {
            start = Some(index);
        }
        if position == offset + length {
            end = Some(index);
        }
        position += u32::try_from(character.len_utf16()).map_err(|_| Error::Offset)?;
    }
    if position == offset {
        start = Some(text.len());
    }
    if position == offset + length {
        end = Some(text.len());
    }
    Ok(text[start.ok_or(Error::Offset)?..end.ok_or(Error::Offset)?].into())
}
