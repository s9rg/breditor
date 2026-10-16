//! Resolve only admitted rich flow containers, never arbitrary AST/DOM paths.
use crate::Error;
use breditor_core::rich_content::{RichDocument, RichFlowParent, RichFlowPosition};

pub(super) fn position(
    document: &RichDocument,
    parent: Option<&str>,
    before: Option<&str>,
) -> Result<RichFlowPosition, Error> {
    let parent = if let Some(parent) = parent {
        let block = super::paragraphs::id(parent)?;
        match super::selection::kind(document, parent)?.as_str() {
            "breditor/table-cell" => RichFlowParent::Cell(super::merges::cell(document, parent)?),
            "breditor/list-item" => RichFlowParent::ListItem(block),
            "breditor/blockquote" => RichFlowParent::Blockquote(block),
            "breditor/task-item" => RichFlowParent::TaskItem(block),
            _ => return Err(Error::Contract("shared rich flow parent kind")),
        }
    } else {
        RichFlowParent::Document
    };
    Ok(RichFlowPosition::new(parent, before.map(super::paragraphs::id).transpose()?))
}
