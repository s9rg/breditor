//! Typed stable-ID directory over the existing immutable validated AST.

use std::{collections::BTreeMap, sync::Arc};

use thiserror::Error;

use crate::{
    document::{Document, NodeRef},
    position::{NodePath, NodePathCursor},
    schema::{CompiledSchema, DocumentLimits, ValidationReport},
};

use super::{
    BlockId, CellId, DocumentId, ImageBinding, ImageId, RichTableView, RowId, TableId,
    ast_properties,
};

/// Admission/read failure without leaking document text or asset credentials.
#[derive(Debug, Error)]
pub enum RichDocumentError {
    /// The schema is not the exact separately compiled rich profile.
    #[error("a sealed rich-content schema is required")]
    UnsupportedSchema,
    /// Durable selector or fingerprint differs; no reinterpretation is attempted.
    #[error("document and rich schema durable bindings differ")]
    SchemaBinding,
    /// Complete revalidation under the active host limits failed.
    #[error(transparent)]
    Validation(#[from] ValidationReport),
    /// An internal typed-read invariant failed; payloads are never included.
    #[error("rich AST invariant failed: {0}")]
    Invariant(&'static str),
}

/// Rich-document view with a snapshot-local stable-content-ID directory.
///
/// The immutable [`Document`] remains the single AST; this value adds indices,
/// not another content store. IDs survive reordering, but returned [`NodePath`]
/// values belong only to this snapshot. Rebuild the directory after an edit or
/// collaboration materialization. No unsafe constructor or `Deserialize` exists.
#[derive(Clone, Debug)]
pub struct RichDocument {
    document: Document,
    id: DocumentId,
    directory: Arc<IdentityDirectory>,
}

#[derive(Debug, Default)]
struct IdentityDirectory {
    blocks: BTreeMap<BlockId, NodePath>,
    tables: BTreeMap<TableId, NodePath>,
    images: BTreeMap<ImageId, NodePath>,
    cells: BTreeMap<CellId, NodePath>,
}

impl RichDocument {
    /// Admit an already decoded immutable AST and build its typed directory.
    ///
    /// Matching durable identity is necessary but not sufficient: a different
    /// compiled proof or host resource policy triggers complete revalidation.
    /// The generic fingerprint-bearing document codec can carry research AST
    /// fixtures; this does not define a public rich session or sync wire family.
    ///
    /// # Errors
    /// Rejects non-rich schemas, mismatched bindings, host-limit violations or
    /// inconsistent internal identity/shape invariants. No partial view escapes.
    pub fn try_admit(
        schema: &CompiledSchema,
        document: Document,
        limits: &DocumentLimits,
    ) -> Result<Self, RichDocumentError> {
        if !schema.is_rich_content_profile() {
            return Err(RichDocumentError::UnsupportedSchema);
        }
        if document.schema() != schema.id() || document.schema_fingerprint() != schema.fingerprint()
        {
            return Err(RichDocumentError::SchemaBinding);
        }
        let document = if document.is_proven_for(schema, limits) {
            document
        } else {
            document.try_revalidate(schema, limits)?
        };
        let root =
            document.root().as_element().ok_or(RichDocumentError::Invariant("root element"))?;
        let id = DocumentId::try_new(
            ast_properties::string(root, "document-id").map_err(RichDocumentError::Invariant)?,
        )
        .map_err(|_| RichDocumentError::Invariant("document identity"))?;
        let mut directory = IdentityDirectory::default();
        // Share immutable node references while constructing indices; no full
        // AST copy is made, and the prior proof bounds this recursive walk.
        directory.index(document.root(), &mut NodePathCursor::default(), None, None)?;
        Ok(Self { document, id, directory: Arc::new(directory) })
    }

    /// Underlying single immutable AST.
    #[must_use]
    pub const fn document(&self) -> &Document {
        &self.document
    }

    /// Host-scoped stable document ID, not authorization to join a room.
    #[must_use]
    pub const fn id(&self) -> &DocumentId {
        &self.id
    }

    /// Snapshot-local path of a stable content node, including row/cell nodes.
    #[must_use]
    pub fn block_path(&self, id: &BlockId) -> Option<&NodePath> {
        self.directory.blocks.get(id)
    }

    /// Snapshot-local path of a base cell, even when covered by a merge.
    #[must_use]
    pub fn cell_path(&self, id: &CellId) -> Option<&NodePath> {
        self.directory.cells.get(id)
    }

    /// Snapshot-local path of a stable table node.
    #[must_use]
    pub fn table_path(&self, id: &TableId) -> Option<&NodePath> {
        self.directory.tables.get(id)
    }

    /// Stable table IDs in canonical byte order, not document visual order.
    #[must_use]
    pub fn table_ids(&self) -> impl ExactSizeIterator<Item = &TableId> {
        self.directory.tables.keys()
    }

    /// Snapshot-local path of a stable image node.
    #[must_use]
    pub fn image_path(&self, id: &ImageId) -> Option<&NodePath> {
        self.directory.images.get(id)
    }

    /// Stable image IDs in canonical byte order, not document visual order.
    #[must_use]
    pub fn image_ids(&self) -> impl ExactSizeIterator<Item = &ImageId> {
        self.directory.images.keys()
    }

    /// Canonical base-cell identity directory, including covered cells.
    #[must_use]
    pub fn cell_entries(&self) -> impl ExactSizeIterator<Item = (&CellId, &NodePath)> {
        self.directory.cells.iter()
    }

    /// Derive geometry without flattening covered base-cell content.
    ///
    /// # Errors
    /// Returns an invariant error only if the proved AST and private directory disagree.
    pub fn table(&self, id: &TableId) -> Result<Option<RichTableView>, RichDocumentError> {
        let Some(path) = self.directory.tables.get(id) else { return Ok(None) };
        Ok(Some(
            ast_properties::table_view(self.element_at(path)?)
                .map_err(RichDocumentError::Invariant)?,
        ))
    }

    /// Read semantic asset binding; resolving bytes/URLs remains the host's job.
    ///
    /// # Errors
    /// Returns an invariant error only if the proved AST and private directory disagree.
    pub fn image(&self, id: &ImageId) -> Result<Option<ImageBinding>, RichDocumentError> {
        let Some(path) = self.directory.images.get(id) else { return Ok(None) };
        Ok(Some(
            ast_properties::image_binding(self.element_at(path)?)
                .map_err(RichDocumentError::Invariant)?,
        ))
    }

    fn element_at(
        &self,
        path: &NodePath,
    ) -> Result<&crate::document::ElementNode, RichDocumentError> {
        self.document
            .node_at(path)
            .ok()
            .and_then(NodeRef::as_element)
            .ok_or(RichDocumentError::Invariant("directory node"))
    }
}

impl IdentityDirectory {
    fn index(
        &mut self,
        node: &NodeRef,
        path: &mut NodePathCursor,
        owning_table: Option<&TableId>,
        owning_row: Option<&RowId>,
    ) -> Result<(), RichDocumentError> {
        let Some(element) = node.as_element() else { return Ok(()) };
        let parse =
            |local| ast_properties::string(element, local).map_err(RichDocumentError::Invariant);
        if element.kind().as_str() != "breditor/document" {
            let id = BlockId::try_new(parse("block-id")?)
                .map_err(|_| RichDocumentError::Invariant("block identity"))?;
            if self.blocks.insert(id, path.snapshot()).is_some() {
                return Err(RichDocumentError::Invariant("duplicate block identity"));
            }
        }
        let table = if element.kind().as_str() == "breditor/table" {
            let id = TableId::try_new(parse("table-id")?)
                .map_err(|_| RichDocumentError::Invariant("table identity"))?;
            if self.tables.insert(id.clone(), path.snapshot()).is_some() {
                return Err(RichDocumentError::Invariant("duplicate table identity"));
            }
            Some(id)
        } else {
            None
        };
        let row = if element.kind().as_str() == "breditor/table-row" {
            Some(
                RowId::try_new(parse("row-id")?)
                    .map_err(|_| RichDocumentError::Invariant("row identity"))?,
            )
        } else {
            None
        };
        if element.kind().as_str() == "breditor/table-cell" {
            let table = owning_table.ok_or(RichDocumentError::Invariant("cell owning table"))?;
            let row = owning_row.ok_or(RichDocumentError::Invariant("cell owning row"))?;
            let column = super::ColumnId::try_new(parse("column-id")?)
                .map_err(|_| RichDocumentError::Invariant("cell column identity"))?;
            if self
                .cells
                .insert(CellId::new(table.clone(), row.clone(), column), path.snapshot())
                .is_some()
            {
                return Err(RichDocumentError::Invariant("duplicate base cell"));
            }
        }
        if element.kind().as_str() == "breditor/image" {
            let id = ImageId::try_new(parse("image-id")?)
                .map_err(|_| RichDocumentError::Invariant("image identity"))?;
            if self.images.insert(id, path.snapshot()).is_some() {
                return Err(RichDocumentError::Invariant("duplicate image identity"));
            }
        }
        for (index, child) in element.children().iter().enumerate() {
            path.try_push(
                u32::try_from(index).map_err(|_| RichDocumentError::Invariant("child index"))?,
            )
            .map_err(|_| RichDocumentError::Invariant("path depth"))?;
            self.index(child, path, table.as_ref().or(owning_table), row.as_ref().or(owning_row))?;
            path.pop();
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        codec::DocumentJsonCodecV2,
        extension::{ExtensionLimits, ExtensionSet},
        identity::QualifiedName,
        schema::{SchemaId, SchemaVersion},
    };

    #[test]
    fn clones_share_the_immutable_identity_directory() -> Result<(), Box<dyn std::error::Error>> {
        let schema = CompiledSchema::try_compile_rich_content_profile(
            SchemaId::new(
                QualifiedName::try_new("example/directory-sharing")?,
                SchemaVersion::try_new(1)?,
            ),
            &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
        )?;
        let value = serde_json::json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":1},"schemaFingerprint":schema.fingerprint().to_string(),"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"document-one"},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"paragraph-one"},"children":[]}]}});
        let document = DocumentJsonCodecV2::new(schema.clone()).decode(&value.to_string())?;
        let rich = RichDocument::try_admit(&schema, document, &DocumentLimits::default())?;
        let cloned = rich.clone();
        assert!(Arc::ptr_eq(&rich.directory, &cloned.directory));
        assert_eq!(rich.document().root(), cloned.document().root());
        Ok(())
    }
}
