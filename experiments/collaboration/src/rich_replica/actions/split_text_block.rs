//! Split an admitted paragraph/heading by routing original characters, never by copying its tail.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    position::{Affinity, TextOffset},
    rich_content::{RichDocument, RichTextPoint, actions::SplitTextBlock as CoreSplit},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// One shared paragraph boundary with an explicit fresh right identity and kind.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SplitTextBlock {
    /// Existing paragraph/heading/cell text identity; caption splitting is rejected by the core.
    pub block: String,
    /// Scalar-aligned UTF-16 cut in the current logical block, after earlier group commands.
    pub offset: u32,
    /// Fresh global block identity, never reused after Undo.
    pub right: String,
    /// Null creates a paragraph; a rank creates a heading with that admitted level.
    pub right_heading: Option<u8>,
}
impl SplitTextBlock {
    fn empty_node(&self) -> Value {
        let mut node = super::super::model::placeholder(&self.right, &[]);
        if let Some(rank) = self.right_heading {
            node["type"] = json!("breditor/heading");
            node["properties"]["breditor/level"] = json!(rank);
        }
        node
    }
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::creation::prepare(doc, &self.empty_node(), None, None)?;
        super::super::model::metadata(doc, &self.right)?.ensure_mergeable_map("placements")?;
        super::super::text_flow::prepare_root(doc, &self.block)?;
        let source = super::super::materialize::envelope(doc)?;
        if let Ok((Some(parent), _)) =
            super::super::paragraphs::layout(&source["root"], &self.block)
            && super::super::model::optional_metadata(doc, &parent).is_none()
        {
            super::super::creation::activate_cell(doc, &parent)?;
        }
        super::super::text_flow::PreparedSplit::reserve(doc, &self.right)
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
        ordinal: usize,
    ) -> Result<(), Error> {
        let point = RichTextPoint::new(
            super::super::paragraphs::id(&self.block)?,
            TextOffset::try_new(u64::from(self.offset)).map_err(|_| Error::Offset)?,
            Affinity::After,
        );
        let action = CoreSplit::capture(
            document,
            &point,
            &super::super::paragraphs::id(&self.right)?,
            self.right_heading,
        )
        .map_err(|_| Error::Contract("shared paragraph split capture"))?;
        let edit = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared paragraph split admission"))?
            .ok_or(Error::Contract("shared paragraph split effect"))?;
        let before: Value = serde_json::from_str(
            &codec
                .encode(document.document())
                .map_err(|_| Error::Contract("shared paragraph source encoding"))?,
        )?;
        let (parent, before) = super::super::paragraphs::layout(&before["root"], &self.block)?;
        let plan = super::super::text_flow::PreparedSplit::plan(
            doc,
            &self.block,
            self.offset,
            &self.right,
        )?;
        super::super::creation::publish(doc, &self.empty_node(), stamp, ordinal)?;
        super::super::placement::move_block(
            doc,
            &self.right,
            parent.as_deref(),
            before.as_deref(),
            stamp,
            ordinal,
        )?;
        doc.commit();
        plan.apply_owned(doc, stamp)?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}
