//! Writer-owned paragraph/heading kind and rank without replacing source text.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::SetHeading as CoreSetHeading},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;

/// Convert one visible text block while retaining identity, formats and causal text sources.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetHeading {
    /// Stable paragraph/heading identity, including a visible normalized empty paragraph.
    pub block: String,
    /// Heading rank 1–6, or null for an ordinary paragraph.
    pub level: Option<u8>,
}
impl SetHeading {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::creation::activate_text(doc, &self.block)?;
        super::prepare_field(doc, &self.block, "text-kind")
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let action = CoreSetHeading::capture(
            document,
            &super::super::paragraphs::id(&self.block)?,
            self.level,
        )
        .map_err(|_| Error::Contract("shared heading capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared heading admission"))?
        else {
            return Ok(());
        };
        let mut sets = BTreeMap::from([(
            "$type".into(),
            json!(if self.level.is_some() { "breditor/heading" } else { "breditor/paragraph" }),
        )]);
        let removes = if let Some(level) = self.level {
            sets.insert("breditor/level".into(), json!(level));
            vec![]
        } else {
            vec!["breditor/level".into()]
        };
        super::super::model::write_patch(
            doc,
            &self.block,
            "text-kind",
            &super::super::model::Patch { sets, removes },
            stamp,
        )?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}
