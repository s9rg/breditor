//! Native/Wasm parity bridge for the separate rich AST, not a production wire API.

use breditor_core::{
    codec::DocumentJsonCodecV2,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    rich_content::{
        CellId, ImageAlt, ImageSize, RichDocument,
        actions::{ResizeColumn, ResizeImage, RichAction, SetImageAlt, apply_batch},
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    state::EditorContext,
};
use serde_json::{Value, json};

use crate::Error;

fn contract(_error: impl std::fmt::Display) -> Error {
    Error::Contract("rich AST fixture admission")
}

pub(crate) fn schema() -> Result<CompiledSchema, Error> {
    let id = SchemaId::new(
        QualifiedName::try_new("breditor-probe/rich-content").map_err(contract)?,
        SchemaVersion::try_new(1).map_err(contract)?,
    );
    let extensions = ExtensionSet::try_new(vec![], ExtensionLimits::default()).map_err(contract)?;
    CompiledSchema::try_compile_rich_content_profile(id, &extensions).map_err(contract)
}

/// Exact research-only selector/fingerprint for constructing AST test envelopes.
///
/// # Errors
/// Rejects an internal schema-compilation failure without publishing a partial binding.
pub fn binding() -> Result<String, Error> {
    let schema = schema()?;
    Ok(json!({"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string()}).to_string())
}

fn cell_json(cell: &CellId) -> Value {
    json!({"table":cell.table().as_str(),"row":cell.row().as_str(),"column":cell.column().as_str()})
}

/// Strictly admit a bounded research AST and expose the real Rust typed views.
///
/// This bridge uses the existing generic fingerprint-bearing document codec for
/// fixtures only. It does not accept a session journal or remote CRDT changes,
/// and does not declare a new shipping rich-document/session/sync wire family.
///
/// # Errors
/// Rejects wrong bindings, malformed/extra properties, identities, geometry and
/// resource limits. Output is deterministic and failures omit caller payloads.
pub fn admit(input: &str) -> Result<String, Error> {
    let schema = schema()?;
    let limits = DocumentLimits::default().with_max_json_bytes(256 * 1024);
    let codec = DocumentJsonCodecV2::new(schema.clone()).with_limits(limits.clone());
    let document = codec.decode(input).map_err(contract)?;
    let rich = RichDocument::try_admit(&schema, document, &limits).map_err(contract)?;
    let canonical = codec.encode(rich.document()).map_err(contract)?;
    let tables: Vec<_> = rich.table_ids().map(|id| {
        let view = rich.table(id).map_err(contract)?.ok_or(Error::Contract("missing rich table"))?;
        Ok(json!({
            "id":id.as_str(), "path":rich.table_path(id).map(breditor_core::position::NodePath::to_vec),
            "rows":view.rows().iter().map(breditor_core::rich_content::RowId::as_str).collect::<Vec<_>>(),
            "columns":view.columns().iter().map(|column|json!({"id":column.id().as_str(),"width":column.width()})).collect::<Vec<_>>(),
            "hidden":view.geometry().is_hidden(),
            "active":view.geometry().active_regions().iter().map(breditor_core::rich_content::MergeId::as_str).collect::<Vec<_>>(),
            "cells":view.geometry().cells().iter().map(|cell|json!({
                "base":cell_json(cell.base()),"master":cell_json(cell.master()),
                "row_span":cell.row_span(),"column_span":cell.column_span(),
                "sources":cell.source_cells().iter().map(cell_json).collect::<Vec<_>>()
            })).collect::<Vec<_>>()
        }))
    }).collect::<Result<_,Error>>()?;
    let images: Vec<_> = rich.image_ids().map(|id| {
        let view = rich.image(id).map_err(contract)?.ok_or(Error::Contract("missing rich image"))?;
        Ok(json!({"id":id.as_str(), "path":rich.image_path(id).map(breditor_core::position::NodePath::to_vec),
            "asset":view.asset().as_str(),"generation":view.generation().as_str(),
            "alt":view.alt().text(), "decorative":view.alt().is_decorative(),
            "size":view.size().map(|size|[size.width(),size.height()])}))
    }).collect::<Result<_,Error>>()?;
    let cells: Vec<_> = rich
        .cell_entries()
        .map(|(id, path)| json!({"id":cell_json(id),"path":path.to_vec()}))
        .collect();
    Ok(json!({"canonical":canonical, "document_id":rich.id().as_str(), "tables":tables, "images":images, "cells":cells}).to_string())
}

/// Exercise a real local rich action group and exact inverse/redo in Rust.
///
/// Fixed research scenario only: resize the first image, mark it decorative,
/// then resize the first table column. No JavaScript-owned action/history model.
///
/// # Errors
/// Rejects invalid ASTs, absent scenario targets, stale guards or failed inverses.
pub fn exercise_actions(input: &str) -> Result<String, Error> {
    let schema = schema()?;
    let limits = DocumentLimits::default().with_max_json_bytes(256 * 1024);
    let codec = DocumentJsonCodecV2::new(schema.clone()).with_limits(limits.clone());
    let original =
        RichDocument::try_admit(&schema, codec.decode(input).map_err(contract)?, &limits)
            .map_err(contract)?;
    let context = EditorContext::new(schema, limits);
    let image = original.image_ids().next().cloned().ok_or(Error::Contract("scenario image"))?;
    let table = original.table_ids().next().cloned().ok_or(Error::Contract("scenario table"))?;
    let column = original
        .table(&table)
        .map_err(contract)?
        .ok_or(Error::Contract("scenario table"))?
        .columns()
        .first()
        .map(|column| column.id().clone())
        .ok_or(Error::Contract("scenario column"))?;
    let resize = RichAction::ResizeImage(
        ResizeImage::capture(
            &original,
            &image,
            Some(ImageSize::try_new(320, 240).map_err(contract)?),
        )
        .map_err(contract)?,
    );
    let staged = resize
        .apply(&context, &original)
        .map_err(contract)?
        .ok_or(Error::Contract("scenario resize"))?;
    let alt = RichAction::SetImageAlt(
        SetImageAlt::capture(staged.document(), &image, ImageAlt::decorative())
            .map_err(contract)?,
    );
    let width = RichAction::ResizeColumn(
        ResizeColumn::capture(&original, &table, &column, 320).map_err(contract)?,
    );
    let changed = apply_batch(&context, &original, &[resize, alt, width])
        .map_err(contract)?
        .ok_or(Error::Contract("scenario action group"))?;
    let undo = apply_batch(&context, changed.document(), changed.inverse())
        .map_err(contract)?
        .ok_or(Error::Contract("scenario inverse group"))?;
    let redo = apply_batch(&context, undo.document(), undo.inverse())
        .map_err(contract)?
        .ok_or(Error::Contract("scenario redo group"))?;
    Ok(json!({
        "initial":codec.encode(original.document()).map_err(contract)?,
        "changed":codec.encode(changed.document().document()).map_err(contract)?,
        "undone":codec.encode(undo.document().document()).map_err(contract)?,
        "redone":codec.encode(redo.document().document()).map_err(contract)?,
        "inverse_count":changed.inverse().len(),
    })
    .to_string())
}
