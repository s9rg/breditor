//! Native letter-case change of the selected text (UPPER, lower, Title Case, cycle).
//!
//! The command is planned as checked semantic text splices over the exact source
//! document (the same immutable replacement plan native search uses), so it is
//! one complete candidate, one history group and one source-bound local recipe.
//! Each splice stays inside one existing format run, so every format instance,
//! property map, block identity and the paragraph structure survive exactly, and a
//! length change such as `ß` → `SS` keeps format runs consistent. Mention text is
//! never altered: a mention's text is its immutable `@label` snapshot.
mod mapping;
mod request;

pub use request::{
    RICH_CASE_MAX_MINOR_WORD_BYTES, RICH_CASE_MAX_MINOR_WORDS, RichCaseChange, RichCaseOptions,
    RichCaseRequest, default_title_minor_words,
};

use super::{
    BlockId, RICH_MENTION_FORMAT, RICH_SEARCH_MAX_MATCHES, RichDocument, RichSearchError,
    RichSearchReplacePlan, RichSearchTextReplacement, RichSelection, RichSelectionCoverage,
    RichSelectionError, RichSelectionKind, RichTextPoint,
};
use crate::{document::NodeRef, position::TextOffset, state::EditorContext};
use std::collections::BTreeMap;

/// Payload-free case-change failure; nothing is published.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichCaseChangeError {
    /// The request JSON, locale or minor-word list is malformed or out of bounds.
    #[error("invalid case-change request")]
    Request,
    /// There is no selection, or a selected text block cannot be read.
    #[error("case change requires a text, node or grid selection")]
    Selection,
    /// The checked replacement plan or complete candidate admission failed.
    #[error(transparent)]
    Plan(#[from] RichSearchError),
}

/// One complete admitted case change: candidate, mapped selection and resolved mode.
#[derive(Clone, Debug)]
pub struct RichCaseChangePlan {
    change: RichCaseChange,
    plan: RichSearchReplacePlan,
    document: RichDocument,
    selection: RichSelection,
}
impl RichCaseChangePlan {
    /// Applied mode; `Cycle` is resolved to UPPER, lower or Title.
    #[must_use]
    pub const fn change(&self) -> RichCaseChange {
        self.change
    }
    /// Checked splices over original coordinates (one per changed format-run interval).
    #[must_use]
    pub const fn replacements(&self) -> &RichSearchReplacePlan {
        &self.plan
    }
    /// Complete admitted candidate document.
    #[must_use]
    pub const fn document(&self) -> &RichDocument {
        &self.document
    }
    /// The source selection mapped onto the candidate (same direction and affinities).
    #[must_use]
    pub const fn selection(&self) -> &RichSelection {
        &self.selection
    }
}

