//! Admitted clipboard content becomes explicit text, fresh flow or multicell drafts.

use super::{
    RichClipboardError, RichClipboardFragment, RichClipboardIdAllocator, RichClipboardKind, rekey,
};
use crate::{
    document::TextFragment,
    rich_content::{
        RichBlockDraft, RichTableLimits, TableCellPasteDraft, TablePasteDraft, TablePasteMerge,
        TableShape, actions::text_patch, ast_properties,
    },
    state::EditorContext,
};

impl RichClipboardFragment {
    /// Read the canonical inline fragment without allocating irrelevant structural identities.
    ///
    /// # Errors
    /// Rejects non-text payloads or incompatible/tighter receiving policy.
    pub fn text_fragment(
        &self,
        context: &EditorContext,
    ) -> Result<TextFragment, RichClipboardError> {
        if self.kind != RichClipboardKind::Text {
            return Err(RichClipboardError::Kind);
        }
        Self::try_admit(context, self.kind, self.document.document().clone())?;
        let root =
            self.document.document().root().as_element().ok_or(RichClipboardError::Invariant)?;
        Ok(text_patch::fragment(root.children().get(0).ok_or(RichClipboardError::Invariant)?)?)
    }
    /// Prepare fresh rich flow blocks; a grid becomes a whole copied table.
    ///
    /// IDs consumed by the host stay consumed after failure; document publication is separate.
    ///
    /// # Errors
    /// Rejects text payloads, allocation/source-ID reuse, incompatible schemas or active limits.
    pub fn flow_drafts(
        &self,
        context: &EditorContext,
        allocator: &mut dyn RichClipboardIdAllocator,
    ) -> Result<Vec<RichBlockDraft>, RichClipboardError> {
        if self.kind == RichClipboardKind::Text {
            return Err(RichClipboardError::Kind);
        }
        let fresh = rekey::prepare(context, self, allocator)?;
        Ok(fresh
            .document
            .document()
            .root()
            .as_element()
            .ok_or(RichClipboardError::Invariant)?
            .children()
            .iter()
            .cloned()
            .map(RichBlockDraft::from_node)
            .collect())
    }
    /// Prepare fresh independent cell bodies, exact header intent and newly authored relative merges.
    ///
    /// The receiving paste planner must select or explicitly grow a matching rectangle.
    /// This never tiles/crops content or imports the source table's collaboration history.
    ///
    /// # Errors
    /// Rejects non-grid payloads, failed allocation, incompatible schemas or active limits.
    pub fn table_paste_draft(
        &self,
        context: &EditorContext,
        allocator: &mut dyn RichClipboardIdAllocator,
    ) -> Result<TablePasteDraft, RichClipboardError> {
        if self.kind != RichClipboardKind::Grid {
            return Err(RichClipboardError::Kind);
        }
        let fresh = rekey::prepare(context, self, allocator)?;
        let id = fresh.document.table_ids().next().ok_or(RichClipboardError::Invariant)?;
        let view = fresh.document.table(id)?.ok_or(RichClipboardError::Invariant)?;
        let node = fresh
            .document
            .table_path(id)
            .and_then(|path| fresh.document.document().node_at(path).ok())
            .and_then(crate::document::NodeRef::as_element)
            .ok_or(RichClipboardError::Invariant)?;
        let mut cells = Vec::new();
        for row in node.children() {
            let mut values = Vec::new();
            for cell in row.as_element().ok_or(RichClipboardError::Invariant)?.children() {
                let cell = cell.as_element().ok_or(RichClipboardError::Invariant)?;
                let header = ast_properties::property(cell, "header")
                    .and_then(crate::document::PropertyValue::as_boolean)
                    .ok_or(RichClipboardError::Invariant)?;
                values.push(TableCellPasteDraft::try_new(
                    cell.children().iter().cloned().map(RichBlockDraft::from_node).collect(),
                    Some(header),
                )?);
            }
            cells.push(values);
        }
        let shape = TableShape::try_new(
            id.clone(),
            view.rows().to_vec(),
            view.columns().iter().map(|column| column.id().clone()).collect(),
            RichTableLimits::default(),
        )?;
        let mut merges = Vec::new();
        for record in ast_properties::property(node, "merges")
            .and_then(crate::document::PropertyValue::as_array)
            .ok_or(RichClipboardError::Invariant)?
        {
            let region =
                ast_properties::merge(id, record).map_err(|_| RichClipboardError::Invariant)?;
            let (r0, r1, c0, c1) = shape.rectangle(&region).ok_or(RichClipboardError::Invariant)?;
            merges.push(TablePasteMerge::try_new(
                region.id().clone(),
                region.stamp(),
                (r0, r1),
                (c0, c1),
            )?);
        }
        Ok(TablePasteDraft::try_new(cells, merges)?)
    }
}
