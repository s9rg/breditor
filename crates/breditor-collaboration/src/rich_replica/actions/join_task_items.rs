//! Task join retains source text and both independent completion contributions.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::JoinTaskItems as CoreJoin},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Join adjacent tasks; left completion wins and a left rich tail prevents text concatenation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct JoinTaskItems {
    /// Owning task list.
    pub container: String,
    /// Left task identity.
    pub left: String,
    /// Immediately following right task identity.
    pub right: String,
}
impl JoinTaskItems {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::list_structure::retain_heads(
            doc,
            &self.container,
            Some((&self.left, &self.right)),
        )?;
        super::super::list_structure::prepare_v2(doc)
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
                .map_err(|_| Error::Contract("shared task join capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared task join admission"))?
        else {
            return Ok(());
        };
        let before: Value = serde_json::from_str(
            &codec
                .encode(document.document())
                .map_err(|_| Error::Contract("shared task join source"))?,
        )?;
        let after: Value = serde_json::from_str(
            &codec
                .encode(edit.document().document())
                .map_err(|_| Error::Contract("shared task join result"))?,
        )?;
        let head = |item: &str| -> Result<String, Error> {
            super::super::creation::find(&before["root"], item)
                .and_then(|item| item["children"].get(0))
                .and_then(|node| node.pointer("/properties/breditor~1block-id"))
                .and_then(Value::as_str)
                .map(str::to_owned)
                .ok_or(Error::Contract("shared task leading head"))
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
