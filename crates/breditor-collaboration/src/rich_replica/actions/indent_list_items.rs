//! Indent a contiguous item interval as retained subtrees, with an explicit new nested wrapper.
use super::NestedList;
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::IndentListItems as CoreIndent},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
/// Move complete items into the previous item's compatible trailing list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IndentListItems {
    /// Source list wrapper identity.
    pub container: String,
    /// First selected item identity.
    pub first: String,
    /// Last selected item identity, inclusive.
    pub last: String,
    /// Required only when no compatible trailing list exists.
    pub new_nested: Option<NestedList>,
}
impl IndentListItems {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        if let Some(nested) = &self.new_nested {
            nested.style.core()?;
            super::super::list_structure::reserve(
                doc,
                &nested.block,
                "breditor/bullet-list",
                None,
            )?;
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
        let nested = self
            .new_nested
            .as_ref()
            .map(|value| Ok::<_, Error>((id(&value.block)?, value.style.core()?)))
            .transpose()?;
        let action = CoreIndent::capture(
            document,
            &id(&self.container)?,
            &id(&self.first)?,
            &id(&self.last)?,
            nested,
        )
        .map_err(|_| Error::Contract("shared list indent capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared list indent admission"))?
        else {
            return Ok(());
        };
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
