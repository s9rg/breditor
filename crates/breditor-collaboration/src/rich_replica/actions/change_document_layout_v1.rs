//! One document-family layout intent owns only changed fields of native covered blocks.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::{DocumentJsonCodecV2, decode_rich_block_layout_patch},
    rich_content::{
        BlockId, RichBlockLayoutPatch, RichDocument, RichLocalOutcome, RichLocalSession,
        RichSelectionCoverage, RichSelectionKind, actions::SetBlockLayout as CoreSetBlockLayout,
    },
    session::HistoryCapacity,
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
/// Closed additive whole-document layout action; old per-dispatch step limits remain unchanged.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChangeDocumentLayoutV1 {
    /// Strict native Keep/Set/Clear patch; duplicate nested fields remain visible to native admission.
    pub patch_json: String,
}
pub(in crate::rich_replica) struct Plan {
    pub document: RichDocument,
    pub patch: RichBlockLayoutPatch,
    pub blocks: Vec<BlockId>,
}
impl ChangeDocumentLayoutV1 {
    pub(in crate::rich_replica) fn plan(
        &self,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<Option<Plan>, Error> {
        let context = super::super::paragraphs::context(codec);
        let patch = decode_rich_block_layout_patch(&context, &self.patch_json)
            .map_err(|_| Error::Contract("document layout intent"))?;
        let mut preview = RichLocalSession::try_new(
            context.clone(),
            document.clone(),
            Some(RichSelectionKind::Document),
            HistoryCapacity::try_new(0).map_err(|_| Error::Contract("document layout history"))?,
        )
        .map_err(|_| Error::Contract("document layout preview"))?;
        if preview
            .change_selection_layout(&preview.snapshot(), &patch)
            .map_err(|_| Error::Contract("document layout admission"))?
            == RichLocalOutcome::Unchanged
        {
            return Ok(None);
        }
        let coverage = RichSelectionCoverage::document(document)
            .map_err(|_| Error::Contract("document layout coverage"))?;
        let mut blocks = vec![];
        for span in coverage.text() {
            if CoreSetBlockLayout::capture(document, span.block(), &patch)
                .and_then(|action| action.apply(&context, document))
                .map_err(|_| Error::Contract("document layout block plan"))?
                .is_some()
            {
                blocks.push(span.block().clone());
            }
        }
        Ok(Some(Plan { document: preview.state().document().clone(), patch, blocks }))
    }
    pub(in crate::rich_replica) fn preview(
        &self,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        self.plan(codec, document)?.ok_or(Error::Contract("document layout no-op saved action"))?;
        Ok(())
    }
    pub(super) fn prepare(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        let plan = self
            .plan(codec, document)?
            .ok_or(Error::Contract("document layout no-op saved action"))?;
        for block in plan.blocks {
            super::SetBlockLayout {
                block: block.as_str().into(),
                patch_json: self.patch_json.clone(),
            }
            .prepare(doc)?;
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
        let plan = self
            .plan(codec, document)?
            .ok_or(Error::Contract("document layout no-op saved action"))?;
        for block in &plan.blocks {
            for (field, value) in super::super::layout_fields::changes(plan.patch) {
                field.write(doc, block.as_str(), value, stamp)?;
            }
            doc.commit();
        }
        super::super::paragraphs::verify(doc, codec, &plan.document)
    }
}
