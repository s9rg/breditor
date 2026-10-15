//! Explicit writer-owned task completion, independent of retained body edits.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::SetTaskChecked as CoreSetTaskChecked},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Set an explicit Boolean; replay never re-evaluates a state-dependent toggle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetTaskChecked {
    /// Stable task-item ID, not a task-list or its leading paragraph.
    pub block: String,
    /// Desired completion state.
    pub checked: bool,
}
impl SetTaskChecked {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::prepare_field(doc, &self.block, "property:breditor/checked")
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let action = CoreSetTaskChecked::capture(
            document,
            &super::super::paragraphs::id(&self.block)?,
            self.checked,
        )
        .map_err(|_| Error::Contract("shared task completion capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared task completion admission"))?
        else {
            return Ok(());
        };
        super::super::model::write_patch(
            doc,
            &self.block,
            "property:breditor/checked",
            &super::super::model::Patch::set("breditor/checked", json!(self.checked)),
            stamp,
        )?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}
