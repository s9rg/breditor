//! Explicit atomic-rule birth at a typed rich flow position, without implicit text allocation.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::InsertHorizontalRule as CoreInsert},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// Insert one fresh V2 rule; creating navigation text remains an explicit separate command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsertHorizontalRule {
    /// Fresh rule block identity.
    pub block: String,
    /// Existing flow parent, or the document root.
    pub parent: Option<String>,
    /// Direct-child anchor, or append.
    pub before: Option<String>,
}
impl InsertHorizontalRule {
    fn node(&self) -> Value {
        json!({"kind":"element","type":"breditor/horizontal-rule","entityId":null,"properties":{"breditor/block-id":self.block},"children":[]})
    }
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        if let Some(parent) = &self.parent {
            super::super::creation::activate_cell(doc, parent)?;
        }
        let source = super::super::materialize::envelope(doc)?;
        if self
            .parent
            .as_ref()
            .is_none_or(|parent| super::super::creation::find(&source["root"], parent).is_some())
        {
            super::super::clipboard_flow::prepare(doc, self.parent.as_deref())?;
        }
        super::super::clipboard_plan::prepare(
            doc,
            &self.node(),
            self.parent.as_deref(),
            self.before.as_deref(),
        )
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
        ordinal: usize,
    ) -> Result<(), Error> {
        let position = super::super::flow_parent::position(
            document,
            self.parent.as_deref(),
            self.before.as_deref(),
        )?;
        let action =
            CoreInsert::capture(document, &position, &super::super::paragraphs::id(&self.block)?)
                .map_err(|_| Error::Contract("shared rule insert capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared rule insert admission"))?
        else {
            return Ok(());
        };
        super::super::clipboard_plan::publish(doc, &self.node(), stamp, ordinal)?;
        // Earlier commands can move children after infrastructure was prepared.
        // Resolve this command's insertion order now, with an owned occurrence.
        // Retained-head ordinals are bounded by the 20,000-entry causal order.
        super::super::placement::move_block(
            doc,
            &self.block,
            self.parent.as_deref(),
            self.before.as_deref(),
            stamp,
            1_000_000,
        )?;
        super::super::clipboard_flow::retain(
            doc,
            codec,
            document,
            edit.document(),
            self.parent.as_deref(),
            stamp,
        )?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}
