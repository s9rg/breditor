use crate::{document::NodeRef, rich_content::RichDocument};

/// Whether the accepted AST admits the document-level writing prompt.
///
/// Exactly one top-level paragraph or heading with no text leaves qualifies.
/// Whitespace, additional blocks and every structural container/atom (including
/// empty code, lists, quotes, tables and images) are retained content, not empty.
/// Layout and heading rank do not suppress a prompt in an otherwise empty prose
/// block. This is a presentation policy, not a test for discarding saved data.
///
/// The admitted immutable tree makes this a constant-work, allocation-free read.
/// Empty text leaves cannot exist in an admitted document. No history, selection,
/// metadata, proposal or document property is changed or inferred from counts.
#[must_use]
pub fn is_rich_placeholder_empty(document: &RichDocument) -> bool {
    let Some(root) = document.document().root().as_element() else {
        return false;
    };
    if root.children().len() != 1 {
        return false;
    }
    let Some(block) = root.children().get(0).and_then(NodeRef::as_element) else {
        return false;
    };
    matches!(block.kind().as_str(), "breditor/paragraph" | "breditor/heading")
        && block.children().is_empty()
}
