//! Empty-task exit is guarded separately from split and rich-tail removal.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::ExitTaskItem as CoreExit},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Exit one truly empty task: promote one level or preserve its prose outside the list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExitTaskItem {
    /// Owning task list.
    pub container: String,
    /// Task whose sole prose head is empty and has no trailing rich flow.
    pub item: String,
    /// Fresh suffix wrapper iff both neighboring intervals remain.
    pub fresh_tail: Option<String>,
}
impl ExitTaskItem {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::list_structure::retain_heads(
            doc,
            &self.container,
            Some((&self.item, &self.item)),
        )?;
        if let Some(tail) = &self.fresh_tail {
            super::super::list_structure::reserve(doc, tail, "breditor/task-list", None)?;
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
        let tail = self.fresh_tail.as_deref().map(id).transpose()?;
        let action =
            CoreExit::capture(document, &id(&self.container)?, &id(&self.item)?, tail.as_ref())
                .map_err(|_| Error::Contract("shared task empty exit capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared task empty exit admission"))?
        else {
            return Ok(());
        };
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
