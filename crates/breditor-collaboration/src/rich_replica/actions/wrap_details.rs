//! Shared V4 section wrap: one owned section and summary birth, retained body placements.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::WrapDetails as CoreWrap},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// Wrap a complete direct-sibling flow interval as the body of a fresh V4 section.
///
/// The section's summary is a fresh empty text block; every wrapped block keeps its
/// identity, text and descendants (only placements are authored). `open` is the
/// section's immutable creation default for `details-open`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WrapDetails {
    /// First selected flow block.
    pub first: String,
    /// Last selected flow block, inclusive and in document order.
    pub last: String,
    /// Fresh stable section identity.
    pub wrapper: String,
    /// Fresh stable summary identity.
    pub summary: String,
    /// Whether the new section is expanded.
    pub open: bool,
}
impl WrapDetails {
    fn section(&self) -> Value {
        let mut node = json!({"kind":"element","type":"breditor/details","entityId":null,
            "properties":{"breditor/block-id":self.wrapper},"children":[]});
        if self.open {
            node["properties"]["breditor/details-open"] = json!(true);
        }
        node
    }
    fn summary(&self) -> Value {
        json!({"kind":"element","type":"breditor/details-summary","entityId":null,
            "properties":{"breditor/block-id":self.summary},"children":[]})
    }
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::list_structure::retain_text(doc, &self.first)?;
        super::super::list_structure::retain_text(doc, &self.last)?;
        super::super::creation::prepare(doc, &self.section(), None, None)?;
        // The summary's immutable origin is inside its own section: it never has an
        // occurrence outside a section, so no suspended move can expose it elsewhere.
        super::super::creation::prepare(doc, &self.summary(), Some(&self.wrapper), None)?;
        super::super::list_structure::prepare_v2(doc)
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let id = super::super::paragraphs::id;
        let action = CoreWrap::capture(
            document,
            &id(&self.first)?,
            &id(&self.last)?,
            &id(&self.wrapper)?,
            &id(&self.summary)?,
            self.open,
        )
        .map_err(|_| Error::Contract("shared section wrap capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared section wrap admission"))?
        else {
            return Ok(());
        };
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
