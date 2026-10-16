//! One owned quote birth and retained placements; enclosed text is never copied.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::WrapBlockquote as CoreWrap},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Wrap a complete direct-sibling flow interval in a fresh V2 quote.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WrapBlockquote {
    /// First selected flow block.
    pub first: String,
    /// Last selected flow block, inclusive and in document order.
    pub last: String,
    /// Fresh stable quote wrapper identity.
    pub wrapper: String,
}
impl WrapBlockquote {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::list_structure::retain_text(doc, &self.first)?;
        super::super::list_structure::retain_text(doc, &self.last)?;
        super::super::list_structure::reserve(doc, &self.wrapper, "breditor/blockquote", None)?;
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
            CoreWrap::capture(document, &id(&self.first)?, &id(&self.last)?, &id(&self.wrapper)?)
                .map_err(|_| Error::Contract("shared quote wrap capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared quote wrap admission"))?
        else {
            return Ok(());
        };
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
