//! Whole-caption creation/replacement/removal selects retained source identity with owned intent.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{ImageId, RichBlockDraft, RichDocument, actions::SetImageCaption as CoreSet},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Select a fresh paragraph caption or explicit absence, without erasing hidden remote text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetImageCaption {
    /// Stable image block identity, not its asset identity.
    pub block: String,
    /// Fresh schema-bound paragraph with explicit formats; null owns a caption-removal choice.
    #[serde(deserialize_with = "caption_value")]
    pub caption: Option<Value>,
}
fn caption_value<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Value>, D::Error> {
    Option::<Value>::deserialize(deserializer)
}
impl SetImageCaption {
    fn draft(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
    ) -> Result<Option<RichBlockDraft>, Error> {
        let Some(node) = &self.caption else {
            return Ok(None);
        };
        if node["type"] != "breditor/paragraph" {
            return Err(Error::Contract("shared caption paragraph kind"));
        }
        let source = super::super::clipboard_plan::admit(
            codec,
            super::super::materialize::header(doc)?,
            vec![node.clone()],
        )?;
        Ok(super::super::clipboard_plan::drafts(&source, std::slice::from_ref(node))?
            .into_iter()
            .next())
    }
    pub(in crate::rich_replica) fn validate_draft(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
    ) -> Result<(), Error> {
        if let Some(node) = &self.caption {
            super::super::creation::fresh_entities(doc, node)?;
        }
        self.draft(doc, codec)?;
        Ok(())
    }
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::captions::prepare_parent(doc, Some(&self.block))?;
        if let Some(node) = &self.caption {
            super::super::creation::prepare(doc, node, Some(&self.block), None)?;
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
        let raw: Value = serde_json::from_str(
            &codec
                .encode(document.document())
                .map_err(|_| Error::Contract("shared caption export"))?,
        )?;
        let image = super::super::creation::find(&raw["root"], &self.block)
            .ok_or(Error::Contract("visible shared caption image"))?;
        let id = ImageId::try_new(
            image["properties"]["breditor/image-id"]
                .as_str()
                .ok_or(Error::Contract("shared caption image identity"))?,
        )
        .map_err(|_| Error::Contract("shared caption image identity"))?;
        let action = CoreSet::capture(document, &id, self.draft(doc, codec)?)
            .map_err(|_| Error::Contract("shared caption capture"))?;
        let edit = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared caption admission"))?;
        if let Some(node) = &self.caption {
            super::super::creation::publish(doc, node, stamp, ordinal)?;
        }
        // Explicit absence owns intent even when the current image has no caption.
        super::super::captions::write(
            doc,
            &self.block,
            self.caption.as_ref().map(super::super::creation::block).transpose()?,
            stamp,
        )?;
        super::super::paragraphs::verify(
            doc,
            codec,
            edit.as_ref().map_or(document, |edit| edit.document()),
        )
    }
}
