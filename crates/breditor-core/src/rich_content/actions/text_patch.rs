//! Checked one-block text replacement shared by insertion, deletion and replacement actions.

use super::{ReplaceText, RichAction, RichActionError, RichEdit, node_patch::NodePatch};
use crate::{
    document::{NodeRef, TextFragment, TextRun},
    position::TextOffset,
    rich_content::{BlockId, RichDocument, rich_text_mapping::RichTextMap},
    state::EditorContext,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct TextPatch {
    patch: NodePatch,
    pub(super) map: RichTextMap,
}

pub(crate) fn fragment(node: &NodeRef) -> Result<TextFragment, RichActionError> {
    let element = node
        .as_element()
        .filter(|node| matches!(node.kind().as_str(), "breditor/paragraph" | "breditor/heading"))
        .ok_or(RichActionError::TextTarget)?;
    TextFragment::try_from_runs(
        element
            .children()
            .iter()
            .map(|node| {
                node.as_text().map(TextRun::from_text_node).ok_or(RichActionError::TextTarget)
            })
            .collect::<Result<_, _>>()?,
    )
    .map_err(|_| RichActionError::TextPrimitive)
}

pub(crate) fn block_node<'a>(
    document: &'a RichDocument,
    block: &BlockId,
) -> Result<&'a NodeRef, RichActionError> {
    document
        .block_path(block)
        .and_then(|path| document.document().node_at(path).ok())
        .ok_or(RichActionError::MissingTarget)
}

pub(crate) fn text_node(source: &NodeRef, text: &TextFragment) -> Result<NodeRef, RichActionError> {
    Ok(NodeRef::element(
        source
            .as_element()
            .ok_or(RichActionError::TextTarget)?
            .try_with_children(
                text.iter().cloned().map(TextRun::into_text_node).map(NodeRef::text).collect(),
            )
            .map_err(|_| RichActionError::Rewrite)?,
    ))
}

impl TextPatch {
    pub(super) fn capture(
        document: &RichDocument,
        block: &BlockId,
        start: TextOffset,
        end: TextOffset,
        inserted: &TextFragment,
    ) -> Result<Self, RichActionError> {
        if start > end {
            return Err(RichActionError::TextRange);
        }
        let source = block_node(document, block)?;
        let original = fragment(source)?;
        let (head, rest) = original.split_at(start).map_err(|_| RichActionError::TextRange)?;
        let length =
            TextOffset::try_new(end.get() - start.get()).map_err(|_| RichActionError::TextRange)?;
        let (_, tail) = rest.split_at(length).map_err(|_| RichActionError::TextRange)?;
        let text = head
            .try_concat(inserted)
            .and_then(|text| text.try_concat(&tail))
            .map_err(|_| RichActionError::TextPrimitive)?;
        let replacement = text_node(source, &text)?;
        Ok(Self {
            patch: NodePatch::capture(document, block, replacement.clone())?,
            map: RichTextMap {
                block: block.clone(),
                start,
                end,
                inserted: inserted.utf16_len(),
                before: source.clone(),
                after: replacement,
            },
        })
    }
    fn inverse(&self) -> Result<Self, RichActionError> {
        Ok(Self { patch: self.patch.inverse(), map: self.map.inverse()? })
    }
    pub(super) fn edit(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::ReplaceText(ReplaceText::from_inverse(self.inverse()?)),
        )
    }
}
