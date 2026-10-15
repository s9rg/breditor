//! Fresh rich flow paste authors merge geometry with this action's actual causal clock.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{
        RichDocument, RichFlowParent, RichFlowPosition, actions::InsertBlocks as CoreInsert,
    },
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Insert freshly re-keyed semantic flow; clipboard clocks are placeholders, not authority.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PasteBlocks {
    /// Existing document/cell/list-item insertion parent; captions are not general flow.
    pub parent: Option<String>,
    /// Existing direct child, or append.
    pub before: Option<String>,
    /// Fresh rich flow records with active geometry only and no merge retractions.
    pub nodes: Vec<Value>,
}
impl PasteBlocks {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        if let Some(parent) = &self.parent {
            super::super::creation::activate_cell(doc, parent)?;
        }
        super::super::clipboard_flow::prepare(doc, self.parent.as_deref())?;
        for node in &self.nodes {
            super::super::clipboard_plan::prepare(
                doc,
                node,
                self.parent.as_deref(),
                self.before.as_deref(),
            )?;
        }
        Ok(())
    }
    pub(in crate::rich_replica) fn preview(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<RichDocument, Error> {
        if self.nodes.is_empty() || self.nodes.len() > 64 {
            return Err(Error::Limit("pasted flow blocks"));
        }
        let mut nodes = self.nodes.clone();
        for node in &mut nodes {
            super::super::clipboard_plan::author_clocks(node, stamp)?;
        }
        let source = super::super::clipboard_plan::admit(
            codec,
            super::super::clipboard_plan::envelope(doc)?,
            nodes.clone(),
        )?;
        super::super::clipboard_plan::semantic(codec, &source)?;
        let parent = if let Some(parent) = &self.parent {
            if let Ok(cell) = super::super::merges::cell(document, parent) {
                RichFlowParent::Cell(cell)
            } else {
                RichFlowParent::ListItem(super::super::paragraphs::id(parent)?)
            }
        } else {
            RichFlowParent::Document
        };
        let position = RichFlowPosition::new(
            parent,
            self.before.as_deref().map(super::super::paragraphs::id).transpose()?,
        );
        let edit = CoreInsert::capture(
            document,
            &position,
            super::super::clipboard_plan::drafts(&source, &nodes)?,
        )
        .map_err(|_| Error::Contract("shared flow paste capture"))?
        .apply(&super::super::paragraphs::context(codec), document)
        .map_err(|_| Error::Contract("shared flow paste admission"))?
        .ok_or(Error::Contract("shared flow paste no effect"))?;
        Ok(edit.document().clone())
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
        ordinal: usize,
    ) -> Result<(), Error> {
        let expected = self.preview(doc, codec, document, stamp)?;
        for mut node in self.nodes.clone() {
            super::super::clipboard_plan::author_clocks(&mut node, stamp)?;
            super::super::clipboard_plan::publish(doc, &node, stamp, ordinal)?;
        }
        super::super::clipboard_flow::retain(
            doc,
            codec,
            document,
            &expected,
            self.parent.as_deref(),
            stamp,
        )?;
        super::super::paragraphs::verify(doc, codec, &expected)
    }
}
