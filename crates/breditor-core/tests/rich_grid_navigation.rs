#![cfg(feature = "experimental-rich-content")]
//! Merge-aware logical grid movement, directional extension and owner history separation.

use breditor_core::{
    codec::DocumentJsonCodecV2,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    rich_content::{
        CausalStamp, CellId, ChangeId, ColumnId, GridBoundary, GridMove, GridNavigationMode,
        GridNavigationOutcome, MergeId, ReplicaId, ResolvedRichSelection, RichDocument,
        RichLocalSession, RichSelection, RichSelectionError, RichSelectionKind,
        RichSelectionUpdate, RowId, TableId,
        actions::{MergeTableCells, MoveTableRow, ResizeColumn, RichAction},
        navigate_grid,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type TestResult = Result<(), Box<dyn std::error::Error>>;

fn cell(row: usize, column: usize) -> Result<CellId, Box<dyn std::error::Error>> {
    Ok(CellId::new(
        TableId::try_new("t")?,
        RowId::try_new(format!("r{row}"))?,
        ColumnId::try_new(format!("c{column}"))?,
    ))
}
fn grid(
    doc: &RichDocument,
    anchor: (usize, usize),
    focus: (usize, usize),
) -> Result<RichSelection, Box<dyn std::error::Error>> {
    Ok(RichSelection::try_new(
        doc,
        RichSelectionKind::Grid {
            anchor: cell(anchor.0, anchor.1)?,
            focus: cell(focus.0, focus.1)?,
        },
    )?)
}
fn element(kind: &str, properties: Value, children: Vec<Value>) -> Value {
    let mut value = json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":null,"children":[]});
    value["properties"] = properties;
    value["children"] = Value::Array(children);
    value
}
fn fixture() -> Result<(EditorContext, RichDocument), Box<dyn std::error::Error>> {
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/rich-grid")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    let rows = (0..3).map(|row| {
        let cells = (0..4).map(|column|element("table-cell",json!({"breditor/block-id":format!("cell-{row}-{column}"),"breditor/column-id":format!("c{column}"),"breditor/header":false}),
            vec![element("paragraph",json!({"breditor/block-id":format!("p-{row}-{column}")}),vec![json!({"kind":"text","text":format!("{row}:{column}"),"formats":[]})])])).collect();
        element("table-row",json!({"breditor/block-id":format!("row-{row}"),"breditor/row-id":format!("r{row}")}),cells)
    }).collect();
    let table = element(
        "table",
        json!({"breditor/block-id":"table-block","breditor/table-id":"t",
        "breditor/columns":(0..4).map(|column|json!({"id":format!("c{column}"),"width":100})).collect::<Vec<_>>(),"breditor/merges":[],"breditor/retracted-merges":[]}),
        rows,
    );
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":1},"schemaFingerprint":schema.fingerprint().to_string(),
        "root":element("document",json!({"breditor/document-id":"room"}),vec![table])});
    let context = EditorContext::new(schema.clone(), DocumentLimits::default());
    let doc = DocumentJsonCodecV2::new(schema.clone()).decode(&input.to_string())?;
    let mut doc = RichDocument::try_admit(&schema, doc, context.limits())?;
    for (index, (anchor, focus)) in [((0, 0), (1, 1)), ((0, 3), (2, 3))].into_iter().enumerate() {
        let selection = grid(&doc, anchor, focus)?;
        let stamp = CausalStamp::new(
            u64::try_from(index + 1)?,
            ChangeId::new(ReplicaId::try_new(1)?, u64::try_from(index + 1)?),
        );
        let action = MergeTableCells::capture(
            &doc,
            &selection,
            MergeId::try_new(format!("merge-{index}"))?,
            stamp,
        )?;
        doc = action.apply(&context, &doc)?.ok_or("merge")?.into_parts().0;
    }
    Ok((context, doc))
}
fn moved(outcome: GridNavigationOutcome) -> Result<RichSelection, Box<dyn std::error::Error>> {
    let GridNavigationOutcome::Moved(selection) = outcome else {
        return Err("expected grid move".into());
    };
    Ok(selection)
}
fn focus(selection: &RichSelection) -> Result<&CellId, Box<dyn std::error::Error>> {
    let RichSelectionKind::Grid { focus, .. } = selection.kind() else { return Err("grid".into()) };
    Ok(focus)
}

