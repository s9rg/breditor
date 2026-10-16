//! Fresh task wrappers own explicit completion defaults; bodies retain their causal identity.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::WrapTaskList as CoreWrap},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Explicit host-owned fresh task identity and its initial completion.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NewTaskItem {
    /// Fresh task-item identity, independent of its existing prose head.
    pub block: String,
    /// Initial checked state; never inferred from browser markup.
    pub checked: bool,
}
/// Wrap prose-led sibling groups, retaining each group's complete rich tail.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WrapTaskList {
    /// First selected flow block; must be prose.
    pub first: String,
    /// Last selected flow block, inclusive.
    pub last: String,
    /// Fresh task-list wrapper.
    pub container: String,
    /// Exactly one fresh item identity/checked value per leading prose block.
    pub items: Vec<NewTaskItem>,
}
impl WrapTaskList {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        if self.items.is_empty() || self.items.len() > 1000 {
            return Err(Error::Limit("shared wrapped task items"));
        }
        super::super::list_structure::retain_text(doc, &self.first)?;
        super::super::list_structure::retain_text(doc, &self.last)?;
        super::super::list_structure::reserve(doc, &self.container, "breditor/task-list", None)?;
        for item in &self.items {
            super::super::list_structure::reserve_task(doc, &item.block, item.checked)?;
        }
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
        let items = self
            .items
            .iter()
            .map(|item| Ok((id(&item.block)?, item.checked)))
            .collect::<Result<Vec<_>, Error>>()?;
        let action = CoreWrap::capture(
            document,
            &id(&self.first)?,
            &id(&self.last)?,
            &id(&self.container)?,
            &items,
        )
        .map_err(|_| Error::Contract("shared task wrap capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared task wrap admission"))?
        else {
            return Ok(());
        };
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
