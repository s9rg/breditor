//! Split owns observed intent retractions, leaving future unobserved merges and all text intact.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::SplitTableCell},
    state::EditorContext,
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Split one visible presentation cell, addressed by any retained base cell.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SplitCell {
    /// Existing stable base-cell block identity, not a DOM cell index.
    pub cell: String,
}
impl SplitCell {
    pub(in crate::rich_replica) fn capture(
        &self,
        document: &RichDocument,
    ) -> Result<SplitTableCell, Error> {
        SplitTableCell::capture(document, &super::super::merges::cell(document, &self.cell)?)
            .map_err(|_| Error::Contract("shared split capture"))
    }
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        let raw = super::super::materialize::envelope(doc)?;
        let cell = super::super::creation::find(&raw["root"], &self.cell)
            .ok_or(Error::Contract("visible shared split cell"))?;
        if cell["type"] != "breditor/table-cell" {
            return Err(Error::Contract("shared split target kind"));
        }
        super::super::merges::prepare(
            doc,
            &owner(&raw["root"], &self.cell).ok_or(Error::Contract("shared split owner"))?,
            None,
        )
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let cell = super::super::merges::cell(document, &self.cell)?;
        let block = super::super::merges::table_block(document, &cell)?;
        let context = EditorContext::new(codec.schema().clone(), codec.limits().clone());
        if let Some(edit) = self
            .capture(document)?
            .apply(&context, document)
            .map_err(|_| Error::Contract("shared split admission"))?
        {
            super::super::merges::publish_retractions(
                doc,
                &block,
                &super::super::merges::properties(codec, document, &block)?,
                &super::super::merges::properties(codec, edit.document(), &block)?,
                stamp,
            )?;
        }
        Ok(())
    }
}

fn owner(node: &serde_json::Value, cell: &str) -> Option<String> {
    if node["type"] == "breditor/table" && super::super::creation::find(node, cell).is_some() {
        return node["properties"]["breditor/block-id"].as_str().map(str::to_owned);
    }
    node["children"].as_array()?.iter().find_map(|node| owner(node, cell))
}
