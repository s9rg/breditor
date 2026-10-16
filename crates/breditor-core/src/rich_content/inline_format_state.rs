//! Read-only exact formatting state over one admitted rich snapshot.
//!
//! This query neither plans an edit nor grants action/observation authority.
//! Activation and property agreement are deliberately distinct: two different
//! links can both be active while their URL control must display a mixed value.

use super::{ResolvedRichSelection, RichDocument, RichSelection, RichSelectionKind};
use crate::{
    document::{Format, FormatSet},
    identity::QualifiedName,
    state::EditorContext,
};

/// Complete state of one declared inline format over applicable selected text.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RichInlineFormatState {
    /// No text selection, unsupported node/grid/code selection, or no selected characters.
    /// An empty paragraph's collapsed caret is applicable and is not this branch.
    Unavailable,
    /// Applicable text exists, but the format is absent everywhere.
    Unset,
    /// The format is present everywhere with this exact complete property map.
    Uniform(Format),
    /// Presence or complete property maps differ across the selected characters.
    Mixed {
        /// True for differing property maps when every character has the format.
        /// False when some selected characters do not have the format.
        present_everywhere: bool,
    },
}

/// Failure of a read-only query; none of these failures publish state.
#[derive(Debug, thiserror::Error)]
pub enum RichInlineFormatStateError {
    /// The document lacks admission under this exact compiled rich context/budget.
    #[error("inline state requires the document's admitted rich context")]
    Context,
    /// Unknown formats do not silently appear as disabled or absent formats.
    #[error("inline state format is not declared")]
    UnknownFormat,
    /// A stale or foreign selection must not produce a plausible toolbar value.
    #[error(transparent)]
    Selection(#[from] super::RichSelectionError),
    /// Pending overrides require a caret and the active typed-format/resource policy.
    #[error(transparent)]
    Pending(#[from] super::RichLocalSessionError),
    /// A typed directory or offset read contradicted existing admission.
    #[error("inline state snapshot invariant failed")]
    Invariant,
}

/// Inspect one format without changing content, selection, pending state or history.
///
/// A collapsed caret uses the focus affinity, including an explicit empty pending
/// override. Nonempty directional text ranges inspect intersecting UTF-16 runs
/// in document order, across paragraphs, list bodies, cells and captions. Empty
/// blocks and boundary-only fragments contribute no character observations.
/// Node/grid selections intentionally return `Unavailable`: this does not claim
/// that a formatting command supports those selections. The immutable AST is
/// authoritative; no DOM or independently mutable text projection is consulted.
/// A code caret or text interval crossing code is unavailable: code is not an
/// absent format that can be toggled on, nor silently omitted from a mixed read.
///
/// The context must be the one admitting this document. Independently compiled
/// contexts must first re-admit the document under their own proof and budgets.
/// This read-only result is not a compiled proof or a live-publication guard.
///
/// # Errors
/// Rejects unknown kinds, an incompatible context, stale selections, non-caret
/// pending overrides and inadmissible pending literals. Errors publish nothing.
pub fn inspect_inline_format(
    context: &EditorContext,
    document: &RichDocument,
    selection: Option<&RichSelection>,
    pending: Option<&FormatSet>,
    kind: &QualifiedName,
) -> Result<RichInlineFormatState, RichInlineFormatStateError> {
    if !context.schema().is_rich_content_profile()
        || !document.document().is_proven_for(context.schema(), context.limits())
    {
        return Err(RichInlineFormatStateError::Context);
    }
    if !context.schema().allows_text_format(kind) {
        return Err(RichInlineFormatStateError::UnknownFormat);
    }
    let resolved = selection.map(|value| value.resolve(document)).transpose()?;
    let caret = super::local_session::typing_state::caret(selection);
    if let Some(pending) = pending {
        if caret.is_none() {
            return Err(super::RichLocalSessionError::TypingCaret.into());
        }
        super::local_session::typing_state::validate(context, document, selection, Some(pending))?;
    }
    if context.schema().rich_content_revision().is_some_and(|revision| revision >= 2)
        && contains_code(document, selection)?
    {
        return Ok(RichInlineFormatState::Unavailable);
    }
    if caret.is_some() {
        let Some(ResolvedRichSelection::TextRange { focus, .. }) = resolved else {
            return Err(RichInlineFormatStateError::Invariant);
        };
        let formats =
            super::local_session::typing_state::resolved_caret_formats(document, &focus, pending)?;
        let mut scan = Scan::default();
        scan.observe(formats.get(kind));
        return Ok(scan.finish());
    }
    let Some(RichSelectionKind::TextRange { anchor, focus }) = selection.map(RichSelection::kind)
    else {
        return Ok(RichInlineFormatState::Unavailable);
    };
    let path = |point: &super::RichTextPoint| {
        document.block_path(point.block()).ok_or(RichInlineFormatStateError::Invariant)
    };
    let (a, f) = (path(anchor)?, path(focus)?);
    let (start, start_path, end, end_path) = if (a, anchor.offset()) <= (f, focus.offset()) {
        (anchor, a, focus, f)
    } else {
        (focus, f, anchor, a)
    };
    let mut scan = Scan::default();
    // Directory iteration is ID ordered, not visual ordered. This exact aggregate
    // is commutative; paths restrict the source interval without copying any text.
    for (_, path) in document.block_entries() {
        if path < start_path || path > end_path {
            continue;
        }
        let node = document
            .document()
            .node_at(path)
            .ok()
            .and_then(crate::document::NodeRef::as_element)
            .ok_or(RichInlineFormatStateError::Invariant)?;
        if !matches!(node.kind().as_str(), "breditor/paragraph" | "breditor/heading") {
            continue;
        }
        let lower = if path == start_path { start.offset().get() } else { 0 };
        let upper = if path == end_path { end.offset().get() } else { u64::MAX };
        let mut offset = 0u64;
        for child in node.children() {
            let run = child.as_text().ok_or(RichInlineFormatStateError::Invariant)?;
            let next = offset
                .checked_add(u64::from(run.utf16_len()))
                .ok_or(RichInlineFormatStateError::Invariant)?;
            if lower < next && upper > offset {
                scan.observe(run.formats().get(kind));
            }
            offset = next;
        }
    }
    Ok(scan.finish())
}

fn contains_code(
    document: &RichDocument,
    selection: Option<&RichSelection>,
) -> Result<bool, RichInlineFormatStateError> {
    let Some(RichSelectionKind::TextRange { anchor, focus }) = selection.map(RichSelection::kind)
    else {
        return Ok(false);
    };
    let a = document.block_path(anchor.block()).ok_or(RichInlineFormatStateError::Invariant)?;
    let f = document.block_path(focus.block()).ok_or(RichInlineFormatStateError::Invariant)?;
    let (first, last) = if a <= f { (a, f) } else { (f, a) };
    Ok(document.block_entries().any(|(_, path)| {
        path >= first
            && path <= last
            && document
                .document()
                .node_at(path)
                .ok()
                .and_then(crate::document::NodeRef::as_element)
                .is_some_and(|node| node.kind().as_str() == "breditor/code-block")
    }))
}

#[derive(Default)]
pub(super) struct Scan {
    observed: bool,
    absent: bool,
    first: Option<Format>,
    different: bool,
}
impl Scan {
    pub(super) fn observe(&mut self, format: Option<&Format>) {
        self.observed = true;
        if let Some(format) = format {
            if let Some(first) = &self.first {
                self.different |= first != format;
            } else {
                self.first = Some(format.clone());
            }
        } else {
            self.absent = true;
        }
    }
    pub(super) fn finish(self) -> RichInlineFormatState {
        if !self.observed {
            RichInlineFormatState::Unavailable
        } else if self.different || (self.absent && self.first.is_some()) {
            RichInlineFormatState::Mixed { present_everywhere: !self.absent }
        } else if let Some(format) = self.first {
            RichInlineFormatState::Uniform(format)
        } else {
            RichInlineFormatState::Unset
        }
    }
}
