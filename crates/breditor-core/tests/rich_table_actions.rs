#![cfg(feature = "experimental-rich-content")]
//! Table-axis edits, immutable drafts and stable rich-selection contracts.

use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, Point, TextOffset},
    rich_content::{
        BlockId, CellId, ColumnId, ResolvedRichSelection, RichBlockDraft, RichDocument,
        RichSelection, RichSelectionError, RichSelectionKind, RichSelectionLoss,
        RichSelectionMappingOutcome, RichTextPoint, RowId, TableCellDraft, TableColumnDraft,
        TableId, TableRowDraft,
        actions::{
            DeleteTableColumn, DeleteTableRow, InsertTableColumn, InsertTableRow, ResizeColumn,
            RichAction, RichActionError, apply_batch,
        },
        rebase_rich_selection,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion, ValidationCode},
    state::EditorContext,
};
use proptest::{
    prelude::*,
    test_runner::{RngAlgorithm, RngSeed},
};
use serde_json::{Value, json};

type TestResult = Result<(), Box<dyn std::error::Error>>;

fn schema() -> Result<CompiledSchema, Box<dyn std::error::Error>> {
    Ok(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/table-actions")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?)
}
fn element(kind: &str, properties: Value, children: Vec<Value>) -> Value {
    let mut result = json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null});
    result["properties"] = properties;
    result["children"] = children.into();
    result
}
fn table(rows: usize, columns: usize) -> Value {
    element("table",json!({"breditor/block-id":"table-block","breditor/table-id":"t","breditor/columns":(0..columns).map(|column|json!({"id":format!("c{column}"),"width":120})).collect::<Vec<_>>(),"breditor/merges":[],"breditor/retracted-merges":[]}),
        (0..rows).map(|row|element("table-row",json!({"breditor/block-id":format!("row-block-{row}"),"breditor/row-id":format!("r{row}")}),
            (0..columns).map(|column|element("table-cell",json!({"breditor/block-id":format!("cell-{row}-{column}"),"breditor/column-id":format!("c{column}"),"breditor/header":row==0}),
                vec![element("paragraph",json!({"breditor/block-id":format!("body-{row}-{column}")}),vec![json!({"kind":"text","text":"a🙂b","formats":[]})])])).collect())).collect())
}
fn merge(id: &str, r0: &str, r1: &str, c0: &str, c1: &str, rows: usize, columns: usize) -> Value {
    json!({"id":id,"lamport":"1","writer":"9007199254740993","counter":"0","rows":(0..rows).map(|row|format!("r{row}")).collect::<Vec<_>>(),"columns":(0..columns).map(|column|format!("c{column}")).collect::<Vec<_>>(),"first-row":r0,"last-row":r1,"first-column":c0,"last-column":c1})
}
fn admit(grid: Value) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let schema = schema()?;
    let value = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":1},"schemaFingerprint":schema.fingerprint().to_string(),"root":element("document",json!({"breditor/document-id":"room"}),vec![grid])});
    let document = DocumentJsonCodecV2::new(schema.clone()).decode(&value.to_string())?;
    Ok(RichDocument::try_admit(&schema, document, &DocumentLimits::default())?)
}
fn cell(row: &str, column: &str) -> Result<CellId, Box<dyn std::error::Error>> {
    Ok(CellId::new(TableId::try_new("t")?, RowId::try_new(row)?, ColumnId::try_new(column)?))
}
fn fragment(text: &str) -> Result<TextFragment, Box<dyn std::error::Error>> {
    Ok(TextRun::try_new(text, FormatSet::default())?.into())
}
fn cell_draft(prefix: &str, column: &str) -> Result<TableCellDraft, Box<dyn std::error::Error>> {
    Ok(TableCellDraft::try_new(
        &BlockId::try_new(format!("{prefix}-cell"))?,
        ColumnId::try_new(column)?,
        false,
        vec![RichBlockDraft::paragraph(
            &BlockId::try_new(format!("{prefix}-body"))?,
            &fragment("new 🙂")?,
        )?],
    )?)
}
fn row_draft(row: &str, columns: &[&str]) -> Result<TableRowDraft, Box<dyn std::error::Error>> {
    Ok(TableRowDraft::try_new(
        &BlockId::try_new(format!("{row}-block"))?,
        RowId::try_new(row)?,
        columns
            .iter()
            .map(|column| cell_draft(&format!("{row}-{column}"), column))
            .collect::<Result<_, _>>()?,
    )?)
}
fn context() -> Result<EditorContext, Box<dyn std::error::Error>> {
    Ok(EditorContext::new(schema()?, DocumentLimits::default()))
}
fn bytes(document: &RichDocument) -> Result<String, Box<dyn std::error::Error>> {
    Ok(DocumentJsonCodecV2::new(schema()?).encode(document.document())?)
}
fn text_selection(
    document: &RichDocument,
    id: &str,
    offset: u64,
    affinity: Affinity,
) -> Result<RichSelection, Box<dyn std::error::Error>> {
    let point = RichTextPoint::new(BlockId::try_new(id)?, TextOffset::try_new(offset)?, affinity);
    Ok(RichSelection::try_new(
        document,
        RichSelectionKind::TextRange { anchor: point.clone(), focus: point },
    )?)
}

