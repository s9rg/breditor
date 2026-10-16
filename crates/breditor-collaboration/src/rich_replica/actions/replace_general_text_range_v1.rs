//! One versioned semantic edit; no transient AST admission and no shared root register.
use super::ReplaceTextRange;
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{BlockId, RichDocument, actions::RichGeneralRangePlan},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Closed saved general-range intent, legal only in the explicit general history family.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReplaceGeneralTextRangeV1 {
    /// Directional scalar-aligned source range and exact inserted rich runs.
    pub range: ReplaceTextRange,
    /// Exactly the native-required durably fresh empty paragraph identities.
    pub empty: Vec<String>,
}
pub(in crate::rich_replica) struct PreparedGeneralRange {
    pub core: RichGeneralRangePlan,
    pub expected: RichDocument,
    floors: Vec<Value>,
}
impl ReplaceGeneralTextRangeV1 {
    pub(in crate::rich_replica) fn plan(
        &self,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<PreparedGeneralRange, Error> {
        let inserted = self.range.fragment(codec)?;
        let selection = super::super::selection::Selection::TextRange {
            anchor: self.range.anchor.clone(),
            focus: self.range.focus.clone(),
        }
        .admit(document)?;
        let core = RichGeneralRangePlan::capture(document, &selection, &inserted)
            .map_err(|_| Error::Contract("general semantic range capture"))?;
        let empty = self
            .empty
            .iter()
            .map(|id| super::super::paragraphs::id(id))
            .collect::<Result<Vec<BlockId>, _>>()?;
        let edit = core
            .action(&empty)
            .map_err(|_| Error::Contract("general semantic floor identities"))?
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("general semantic final admission"))?
            .ok_or(Error::Contract("general semantic content change required"))?;
        let expected = edit.document().clone();
        let raw: Value = serde_json::from_str(
            &codec
                .encode(expected.document())
                .map_err(|_| Error::Contract("general semantic result"))?,
        )?;
        let floors = empty
            .iter()
            .map(|id| {
                super::super::creation::find(&raw["root"], id.as_str())
                    .cloned()
                    .ok_or(Error::Contract("general semantic floor node"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(PreparedGeneralRange { core, expected, floors })
    }
    pub(in crate::rich_replica) fn prepare(
        &self,
        doc: &LoroDoc,
        plan: &PreparedGeneralRange,
    ) -> Result<(), Error> {
        self.range.prepare(doc)?;
        let Some(coverage) = plan.core.covered() else {
            return Ok(());
        };
        for id in coverage.deleted_blocks() {
            if id.as_str().starts_with(super::super::model::VIRTUAL_PREFIX) {
                super::super::list_structure::retain_text(doc, id.as_str())?;
            }
        }
        for span in coverage.text_ranges() {
            super::super::text_flow::prepare_root(doc, span.block().as_str())?;
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
    pub(in crate::rich_replica) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
        plan: &PreparedGeneralRange,
    ) -> Result<(), Error> {
        let Some(coverage) = plan.core.covered() else {
            return self.range.apply(doc, codec, document, stamp);
        };
        // All writes use original causal fields. Only the complete result is
        // materialized/admitted, so valid final edits require no temporary node budget.
        for (ordinal, node) in plan.floors.iter().enumerate() {
            super::super::creation::publish(doc, node, stamp, ordinal)?;
        }
        doc.commit();
        for span in coverage.text_ranges() {
            let start = u32::try_from(span.start().get()).map_err(|_| Error::Offset)?;
            let length =
                u32::try_from(span.end().get() - span.start().get()).map_err(|_| Error::Offset)?;
            if length > 0 {
                super::super::text_flow::delete(doc, span.block().as_str(), start, length)?;
            }
            doc.commit();
            if span.block() == coverage.insertion_start().block() {
                self.range.insert(doc, span.block().as_str(), start, stamp)?;
            }
        }
        for id in coverage.deleted_blocks() {
            super::DeleteBlock { block: id.as_str().into() }.apply(doc, stamp)?;
        }
        super::super::paragraphs::verify(doc, codec, &plan.expected)
    }
}
