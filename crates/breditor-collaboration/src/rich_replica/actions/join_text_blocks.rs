//! Join admitted adjacent text blocks by attaching the right source root to the left.
use crate::Error;
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::JoinTextBlocks as CoreJoin},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Join direct flow siblings while retaining the left identity/kind and every original character.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct JoinTextBlocks {
    /// Surviving paragraph/heading identity.
    pub left: String,
    /// Adjacent following paragraph/heading identity; its causal state is retained.
    pub right: String,
}
impl JoinTextBlocks {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::text_flow::prepare_root(doc, &self.left)?;
        super::super::text_flow::prepare_root(doc, &self.right)
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        let action = CoreJoin::capture(
            document,
            &super::super::paragraphs::id(&self.left)?,
            &super::super::paragraphs::id(&self.right)?,
        )
        .map_err(|_| Error::Contract("shared paragraph join capture"))?;
        let edit = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared paragraph join admission"))?
            .ok_or(Error::Contract("shared paragraph join effect"))?;
        super::super::text_flow::PreparedJoin::prepare(doc, &self.left, &self.right)?
            .apply_staged(doc)?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}
