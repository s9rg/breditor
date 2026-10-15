//! Schema-admitted pending caret formats and explicit effective-context preservation.

use super::{RichLocalSessionError, RichLocalState};
use crate::{
    document::FormatSet,
    rich_content::{
        RichDocument, RichSelection, RichSelectionKind, RichTextPoint, actions::RichBatchEdit,
    },
    state::EditorContext,
};

pub(crate) fn caret(selection: Option<&RichSelection>) -> Option<&RichTextPoint> {
    let RichSelectionKind::TextRange { anchor, focus } = selection?.kind() else {
        return None;
    };
    (anchor.block() == focus.block() && anchor.offset() == focus.offset()).then_some(focus)
}

/// Shared exact caret lookup for typing and read-only formatting state.
pub(crate) fn resolved_caret_formats(
    document: &RichDocument,
    focus: &crate::position::Point,
    pending: Option<&FormatSet>,
) -> Result<FormatSet, RichLocalSessionError> {
    if let Some(formats) = pending {
        return Ok(formats.clone());
    }
    match focus {
        crate::position::Point::Text { text_path, .. } => document
            .document()
            .node_at(text_path)
            .ok()
            .and_then(crate::document::NodeRef::as_text)
            .map(|text| text.formats().clone())
            .ok_or(RichLocalSessionError::HistoryMismatch),
        crate::position::Point::Children { .. } => Ok(FormatSet::default()),
    }
}

pub(crate) fn validate(
    context: &EditorContext,
    document: &RichDocument,
    selection: Option<&RichSelection>,
    formats: Option<&FormatSet>,
) -> Result<(), RichLocalSessionError> {
    let Some(formats) = formats else {
        return Ok(());
    };
    let caret = caret(selection).ok_or(RichLocalSessionError::TypingCaret)?;
    if !formats.is_empty()
        && document
            .block_path(caret.block())
            .and_then(|path| document.document().node_at(path).ok())
            .and_then(crate::document::NodeRef::as_element)
            .is_some_and(|node| node.kind().as_str() == "breditor/code-block")
    {
        return Err(RichLocalSessionError::CodeFormats);
    }
    validate_formats(context, formats)
}

pub(crate) fn validate_formats(
    context: &EditorContext,
    formats: &FormatSet,
) -> Result<(), RichLocalSessionError> {
    if formats.len() > context.limits().max_formats_per_text() {
        return Err(RichLocalSessionError::TypingLimit);
    }
    let mut values = 0u64;
    let mut strings = 0u64;
    for format in formats {
        let summary = context.schema().validate_inline_format_instance(context.limits(), format)?;
        values = values
            .checked_add(summary.property_value_count())
            .ok_or(RichLocalSessionError::TypingLimit)?;
        strings = strings
            .checked_add(summary.property_string_bytes())
            .ok_or(RichLocalSessionError::TypingLimit)?;
    }
    if values > u64::try_from(context.limits().max_property_values()).unwrap_or(u64::MAX)
        || strings
            > u64::try_from(context.limits().max_total_property_string_bytes()).unwrap_or(u64::MAX)
    {
        return Err(RichLocalSessionError::TypingLimit);
    }
    Ok(())
}

pub(super) fn mapped(
    before: &RichLocalState,
    document: &RichDocument,
    selection: Option<&RichSelection>,
    edit: Option<&RichBatchEdit>,
) -> Option<FormatSet> {
    let formats = before.pending_formats.as_ref()?;
    let old = caret(before.selection.as_ref())?;
    let after = caret(selection)?;
    if old.block() != after.block() {
        return None;
    }
    let node_kind = |document: &RichDocument, point: &RichTextPoint| {
        document
            .block_path(point.block())
            .and_then(|path| document.document().node_at(path).ok())
            .and_then(crate::document::NodeRef::as_element)
            .map(|node| node.kind().clone())
    };
    if node_kind(&before.document, old) != node_kind(document, after) {
        return None;
    }
    if let Some(edit) = edit {
        let expected = edit.map_selection(before.selection.as_ref()?).ok()?.into_selection()?;
        if caret(Some(&expected)) != Some(after) {
            return None;
        }
    } else if old != after {
        return None;
    }
    Some(formats.clone())
}
