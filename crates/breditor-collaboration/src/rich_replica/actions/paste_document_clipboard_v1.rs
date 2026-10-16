//! Whole-root rich paste lowers to fresh owned births and observed visibility edits, never a root register.
use super::DeleteBlock;
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichClipboardJsonCodec},
    rich_content::{
        CausalStamp, ChangeId, ReplicaId, RichClipboardNamespace, RichDocument,
        RichDocumentClipboardPlan,
    },
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
/// Closed additive document-family command; the clipboard stays semantic content, not causal history.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PasteDocumentClipboardV1 {
    /// Original schema-bound semantic clipboard, independently bounded by its native codec.
    pub clipboard_json: String,
    /// Fresh permanently consumed host namespace, including every failed/undone attempt.
    pub prefix: String,
}
impl PasteDocumentClipboardV1 {
    pub(in crate::rich_replica) fn plan(
        &self,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<RichDocumentClipboardPlan, Error> {
        let context = super::super::paragraphs::context(codec);
        let clipboard = RichClipboardJsonCodec::new(context.clone())
            .decode(&self.clipboard_json)
            .map_err(|_| Error::Contract("document clipboard admission"))?;
        let (lamport, writer, counter) = stamp.words();
        let clock = CausalStamp::new(
            lamport,
            ChangeId::new(
                ReplicaId::try_new(writer).map_err(|_| Error::Contract("document paste author"))?,
                u64::from(counter),
            ),
        );
        let mut ids = RichClipboardNamespace::with_stamp(&self.prefix, clock)
            .map_err(|_| Error::Contract("document paste namespace"))?;
        RichDocumentClipboardPlan::capture(&context, document, &clipboard, &mut ids)
            .map_err(|_| Error::Contract("document clipboard native plan"))
    }
    fn nodes(
        codec: &DocumentJsonCodecV2,
        plan: &RichDocumentClipboardPlan,
    ) -> Result<Vec<Value>, Error> {
        let raw: Value = serde_json::from_str(
            &codec
                .encode(plan.document().document())
                .map_err(|_| Error::Contract("document paste export"))?,
        )?;
        raw["root"]["children"].as_array().cloned().ok_or(Error::Contract("document paste root"))
    }
    fn removed(codec: &DocumentJsonCodecV2, document: &RichDocument) -> Result<Vec<String>, Error> {
        let raw: Value = serde_json::from_str(
            &codec
                .encode(document.document())
                .map_err(|_| Error::Contract("document paste source"))?,
        )?;
        raw["root"]["children"]
            .as_array()
            .ok_or(Error::Contract("document paste source root"))?
            .iter()
            .map(super::super::creation::block)
            .filter_map(|result| match result {
                Ok(id) if id.starts_with(super::super::model::VIRTUAL_PREFIX) => None,
                Ok(id) => Some(Ok(id.into())),
                Err(e) => Some(Err(e)),
            })
            .collect()
    }
    pub(in crate::rich_replica) fn preview(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        fn fresh(doc: &LoroDoc, node: &Value) -> Result<(), Error> {
            if super::super::model::optional_metadata(doc, super::super::creation::block(node)?)
                .is_some()
            {
                return Err(Error::Contract("historical document paste identity"));
            }
            super::super::creation::fresh_entities(doc, node)?;
            for child in
                node["children"].as_array().ok_or(Error::Contract("document paste children"))?
            {
                if child["kind"] == "element" {
                    fresh(doc, child)?;
                }
            }
            Ok(())
        }
        let plan = self.plan(codec, document, Stamp::next(doc)?)?;
        for node in Self::nodes(codec, &plan)? {
            fresh(doc, &node)?;
        }
        Ok(())
    }
    pub(super) fn prepare(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        let plan = self.plan(codec, document, Stamp::next(doc)?)?;
        let removed = Self::removed(codec, document)?;
        for node in Self::nodes(codec, &plan)? {
            super::super::clipboard_plan::prepare(
                doc,
                &node,
                None,
                removed.first().map(String::as_str),
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
    ) -> Result<(), Error> {
        let plan = self.plan(codec, document, stamp)?;
        for (ordinal, node) in Self::nodes(codec, &plan)?.iter().enumerate() {
            super::super::clipboard_plan::publish(doc, node, stamp, ordinal)?;
            doc.commit();
        }
        for block in Self::removed(codec, document)? {
            DeleteBlock { block }.apply(doc, Stamp::next(doc)?)?;
            doc.commit();
        }
        super::super::paragraphs::verify(doc, codec, plan.document())
    }
}
