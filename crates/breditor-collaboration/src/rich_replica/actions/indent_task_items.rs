//! Task indentation owns retained placements, not replacement snapshots of item bodies.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::IndentTaskItems as CoreIndent},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Nest a contiguous task interval under its preceding task, preserving completion.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IndentTaskItems {
    /// Source task list.
    pub container: String,
    /// First selected task.
    pub first: String,
    /// Last selected task, inclusive.
    pub last: String,
    /// Fresh nested list iff the preceding task has no trailing task list.
    pub new_nested: Option<String>,
}
impl IndentTaskItems {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        if let Some(nested) = &self.new_nested {
            super::super::list_structure::reserve(doc, nested, "breditor/task-list", None)?;
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
        let nested = self.new_nested.as_deref().map(id).transpose()?;
        let action = CoreIndent::capture(
            document,
            &id(&self.container)?,
            &id(&self.first)?,
            &id(&self.last)?,
            nested.as_ref(),
        )
        .map_err(|_| Error::Contract("shared task indent capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared task indent admission"))?
        else {
            return Ok(());
        };
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
