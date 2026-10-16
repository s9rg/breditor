//! Separate coverage-aware formatting read. Original node/grid-unavailable reads stay unchanged.
use super::{
    RichDocument, RichInlineFormatState, RichInlineFormatStateError, RichSelection,
    RichSelectionCoverage, inline_format_state::Scan,
};
use crate::{document::FormatSet, identity::QualifiedName, state::EditorContext};
/// Inspect exact mixed-property state over text, whole nodes or merge-closed grids.
///
/// This distinct query includes captions and source-cell bodies selected by a
/// node/grid. It never treats a grid as a text interval or silently skips code.
/// Any touched code block is unavailable. Collapsed text retains the original
/// affinity/pending-format semantics. Empty spans observe no characters.
/// # Errors
/// Unknown kinds, incompatible context and stale/foreign selections reject without publication.
pub fn inspect_selection_format(
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
    let Some(selection) = selection else {
        if pending.is_some() {
            return Err(super::RichLocalSessionError::TypingCaret.into());
        }
        return Ok(RichInlineFormatState::Unavailable);
    };
    selection.resolve(document)?;
    if super::local_session::typing_state::caret(Some(selection)).is_some() {
        return super::inspect_inline_format(context, document, Some(selection), pending, kind);
    }
    if pending.is_some() {
        return Err(super::RichLocalSessionError::TypingCaret.into());
    }
    let coverage = RichSelectionCoverage::capture(document, selection)?;
    if coverage.text().iter().any(|s| s.kind().as_str() == "breditor/code-block") {
        return Ok(RichInlineFormatState::Unavailable);
    }
    let mut scan = Scan::default();
    for span in coverage.text() {
        let node = super::rich_selection::block(document, span.block())?;
        let mut at = 0u64;
        for child in node.children() {
            let text = child.as_text().ok_or(RichInlineFormatStateError::Invariant)?;
            let end = at
                .checked_add(u64::from(text.utf16_len()))
                .ok_or(RichInlineFormatStateError::Invariant)?;
            if span.start().get() < end && span.end().get() > at {
                scan.observe(text.formats().get(kind));
            }
            at = end;
        }
    }
    Ok(scan.finish())
}
