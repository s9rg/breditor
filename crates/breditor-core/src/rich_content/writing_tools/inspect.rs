use super::{
    RICH_WRITING_MAX_TEXT_BYTES, RichHeadingOutlineEntry, RichWritingCounts, RichWritingError,
    RichWritingTools,
};
use crate::{
    document::{NodeRef, PropertyValue},
    rich_content::{RichDocument, RichSearchError, ast_properties, search::domains},
};

/// Count accepted text and derive headings without publishing content/UI/history.
///
/// Uses native Find's bounded semantic-domain traversal: transparent lists/tasks/
/// quotes, caption/code bodies and visible merged-source partitions once each.
/// Metadata, alt text, generated numbering and structural separators are excluded.
/// Words/graphemes are segmented across format runs, but not across block edges.
///
/// # Errors
/// Rejects the complete read on text, domain or node limits or an admitted-tree
/// contradiction. Labels alone may truncate, explicitly and at grapheme edges.
pub fn inspect_rich_writing_tools(
    document: &RichDocument,
) -> Result<RichWritingTools, RichWritingError> {
    fn mapped(error: RichSearchError) -> RichWritingError {
        match error {
            RichSearchError::DocumentLimit => RichWritingError::DocumentLimit,
            _ => RichWritingError::Invariant,
        }
    }
    let mut result = RichWritingTools { counts: RichWritingCounts::default(), outline: Vec::new() };
    let mut bytes = 0;
    for block in domains::domains(document).map_err(mapped)? {
        let text =
            domains::text(document, &block, RICH_WRITING_MAX_TEXT_BYTES - bytes).map_err(mapped)?;
        bytes += text.len();
        result.counts.add(&text)?;
        let node = document
            .block_path(&block)
            .and_then(|p| document.document().node_at(p).ok())
            .and_then(NodeRef::as_element)
            .ok_or(RichWritingError::Invariant)?;
        if node.kind().as_str() == "breditor/heading" {
            let level = ast_properties::property(node, "level")
                .and_then(PropertyValue::as_integer)
                .and_then(|value| u8::try_from(value.get()).ok())
                .filter(|value| (1..=6).contains(value))
                .ok_or(RichWritingError::Invariant)?;
            result.outline.push(RichHeadingOutlineEntry::new(block, level, &text));
        }
    }
    Ok(result)
}