#[test]
fn inserted_row_expands_a_merge_and_restores_exact_body_header_and_intent_bytes() -> TestResult {
    let mut grid = table(2, 2);
    grid["properties"]["breditor/merges"] = json!([merge("m", "r0", "r1", "c0", "c1", 2, 2)]);
    let original = admit(grid)?;
    let action = InsertTableRow::capture(
        &original,
        &TableId::try_new("t")?,
        Some(&RowId::try_new("r1")?),
        row_draft("inserted", &["c0", "c1"])?,
    )?;
    let edit = action.apply(&context()?, &original)?.ok_or("edit")?;
    let view = edit.document().table(&TableId::try_new("t")?)?.ok_or("table")?;
    assert_eq!(
        view.rows().iter().map(RowId::as_str).collect::<Vec<_>>(),
        vec!["r0", "inserted", "r1"]
    );
    assert_eq!(view.geometry().cell(0, 0).ok_or("master")?.source_cells().len(), 6);
    assert!(edit.document().cell_path(&cell("inserted", "c1")?).is_some());
    let restored = edit.inverse().apply(&context()?, edit.document())?.ok_or("inverse")?;
    assert_eq!(bytes(restored.document())?, bytes(&original)?);
    let redo = restored.inverse().apply(&context()?, restored.document())?.ok_or("redo")?;
    assert_eq!(bytes(redo.document())?, bytes(edit.document())?);
    Ok(())
}

#[test]
fn inserted_column_addresses_unsorted_row_drafts_by_id_and_expands_merge_sources() -> TestResult {
    let mut grid = table(2, 2);
    grid["properties"]["breditor/merges"] = json!([merge("m", "r0", "r1", "c0", "c1", 2, 2)]);
    let original = admit(grid)?;
    let draft = TableColumnDraft::try_new(ColumnId::try_new("new-col")?, 240)?;
    let action = InsertTableColumn::capture(
        &original,
        &TableId::try_new("t")?,
        Some(&ColumnId::try_new("c1")?),
        &draft,
        vec![
            (RowId::try_new("r1")?, cell_draft("new-r1", "new-col")?),
            (RowId::try_new("r0")?, cell_draft("new-r0", "new-col")?),
        ],
    )?;
    let edit = action.apply(&context()?, &original)?.ok_or("edit")?;
    let view = edit.document().table(&TableId::try_new("t")?)?.ok_or("table")?;
    assert_eq!(
        view.columns().iter().map(|column| column.id().as_str()).collect::<Vec<_>>(),
        vec!["c0", "new-col", "c1"]
    );
    assert_eq!(view.geometry().cell(0, 0).ok_or("master")?.source_cells().len(), 6);
    assert_eq!(view.columns()[1].width(), 240);
    for row in ["r0", "r1"] {
        assert!(edit.document().cell_path(&cell(row, "new-col")?).is_some());
    }
    let restored = edit.inverse().apply(&context()?, edit.document())?.ok_or("inverse")?;
    assert_eq!(bytes(restored.document())?, bytes(&original)?);
    Ok(())
}

