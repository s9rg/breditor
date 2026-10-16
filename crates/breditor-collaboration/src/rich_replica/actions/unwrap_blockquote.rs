//! Remove exactly one quote layer without replacing its original source bodies.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::UnwrapBlockquote as CoreUnwrap},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Unwrap one V2 quote, retaining nested quote/list/media identities.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UnwrapBlockquote {
    /// Existing visible quote wrapper.
    pub wrapper: String,
}
impl UnwrapBlockquote {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::list_structure::retain_body(doc, &self.wrapper)?;
        super::super::list_structure::prepare_v2(doc)
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let action = CoreUnwrap::capture(document, &super::super::paragraphs::id(&self.wrapper)?)
            .map_err(|_| Error::Contract("shared quote unwrap capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared quote unwrap admission"))?
        else {
            return Ok(());
        };
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
