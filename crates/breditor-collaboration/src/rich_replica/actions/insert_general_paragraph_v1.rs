//! One native general Enter command, lowered to original range and suffix/item primitives.
use super::{Command, ReplaceGeneralTextRangeV1, SplitListItem, SplitTaskItem, SplitTextBlock};
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::TextFragment,
    rich_content::{
        RichDocument,
        actions::{RichGeneralParagraphKind, RichGeneralParagraphPlan},
    },
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Closed general paragraph intent; Rust derives floors, suffix/item identities and split semantics.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsertGeneralParagraphV1 {
    /// Original directional text selection, not a temporary current-selection publication.
    pub selection: super::super::selection::Selection,
    /// Host-reserved never-reused namespace, bounded to leave native suffix room.
    pub prefix: String,
}
impl InsertGeneralParagraphV1 {
    fn plan(
        &self,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<RichGeneralParagraphPlan, Error> {
        RichGeneralParagraphPlan::capture(
            &super::super::paragraphs::context(codec),
            document,
            &self.selection.admit(document)?,
            &self.prefix,
        )
        .map_err(|_| Error::Contract("general paragraph native plan"))
    }
    pub(in crate::rich_replica) fn preview(
        &self,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        self.plan(codec, document)?;
        Ok(())
    }
    fn deletion(
        &self,
        codec: &DocumentJsonCodecV2,
        plan: &RichGeneralParagraphPlan,
    ) -> Result<ReplaceGeneralTextRangeV1, Error> {
        Ok(ReplaceGeneralTextRangeV1 {
            range: super::super::general_range_plan::request(
                codec,
                &self.selection,
                &TextFragment::empty(),
            )?,
            empty: plan.empty_blocks().iter().map(|id| id.as_str().into()).collect(),
        })
    }
    fn split(plan: &RichGeneralParagraphPlan) -> Result<Command, Error> {
        let point = plan.split_point();
        let block = point.block().as_str().to_owned();
        let offset = u32::try_from(point.offset().get()).map_err(|_| Error::Offset)?;
        let right = plan.right().as_str().to_owned();
        Ok(match plan.kind() {
            RichGeneralParagraphKind::Paragraph => Command::SplitTextBlock(SplitTextBlock {
                block,
                offset,
                right,
                right_heading: None,
            }),
            RichGeneralParagraphKind::ListItem => Command::SplitListItem(SplitListItem {
                block,
                offset,
                right,
                new_item: plan
                    .item()
                    .ok_or(Error::Contract("general paragraph item"))?
                    .as_str()
                    .into(),
                right_heading: None,
            }),
            RichGeneralParagraphKind::TaskItem => Command::SplitTaskItem(SplitTaskItem {
                block,
                offset,
                right,
                new_item: plan
                    .item()
                    .ok_or(Error::Contract("general paragraph task"))?
                    .as_str()
                    .into(),
                right_heading: None,
            }),
        })
    }
    pub(super) fn prepare(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        let plan = self.plan(codec, document)?;
        let deletion = self.deletion(codec, &plan)?;
        let range = deletion.plan_for_compound(codec, document)?;
        deletion.prepare(doc, &range)?;
        Self::split(&plan)?.prepare(doc, codec, plan.replacement_document())
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let plan = self.plan(codec, document)?;
        let deletion = self.deletion(codec, &plan)?;
        let range = deletion.plan_for_compound(codec, document)?;
        deletion.apply(doc, codec, document, stamp, &range)?;
        doc.commit();
        Self::split(&plan)?.apply(doc, codec, plan.replacement_document(), Stamp::next(doc)?, 0)?;
        super::super::paragraphs::verify(doc, codec, plan.document())
    }
}
