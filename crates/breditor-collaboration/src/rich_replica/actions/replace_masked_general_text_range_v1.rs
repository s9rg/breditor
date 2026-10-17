//! One additive masked compound; retained characters are routed, never copied or reinserted.
use super::{DeleteBlock, ReplaceTextRange};
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    position::TextOffset,
    rich_content::{
        BlockId, RichDocument,
        actions::{RichMaskedGeneralRangePlan, RichMaskedTextSpan},
    },
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
#[cfg(test)]
#[path = "replace_masked_general_text_range_v1/tests.rs"]
mod tests;

/// Explicit current-source removal span, not a durable identity witness or permission.
/// Review rebasing must derive it from the complete original-character proof.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MaskedTextSpanV1 {
    /// Current admitted text block.
    pub block: String,
    /// Inclusive scalar-aligned UTF-16 position.
    pub start: u32,
    /// Exclusive scalar-aligned UTF-16 position.
    pub end: u32,
}
/// Versioned exact-source compound. Old command tags and range meanings are unchanged.
/// Unmasked characters inside the range survive in their existing native source containers.
/// Only legal as one command in explicitly enabled general history; review capture is pure.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReplaceMaskedGeneralTextRangeV1 {
    /// Directional range and only the desired new rich runs, not retained peer text.
    pub range: ReplaceTextRange,
    /// Ordered nonoverlapping spans to remove in that exact source range.
    pub spans: Vec<MaskedTextSpanV1>,
    /// Exactly the fresh native-required paragraph floors, recomputed after retaining text.
    pub empty: Vec<String>,
}
pub(in crate::rich_replica) struct PreparedMaskedRange {
    core: RichMaskedGeneralRangePlan,
    expected: RichDocument,
    floors: Vec<Value>,
}
impl ReplaceMaskedGeneralTextRangeV1 {
    pub(in crate::rich_replica) fn plan(
        &self,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<PreparedMaskedRange, Error> {
        if self.spans.len() > 4096 || self.empty.len() > 4096 {
            return Err(Error::Limit("masked semantic work"));
        }
        let selection = super::super::selection::Selection::TextRange {
            anchor: self.range.anchor.clone(),
            focus: self.range.focus.clone(),
        }
        .admit(document)?;
        let spans = self
            .spans
            .iter()
            .map(|span| {
                RichMaskedTextSpan::try_new(
                    super::super::paragraphs::id(&span.block)?,
                    TextOffset::try_new(u64::from(span.start)).map_err(|_| Error::Offset)?,
                    TextOffset::try_new(u64::from(span.end)).map_err(|_| Error::Offset)?,
                )
                .map_err(|_| Error::Contract("masked range span"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let core = RichMaskedGeneralRangePlan::capture(
            document,
            &selection,
            &self.range.fragment(codec)?,
            &spans,
        )
        .map_err(|_| Error::Contract("masked semantic range capture"))?;
        let empty = self
            .empty
            .iter()
            .map(|id| super::super::paragraphs::id(id))
            .collect::<Result<Vec<_>, _>>()?;
        let expected = core
            .expected_document(&super::super::paragraphs::context(codec), &empty)
            .map_err(|_| Error::Contract("masked semantic final admission"))?;
        let raw: Value = serde_json::from_str(
            &codec
                .encode(expected.document())
                .map_err(|_| Error::Contract("masked semantic result"))?,
        )?;
        let floors = empty
            .iter()
            .map(|id| {
                super::super::creation::find(&raw["root"], id.as_str())
                    .cloned()
                    .ok_or(Error::Contract("masked semantic floor node"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(PreparedMaskedRange { core, expected, floors })
    }
    pub(super) fn prepare(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        let plan = self.plan(codec, document)?;
        self.range.prepare(doc)?;
        for span in plan.core.text_spans() {
            super::super::text_flow::prepare_root(doc, span.block().as_str())?;
        }
        for id in plan.core.joined_text_roots() {
            super::super::text_flow::prepare_root(doc, id.as_str())?;
        }
        for id in plan.core.protected_deleted_blocks().into_iter().flatten() {
            if id.as_str().starts_with(super::super::model::VIRTUAL_PREFIX) {
                super::super::list_structure::retain_text(doc, id.as_str())?;
            }
        }
        for (floor, node) in plan.core.empty_blocks().iter().zip(&plan.floors) {
            if let Some(parent) = floor.parent() {
                super::super::creation::activate_cell(doc, parent.as_str())?;
            }
            super::super::creation::prepare(
                doc,
                node,
                floor.parent().map(BlockId::as_str),
                floor.before().map(BlockId::as_str),
            )?;
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
        let plan = self.plan(codec, document)?;
        // Staging owns all writes. Never materialize/admit a transient partial tree.
        for (ordinal, node) in plan.floors.iter().enumerate() {
            super::super::creation::publish(doc, node, stamp, ordinal)?;
        }
        doc.commit();
        for span in plan.core.text_spans().iter().rev() {
            super::super::text_flow::delete(
                doc,
                span.block().as_str(),
                u32::try_from(span.start().get()).map_err(|_| Error::Offset)?,
                u32::try_from(span.end().get() - span.start().get()).map_err(|_| Error::Offset)?,
            )?;
            doc.commit();
        }
        if let Some(deletes) = plan.core.protected_deleted_blocks() {
            for id in deletes {
                DeleteBlock { block: id.as_str().into() }.apply(doc, stamp)?;
            }
        } else {
            Self::join(doc, codec, document, stamp, &plan)?;
        }
        doc.commit();
        let start = plan.core.insertion_start();
        self.range.insert(
            doc,
            start.block().as_str(),
            u32::try_from(start.offset().get()).map_err(|_| Error::Offset)?,
            stamp,
        )?;
        super::super::paragraphs::verify(doc, codec, &plan.expected)
    }
    fn join(
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
        plan: &PreparedMaskedRange,
    ) -> Result<(), Error> {
        let roots = plan.core.joined_text_roots();
        let first = roots.first().ok_or(Error::Contract("masked join first root"))?;
        for root in roots.iter().skip(1) {
            super::super::text_flow::PreparedJoin::prepare(doc, first.as_str(), root.as_str())?
                .apply_staged(doc)?;
            doc.commit();
        }
        let retained = roots.iter().map(BlockId::as_str).collect::<Vec<_>>();
        let structure = super::super::range_plan::RangePlan::capture_retaining_text(
            codec,
            document,
            &plan.expected,
            &retained,
        )?;
        for (ordinal, (block, parent, before)) in structure.moves.iter().enumerate() {
            super::super::placement::move_block(
                doc,
                block,
                parent.as_deref(),
                before.as_deref(),
                stamp,
                ordinal,
            )?;
        }
        for block in structure.deletes {
            DeleteBlock { block }.apply(doc, stamp)?;
        }
        Ok(())
    }
}