#[test]
fn tab_visits_each_presentation_master_once_and_reports_exact_boundaries() -> TestResult {
    let (_, doc) = fixture()?;
    let mut selection = grid(&doc, (0, 0), (0, 0))?;
    let mut visited = vec![focus(&selection)?.clone()];
    loop {
        match navigate_grid(&doc, &selection, GridMove::Next, GridNavigationMode::Collapse)? {
            GridNavigationOutcome::Moved(next) => {
                visited.push(focus(&next)?.clone());
                selection = next;
            }
            GridNavigationOutcome::Boundary(GridBoundary::AfterTable) => break,
            _ => return Err("unexpected tab outcome".into()),
        }
    }
    assert_eq!(
        visited,
        [(0, 0), (0, 2), (0, 3), (1, 2), (2, 0), (2, 1), (2, 2)]
            .into_iter()
            .map(|(r, c)| cell(r, c))
            .collect::<Result<Vec<_>, _>>()?
    );
    for expected in visited.iter().rev().skip(1) {
        selection = moved(navigate_grid(
            &doc,
            &selection,
            GridMove::Previous,
            GridNavigationMode::Collapse,
        )?)?;
        assert_eq!(focus(&selection)?, expected);
    }
    assert_eq!(
        navigate_grid(&doc, &selection, GridMove::Previous, GridNavigationMode::Collapse)?,
        GridNavigationOutcome::Boundary(GridBoundary::BeforeTable)
    );
    let covered = grid(&doc, (1, 1), (1, 1))?;
    assert_eq!(
        focus(&moved(navigate_grid(
            &doc,
            &covered,
            GridMove::Next,
            GridNavigationMode::Collapse
        )?)?)?,
        &cell(0, 2)?
    );
    Ok(())
}

#[test]
fn arrows_skip_spans_and_retain_covered_focus_lanes() -> TestResult {
    let (_, doc) = fixture()?;
    for (origin, movement, target) in [
        ((1, 1), GridMove::Right, (1, 2)),
        ((1, 1), GridMove::Down, (2, 1)),
        ((1, 3), GridMove::Left, (1, 2)),
        ((2, 2), GridMove::Right, (2, 3)),
        ((2, 3), GridMove::Left, (2, 2)),
    ] {
        let selection = grid(&doc, origin, origin)?;
        assert_eq!(
            focus(&moved(navigate_grid(
                &doc,
                &selection,
                movement,
                GridNavigationMode::Collapse
            )?)?)?,
            &cell(target.0, target.1)?
        );
    }
    for (origin, movement, boundary) in [
        ((1, 1), GridMove::Left, GridBoundary::LeftEdge),
        ((1, 1), GridMove::Up, GridBoundary::TopEdge),
        ((1, 3), GridMove::Up, GridBoundary::TopEdge),
        ((1, 3), GridMove::Down, GridBoundary::BottomEdge),
        ((1, 3), GridMove::Right, GridBoundary::RightEdge),
    ] {
        let selection = grid(&doc, origin, origin)?;
        assert_eq!(
            navigate_grid(&doc, &selection, movement, GridNavigationMode::Collapse)?,
            GridNavigationOutcome::Boundary(boundary)
        );
    }
    Ok(())
}

