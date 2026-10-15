//! Atomic rich flow paste at a selected text range, preserving the original suffix source.
use super::{ReplaceTextRange, SplitTextBlock};
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::TextFragment,
    rich_content::{
        RichDocument, RichTextPoint,
        actions::{
            InsertBlocks as CoreInsert, ReplaceTextRange as CoreReplace,
            SplitTextBlock as CoreSplit,
        },
    },
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Replace selected text, split the retained source, then insert fresh semantic flow before its suffix.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PasteFlowAtText {
    /// Original directional anchor, admitted in this staged document.
    pub anchor: super::super::selection::TextPoint,
    /// Original directional focus.
    pub focus: super::super::selection::TextPoint,
    /// Fresh paragraph identity for the retained suffix (including an empty suffix).
    pub right: String,
    /// Freshly allocated rich semantic flow; clocks never authorize shared merges.
    pub nodes: Vec<Value>,
}
struct Prelude {
    replaced: RichDocument,
    split: RichDocument,
    point: RichTextPoint,
}
impl PasteFlowAtText {
    fn replacement(&self) -> ReplaceTextRange {
        ReplaceTextRange { anchor: self.anchor.clone(), focus: self.focus.clone(), runs: vec![] }
    }
    fn prelude(
        &self,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<Prelude, Error> {
        let context = super::super::paragraphs::context(codec);
        let selection = super::super::selection::Selection::TextRange {
            anchor: self.anchor.clone(),
            focus: self.focus.clone(),
        }
        .admit(document)?;
        let replace = CoreReplace::capture(document, &selection, &TextFragment::empty())
            .map_err(|_| Error::Contract("flow paste range"))?;
        let point = replace.insertion_end().clone();
        let replaced = replace
            .apply(&context, document)
            .map_err(|_| Error::Contract("flow paste range admission"))?
            .map_or_else(|| document.clone(), |edit| edit.document().clone());
        let split = CoreSplit::capture(
            &replaced,
            &point,
            &super::super::paragraphs::id(&self.right)?,
            None,
        )
        .map_err(|_| Error::Contract("flow paste split"))?
        .apply(&context, &replaced)
        .map_err(|_| Error::Contract("flow paste split admission"))?
        .ok_or(Error::Contract("flow paste split effect"))?
        .document()
        .clone();
        Ok(Prelude { replaced, split, point })
    }
    fn insertion(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        split: &RichDocument,
        stamp: Stamp,
    ) -> Result<(RichDocument, Vec<Value>), Error> {
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
        let position = split
            .flow_position_before(&super::super::paragraphs::id(&self.right)?)
            .ok_or(Error::Contract("flow paste insertion position"))?;
        let after = CoreInsert::capture(
            split,
            &position,
            super::super::clipboard_plan::drafts(&source, &nodes)?,
        )
        .map_err(|_| Error::Contract("flow paste insertion capture"))?
        .apply(&super::super::paragraphs::context(codec), split)
        .map_err(|_| Error::Contract("flow paste insertion admission"))?
        .ok_or(Error::Contract("flow paste insertion effect"))?
        .document()
        .clone();
        Ok((after, nodes))
    }
    pub(in crate::rich_replica) fn preview(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        let plan = self.prelude(codec, document)?;
        self.insertion(doc, codec, &plan.split, Stamp::next(doc)?)?;
        Ok(())
    }
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        self.replacement().prepare(doc)?;
        super::super::creation::prepare(
            doc,
            &super::super::model::placeholder(&self.right, &[]),
            None,
            None,
        )?;
        super::super::model::metadata(doc, &self.right)?.ensure_mergeable_map("placements")?;
        super::super::text_flow::PreparedSplit::reserve(doc, &self.right)?;
        let raw = super::super::materialize::envelope(doc)?;
        for point in [&self.anchor, &self.focus] {
            if let Ok((Some(parent), _)) =
                super::super::paragraphs::layout(&raw["root"], &point.block)
                && super::super::model::optional_metadata(doc, &parent).is_none()
            {
                super::super::creation::activate_cell(doc, &parent)?;
            }
        }
        for node in &self.nodes {
            super::super::cell_bodies::prepare_body(doc, node)?;
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
        let plan = self.prelude(codec, document)?;
        self.replacement().apply(doc, codec, document, stamp)?;
        doc.commit();
        let split = SplitTextBlock {
            block: plan.point.block().as_str().into(),
            offset: u32::try_from(plan.point.offset().get()).map_err(|_| Error::Offset)?,
            right: self.right.clone(),
            right_heading: None,
        };
        split.apply(doc, codec, &plan.replaced, Stamp::next(doc)?, 0)?;
        doc.commit();
        // Each dependent phase uses its actual next causal stamp. They still share the
        // outer Undo group; placement site ordinals cannot collide with range/split moves.
        let paste_stamp = Stamp::next(doc)?;
        let (expected, nodes) = self.insertion(doc, codec, &plan.split, paste_stamp)?;
        let raw: Value = serde_json::from_str(
            &codec
                .encode(plan.split.document())
                .map_err(|_| Error::Contract("flow paste split export"))?,
        )?;
        let (parent, _) = super::super::paragraphs::layout(&raw["root"], &self.right)?;
        for (index, node) in nodes.iter().enumerate() {
            super::super::clipboard_plan::publish(doc, node, paste_stamp, index)?;
            doc.commit();
            super::super::placement::move_block(
                doc,
                super::super::creation::block(node)?,
                parent.as_deref(),
                Some(&self.right),
                paste_stamp,
                index,
            )?;
            doc.commit();
        }
        super::super::paragraphs::verify(doc, codec, &expected)
    }
}
