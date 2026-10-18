//! Immutable semantic splices over original characters, not whole-block shared writes.
use super::{
    RICH_SEARCH_MAX_INSERTED_BYTES, RICH_SEARCH_MAX_TEXT_BYTES, RichSearchError,
    RichSearchReplacement, RichSearchResults, domains, replacement_template::Template,
};
use crate::{
    document::{FormatSet, NodeRef, TextFragment, TextRun},
    position::TextOffset,
    rich_content::{BlockId, RichDocument},
};
use std::{fmt, ops::Range};

/// One non-identity edit in original block-relative coordinates.
#[derive(Clone, Eq, PartialEq)]
pub struct RichSearchTextEdit {
    pub(super) block: BlockId,
    pub(super) start: TextOffset,
    pub(super) end: TextOffset,
    pub(super) bytes: Range<usize>,
    pub(super) inserted: TextFragment,
}

impl RichSearchTextEdit {
    /// Stable semantic text domain; not a DOM path or replication credential.
    #[must_use]
    pub const fn block(&self) -> &BlockId {
        &self.block
    }
    /// Inclusive original scalar-aligned UTF-16 boundary.
    #[must_use]
    pub const fn start(&self) -> TextOffset {
        self.start
    }
    /// Exclusive original boundary; equal endpoints describe insertion.
    #[must_use]
    pub const fn end(&self) -> TextOffset {
        self.end
    }
    /// Exact checked inserted text and its native inherited formatting.
    #[must_use]
    pub const fn inserted(&self) -> &TextFragment {
        &self.inserted
    }
}

impl fmt::Debug for RichSearchTextEdit {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("RichSearchTextEdit")
            .field("block", &self.block)
            .field("start", &self.start)
            .field("end", &self.end)
            .field("inserted_bytes", &self.inserted.text_bytes())
            .finish_non_exhaustive()
    }
}

/// Complete native replacement intent, retaining the exact accepted source tree.
///
/// Fields are private and no unchecked constructor/decoder exists. A shared owner
/// must additionally check its live causal observation and lower the original
/// character ranges. This plan is neither shared mutation nor durable query replay.
#[derive(Clone)]
pub struct RichSearchReplacePlan {
    pub(super) source: RichDocument,
    pub(super) edits: Vec<RichSearchTextEdit>,
    pub(super) selected_matches: usize,
    pub(super) inserted_bytes: usize,
}

impl RichSearchReplacePlan {
    /// Changed edits in semantic domain order and ascending original offsets.
    /// Identity replacements are absent, preserving all original formats/IDs.
    #[must_use]
    pub fn edits(&self) -> &[RichSearchTextEdit] {
        &self.edits
    }
    /// Selected hits, including identities which deliberately create no edit.
    #[must_use]
    pub const fn selected_matches(&self) -> usize {
        self.selected_matches
    }
    /// Aggregate changed insertion size admitted before allocating expanded text.
    #[must_use]
    pub const fn inserted_bytes(&self) -> usize {
        self.inserted_bytes
    }
    /// Check the entire original AST and binding, not only each matched substring.
    /// # Errors
    /// Rejects changed, foreign or schema-incompatible source documents.
    pub fn validate_for(&self, document: &RichDocument) -> Result<(), RichSearchError> {
        super::results::validate_source(&self.source, document)
    }
}

impl fmt::Debug for RichSearchReplacePlan {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("RichSearchReplacePlan")
            .field("selected_matches", &self.selected_matches)
            .field("edits", &self.edits.len())
            .field("inserted_bytes", &self.inserted_bytes)
            .finish_non_exhaustive()
    }
}

struct Domain {
    text: String,
    ends: Vec<(usize, FormatSet)>,
}
impl Domain {
    fn load(document: &RichDocument, block: &BlockId) -> Result<Self, RichSearchError> {
        let text = domains::text(document, block, RICH_SEARCH_MAX_TEXT_BYTES)?;
        let node = document
            .block_path(block)
            .and_then(|path| document.document().node_at(path).ok())
            .and_then(NodeRef::as_element)
            .ok_or(RichSearchError::Invariant)?;
        let mut end = 0;
        let mut ends = Vec::new();
        for child in node.children() {
            let run = child.as_text().ok_or(RichSearchError::Invariant)?;
            end += run.text().len();
            ends.push((end, run.formats().clone()));
        }
        Ok(Self { text, ends })
    }
    fn formats(&self, byte: usize) -> FormatSet {
        let index = self.ends.partition_point(|(end, _)| *end <= byte);
        self.ends
            .get(index)
            .or_else(|| self.ends.last())
            .map_or_else(FormatSet::default, |(_, formats)| formats.clone())
    }
}

pub(super) fn build(
    results: &RichSearchResults,
    indices: impl IntoIterator<Item = usize>,
    replacement: &RichSearchReplacement,
) -> Result<RichSearchReplacePlan, RichSearchError> {
    let template = Template::compile(replacement, results)?;
    let mut plan = RichSearchReplacePlan {
        source: results.source.clone(),
        edits: Vec::new(),
        selected_matches: 0,
        inserted_bytes: 0,
    };
    let mut cached: Option<(&BlockId, Domain)> = None;
    for index in indices {
        let found = results.matches.get(index).ok_or(RichSearchError::Index)?;
        plan.selected_matches += 1;
        if cached.as_ref().is_none_or(|(block, _)| *block != &found.block) {
            cached = Some((&found.block, Domain::load(&results.source, &found.block)?));
        }
        let domain = &cached.as_ref().ok_or(RichSearchError::Invariant)?.1;
        let Some(text) = template.expand(
            &domain.text,
            found,
            RICH_SEARCH_MAX_INSERTED_BYTES - plan.inserted_bytes,
        )?
        else {
            continue;
        };
        let bytes =
            found.captures.first().and_then(Clone::clone).ok_or(RichSearchError::Invariant)?;
        plan.inserted_bytes += text.len();
        let inserted = if text.is_empty() {
            TextFragment::empty()
        } else {
            TextRun::try_new(text, domain.formats(bytes.start))
                .map(TextFragment::from)
                .map_err(|_| RichSearchError::ReplacementLimit)?
        };
        plan.edits.push(RichSearchTextEdit {
            block: found.block.clone(),
            start: found.start,
            end: found.end,
            bytes,
            inserted,
        });
    }
    Ok(plan)
}
