//! Promote nested items or unlist a top-level interval, retaining numbered tails and rich order.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::OutdentListItems as CoreOutdent},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
/// Outdent a contiguous item interval; the core decides nested versus top-level semantics.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OutdentListItems {
    /// Source list wrapper identity.
    pub container: String,
    /// First selected item identity.
    pub first: String,
    /// Last selected item identity, inclusive.
    pub last: String,
    /// Fresh tail wrapper exactly when both a prefix and suffix remain.
    pub fresh_tail: Option<String>,
}
impl OutdentListItems {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::list_structure::retain_heads(
            doc,
            &self.container,
            Some((&self.first, &self.last)),
        )?;
        if let Some(tail) = &self.fresh_tail {
            super::super::list_structure::reserve(doc, tail, "breditor/bullet-list", None)?;
        }
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
        let tail = self.fresh_tail.as_deref().map(id).transpose()?;
        let action = CoreOutdent::capture(
            document,
            &id(&self.container)?,
            &id(&self.first)?,
            &id(&self.last)?,
            tail.as_ref(),
        )
        .map_err(|_| Error::Contract("shared list outdent capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared list outdent admission"))?
        else {
            return Ok(());
        };
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