/// Plan a case change of `selection` (a caret changes its whole text block).
///
/// Returns `Ok(None)` when no scalar would change (already in the requested case,
/// no cased letters, or only mention text selected).
/// # Errors
/// A stale selection, unreadable blocks, more than the native replacement budget
/// and a failed candidate admission reject the complete request.
pub fn plan_rich_case_change(
    context: &EditorContext,
    document: &RichDocument,
    selection: &RichSelection,
    request: &RichCaseRequest,
) -> Result<Option<RichCaseChangePlan>, RichCaseChangeError> {
    let spans = spans(document, selection)?;
    let blocks = spans
        .iter()
        .map(|(block, start, end)| Ok((Block::load(document, block)?, *start, *end)))
        .collect::<Result<Vec<_>, RichCaseChangeError>>()?;
    let change = match request.change() {
        RichCaseChange::Cycle => cycle(&blocks, request.options()),
        change => change,
    };
    let order: BTreeMap<BlockId, usize> = super::search::domains::domains(document)?
        .into_iter()
        .enumerate()
        .map(|(index, block)| (block, index))
        .collect();
    // Minimal splices keep every unchanged scalar's identity (concurrent shared insertions next
    // to it survive); only a selection beyond the native splice budget merges within runs.
    let mut replacements = collect(&blocks, &order, change, request.options(), false)?;
    if replacements.len() > RICH_SEARCH_MAX_MATCHES {
        replacements = collect(&blocks, &order, change, request.options(), true)?;
    }
    if replacements.is_empty() {
        return Ok(None);
    }
    replacements.sort_by_key(|a| (a.0, a.1));
    let typed = replacements
        .iter()
        .map(|(_, from, to, text, block)| {
            RichSearchTextReplacement::try_new(block.clone(), offset(*from)?, offset(*to)?, text)
                .map_err(RichCaseChangeError::from)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let plan = RichSearchReplacePlan::try_from_semantic_replacements(document, &typed)?;
    if plan.edits().is_empty() {
        return Ok(None);
    }
    let candidate = plan.preview(context, document)?;
    let selection = map_selection(selection, &replacements, &candidate)?;
    Ok(Some(RichCaseChangePlan { change, plan, document: candidate, selection }))
}

type Splice = (usize, u64, u64, String, BlockId);
fn collect(
    blocks: &[(Block, u64, u64)],
    order: &BTreeMap<BlockId, usize>,
    change: RichCaseChange,
    options: &RichCaseOptions,
    merge: bool,
) -> Result<Vec<Splice>, RichCaseChangeError> {
    let mut replacements = Vec::new();
    for (block, start, end) in blocks {
        let rank = *order.get(&block.id).ok_or(RichCaseChangeError::Selection)?;
        for (from, to, text) in block.splices(change, options, *start, *end, merge) {
            replacements.push((rank, from, to, text, block.id.clone()));
        }
    }
    Ok(replacements)
}

fn offset(value: u64) -> Result<TextOffset, RichCaseChangeError> {
    TextOffset::try_new(value).map_err(|_| RichCaseChangeError::Selection)
}

/// Selected UTF-16 intervals; a collapsed caret selects its complete text block.
fn spans(
    document: &RichDocument,
    selection: &RichSelection,
) -> Result<Vec<(BlockId, u64, u64)>, RichCaseChangeError> {
    selection.resolve(document).map_err(|_| RichCaseChangeError::Selection)?;
    if let RichSelectionKind::TextRange { anchor, focus } = selection.kind()
        && anchor.block() == focus.block()
        && anchor.offset() == focus.offset()
    {
        let block = Block::load(document, anchor.block())?;
        return Ok(vec![(anchor.block().clone(), 0, block.utf16_len())]);
    }
    let coverage = RichSelectionCoverage::capture(document, selection)
        .map_err(|_: RichSelectionError| RichCaseChangeError::Selection)?;
    Ok(coverage
        .text()
        .iter()
        .filter(|span| span.start() < span.end())
        .map(|span| (span.block().clone(), span.start().get(), span.end().get()))
        .collect())
}

/// Resolve Shift+F3 cycling from the selected text: UPPER → lower → Title → UPPER;
/// mixed text becomes UPPER.
fn cycle(blocks: &[(Block, u64, u64)], options: &RichCaseOptions) -> RichCaseChange {
    let unchanged = |change| {
        blocks.iter().all(|(block, start, end)| {
            block.splices(change, options, *start, *end, true).is_empty()
        })
    };
    if unchanged(RichCaseChange::Upper) {
        RichCaseChange::Lower
    } else if unchanged(RichCaseChange::Lower) {
        RichCaseChange::Title
    } else {
        RichCaseChange::Upper
    }
}

/// One text block: its complete text and format-run boundaries.
struct Block {
    id: BlockId,
    text: String,
    /// (byte start, byte end, is mention) of every run.
    runs: Vec<(usize, usize, bool)>,
}
impl Block {
    fn load(document: &RichDocument, id: &BlockId) -> Result<Self, RichCaseChangeError> {
        let node = document
            .block_path(id)
            .and_then(|path| document.document().node_at(path).ok())
            .and_then(NodeRef::as_element)
            .ok_or(RichCaseChangeError::Selection)?;
        let mut text = String::new();
        let mut runs = Vec::with_capacity(node.children().len());
        for child in node.children() {
            let run = child.as_text().ok_or(RichCaseChangeError::Selection)?;
            let start = text.len();
            text.push_str(run.text());
            let mention = run.formats().iter().any(|f| f.kind().as_str() == RICH_MENTION_FORMAT);
            runs.push((start, text.len(), mention));
        }
        Ok(Self { id: id.clone(), text, runs })
    }
    fn utf16_len(&self) -> u64 {
        self.text.encode_utf16().count() as u64
    }
    /// Changed intervals `(utf16 start, utf16 end, replacement)` inside `start..end`, each
    /// within one non-mention run. Unmerged splices are maximal runs of changed scalars;
    /// merged splices span from a run's first to its last changed scalar.
    fn splices(
        &self,
        change: RichCaseChange,
        options: &RichCaseOptions,
        start: u64,
        end: u64,
        merge: bool,
    ) -> Vec<(u64, u64, String)> {
        let mapping = mapping::map_block(&self.text, change, options);
        let mut result = Vec::new();
        let mut utf16 = 0u64;
        let mut run = 0usize;
        // (run index, utf16 start, utf16 end, replacement, pending unchanged tail)
        let mut open: Option<(usize, u64, u64, String, String)> = None;
        for (byte, c, mapped) in mapping.scalars {
            while self.runs.get(run).is_some_and(|(_, run_end, _)| *run_end <= byte) {
                run += 1;
            }
            let width = c.len_utf16() as u64;
            let selected = utf16 >= start && utf16 + width <= end;
            let mention = self.runs.get(run).is_some_and(|(_, _, mention)| *mention);
            if (open.as_ref().is_some_and(|(index, ..)| *index != run)
                || !selected
                || mention
                || (!merge && mapped.is_none()))
                && let Some((_, from, to, text, _)) = open.take()
            {
                result.push((from, to, text));
            }
            if selected && !mention {
                match (&mut open, mapped) {
                    (Some((_, _, to, text, tail)), Some(mapped)) => {
                        text.push_str(tail);
                        tail.clear();
                        text.push_str(&mapped);
                        *to = utf16 + width;
                    }
                    (Some((.., tail)), None) => tail.push(c),
                    (None, Some(mapped)) => {
                        open = Some((run, utf16, utf16 + width, mapped, String::new()));
                    }
                    (None, None) => {}
                }
            }
            utf16 += width;
        }
        if let Some((_, from, to, text, _)) = open {
            result.push((from, to, text));
        }
        result
    }
}

/// Map each endpoint through the ordered splices of its block. A point inside a
/// splice (only a caret can be) keeps its distance from the splice start, clamped
/// to the replacement and aligned down to a scalar boundary.
fn map_selection(
    selection: &RichSelection,
    replacements: &[Splice],
    candidate: &RichDocument,
) -> Result<RichSelection, RichCaseChangeError> {
    let point = |point: &RichTextPoint| -> Result<RichTextPoint, RichCaseChangeError> {
        let x = point.offset().get();
        let mut delta: i128 = 0;
        let mut inside = None;
        for (_, from, to, text, _) in replacements.iter().filter(|r| &r.4 == point.block()) {
            let inserted = text.encode_utf16().count() as u64;
            if *to <= x {
                delta += i128::from(inserted) - i128::from(to - from);
            } else if *from < x {
                let mut within = 0u64;
                for c in text.chars() {
                    let next = within + c.len_utf16() as u64;
                    if next > x - from {
                        break;
                    }
                    within = next;
                }
                inside = Some(i128::from(*from) + delta + i128::from(within));
            }
        }
        let value = inside.unwrap_or(i128::from(x) + delta);
        let value = u64::try_from(value).map_err(|_| RichCaseChangeError::Selection)?;
        Ok(RichTextPoint::new(point.block().clone(), offset(value)?, point.affinity()))
    };
    let kind = match selection.kind() {
        RichSelectionKind::TextRange { anchor, focus } => {
            RichSelectionKind::TextRange { anchor: point(anchor)?, focus: point(focus)? }
        }
        kind => kind.clone(),
    };
    RichSelection::try_new(candidate, kind).map_err(|_| RichCaseChangeError::Selection)
}
