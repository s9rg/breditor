//! Shared V4 page break deletion with an explicit optional fresh floor paragraph.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::ReplaceBlocks as CoreReplace},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Delete one V4 page break. A sole root child needs the host-supplied fresh empty
/// paragraph `paragraph` (as the local `deletePageBreak` floor); otherwise it is `null`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeletePageBreak {
    /// Existing page-break block identity.
    pub block: String,
    /// Optional fresh empty floor paragraph identity.
    pub paragraph: Option<String>,
}
impl DeletePageBreak {
    fn floor(&self) -> Result<Option<Value>, Error> {
        self.paragraph.as_deref().map(|id| super::super::atom_edit::paragraph(id, "")).transpose()
    }
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::model::metadata(doc, &self.block)?.ensure_mergeable_map("deletions")?;
        if let Some(floor) = self.floor()? {
            super::super::clipboard_plan::prepare(doc, &floor, None, Some(&self.block))?;
        }
        Ok(())
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
        ordinal: usize,
    ) -> Result<(), Error> {
        let block = super::super::paragraphs::id(&self.block)?;
        if !document.is_page_break(&block) {
            return Err(Error::Contract("shared page break target"));
        }
        let floor = self.floor()?;
        let drafts = if let Some(node) = &floor {
            let source = super::super::clipboard_plan::admit(
                codec,
                super::super::clipboard_plan::envelope(doc)?,
                vec![node.clone()],
            )?;
            super::super::clipboard_plan::drafts(&source, std::slice::from_ref(node))?
        } else {
            vec![]
        };
        let action = CoreReplace::capture(document, &block, &block, drafts)
            .map_err(|_| Error::Contract("shared page break delete capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared page break delete admission"))?
        else {
            return Ok(());
        };
        if let Some(node) = &floor {
            super::super::clipboard_plan::publish(doc, node, stamp, ordinal)?;
            super::super::placement::move_block(
                doc,
                super::super::creation::block(node)?,
                None,
                Some(&self.block),
                stamp,
                1_000_000,
            )?;
        }
        super::DeleteBlock { block: self.block.clone() }.apply(doc, stamp)?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}
