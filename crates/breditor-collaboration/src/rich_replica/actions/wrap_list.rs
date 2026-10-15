//! Wrap admitted sibling flow with fresh containers while retaining every original body identity.
use super::ListStyle;
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::WrapList as CoreWrap},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Wrap a sibling interval; every selected text block starts one explicitly identified item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WrapList {
    /// First selected flow block, which must be text.
    pub first: String,
    /// Last selected flow block, including trailing rich media.
    pub last: String,
    /// Fresh list wrapper identity.
    pub container: String,
    /// One fresh item identity per selected paragraph/heading.
    pub items: Vec<String>,
    /// Complete resulting kind and first ordinal.
    pub style: ListStyle,
}
impl WrapList {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::list_structure::retain_text(doc, &self.first)?;
        super::super::list_structure::retain_text(doc, &self.last)?;
        if self.items.is_empty() || self.items.len() > 1000 {
            return Err(Error::Limit("shared wrapped list items"));
        }
        self.style.core()?;
        super::super::list_structure::reserve(doc, &self.container, "breditor/bullet-list", None)?;
        for item in &self.items {
            super::super::list_structure::reserve(doc, item, "breditor/list-item", None)?;
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
        let items = self.items.iter().map(|item| id(item)).collect::<Result<Vec<_>, _>>()?;
        let action = CoreWrap::capture(
            document,
            &id(&self.first)?,
            &id(&self.last)?,
            &id(&self.container)?,
            &items,
            self.style.core()?,
        )
        .map_err(|_| Error::Contract("shared list wrap capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared list wrap admission"))?
        else {
            return Ok(());
        };
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
