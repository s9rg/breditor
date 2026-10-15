//! List Backspace joins text sources only when the core's rich reading-order rule permits it.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::JoinListItems as CoreJoin},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
/// Join adjacent items; a rich left tail keeps the right head as a distinct later body block.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct JoinListItems {
    /// Visible list wrapper identity.
    pub container: String,
    /// Left item identity.
    pub left: String,
    /// Adjacent right item identity.
    pub right: String,
}
impl JoinListItems {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::list_structure::retain_heads(
            doc,
            &self.container,
            Some((&self.left, &self.right)),
        )?;
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
        let action =
            CoreJoin::capture(document, &id(&self.container)?, &id(&self.left)?, &id(&self.right)?)
                .map_err(|_| Error::Contract("shared list join capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared list join admission"))?
        else {
            return Ok(());
        };
        let before: Value = serde_json::from_str(
            &codec
                .encode(document.document())
                .map_err(|_| Error::Contract("shared list join source"))?,
        )?;
        let after: Value = serde_json::from_str(
            &codec
                .encode(edit.document().document())
                .map_err(|_| Error::Contract("shared list join result"))?,
        )?;
        let head = |item: &str| -> Result<String, Error> {
            super::super::creation::find(&before["root"], item)
                .and_then(|item| item["children"].get(0))
                .and_then(|node| node.pointer("/properties/breditor~1block-id"))
                .and_then(Value::as_str)
                .map(str::to_owned)
                .ok_or(Error::Contract("shared list leading head"))
        };
        let right = head(&self.right)?;
        if super::super::creation::find(&after["root"], &right).is_none() {
            super::super::text_flow::PreparedJoin::prepare(doc, &head(&self.left)?, &right)?
                .apply_staged(doc)?;
            doc.commit();
        }
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
