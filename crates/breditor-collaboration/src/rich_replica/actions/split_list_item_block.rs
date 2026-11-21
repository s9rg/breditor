//! Multi-block item Enter: move a later text block and its following flow into a fresh item.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::SplitListItem as CoreSplit},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
/// Split a list item before a non-leading paragraph/heading; no text is split or copied.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SplitListItemBlock {
    /// Existing later paragraph/heading identity; it becomes the new item's head.
    pub block: String,
    /// Fresh sibling item identity.
    pub new_item: String,
}
impl SplitListItemBlock {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::list_structure::reserve(doc, &self.new_item, "breditor/list-item", None)?;
        super::super::list_structure::retain_text(doc, &self.block)?;
        super::super::list_structure::prepare(doc)
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let id = super::super::paragraphs::id;
        let action = CoreSplit::capture_block(document, &id(&self.block)?, &id(&self.new_item)?)
            .map_err(|_| Error::Contract("shared list block split capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared list block split admission"))?
        else {
            return Ok(());
        };
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
