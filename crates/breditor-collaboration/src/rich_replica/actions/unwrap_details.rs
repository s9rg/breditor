//! Shared V4 section unwrap: the summary becomes a paragraph (same identity), the body is lifted.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::UnwrapDetails as CoreUnwrap},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;

/// Remove one V4 section layer. The summary keeps its identity, runs and formats as an
/// ordinary paragraph (an owned `text-kind` contribution); body blocks keep theirs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UnwrapDetails {
    /// Existing visible section.
    pub wrapper: String,
}
impl UnwrapDetails {
    /// The visible, authored summary of the section (a derived summary is refused).
    fn summary(&self, doc: &LoroDoc) -> Result<String, Error> {
        let source = super::super::materialize::envelope(doc)?;
        let section = super::super::creation::find(&source["root"], &self.wrapper)
            .filter(|node| node["type"] == "breditor/details")
            .ok_or(Error::Contract("shared section unwrap target"))?;
        let summary = section["children"]
            .get(0)
            .filter(|node| node["type"] == "breditor/details-summary")
            .ok_or(Error::Contract("shared section summary"))?;
        let block = super::super::creation::block(summary)?;
        if super::super::model::optional_metadata(doc, block).is_none() {
            return Err(Error::Contract("shared derived section summary"));
        }
        Ok(block.to_owned())
    }
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        let summary = self.summary(doc)?;
        super::super::list_structure::retain_body(doc, &self.wrapper)?;
        super::super::list_structure::prepare_v2(doc)?;
        super::prepare_field(doc, &summary, "text-kind")
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let action = CoreUnwrap::capture(document, &super::super::paragraphs::id(&self.wrapper)?)
            .map_err(|_| Error::Contract("shared section unwrap capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared section unwrap admission"))?
        else {
            return Ok(());
        };
        // The kind contribution comes first so the lifted summary is a paragraph wherever
        // its new placement resolves (a summary outside a section is never admitted).
        let summary = self.summary(doc)?;
        super::super::model::write_patch(
            doc,
            &summary,
            "text-kind",
            &super::super::model::Patch {
                sets: BTreeMap::from([("$type".into(), json!("breditor/paragraph"))]),
                removes: vec!["breditor/level".into()],
            },
            stamp,
        )?;
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
