//! Shared V4 page break birth at an explicit document-root position.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichBlockDraft, RichDocument, actions::InsertBlocks as CoreInsert},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// Insert one fresh V4 page break directly below the document root.
///
/// There is no parent field: a page break is root-only, so a non-root position is not
/// representable. The before-anchor must be a visible root block (or append).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsertPageBreak {
    /// Fresh page-break block identity.
    pub block: String,
    /// Direct root-child anchor, or append.
    pub before: Option<String>,
}
impl InsertPageBreak {
    fn node(&self) -> Value {
        json!({"kind":"element","type":"breditor/page-break","entityId":null,"properties":{"breditor/block-id":self.block},"children":[]})
    }
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::clipboard_flow::prepare(doc, None)?;
        super::super::clipboard_plan::prepare(doc, &self.node(), None, self.before.as_deref())
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
        ordinal: usize,
    ) -> Result<(), Error> {
        let position = super::super::flow_parent::position(document, None, self.before.as_deref())?;
        let draft = RichBlockDraft::page_break(&super::super::paragraphs::id(&self.block)?)
            .map_err(|_| Error::Contract("shared page break draft"))?;
        let action = CoreInsert::capture(document, &position, vec![draft])
            .map_err(|_| Error::Contract("shared page break capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared page break admission"))?
        else {
            return Ok(());
        };
        super::super::clipboard_plan::publish(doc, &self.node(), stamp, ordinal)?;
        // As for rules: resolve this command's root order now, with an owned occurrence,
        // because earlier commands of the same group can move siblings.
        super::super::placement::move_block(
            doc,
            &self.block,
            None,
            self.before.as_deref(),
            stamp,
            1_000_000,
        )?;
        super::super::clipboard_flow::retain(doc, codec, document, edit.document(), None, stamp)?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}