#[test]
fn deleting_merged_master_axes_keeps_captured_intent_and_all_surviving_bodies() -> TestResult {
    let mut grid = table(2, 2);
    grid["properties"]["breditor/merges"] = json!([merge("m", "r0", "r1", "c0", "c1", 2, 2)]);
    let original = admit(grid)?;
    let actions = [
        RichAction::DeleteTableRow(DeleteTableRow::capture(
            &original,
            &TableId::try_new("t")?,
            &RowId::try_new("r0")?,
        )?),
        RichAction::DeleteTableColumn(DeleteTableColumn::capture(
            &original,
            &TableId::try_new("t")?,
            &ColumnId::try_new("c0")?,
        )?),
    ];
    for action in actions {
        let edit = action.apply(&context()?, &original)?.ok_or("edit")?;
        let view = edit.document().table(&TableId::try_new("t")?)?.ok_or("table")?;
        assert_eq!(view.geometry().cell(0, 0).ok_or("master")?.source_cells().len(), 2);
        assert_eq!(view.geometry().active_regions()[0].as_str(), "m");
        let restored = edit.inverse().apply(&context()?, edit.document())?.ok_or("inverse")?;
        assert_eq!(bytes(restored.document())?, bytes(&original)?);
    }
    Ok(())
}

#[test]
fn deleting_final_axes_hides_table_and_exact_inverse_restores_source_selection() -> TestResult {
    let original = admit(table(1, 1))?;
    let selections = [
        RichSelection::try_new(
            &original,
            RichSelectionKind::Node(BlockId::try_new("table-block")?),
        )?,
        RichSelection::try_new(
            &original,
            RichSelectionKind::Grid { anchor: cell("r0", "c0")?, focus: cell("r0", "c0")? },
        )?,
        text_selection(&original, "body-0-0", 3, Affinity::After)?,
    ];
    for action in [
        RichAction::DeleteTableRow(DeleteTableRow::capture(
            &original,
            &TableId::try_new("t")?,
            &RowId::try_new("r0")?,
        )?),
        RichAction::DeleteTableColumn(DeleteTableColumn::capture(
            &original,
            &TableId::try_new("t")?,
            &ColumnId::try_new("c0")?,
        )?),
    ] {
        let edit = action.apply(&context()?, &original)?.ok_or("edit")?;
        assert!(
            edit.document().table(&TableId::try_new("t")?)?.ok_or("table")?.geometry().is_hidden()
        );
        for selection in &selections {
            let mapped = edit.map_selection(selection)?;
            assert_eq!(
                mapped.outcome(),
                RichSelectionMappingOutcome::Cleared(RichSelectionLoss::HiddenTable)
            );
            assert!(mapped.selection().is_none());
        }
        let restored = edit.inverse().apply(&context()?, edit.document())?.ok_or("inverse")?;
        assert_eq!(bytes(restored.document())?, bytes(&original)?);
        for selection in &selections {
            selection.resolve(restored.document())?;
        }
    }
    Ok(())
}

#[test]
fn empty_table_can_gain_axes_without_fabricating_unowned_cell_ids() -> TestResult {
    let original = admit(table(0, 0))?;
    let row = InsertTableRow::capture(
        &original,
        &TableId::try_new("t")?,
        None,
        row_draft("fresh-row", &[])?,
    )?
    .apply(&context()?, &original)?
    .ok_or("row edit")?;
    assert!(row.document().table(&TableId::try_new("t")?)?.ok_or("table")?.geometry().is_hidden());
    let column = InsertTableColumn::capture(
        row.document(),
        &TableId::try_new("t")?,
        None,
        &TableColumnDraft::try_new(ColumnId::try_new("fresh-column")?, 160)?,
        vec![(RowId::try_new("fresh-row")?, cell_draft("new-body", "fresh-column")?)],
    )?
    .apply(&context()?, row.document())?
    .ok_or("column edit")?;
    assert!(
        !column.document().table(&TableId::try_new("t")?)?.ok_or("table")?.geometry().is_hidden()
    );
    assert!(column.document().cell_path(&cell("fresh-row", "fresh-column")?).is_some());
    Ok(())
}

