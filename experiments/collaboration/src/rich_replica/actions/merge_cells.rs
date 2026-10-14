//! Shared merge delegates capture/closure laws to the original core, then owns one intent.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{
        MergeId, RichDocument, RichSelection, RichSelectionKind, actions::MergeTableCells,
    },
    state::EditorContext,
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Merge a directional base-cell rectangle without flattening any retained body.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MergeCells {
    /// Stable table block identity.
    pub block: String,
    /// Fresh table-scoped merge intent identity, never reused after Undo.
    pub merge: String,
    /// Existing anchor base-cell block identity, including covered cells.
    pub anchor: String,
    /// Existing focus base-cell block identity; order preserves selection direction.
    pub focus: String,
}
impl MergeCells {
    pub(in crate::rich_replica) fn capture(
        &self,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<MergeTableCells, Error> {
        let anchor = super::super::merges::cell(document, &self.anchor)?;
        let focus = super::super::merges::cell(document, &self.focus)?;
        if super::super::merges::table_block(document, &anchor)? != self.block {
            return Err(Error::Contract("shared merge table target"));
        }
        let selection = RichSelection::try_new(document, RichSelectionKind::Grid { anchor, focus })
            .map_err(|_| Error::Contract("shared merge grid"))?;
        MergeTableCells::capture(
            document,
            &selection,
            MergeId::try_new(&self.merge).map_err(|_| Error::Contract("shared merge ID"))?,
            super::super::merges::causal(stamp)?,
        )
        .map_err(|_| Error::Contract("shared merge capture"))
    }
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::merges::prepare(doc, &self.block, Some(&self.merge))
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let action = self.capture(document, stamp)?;
        let context = EditorContext::new(codec.schema().clone(), codec.limits().clone());
        let edit = action
            .apply(&context, document)
            .map_err(|_| Error::Contract("shared merge admission"))?
            .ok_or(Error::Contract("shared merge no effect"))?;
        let before = super::super::merges::properties(codec, document, &self.block)?;
        let after = super::super::merges::properties(codec, edit.document(), &self.block)?;
        let record = after["breditor/merges"]
            .as_array()
            .ok_or(Error::Contract("shared merge records"))?
            .iter()
            .find(|value| value["id"] == self.merge)
            .ok_or(Error::Contract("shared captured merge"))?;
        super::super::merges::publish_record(doc, &self.block, record, stamp)?;
        super::super::merges::publish_retractions(doc, &self.block, &before, &after, stamp)
    }
}
