//! One document replacement lowered to owned visibility and fresh birth operations, never a root register.
use super::{DeleteBlock, InsertBlocks};
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, RichLocalSession, RichSelectionKind},
    session::HistoryCapacity,
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Explicit document-family command with one fresh plain paragraph and bounded literal text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReplaceDocumentPlainTextV1 {
    /// Durably host-reserved paragraph identity; reuse, including historical births, is rejected.
    pub paragraph: String,
    /// Exact text; empty means deletion with a usable empty paragraph.
    pub text: String,
}
struct Plan {
    document: RichDocument,
    insert: InsertBlocks,
    remove: Vec<DeleteBlock>,
}
impl ReplaceDocumentPlainTextV1 {
    fn plan(&self, codec: &DocumentJsonCodecV2, document: &RichDocument) -> Result<Plan, Error> {
        let context = super::super::paragraphs::context(codec);
        let mut native = RichLocalSession::try_new(
            context,
            document.clone(),
            Some(RichSelectionKind::Document),
            HistoryCapacity::try_new(0).map_err(|_| Error::Contract("document preview history"))?,
        )
        .map_err(|_| Error::Contract("document preview"))?;
        native
            .replace_document_plain_text(
                &native.snapshot(),
                &super::super::paragraphs::id(&self.paragraph)?,
                &self.text,
            )
            .map_err(|_| Error::Contract("document replacement native plan"))?;
        let source: Value = serde_json::from_str(
            &codec
                .encode(document.document())
                .map_err(|_| Error::Contract("document source encoding"))?,
        )?;
        let mut remove = vec![];
        for node in
            source["root"]["children"].as_array().ok_or(Error::Contract("document source root"))?
        {
            let block = super::super::creation::block(node)?;
            // A pure normalization floor disappears when the fresh real paragraph becomes visible.
            if !block.starts_with(super::super::model::VIRTUAL_PREFIX) {
                remove.push(DeleteBlock { block: block.into() });
            }
        }
        let after = native.state().document().clone();
        let output: Value = serde_json::from_str(
            &codec
                .encode(after.document())
                .map_err(|_| Error::Contract("document preview encoding"))?,
        )?;
        let nodes = output["root"]["children"]
            .as_array()
            .ok_or(Error::Contract("document preview root"))?
            .clone();
        Ok(Plan {
            document: after,
            insert: InsertBlocks {
                parent: None,
                before: remove.first().map(|d| d.block.clone()),
                nodes,
            },
            remove,
        })
    }
    pub(in crate::rich_replica) fn preview(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        self.plan(codec, document)?;
        if super::super::model::optional_metadata(doc, &self.paragraph).is_some() {
            return Err(Error::Contract("fresh historical document paragraph"));
        }
        Ok(())
    }
    pub(super) fn prepare(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        self.plan(codec, document)?.insert.prepare(doc)
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let plan = self.plan(codec, document)?;
        plan.insert.apply(doc, stamp, 0)?;
        doc.commit();
        for deletion in plan.remove {
            deletion.apply(doc, Stamp::next(doc)?)?;
            doc.commit();
        }
        super::super::paragraphs::verify(doc, codec, &plan.document)
    }
}
