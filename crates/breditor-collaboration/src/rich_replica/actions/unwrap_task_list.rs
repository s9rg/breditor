//! Unlist one task layer without erasing retained item metadata or remote body edits.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::UnwrapTaskList as CoreUnwrap},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Promote every task body into its actual flow parent; nested lists remain intact.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UnwrapTaskList {
    /// Existing visible task-list wrapper.
    pub container: String,
}
impl UnwrapTaskList {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::list_structure::retain_heads(doc, &self.container, None)?;
        super::super::list_structure::prepare_v2(doc)
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let action = CoreUnwrap::capture(document, &super::super::paragraphs::id(&self.container)?)
            .map_err(|_| Error::Contract("shared task unwrap capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared task unwrap admission"))?
        else {
            return Ok(());
        };
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
