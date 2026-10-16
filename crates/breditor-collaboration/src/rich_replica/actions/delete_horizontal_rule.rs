//! Explicit rule deletion with an optional fresh semantic replacement, never a silent fallback.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::DeleteHorizontalRule as CoreDelete},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Delete a V2 rule; a sole-child flow needs a host-supplied replacement.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeleteHorizontalRule {
    /// Existing rule block identity.
    pub block: String,
    /// Optional complete fresh flow AST record with active semantic geometry only.
    pub replacement: Option<Value>,
}
impl DeleteHorizontalRule {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::model::metadata(doc, &self.block)?.ensure_mergeable_map("deletions")?;
        if let Some(replacement) = &self.replacement {
            let source = super::super::materialize::envelope(doc)?;
            let parent = if super::super::creation::find(&source["root"], &self.block).is_some() {
                super::super::paragraphs::layout(&source["root"], &self.block)?.0
            } else {
                super::super::placement::origin_parent(doc, &self.block)?
            };
            super::super::clipboard_plan::prepare(
                doc,
                replacement,
                parent.as_deref(),
                Some(&self.block),
            )?;
        }
        Ok(())
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
        ordinal: usize,
    ) -> Result<(), Error> {
        let mut replacement = self.replacement.clone();
        let draft = if let Some(node) = &mut replacement {
            super::super::clipboard_plan::author_clocks(node, stamp)?;
            let source = super::super::clipboard_plan::admit(
                codec,
                super::super::clipboard_plan::envelope(doc)?,
                vec![node.clone()],
            )?;
            super::super::clipboard_plan::semantic(codec, &source)?;
            super::super::clipboard_plan::drafts(&source, std::slice::from_ref(node))?.pop()
        } else {
            None
        };
        let action =
            CoreDelete::capture(document, &super::super::paragraphs::id(&self.block)?, draft)
                .map_err(|_| Error::Contract("shared rule delete capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared rule delete admission"))?
        else {
            return Ok(());
        };
        if let Some(node) = &replacement {
            super::super::clipboard_plan::publish(doc, node, stamp, ordinal)?;
            let before: Value = serde_json::from_str(
                &codec
                    .encode(document.document())
                    .map_err(|_| Error::Contract("shared rule source encoding"))?,
            )?;
            let parent = super::super::paragraphs::layout(&before["root"], &self.block)?.0;
            super::super::placement::move_block(
                doc,
                super::super::creation::block(node)?,
                parent.as_deref(),
                Some(&self.block),
                stamp,
                1_000_000,
            )?;
        }
        super::DeleteBlock { block: self.block.clone() }.apply(doc, stamp)?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}