#[test]
fn wrong_or_duplicate_axis_bindings_are_rejected_before_publication() -> TestResult {
    let original = admit(table(2, 2))?;
    let table = TableId::try_new("t")?;
    assert!(matches!(
        InsertTableRow::capture(&original, &table, None, row_draft("r0", &["c0", "c1"])?),
        Err(RichActionError::AxisIdentityReuse)
    ));
    assert!(matches!(
        InsertTableRow::capture(
            &original,
            &table,
            Some(&RowId::try_new("missing")?),
            row_draft("fresh", &["c0", "c1"])?
        ),
        Err(RichActionError::MissingTarget)
    ));
    assert!(matches!(
        InsertTableRow::capture(&original, &table, None, row_draft("fresh", &["c1", "c0"])?),
        Err(RichActionError::AxisShape)
    ));
    assert!(matches!(
        InsertTableRow::capture(&original, &table, None, row_draft("fresh", &["c0"])?),
        Err(RichActionError::AxisShape)
    ));
    let draft = TableColumnDraft::try_new(ColumnId::try_new("new-col")?, 160)?;
    for cells in [
        vec![],
        vec![
            (RowId::try_new("r0")?, cell_draft("x", "new-col")?),
            (RowId::try_new("r0")?, cell_draft("y", "new-col")?),
        ],
        vec![
            (RowId::try_new("r0")?, cell_draft("x", "new-col")?),
            (RowId::try_new("extra")?, cell_draft("y", "new-col")?),
        ],
        vec![
            (RowId::try_new("r0")?, cell_draft("x", "c0")?),
            (RowId::try_new("r1")?, cell_draft("y", "new-col")?),
        ],
    ] {
        assert!(matches!(
            InsertTableColumn::capture(&original, &table, None, &draft, cells),
            Err(RichActionError::AxisShape)
        ));
    }
    Ok(())
}

#[test]
fn schema_and_duplicate_node_ids_are_checked_after_draft_capture_without_partial_changes()
-> TestResult {
    let original = admit(table(1, 1))?;
    let duplicate = TableCellDraft::try_new(
        &BlockId::try_new("new-cell")?,
        ColumnId::try_new("c0")?,
        false,
        vec![RichBlockDraft::paragraph(&BlockId::try_new("body-0-0")?, &fragment("duplicate")?)?],
    )?;
    let draft = TableRowDraft::try_new(
        &BlockId::try_new("new-row-block")?,
        RowId::try_new("new-row")?,
        vec![duplicate],
    )?;
    let action = InsertTableRow::capture(&original, &TableId::try_new("t")?, None, draft)?;
    assert!(
        matches!(action.apply(&context()?,&original),Err(RichActionError::Validation(report)) if report.contains(ValidationCode::DuplicateContentId))
    );
    let other = admit(table(1, 1))?;
    let nested = RichBlockDraft::capture(&other, &BlockId::try_new("table-block")?)?;
    let draft = TableRowDraft::try_new(
        &BlockId::try_new("new-row-block")?,
        RowId::try_new("new-row")?,
        vec![TableCellDraft::try_new(
            &BlockId::try_new("new-cell")?,
            ColumnId::try_new("c0")?,
            false,
            vec![nested],
        )?],
    )?;
    let action = InsertTableRow::capture(&original, &TableId::try_new("t")?, None, draft)?;
    assert!(
        matches!(action.apply(&context()?,&original),Err(RichActionError::Validation(report)) if report.contains(ValidationCode::NestedTable))
    );
    assert_eq!(bytes(&original)?, bytes(&admit(table(1, 1))?)?);
    Ok(())
}

