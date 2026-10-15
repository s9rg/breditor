//! Exact rich grid paste delegates geometry/admission to the core and owns each body separately.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{
        MergeId, RichDocument, TableCellPasteDraft, TablePasteDraft, TablePasteMerge,
        actions::PasteTableCells as CorePaste,
    },
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One newly allocated cell body; `None` preserves the target's header choice.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PastedCell {
    /// Fresh semantic flow nodes, with independent source partitions.
    pub body: Vec<Value>,
    /// Explicit header policy.
    pub header: Option<bool>,
}
/// Fresh relative merge geometry; there is deliberately no caller-supplied causal clock.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PastedMerge {
    /// Never-reused target-table-scoped merge identity.
    pub id: String,
    /// Inclusive, ordered relative row bounds.
    pub rows: [usize; 2],
    /// Inclusive, ordered relative column bounds.
    pub columns: [usize; 2],
}
/// Replace a matching merge-closed rectangle; never crop, tile or silently grow it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PasteTableCells {
    /// Existing directional base-cell anchor.
    pub anchor: String,
    /// Existing directional base-cell focus, including covered cells.
    pub focus: String,
    /// Row-major rectangular fresh rich bodies.
    pub cells: Vec<Vec<PastedCell>>,
    /// Disjoint fresh relative merges.
    pub merges: Vec<PastedMerge>,
}
impl PasteTableCells {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::cell_bodies::prepare_targets(doc, &self.anchor)?;
        for cell in self.cells.iter().flatten() {
            for node in &cell.body {
                super::super::cell_bodies::prepare_body(doc, node)?;
            }
        }
        let raw = super::super::materialize::envelope(doc)?;
        let table =
            find_table(&raw["root"], &self.anchor).ok_or(Error::Contract("paste table target"))?;
        super::super::merges::prepare(doc, table, None)?;
        for merge in &self.merges {
            super::super::merges::prepare(doc, table, Some(&merge.id))?;
        }
        Ok(())
    }
    pub(in crate::rich_replica) fn preview(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<RichDocument, Error> {
        if self.cells.is_empty()
            || self.cells.len() > 256
            || self.cells.iter().map(Vec::len).sum::<usize>() > 4096
            || self.merges.len() > 256
        {
            return Err(Error::Limit("shared paste cells"));
        }
        let mut cells = self.cells.clone();
        for cell in cells.iter_mut().flatten() {
            for node in &mut cell.body {
                super::super::clipboard_plan::author_clocks(node, stamp)?;
            }
        }
        let source = super::super::clipboard_plan::admit(
            codec,
            super::super::clipboard_plan::envelope(doc)?,
            cells.iter().flatten().flat_map(|cell| cell.body.clone()).collect(),
        )?;
        super::super::clipboard_plan::semantic(codec, &source)?;
        let cells = cells
            .iter()
            .map(|row| {
                row.iter()
                    .map(|cell| {
                        TableCellPasteDraft::try_new(
                            super::super::clipboard_plan::drafts(&source, &cell.body)?,
                            cell.header,
                        )
                        .map_err(|_| Error::Contract("shared paste cell body"))
                    })
                    .collect::<Result<Vec<_>, _>>()
            })
            .collect::<Result<Vec<_>, _>>()?;
        let merges = self
            .merges
            .iter()
            .map(|merge| {
                TablePasteMerge::try_new(
                    MergeId::try_new(&merge.id)
                        .map_err(|_| Error::Contract("shared paste merge ID"))?,
                    super::super::merges::causal(stamp)?,
                    (merge.rows[0], merge.rows[1]),
                    (merge.columns[0], merge.columns[1]),
                )
                .map_err(|_| Error::Contract("shared paste merge geometry"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let draft = TablePasteDraft::try_new(cells, merges)
            .map_err(|_| Error::Contract("shared paste rectangle"))?;
        let edit = CorePaste::capture(
            document,
            &super::super::cell_bodies::selection(document, &self.anchor, &self.focus)?,
            draft,
        )
        .map_err(|_| Error::Contract("shared paste capture"))?
        .apply(&super::super::paragraphs::context(codec), document)
        .map_err(|_| Error::Contract("shared paste admission"))?
        .ok_or(Error::Contract("shared paste no effect"))?;
        Ok(edit.document().clone())
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let after = self.preview(doc, codec, document, stamp)?;
        let headers = super::super::cell_bodies::headers(
            codec,
            document,
            &self.anchor,
            &self.focus,
            &self.cells,
        )?;
        super::super::cell_bodies::apply(
            doc,
            codec,
            document,
            &after,
            &self.anchor,
            &headers,
            stamp,
        )
    }
}
fn find_table<'a>(node: &'a Value, anchor: &str) -> Option<&'a str> {
    if node["type"] == "breditor/table" && super::super::creation::find(node, anchor).is_some() {
        return super::super::creation::block(node).ok();
    }
    node["children"].as_array()?.iter().find_map(|node| find_table(node, anchor))
}
