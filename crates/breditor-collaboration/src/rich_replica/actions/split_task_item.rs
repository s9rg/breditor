//! Task Enter routes original suffix characters and moves the entire rich tail.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    position::{Affinity, TextOffset},
    rich_content::{RichDocument, RichTextPoint, actions::SplitTaskItem as CoreSplit},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Split task prose without copying its causal suffix; the new right task starts unchecked.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SplitTaskItem {
    /// Existing task's leading paragraph or heading.
    pub block: String,
    /// Scalar-aligned logical UTF-16 split boundary.
    pub offset: u32,
    /// Fresh right task identity.
    pub new_item: String,
    /// Fresh right prose identity.
    pub right: String,
    /// Optional heading rank for the new right prose block.
    pub right_heading: Option<u8>,
}
impl SplitTaskItem {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::list_structure::reserve_task(doc, &self.new_item, false)?;
        super::super::list_structure::reserve(
            doc,
            &self.right,
            if self.right_heading.is_some() { "breditor/heading" } else { "breditor/paragraph" },
            self.right_heading,
        )?;
        super::super::list_structure::prepare_v2(doc)?;
        super::super::text_flow::prepare_root(doc, &self.block)?;
        super::super::text_flow::PreparedSplit::reserve(doc, &self.right)
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let id = super::super::paragraphs::id;
        let point = RichTextPoint::new(
            id(&self.block)?,
            TextOffset::try_new(u64::from(self.offset)).map_err(|_| Error::Offset)?,
            Affinity::After,
        );
        let action = CoreSplit::capture(
            document,
            &point,
            &id(&self.new_item)?,
            &id(&self.right)?,
            self.right_heading,
        )
        .map_err(|_| Error::Contract("shared task split capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared task split admission"))?
        else {
            return Ok(());
        };
        let split = super::super::text_flow::PreparedSplit::plan(
            doc,
            &self.block,
            self.offset,
            &self.right,
        )?;
        super::super::list_structure::apply(doc, codec, document, edit.document(), stamp)?;
        split.apply_owned(doc, stamp)?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}