#[test]
fn whole_table_structural_guards_and_inverse_do_not_erase_later_column_edits() -> TestResult {
    let original = admit(table(2, 2))?;
    let delete =
        DeleteTableRow::capture(&original, &TableId::try_new("t")?, &RowId::try_new("r0")?)?;
    let resized =
        ResizeColumn::capture(&original, &TableId::try_new("t")?, &ColumnId::try_new("c1")?, 320)?
            .apply(&context()?, &original)?
            .ok_or("resize")?;
    assert!(matches!(
        delete.apply(&context()?, resized.document()),
        Err(RichActionError::StaleTarget)
    ));
    let edit = delete.apply(&context()?, &original)?.ok_or("delete")?;
    let changed = ResizeColumn::capture(
        edit.document(),
        &TableId::try_new("t")?,
        &ColumnId::try_new("c1")?,
        320,
    )?
    .apply(&context()?, edit.document())?
    .ok_or("later resize")?;
    assert!(matches!(
        edit.inverse().apply(&context()?, changed.document()),
        Err(RichActionError::StaleTarget)
    ));
    Ok(())
}

#[test]
fn structural_batches_require_staged_capture_and_undo_all_steps_exactly() -> TestResult {
    let original = admit(table(2, 2))?;
    let row = RichAction::InsertTableRow(InsertTableRow::capture(
        &original,
        &TableId::try_new("t")?,
        None,
        row_draft("new-row", &["c0", "c1"])?,
    )?);
    let stale = RichAction::DeleteTableColumn(DeleteTableColumn::capture(
        &original,
        &TableId::try_new("t")?,
        &ColumnId::try_new("c0")?,
    )?);
    assert!(matches!(
        apply_batch(&context()?, &original, &[row.clone(), stale]),
        Err(RichActionError::StaleTarget)
    ));
    let staged = row.apply(&context()?, &original)?.ok_or("staged")?;
    let column = RichAction::DeleteTableColumn(DeleteTableColumn::capture(
        staged.document(),
        &TableId::try_new("t")?,
        &ColumnId::try_new("c0")?,
    )?);
    let batch = apply_batch(&context()?, &original, &[row, column])?.ok_or("batch")?;
    assert_eq!(batch.inverse().len(), 2);
    let restored =
        apply_batch(&context()?, batch.document(), batch.inverse())?.ok_or("inverse batch")?;
    assert_eq!(bytes(restored.document())?, bytes(&original)?);
    let redo = apply_batch(&context()?, restored.document(), restored.inverse())?.ok_or("redo")?;
    assert_eq!(bytes(redo.document())?, bytes(batch.document())?);
    Ok(())
}

#[test]
fn grid_closure_keeps_covered_endpoint_direction_and_all_merged_sources() -> TestResult {
    let mut grid = table(2, 2);
    grid["properties"]["breditor/merges"] = json!([merge("m", "r0", "r1", "c0", "c1", 2, 2)]);
    let document = admit(grid)?;
    let anchor = cell("r1", "c1")?;
    let selection = RichSelection::try_new(
        &document,
        RichSelectionKind::Grid { anchor: anchor.clone(), focus: anchor.clone() },
    )?;
    let ResolvedRichSelection::Grid(grid) = selection.resolve(&document)? else {
        return Err("grid expected".into());
    };
    assert_eq!(grid.anchor(), &anchor);
    assert_eq!(grid.focus(), &anchor);
    assert_eq!(grid.rows(), (0, 1));
    assert_eq!(grid.columns(), (0, 1));
    assert_eq!(grid.cells().len(), 4);
    assert_eq!(grid.masters(), &[cell("r0", "c0")?]);
    Ok(())
}

#[test]
fn merge_closure_reaches_a_fixed_point_when_expansion_touches_another_disjoint_merge() -> TestResult
{
    let mut grid = table(3, 3);
    grid["properties"]["breditor/merges"] =
        json!([merge("a", "r0", "r2", "c2", "c2", 3, 3), merge("b", "r1", "r1", "c0", "c1", 3, 3)]);
    let document = admit(grid)?;
    let selection = RichSelection::try_new(
        &document,
        RichSelectionKind::Grid { anchor: cell("r0", "c1")?, focus: cell("r0", "c2")? },
    )?;
    let ResolvedRichSelection::Grid(grid) = selection.resolve(&document)? else {
        return Err("grid expected".into());
    };
    assert_eq!(grid.rows(), (0, 2));
    assert_eq!(grid.columns(), (0, 2));
    assert_eq!(grid.cells().len(), 9);
    assert_eq!(grid.masters().len(), 6);
    Ok(())
}

