//! Read-only exclusive-script state for the optional standard inline V1 preset.
//!
//! Subscript and superscript are two independent admitted literals; the stored
//! grammar does not forbid a run carrying both, and admission never silently
//! normalizes one away. Commands treat the scripts as mutually exclusive: applying
//! one removes the other in the same intent. This query reports the combined
//! per-character script so a run carrying both (a stored conflict from an older
//! document or a foreign producer) is observable as mixed instead of reading as
//! two independently "active" toggles.

use super::{
    RichDocument, RichInlineFormatState, RichInlineFormatStateError, RichSelection,
    RichSelectionCoverage, StandardInlineFormatV1, inspect_selection_format,
};
use crate::{document::FormatSet, state::EditorContext};

/// Combined script state over the selected characters (or the caret's typing formats).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StandardScriptStateV1 {
    /// Same applicability as [`inspect_selection_format`]: no characters, code, or no selection.
    Unavailable,
    /// Every observed character carries neither script.
    Baseline,
    /// Every observed character carries subscript only.
    Subscript,
    /// Every observed character carries superscript only.
    Superscript,
    /// Characters differ, or at least one carries both scripts.
    Mixed {
        /// True when at least one observed character carries both literals.
        conflicting: bool,
    },
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum Script {
    Baseline,
    Subscript,
    Superscript,
    Both,
}
fn script(formats: &FormatSet) -> Script {
    let has = |kind: StandardInlineFormatV1| formats.get(&kind.kind()).is_some();
    match (has(StandardInlineFormatV1::Subscript), has(StandardInlineFormatV1::Superscript)) {
        (false, false) => Script::Baseline,
        (true, false) => Script::Subscript,
        (false, true) => Script::Superscript,
        (true, true) => Script::Both,
    }
}
fn present(state: &RichInlineFormatState) -> bool {
    matches!(state, RichInlineFormatState::Uniform(_) | RichInlineFormatState::Mixed { .. })
}

/// Inspect the exclusive script state without changing content, selection, pending state or history.
///
/// Applicability, caret affinity, pending overrides, node/grid coverage and the
/// code-block rule are exactly those of [`inspect_selection_format`], which this
/// query runs for both kinds before scanning. Stored conflicts are reported as
/// `Mixed { conflicting: true }`; rendering keeps the canonical recipe nesting
/// (`sub` outside `sup`) and single-valued exports resolve such a run to superscript.
///
/// # Errors
/// Returns [`RichInlineFormatStateError::UnknownFormat`] when the compiled schema
/// does not declare both standard script formats, and otherwise every error of
/// [`inspect_selection_format`]. Errors publish nothing.
pub fn inspect_standard_script_v1(
    context: &EditorContext,
    document: &RichDocument,
    selection: Option<&RichSelection>,
    pending: Option<&FormatSet>,
) -> Result<StandardScriptStateV1, RichInlineFormatStateError> {
    let read = |kind: StandardInlineFormatV1| {
        inspect_selection_format(context, document, selection, pending, &kind.kind())
    };
    let (sub, sup) =
        (read(StandardInlineFormatV1::Subscript)?, read(StandardInlineFormatV1::Superscript)?);
    if matches!(sub, RichInlineFormatState::Unavailable)
        || matches!(sup, RichInlineFormatState::Unavailable)
    {
        return Ok(StandardScriptStateV1::Unavailable);
    }
    let Some(selection) = selection else {
        return Err(RichInlineFormatStateError::Invariant);
    };
    if super::local_session::typing_state::caret(Some(selection)).is_some() {
        // A caret observes exactly one format set, so the two exact reads are per-character exact.
        return Ok(match (present(&sub), present(&sup)) {
            (false, false) => StandardScriptStateV1::Baseline,
            (true, false) => StandardScriptStateV1::Subscript,
            (false, true) => StandardScriptStateV1::Superscript,
            (true, true) => StandardScriptStateV1::Mixed { conflicting: true },
        });
    }
    let coverage = RichSelectionCoverage::capture(document, selection)?;
    let (mut first, mut different, mut conflicting) = (None, false, false);
    for span in coverage.text() {
        let node = super::rich_selection::block(document, span.block())?;
        let mut at = 0u64;
        for child in node.children() {
            let text = child.as_text().ok_or(RichInlineFormatStateError::Invariant)?;
            let end = at
                .checked_add(u64::from(text.utf16_len()))
                .ok_or(RichInlineFormatStateError::Invariant)?;
            if span.start().get() < end && span.end().get() > at {
                let value = script(text.formats());
                conflicting |= value == Script::Both;
                different |= first.is_some_and(|seen| seen != value);
                first.get_or_insert(value);
            }
            at = end;
        }
    }
    Ok(match first {
        _ if different || conflicting => StandardScriptStateV1::Mixed { conflicting },
        Some(Script::Baseline) => StandardScriptStateV1::Baseline,
        Some(Script::Subscript) => StandardScriptStateV1::Subscript,
        Some(Script::Superscript) => StandardScriptStateV1::Superscript,
        Some(Script::Both) | None => return Err(RichInlineFormatStateError::Invariant),
    })
}
