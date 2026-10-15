//! Grid cut/delete preserves axes, geometry, headers and causal content for selective Undo.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::ClearTableCells as CoreClear},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Clear every source partition in a merge-closed rectangle with fresh explicit empty heads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClearTableCells {
    /// Directional visible base-cell anchor.
    pub anchor: String,
    /// Directional visible base-cell focus.
    pub focus: String,
    /// Fresh paragraph IDs, row-major including covered source cells.
    pub empty: Vec<String>,
}
impl ClearTableCells {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::cell_bodies::prepare_targets(doc, &self.anchor)?;
        for id in &self.empty {
            super::super::cell_bodies::prepare_body(doc, &super::super::cell_bodies::empty(id))?;
        }
        Ok(())
    }
    pub(in crate::rich_replica) fn preview(
        &self,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<RichDocument, Error> {
        if self.empty.is_empty() || self.empty.len() > 4096 {
            return Err(Error::Limit("cleared shared cells"));
        }
        let ids = self
            .empty
            .iter()
            .map(|id| super::super::paragraphs::id(id))
            .collect::<Result<Vec<_>, _>>()?;
        let edit = CoreClear::capture(
            document,
            &super::super::cell_bodies::selection(document, &self.anchor, &self.focus)?,
            &ids,
        )
        .map_err(|_| Error::Contract("shared clear capture"))?
        .apply(&super::super::paragraphs::context(codec), document)
        .map_err(|_| Error::Contract("shared clear admission"))?
        .ok_or(Error::Contract("shared clear no effect"))?;
        Ok(edit.document().clone())
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let after = self.preview(codec, document)?;
        super::super::cell_bodies::apply(
            doc,
            codec,
            document,
            &after,
            &self.anchor,
            &std::collections::BTreeMap::new(),
            stamp,
        )
    }
}
