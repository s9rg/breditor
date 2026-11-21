//! Shared V4 table captions: one owned paragraph birth below the table, or its deletion.
//!
//! The caption is an ordinary paragraph child of the table (placement admits rows and
//! paragraphs under a V4 table; the projection always shows rows first). Its text is a
//! normal text container, so typing and formats in it merge per character.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::TextFragment,
    rich_content::{RichBlockDraft, RichDocument, TableId, actions::SetTableCaption},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// The visible table with block identity `block` (encoded AST record).
fn table(
    codec: &DocumentJsonCodecV2,
    document: &RichDocument,
    block: &str,
) -> Result<Value, Error> {
    let source: Value = serde_json::from_str(
        &codec.encode(document.document()).map_err(|_| Error::Contract("shared caption AST"))?,
    )?;
    super::super::creation::find(&source["root"], block)
        .filter(|node| node["type"] == "breditor/table")
        .cloned()
        .ok_or(Error::Contract("shared caption table target"))
}
fn table_id(node: &Value) -> Result<TableId, Error> {
    TableId::try_new(
        node.pointer("/properties/breditor~1table-id")
            .and_then(Value::as_str)
            .ok_or(Error::Contract("shared caption table identity"))?,
    )
    .map_err(|_| Error::Contract("shared caption table identity"))
}
/// The current caption identity: a trailing paragraph child.
fn caption(node: &Value) -> Option<&str> {
    node["children"]
        .as_array()?
        .last()
        .filter(|child| child["type"] == "breditor/paragraph")
        .and_then(|child| child.pointer("/properties/breditor~1block-id"))
        .and_then(Value::as_str)
}

/// Add one empty caption with a fresh identity to a table without a caption.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AddTableCaption {
    /// Existing visible table block identity.
    pub block: String,
    /// Fresh caption paragraph identity.
    pub caption: String,
}
impl AddTableCaption {
    fn node(&self) -> Value {
        json!({"kind":"element","type":"breditor/paragraph","entityId":null,
            "properties":{"breditor/block-id":self.caption},"children":[]})
    }
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::creation::prepare(doc, &self.node(), Some(&self.block), None)
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
        ordinal: usize,
    ) -> Result<(), Error> {
        let node = table(codec, document, &self.block)?;
        // As locally: an existing caption is refused, never replaced.
        if caption(&node).is_some() {
            return Err(Error::Contract("shared table caption exists"));
        }
        let draft = RichBlockDraft::paragraph(
            &super::super::paragraphs::id(&self.caption)?,
            &TextFragment::empty(),
        )
        .map_err(|_| Error::Contract("shared caption draft"))?;
        let action = SetTableCaption::capture(document, &table_id(&node)?, Some(draft))
            .map_err(|_| Error::Contract("shared caption capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared caption admission"))?
        else {
            return Ok(());
        };
        super::super::creation::publish(doc, &self.node(), stamp, ordinal)?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}

/// Remove a table's caption (text, formats and identity); an absent caption is a no-op.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RemoveTableCaption {
    /// Existing visible table block identity.
    pub block: String,
}
impl RemoveTableCaption {
    /// Every live paragraph placed below the table: the projected caption and any
    /// concurrently added candidate the projection hides. Removing "the caption"
    /// removes them all, so no hidden candidate surfaces in place of the removed one.
    fn candidates(&self, doc: &LoroDoc) -> Result<Vec<String>, Error> {
        let model = super::super::model::metadata;
        let mut out = vec![];
        for child in super::super::placement::children(doc, Some(&self.block))? {
            let meta = model(doc, &child)?;
            let raw = loro::ToJson::to_json_value(&meta.get_deep_value());
            if raw["type"] == "breditor/paragraph"
                && super::super::model::born(doc, &raw)?
                && !super::super::model::deleted(doc, &child)?
            {
                out.push(child);
            }
        }
        Ok(out)
    }
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        for caption in self.candidates(doc)? {
            super::super::model::metadata(doc, &caption)?.ensure_mergeable_map("deletions")?;
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
        let node = table(codec, document, &self.block)?;
        if caption(&node).is_none() {
            return Ok(());
        }
        let action = SetTableCaption::capture(document, &table_id(&node)?, None)
            .map_err(|_| Error::Contract("shared caption capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared caption admission"))?
        else {
            return Ok(());
        };
        for block in self.candidates(doc)? {
            super::DeleteBlock { block }.apply(doc, stamp)?;
        }
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}