#[test]
fn backwards_grid_and_collapsed_deleted_row_use_explicit_safe_neighbours() -> TestResult {
    let original = admit(table(3, 2))?;
    let collapsed = RichSelection::try_new(
        &original,
        RichSelectionKind::Grid { anchor: cell("r1", "c0")?, focus: cell("r1", "c0")? },
    )?;
    let edit = DeleteTableRow::capture(&original, &TableId::try_new("t")?, &RowId::try_new("r1")?)?
        .apply(&context()?, &original)?
        .ok_or("delete")?;
    let mapped = edit.map_selection(&collapsed)?;
    assert_eq!(mapped.outcome(), RichSelectionMappingOutcome::Relocated);
    assert_eq!(
        mapped.selection().ok_or("selection")?.kind(),
        &RichSelectionKind::Grid { anchor: cell("r2", "c0")?, focus: cell("r2", "c0")? }
    );
    let backwards = RichSelection::try_new(
        &original,
        RichSelectionKind::Grid { anchor: cell("r2", "c1")?, focus: cell("r0", "c0")? },
    )?;
    let delete =
        DeleteTableRow::capture(&original, &TableId::try_new("t")?, &RowId::try_new("r0")?)?
            .apply(&context()?, &original)?
            .ok_or("delete")?;
    assert_eq!(
        delete.map_selection(&backwards)?.selection().ok_or("selection")?.kind(),
        &RichSelectionKind::Grid { anchor: cell("r2", "c1")?, focus: cell("r1", "c0")? }
    );
    Ok(())
}

#[test]
fn scalar_boundaries_empty_text_and_format_seam_affinity_are_explicit() -> TestResult {
    let original = admit(table(1, 1))?;
    assert!(text_selection(&original, "body-0-0", 2, Affinity::After).is_err());
    assert!(text_selection(&original, "body-0-0", 5, Affinity::After).is_err());
    let strong = FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::default(),
    )])?;
    let runs = TextFragment::try_from_runs(vec![
        TextRun::try_new("a", FormatSet::default())?,
        TextRun::try_new("🙂b", strong)?,
    ])?;
    let draft = TableRowDraft::try_new(
        &BlockId::try_new("new-row-block")?,
        RowId::try_new("fresh")?,
        vec![TableCellDraft::try_new(
            &BlockId::try_new("new-cell")?,
            ColumnId::try_new("c0")?,
            false,
            vec![RichBlockDraft::paragraph(&BlockId::try_new("formatted")?, &runs)?],
        )?],
    )?;
    let edit = InsertTableRow::capture(&original, &TableId::try_new("t")?, None, draft)?
        .apply(&context()?, &original)?
        .ok_or("insert")?;
    for (affinity, leaf, offset) in [(Affinity::Before, 0, 1), (Affinity::After, 1, 0)] {
        let selection = text_selection(edit.document(), "formatted", 1, affinity)?;
        let ResolvedRichSelection::TextRange { anchor, focus } =
            selection.resolve(edit.document())?
        else {
            return Err("text range expected".into());
        };
        assert_eq!(anchor, focus);
        assert_eq!(
            anchor,
            Point::Text {
                text_path: breditor_core::position::NodePath::try_from_indices(vec![
                    0, 1, 0, 0, leaf
                ])?,
                utf16_offset: offset,
                affinity
            }
        );
    }
    Ok(())
}

#[test]
fn deleted_text_caret_relocates_by_affinity_without_erasing_direction_or_saved_undo_selection()
-> TestResult {
    let original = admit(table(3, 1))?;
    let edit = DeleteTableRow::capture(&original, &TableId::try_new("t")?, &RowId::try_new("r1")?)?
        .apply(&context()?, &original)?
        .ok_or("delete")?;
    for (affinity, target, offset) in
        [(Affinity::Before, "body-0-0", 4), (Affinity::After, "body-2-0", 0)]
    {
        let selection = text_selection(&original, "body-1-0", 3, affinity)?;
        let mapping = edit.map_selection(&selection)?;
        assert_eq!(mapping.outcome(), RichSelectionMappingOutcome::Relocated);
        let point =
            RichTextPoint::new(BlockId::try_new(target)?, TextOffset::try_new(offset)?, affinity);
        assert_eq!(
            mapping.selection().ok_or("selection")?.kind(),
            &RichSelectionKind::TextRange { anchor: point.clone(), focus: point }
        );
        let undo = edit.inverse().apply(&context()?, edit.document())?.ok_or("inverse")?;
        selection.resolve(undo.document())?; // Exact history restores the saved source selection.
    }
    Ok(())
}

