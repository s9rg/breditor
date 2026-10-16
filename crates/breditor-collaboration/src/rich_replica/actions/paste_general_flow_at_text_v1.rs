//! One additive compound command preserves general coverage, routed suffix text and rich flow.
use super::{ReplaceGeneralTextRangeV1, SplitTextBlock};
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{
        RichDocument, RichTextPoint,
        actions::{RichGeneralFlowPastePlan, SplitTextBlock as CoreSplit},
    },
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Closed V1 general-flow command. Old runtimes reject its new tag instead of reinterpreting old paste.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PasteGeneralFlowAtTextV1 {
    /// Native coverage deletion with exactly its required fresh floors; inserted runs must be empty.
    pub deletion: ReplaceGeneralTextRangeV1,
    /// Fresh suffix block, distinct from all source, clipboard and floor identities.
    pub right: String,
    /// Freshly re-keyed semantic rich flow; actual merge clocks are authored by the receiver.
    pub nodes: Vec<Value>,
}
impl PasteGeneralFlowAtTextV1 {
    fn plan(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<super::replace_general_text_range_v1::PreparedGeneralRange, Error> {
        if !self.deletion.range.runs.is_empty() {
            return Err(Error::Contract("general flow deletion must be empty"));
        }
        if self.nodes.is_empty() || self.nodes.len() > 64 {
            return Err(Error::Limit("general pasted flow blocks"));
        }
        let plan = self.deletion.plan_for_compound(codec, document)?;
        let source = super::super::clipboard_plan::admit(
            codec,
            super::super::clipboard_plan::envelope(doc)?,
            self.nodes.clone(),
        )?;
        super::super::clipboard_plan::semantic(codec, &source)?;
        let selection = super::super::selection::Selection::TextRange {
            anchor: self.deletion.range.anchor.clone(),
            focus: self.deletion.range.focus.clone(),
        }
        .admit(document)?;
        let empty = self
            .deletion
            .empty
            .iter()
            .map(|id| super::super::paragraphs::id(id))
            .collect::<Result<Vec<_>, _>>()?;
        RichGeneralFlowPastePlan::capture(
            &super::super::paragraphs::context(codec),
            document,
            &selection,
            &empty,
            &super::super::paragraphs::id(&self.right)?,
            super::super::clipboard_plan::drafts(&source, &self.nodes)?,
        )
        .map_err(|_| Error::Contract("general flow native preview"))?;
        Ok(plan)
    }
    pub(in crate::rich_replica) fn preview(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        self.plan(doc, codec, document)?;
        Ok(())
    }
    fn split(&self, point: &RichTextPoint) -> Result<SplitTextBlock, Error> {
        Ok(SplitTextBlock {
            block: point.block().as_str().into(),
            offset: u32::try_from(point.offset().get()).map_err(|_| Error::Offset)?,
            right: self.right.clone(),
            right_heading: None,
        })
    }
    pub(super) fn prepare(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        let plan = self.plan(doc, codec, document)?;
        self.deletion.prepare(doc, &plan)?;
        let point =
            plan.core.insertion_end().map_err(|_| Error::Contract("general flow insertion"))?;
        self.split(&point)?.prepare(doc)?;
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
        let plan = self.plan(doc, codec, document)?;
        let point =
            plan.core.insertion_end().map_err(|_| Error::Contract("general flow insertion"))?;
        self.deletion.apply(doc, codec, document, stamp, &plan)?;
        doc.commit();
        let split = CoreSplit::capture(
            &plan.expected,
            &point,
            &super::super::paragraphs::id(&self.right)?,
            None,
        )
        .map_err(|_| Error::Contract("general flow split"))?
        .apply(&super::super::paragraphs::context(codec), &plan.expected)
        .map_err(|_| Error::Contract("general flow split admission"))?
        .ok_or(Error::Contract("general flow split effect"))?
        .document()
        .clone();
        self.split(&point)?.apply(doc, codec, &plan.expected, Stamp::next(doc)?, 0)?;
        doc.commit();
        let raw: Value = serde_json::from_str(
            &codec
                .encode(split.document())
                .map_err(|_| Error::Contract("general flow split export"))?,
        )?;
        let (parent, _) = super::super::paragraphs::layout(&raw["root"], &self.right)?;
        let paste_stamp = Stamp::next(doc)?;
        let mut nodes = self.nodes.clone();
        for node in &mut nodes {
            super::super::clipboard_plan::author_clocks(node, paste_stamp)?;
        }
        let source = super::super::clipboard_plan::admit(
            codec,
            super::super::clipboard_plan::envelope(doc)?,
            nodes.clone(),
        )?;
        let position = split
            .flow_position_before(&super::super::paragraphs::id(&self.right)?)
            .ok_or(Error::Contract("general flow stable insertion"))?;
        let after = breditor_core::rich_content::actions::InsertBlocks::capture(
            &split,
            &position,
            super::super::clipboard_plan::drafts(&source, &nodes)?,
        )
        .map_err(|_| Error::Contract("general flow capture"))?
        .apply(&super::super::paragraphs::context(codec), &split)
        .map_err(|_| Error::Contract("general flow admission"))?
        .ok_or(Error::Contract("general flow effect"))?
        .document()
        .clone();
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
        super::super::paragraphs::verify(doc, codec, &after)
    }
}
