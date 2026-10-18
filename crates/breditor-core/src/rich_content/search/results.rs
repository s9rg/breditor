//! Immutable source proof and UTF-16 match coordinates; never mutation authority.
use super::{RichSearchError, RichSearchQuery, domains};
use crate::{
    position::{Affinity, TextOffset},
    rich_content::{BlockId, RichDocument, RichSelection, RichSelectionKind, RichTextPoint},
};
use std::{collections::BTreeMap, fmt, ops::Range};

/// One complete match in one semantic text domain.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichSearchMatch {
    pub(super) block: BlockId,
    pub(super) start: TextOffset,
    pub(super) end: TextOffset,
    pub(super) captures: Vec<Option<Range<usize>>>,
}

impl RichSearchMatch {
    /// Stable paragraph/heading/code identity, including cell/caption bodies.
    #[must_use]
    pub const fn block(&self) -> &BlockId {
        &self.block
    }
    /// Scalar-aligned inclusive start in aggregate block-relative UTF-16 units.
    #[must_use]
    pub const fn start(&self) -> TextOffset {
        self.start
    }
    /// Scalar-aligned exclusive end; a zero-width match has equal endpoints.
    #[must_use]
    pub const fn end(&self) -> TextOffset {
        self.end
    }
    /// Capture slot count, including group zero for the complete match.
    #[must_use]
    pub fn capture_count(&self) -> usize {
        self.captures.len()
    }
}

/// Logical match navigation, not visual arrow or bidi navigation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichSearchDirection {
    /// Next match in semantic presentation order.
    Next,
    /// Previous match in semantic presentation order.
    Previous,
}

/// Complete query result retaining the exact immutable source tree.
///
/// No truncated-result constructor or deserializer exists. This value is a
/// guarded read, not authorization to edit or to reuse a live shared writer.
#[derive(Clone)]
pub struct RichSearchResults {
    pub(super) source: RichDocument,
    pub(super) query: RichSearchQuery,
    pub(super) matches: Vec<RichSearchMatch>,
    pub(super) names: BTreeMap<String, usize>,
    pub(super) capture_count: usize,
}

impl RichSearchResults {
    /// Exact admitted query, independent of any subsequent editor selection.
    #[must_use]
    pub const fn query(&self) -> &RichSearchQuery {
        &self.query
    }
    /// Complete matches in visible reading order; no hidden-table or metadata hits.
    #[must_use]
    pub fn matches(&self) -> &[RichSearchMatch] {
        &self.matches
    }
    /// Resolve a named capture to its native slot, without inspecting match text.
    #[must_use]
    pub fn capture_index(&self, name: &str) -> Option<usize> {
        self.names.get(name).copied()
    }
    /// Declared capture slots, including group zero, even when no match was found.
    #[must_use]
    pub const fn capture_count(&self) -> usize {
        self.capture_count
    }
    /// Check document/schema and the entire source tree, not only matched strings.
    /// # Errors
    /// Rejects foreign bindings or any changed source AST. Equal independently
    /// decoded immutable trees retain the same semantic proof.
    pub fn validate_for(&self, document: &RichDocument) -> Result<(), RichSearchError> {
        validate_source(&self.source, document)
    }
    /// Read a capture from the retained source. Missing optional groups return `None`.
    /// # Errors
    /// Rejects invalid match/group indices or contradictions of native UTF-8 spans.
    pub fn capture_text(
        &self,
        index: usize,
        group: usize,
    ) -> Result<Option<String>, RichSearchError> {
        let found = self.matches.get(index).ok_or(RichSearchError::Index)?;
        let Some(span) = found.captures.get(group).ok_or(RichSearchError::Index)? else {
            return Ok(None);
        };
        let text = domains::text(&self.source, &found.block, super::RICH_SEARCH_MAX_TEXT_BYTES)?;
        Ok(Some(text.get(span.clone()).ok_or(RichSearchError::Invariant)?.to_owned()))
    }
    /// Derive a source-bound selection without publishing UI or clearing Redo.
    /// # Errors
    /// Rejects an invalid index or a contradiction of the admitted source positions.
    pub fn selection(&self, index: usize) -> Result<RichSelection, RichSearchError> {
        let found = self.matches.get(index).ok_or(RichSearchError::Index)?;
        let anchor = RichTextPoint::new(found.block.clone(), found.start, Affinity::After);
        let focus = RichTextPoint::new(found.block.clone(), found.end, Affinity::After);
        RichSelection::try_new(&self.source, RichSelectionKind::TextRange { anchor, focus })
            .map_err(|_| RichSearchError::Invariant)
    }
    /// Choose a match index with explicit wrap policy; this pure read changes no selection.
    /// # Errors
    /// Rejects an active index not present in the current complete result.
    pub fn navigate(
        &self,
        active: Option<usize>,
        direction: RichSearchDirection,
        wrap: bool,
    ) -> Result<Option<usize>, RichSearchError> {
        let count = self.matches.len();
        if active.is_some_and(|index| index >= count) {
            return Err(RichSearchError::Index);
        }
        if count == 0 {
            return Ok(None);
        }
        Ok(match (active, direction) {
            (None, RichSearchDirection::Next) => Some(0),
            (None, RichSearchDirection::Previous) => Some(count - 1),
            (Some(index), RichSearchDirection::Next) if index + 1 < count => Some(index + 1),
            (Some(index), RichSearchDirection::Previous) if index > 0 => Some(index - 1),
            (_, RichSearchDirection::Next) if wrap => Some(0),
            (_, RichSearchDirection::Previous) if wrap => Some(count - 1),
            _ => None,
        })
    }
}

pub(super) fn validate_source(
    source: &RichDocument,
    document: &RichDocument,
) -> Result<(), RichSearchError> {
    if document.id() != source.id()
        || document.document().schema_fingerprint() != source.document().schema_fingerprint()
    {
        return Err(RichSearchError::Binding);
    }
    if document.document().root() != source.document().root() {
        return Err(RichSearchError::StaleSource);
    }
    Ok(())
}

impl fmt::Debug for RichSearchResults {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("RichSearchResults")
            .field("query", &self.query)
            .field("matches", &self.matches.len())
            .finish_non_exhaustive()
    }
}
