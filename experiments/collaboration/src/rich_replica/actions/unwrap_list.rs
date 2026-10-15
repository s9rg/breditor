//! Unwrap exactly one list layer without flattening media, nested lists or text sources.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::UnwrapList as CoreUnwrap},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
/// Remove one wrapper/item layer, preserving all rich body identities and order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UnwrapList {
    /// Visible list wrapper identity.
    pub container: String,
}
impl UnwrapList {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::list_structure::retain_heads(doc, &self.container, None)?;
        super::super::list_structure::prepare(doc)
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let action = CoreUnwrap::capture(document, &super::super::paragraphs::id(&self.container)?)
            .map_err(|_| Error::Contract("shared list unwrap capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared list unwrap admission"))?
        else {
            return Ok(());
        };
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