#[test]
fn stale_source_selection_and_changed_surviving_text_are_not_silently_reinterpreted() -> TestResult
{
    let original = admit(table(2, 2))?;
    let selection = text_selection(&original, "body-1-1", 3, Affinity::After)?;
    let edit = InsertTableRow::capture(
        &original,
        &TableId::try_new("t")?,
        Some(&RowId::try_new("r0")?),
        row_draft("fresh", &["c0", "c1"])?,
    )?
    .apply(&context()?, &original)?
    .ok_or("insert")?;
    assert!(matches!(selection.resolve(edit.document()), Err(RichSelectionError::StaleSnapshot)));
    let mapped = edit.map_selection(&selection)?;
    assert_eq!(mapped.outcome(), RichSelectionMappingOutcome::Preserved);
    mapped.selection().ok_or("selection")?.resolve(edit.document())?;
    let mut changed = table(2, 2);
    changed["children"][1]["children"][1]["children"][0]["children"][0]["text"] =
        "prefix a🙂b".into();
    assert!(matches!(
        rebase_rich_selection(&original, &admit(changed)?, &selection),
        Err(RichSelectionError::TextChanged)
    ));
    assert!(matches!(
        edit.map_selection(&text_selection(edit.document(), "body-1-1", 3, Affinity::After)?),
        Err(RichSelectionError::StaleSnapshot)
    ));
    Ok(())
}

#[test]
fn active_host_limits_reject_a_table_expansion_atomically() -> TestResult {
    let original = admit(table(1, 1))?;
    let action = InsertTableRow::capture(
        &original,
        &TableId::try_new("t")?,
        None,
        row_draft("fresh", &["c0"])?,
    )?;
    let maximum = usize::try_from(original.document().summary().node_count())?;
    let tighter = EditorContext::new(schema()?, DocumentLimits::default().with_max_nodes(maximum));
    assert!(matches!(action.apply(&tighter, &original), Err(RichActionError::Validation(_))));
    assert_eq!(bytes(&original)?, bytes(&admit(table(1, 1))?)?);
    Ok(())
}

#[test]
fn axis_ceiling_and_empty_paragraph_point_contracts_are_explicit() -> TestResult {
    let rows = admit(table(256, 0))?;
    assert!(matches!(
        InsertTableRow::capture(&rows, &TableId::try_new("t")?, None, row_draft("fresh", &[])?),
        Err(RichActionError::TableLimit)
    ));
    let columns = admit(table(0, 128))?;
    assert!(matches!(
        InsertTableColumn::capture(
            &columns,
            &TableId::try_new("t")?,
            None,
            &TableColumnDraft::try_new(ColumnId::try_new("fresh-column")?, 160)?,
            vec![]
        ),
        Err(RichActionError::TableLimit)
    ));
    let original = admit(table(1, 1))?;
    let row = TableRowDraft::try_new(
        &BlockId::try_new("empty-row-block")?,
        RowId::try_new("empty-row")?,
        vec![TableCellDraft::try_new(
            &BlockId::try_new("empty-cell")?,
            ColumnId::try_new("c0")?,
            false,
            vec![RichBlockDraft::paragraph(&BlockId::try_new("empty")?, &TextFragment::empty())?],
        )?],
    )?;
    let edit = InsertTableRow::capture(&original, &TableId::try_new("t")?, None, row)?
        .apply(&context()?, &original)?
        .ok_or("insert")?;
    let selection = text_selection(edit.document(), "empty", 0, Affinity::After)?;
    let ResolvedRichSelection::TextRange { anchor, .. } = selection.resolve(edit.document())?
    else {
        return Err("text range expected".into());
    };
    assert_eq!(
        anchor,
        Point::Children {
            parent_path: breditor_core::position::NodePath::try_from_indices(vec![0, 1, 0, 0])?,
            child_index: 0,
            affinity: Affinity::After
        }
    );
    assert!(text_selection(edit.document(), "empty", 1, Affinity::After).is_err());
    Ok(())
}

