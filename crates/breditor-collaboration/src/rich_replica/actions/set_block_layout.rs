//! V3 layout intent owns only requested independent fields, never text or another field.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::{DocumentJsonCodecV2, decode_rich_block_layout_patch},
    rich_content::{RichDocument, actions::SetBlockLayout as CoreSetBlockLayout},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// One explicit model13 bounded text-block layout edit.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetBlockLayout {
    /// Stable visible or earlier-declared paragraph, heading or code identity.
    pub block: String,
    /// Strict native intent JSON. Kept as text so duplicate nested fields cannot be collapsed.
    pub patch_json: String,
}
impl SetBlockLayout {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        if !super::super::layout_fields::enabled(doc)? {
            return Err(Error::Contract("layout requires shared model 13"));
        }
        super::super::creation::activate_text(doc, &self.block)?;
        super::super::layout_fields::prepare_all(
            &super::super::model::metadata(doc, &self.block)?.ensure_mergeable_map("effects")?,
        )
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let context = super::super::paragraphs::context(codec);
        let patch = decode_rich_block_layout_patch(&context, &self.patch_json)
            .map_err(|_| Error::Contract("shared layout intent"))?;
        let action = CoreSetBlockLayout::capture(
            document,
            &super::super::paragraphs::id(&self.block)?,
            &patch,
        )
        .map_err(|_| Error::Contract("shared layout capture"))?;
        let Some(edit) = action
            .apply(&context, document)
            .map_err(|_| Error::Contract("shared layout admission"))?
        else {
            return Ok(());
        };
        for (field, value) in super::super::layout_fields::changes(patch) {
            field.write(doc, &self.block, value, stamp)?;
        }
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}
