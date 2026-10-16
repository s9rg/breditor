//! Task promotion/unlisting retains rich reading order and independent completion fields.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::OutdentTaskItems as CoreOutdent},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Promote nested tasks or unlist top-level bodies without copying text or media.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OutdentTaskItems {
    /// Source task list.
    pub container: String,
    /// First selected task.
    pub first: String,
    /// Last selected task, inclusive.
    pub last: String,
    /// Fresh suffix wrapper iff both a prefix and suffix survive.
    pub fresh_tail: Option<String>,
}
impl OutdentTaskItems {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::list_structure::retain_heads(
            doc,
            &self.container,
            Some((&self.first, &self.last)),
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
        let action = CoreOutdent::capture(
            document,
            &id(&self.container)?,
            &id(&self.first)?,
            &id(&self.last)?,
            tail.as_ref(),
        )
        .map_err(|_| Error::Contract("shared task outdent capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared task outdent admission"))?
        else {
            return Ok(());
        };
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