#[test]
fn deleting_caret_cell_with_an_image_only_neighbour_reports_no_text_target() -> TestResult {
    let mut grid = table(2, 1);
    let image = element(
        "image",
        json!({"breditor/block-id":"image-block","breditor/image-id":"image-one","breditor/asset-id":"asset-one","breditor/asset-generation":"generation-one","breditor/alt-text":"","breditor/decorative":true}),
        vec![],
    );
    grid["children"][1]["children"][0]["children"] = json!([image]);
    let original = admit(grid)?;
    let selection = text_selection(&original, "body-0-0", 3, Affinity::After)?;
    let edit = DeleteTableRow::capture(&original, &TableId::try_new("t")?, &RowId::try_new("r0")?)?
        .apply(&context()?, &original)?
        .ok_or("delete")?;
    assert_eq!(
        edit.map_selection(&selection)?.outcome(),
        RichSelectionMappingOutcome::Cleared(RichSelectionLoss::NoTextTarget)
    );
    Ok(())
}

proptest! {
    #![proptest_config(ProptestConfig {cases:256,rng_algorithm:RngAlgorithm::ChaCha,rng_seed:RngSeed::Fixed(0x6178_6973_756e_646f),..ProptestConfig::default()})]
    #[test]
    fn axis_deletion_and_inverse_match_an_independent_json_oracle(rows in 1usize..5,columns in 1usize..5,index in 0usize..32,is_row in any::<bool>()) {
        let mut oracle=table(rows,columns);
        let original=admit(oracle.clone()).map_err(|error|TestCaseError::fail(error.to_string()))?;
        let table_id=TableId::try_new("t").map_err(|error|TestCaseError::fail(error.to_string()))?;
        let action=if is_row {
            let index=index%rows;
            oracle["children"].as_array_mut().ok_or_else(||TestCaseError::fail("row array"))?.remove(index);
            RichAction::DeleteTableRow(DeleteTableRow::capture(&original,&table_id,&RowId::try_new(format!("r{index}")).map_err(|error|TestCaseError::fail(error.to_string()))?).map_err(|error|TestCaseError::fail(error.to_string()))?)
        } else {
            let index=index%columns;
            oracle["properties"]["breditor/columns"].as_array_mut().ok_or_else(||TestCaseError::fail("column array"))?.remove(index);
            for row in oracle["children"].as_array_mut().ok_or_else(||TestCaseError::fail("rows"))? {row["children"].as_array_mut().ok_or_else(||TestCaseError::fail("cells"))?.remove(index);}
            RichAction::DeleteTableColumn(DeleteTableColumn::capture(&original,&table_id,&ColumnId::try_new(format!("c{index}")).map_err(|error|TestCaseError::fail(error.to_string()))?).map_err(|error|TestCaseError::fail(error.to_string()))?)
        };
        let context=context().map_err(|error|TestCaseError::fail(error.to_string()))?;
        let edit=action.apply(&context,&original).map_err(|error|TestCaseError::fail(error.to_string()))?.ok_or_else(||TestCaseError::fail("edit"))?;
        let expected=admit(oracle).map_err(|error|TestCaseError::fail(error.to_string()))?;
        prop_assert_eq!(edit.document().document().root(),expected.document().root());
        let restored=edit.inverse().apply(&context,edit.document()).map_err(|error|TestCaseError::fail(error.to_string()))?.ok_or_else(||TestCaseError::fail("inverse"))?;
        prop_assert_eq!(bytes(restored.document()).map_err(|error|TestCaseError::fail(error.to_string()))?,bytes(&original).map_err(|error|TestCaseError::fail(error.to_string()))?);
    }
}