#[test]
fn extension_preserves_direction_and_closes_over_whole_spans() -> TestResult {
    let (_, doc) = fixture()?;
    let original = grid(&doc, (0, 2), (1, 1))?;
    let changed =
        moved(navigate_grid(&doc, &original, GridMove::Down, GridNavigationMode::Extend)?)?;
    assert_eq!(
        changed.kind(),
        &RichSelectionKind::Grid { anchor: cell(0, 2)?, focus: cell(2, 1)? }
    );
    let ResolvedRichSelection::Grid(resolved) = changed.resolve(&doc)? else {
        return Err("grid".into());
    };
    assert_eq!(resolved.rows(), (0, 2));
    assert_eq!(resolved.columns(), (0, 2));
    assert_eq!(resolved.cells().len(), 9);
    assert_eq!(resolved.anchor(), &cell(0, 2)?);
    let collapsed =
        moved(navigate_grid(&doc, &original, GridMove::Down, GridNavigationMode::Collapse)?)?;
    assert_eq!(
        collapsed.kind(),
        &RichSelectionKind::Grid { anchor: cell(2, 1)?, focus: cell(2, 1)? }
    );
    Ok(())
}

#[test]
fn row_and_table_endpoints_have_explicit_logical_order() -> TestResult {
    let (_, doc) = fixture()?;
    let origin = grid(&doc, (1, 2), (1, 2))?;
    for (movement, target) in [
        (GridMove::RowStart, (1, 0)),
        (GridMove::RowEnd, (1, 3)),
        (GridMove::TableStart, (0, 0)),
        (GridMove::TableEnd, (2, 2)),
    ] {
        assert_eq!(
            focus(&moved(navigate_grid(&doc, &origin, movement, GridNavigationMode::Collapse)?)?)?,
            &cell(target.0, target.1)?
        );
    }
    let first = grid(&doc, (0, 0), (0, 0))?;
    assert_eq!(
        navigate_grid(&doc, &first, GridMove::TableStart, GridNavigationMode::Collapse)?,
        GridNavigationOutcome::Unchanged
    );
    Ok(())
}

#[test]
fn navigation_publication_is_metadata_only_and_preserves_redo() -> TestResult {
    let (context, doc) = fixture()?;
    let original = grid(&doc, (0, 0), (0, 0))?;
    let mut owner = RichLocalSession::try_new(
        context,
        doc,
        Some(original.kind().clone()),
        HistoryCapacity::default(),
    )?;
    let resize = ResizeColumn::capture(
        owner.state().document(),
        &TableId::try_new("t")?,
        &ColumnId::try_new("c2")?,
        200,
    )?;
    owner.dispatch(
        &owner.snapshot(),
        &[RichAction::ResizeColumn(resize)],
        RichSelectionUpdate::Map,
    )?;
    owner.undo(&owner.snapshot())?;
    let before = owner.state().document().document().clone();
    let next = moved(navigate_grid(
        owner.state().document(),
        owner.state().selection().ok_or("selection")?,
        GridMove::Next,
        GridNavigationMode::Collapse,
    )?)?;
    owner.set_selection(&owner.snapshot(), Some(next.kind().clone()))?;
    assert_eq!(owner.redo_depth(), 1);
    assert_eq!(owner.undo_depth(), 0);
    assert_eq!(owner.state().document().document(), &before);
    owner.redo(&owner.snapshot())?;
    assert_eq!(
        owner.state().document().table(&TableId::try_new("t")?)?.ok_or("table")?.columns()[2]
            .width(),
        200
    );
    Ok(())
}

#[test]
fn navigation_rejects_stale_selection_and_uses_current_reordered_axes() -> TestResult {
    let (context, doc) = fixture()?;
    let selection = grid(&doc, (1, 2), (1, 2))?;
    let action = MoveTableRow::capture(
        &doc,
        &TableId::try_new("t")?,
        &RowId::try_new("r2")?,
        Some(&RowId::try_new("r0")?),
    )?;
    let changed = action.apply(&context, &doc)?.ok_or("move")?.into_parts().0;
    assert!(matches!(
        navigate_grid(&changed, &selection, GridMove::Down, GridNavigationMode::Collapse),
        Err(RichSelectionError::StaleSnapshot)
    ));
    let fresh = RichSelection::try_new(&changed, selection.kind().clone())?;
    assert_eq!(
        navigate_grid(&changed, &fresh, GridMove::Down, GridNavigationMode::Collapse)?,
        GridNavigationOutcome::Boundary(GridBoundary::BottomEdge)
    );
    Ok(())
}
