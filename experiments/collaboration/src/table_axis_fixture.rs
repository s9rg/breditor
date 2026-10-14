//! Native/Wasm parity of real table axis actions and rich selections.
//!
//! Closed fixture records only, not the future rich session or collaboration wire.

use crate::Error;
use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::{FormatSet, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, Point, TextOffset},
    rich_content::{
        BlockId, CellId, ColumnId, ResolvedRichSelection, RichBlockDraft, RichDocument,
        RichSelection, RichSelectionKind, RichSelectionLoss, RichSelectionMappingOutcome,
        RichTextPoint, RowId, TableCellDraft, TableColumnDraft, TableId, TableRowDraft,
        actions::{
            DeleteTableColumn, DeleteTableRow, InsertTableColumn, InsertTableRow, RichAction,
        },
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    state::EditorContext,
};
use serde::Deserialize;
use serde_json::{Value, json};

fn contract(_error: impl std::fmt::Display) -> Error {
    Error::Contract("table axis/selection fixture")
}

pub(crate) fn admitted(
    input: &str,
) -> Result<(EditorContext, DocumentJsonCodecV2, RichDocument), Error> {
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(
            QualifiedName::try_new("breditor-probe/rich-content").map_err(contract)?,
            SchemaVersion::try_new(1).map_err(contract)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default()).map_err(contract)?,
    )
    .map_err(contract)?;
    let limits = DocumentLimits::default().with_max_json_bytes(256 * 1024);
    let codec = DocumentJsonCodecV2::new(schema.clone()).with_limits(limits.clone());
    let document =
        RichDocument::try_admit(&schema, codec.decode(input).map_err(contract)?, &limits)
            .map_err(contract)?;
    Ok((EditorContext::new(schema, limits), codec, document))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CellFixture {
    table: String,
    row: String,
    column: String,
}
impl CellFixture {
    fn admit(self) -> Result<CellId, Error> {
        Ok(CellId::new(
            TableId::try_new(self.table).map_err(contract)?,
            RowId::try_new(self.row).map_err(contract)?,
            ColumnId::try_new(self.column).map_err(contract)?,
        ))
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TextFixture {
    block: String,
    offset: u64,
    affinity: Side,
}
#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum Side {
    Before,
    After,
}
impl TextFixture {
    fn admit(self) -> Result<RichTextPoint, Error> {
        Ok(RichTextPoint::new(
            BlockId::try_new(self.block).map_err(contract)?,
            TextOffset::try_new(self.offset).map_err(contract)?,
            match self.affinity {
                Side::Before => Affinity::Before,
                Side::After => Affinity::After,
            },
        ))
    }
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum SelectionFixture {
    Node { block: String },
    Grid { anchor: CellFixture, focus: CellFixture },
    Text { anchor: TextFixture, focus: TextFixture },
}
impl SelectionFixture {
    fn admit(self, document: &RichDocument) -> Result<RichSelection, Error> {
        let kind = match self {
            Self::Node { block } => {
                RichSelectionKind::Node(BlockId::try_new(block).map_err(contract)?)
            }
            Self::Grid { anchor, focus } => {
                RichSelectionKind::Grid { anchor: anchor.admit()?, focus: focus.admit()? }
            }
            Self::Text { anchor, focus } => {
                RichSelectionKind::TextRange { anchor: anchor.admit()?, focus: focus.admit()? }
            }
        };
        RichSelection::try_new(document, kind).map_err(contract)
    }
}
fn cell_json(cell: &CellId) -> Value {
    json!({"table":cell.table().as_str(),"row":cell.row().as_str(),"column":cell.column().as_str()})
}
fn text_json(point: &RichTextPoint) -> Value {
    json!({"block":point.block().as_str(),"offset":point.offset().get(),"affinity":if point.affinity()==Affinity::Before {"before"}else {"after"}})
}
fn point_json(point: &Point) -> Value {
    match point {
        Point::Text { text_path, utf16_offset, affinity } => {
            json!({"kind":"text","path":text_path.to_vec(),"offset":utf16_offset,"affinity":if *affinity==Affinity::Before {"before"}else {"after"}})
        }
        Point::Children { parent_path, child_index, affinity } => {
            json!({"kind":"children","path":parent_path.to_vec(),"offset":child_index,"affinity":if *affinity==Affinity::Before {"before"}else {"after"}})
        }
    }
}
pub(crate) fn selection_json(
    document: &RichDocument,
    selection: &RichSelection,
) -> Result<Value, Error> {
    let kind = match selection.kind() {
        RichSelectionKind::Node(block) => json!({"kind":"node","block":block.as_str()}),
        RichSelectionKind::Grid { anchor, focus } => {
            json!({"kind":"grid","anchor":cell_json(anchor),"focus":cell_json(focus)})
        }
        RichSelectionKind::TextRange { anchor, focus } => {
            json!({"kind":"text","anchor":text_json(anchor),"focus":text_json(focus)})
        }
    };
    let resolved = match selection.resolve(document).map_err(contract)? {
        ResolvedRichSelection::Node { path, .. } => json!({"path":path.to_vec()}),
        ResolvedRichSelection::TextRange { anchor, focus } => {
            json!({"anchor":point_json(&anchor),"focus":point_json(&focus)})
        }
        ResolvedRichSelection::Grid(grid) => {
            json!({"rows":grid.rows(),"columns":grid.columns(),"cells":grid.cells().iter().map(cell_json).collect::<Vec<_>>(),"masters":grid.masters().iter().map(cell_json).collect::<Vec<_>>()})
        }
    };
    Ok(json!({"kind":kind,"resolved":resolved}))
}

/// Resolve a bounded closed selection fixture through the actual Rust selection model.
///
/// # Errors
/// Rejects malformed ASTs, extra fields, coercible/unsafe offsets, wrong kinds,
/// foreign/deleted cells and scalar-splitting boundaries without publishing state.
pub fn resolve_selection(input: &str, selection: &str) -> Result<String, Error> {
    if selection.len() > 4096 {
        return Err(Error::Limit("selection fixture bytes"));
    }
    let (_, _, document) = admitted(input)?;
    let fixture: SelectionFixture = serde_json::from_str(selection)?;
    Ok(selection_json(&document, &fixture.admit(&document)?)?.to_string())
}

fn draft_cell(prefix: &str, column: &str) -> Result<TableCellDraft, Error> {
    let text: TextFragment =
        TextRun::try_new("new 🙂 body", FormatSet::default()).map_err(contract)?.into();
    TableCellDraft::try_new(
        &BlockId::try_new(format!("{prefix}-cell")).map_err(contract)?,
        ColumnId::try_new(column).map_err(contract)?,
        false,
        vec![
            RichBlockDraft::paragraph(
                &BlockId::try_new(format!("{prefix}-body")).map_err(contract)?,
                &text,
            )
            .map_err(contract)?,
        ],
    )
    .map_err(contract)
}

fn scenario_actions(original: &RichDocument) -> Result<[(&'static str, RichAction); 4], Error> {
    let table = TableId::try_new("table-one").map_err(contract)?;
    let row = TableRowDraft::try_new(
        &BlockId::try_new("inserted-row-block").map_err(contract)?,
        RowId::try_new("inserted-row").map_err(contract)?,
        vec![draft_cell("inserted-c0", "c0")?, draft_cell("inserted-c1", "c1")?],
    )
    .map_err(contract)?;
    let actions = [
        (
            "insert_row",
            RichAction::InsertTableRow(
                InsertTableRow::capture(
                    original,
                    &table,
                    Some(&RowId::try_new("r1").map_err(contract)?),
                    row,
                )
                .map_err(contract)?,
            ),
        ),
        (
            "insert_column",
            RichAction::InsertTableColumn(
                InsertTableColumn::capture(
                    original,
                    &table,
                    Some(&ColumnId::try_new("c1").map_err(contract)?),
                    &TableColumnDraft::try_new(
                        ColumnId::try_new("inserted-column").map_err(contract)?,
                        160,
                    )
                    .map_err(contract)?,
                    vec![
                        (
                            RowId::try_new("r1").map_err(contract)?,
                            draft_cell("inserted-r1", "inserted-column")?,
                        ),
                        (
                            RowId::try_new("r0").map_err(contract)?,
                            draft_cell("inserted-r0", "inserted-column")?,
                        ),
                    ],
                )
                .map_err(contract)?,
            ),
        ),
        (
            "delete_row",
            RichAction::DeleteTableRow(
                DeleteTableRow::capture(original, &table, &RowId::try_new("r1").map_err(contract)?)
                    .map_err(contract)?,
            ),
        ),
        (
            "delete_column",
            RichAction::DeleteTableColumn(
                DeleteTableColumn::capture(
                    original,
                    &table,
                    &ColumnId::try_new("c1").map_err(contract)?,
                )
                .map_err(contract)?,
            ),
        ),
    ];
    Ok(actions)
}

/// Fixed combined scenario: axis actions, covered-image/text/grid mapping and exact undo/redo.
///
/// Uses the native golden root's known IDs. It retains before selections as a
/// local history coordinator must; reverse fallback is not treated as exact undo.
///
/// # Errors
/// Rejects invalid ASTs, absent scenario targets, stale actions, failed mapping or inverse.
pub fn exercise(input: &str) -> Result<String, Error> {
    let (context, codec, original) = admitted(input)?;
    let actions = scenario_actions(&original)?;
    let cell = CellId::new(
        TableId::try_new("table-one").map_err(contract)?,
        RowId::try_new("r1").map_err(contract)?,
        ColumnId::try_new("c1").map_err(contract)?,
    );
    let point = RichTextPoint::new(
        BlockId::try_new("caption-one").map_err(contract)?,
        TextOffset::ZERO,
        Affinity::After,
    );
    let selections = [
        (
            "node",
            RichSelection::try_new(
                &original,
                RichSelectionKind::Node(BlockId::try_new("covered-image-block").map_err(contract)?),
            )
            .map_err(contract)?,
        ),
        (
            "grid",
            RichSelection::try_new(
                &original,
                RichSelectionKind::Grid { anchor: cell.clone(), focus: cell },
            )
            .map_err(contract)?,
        ),
        (
            "text",
            RichSelection::try_new(
                &original,
                RichSelectionKind::TextRange { anchor: point.clone(), focus: point },
            )
            .map_err(contract)?,
        ),
    ];
    let initial = codec.encode(original.document()).map_err(contract)?;
    let mut cases = Vec::new();
    for (name, action) in actions {
        let edit = action
            .apply(&context, &original)
            .map_err(contract)?
            .ok_or(Error::Contract("axis scenario edit"))?;
        let mappings=selections.iter().map(|(name,selection)| {
            let mapping=edit.map_selection(selection).map_err(contract)?;
            let outcome=match mapping.outcome() {RichSelectionMappingOutcome::Preserved=>"preserved",RichSelectionMappingOutcome::Relocated=>"relocated",RichSelectionMappingOutcome::Cleared(_)=>"cleared"};
            let reason=match mapping.outcome() {RichSelectionMappingOutcome::Cleared(RichSelectionLoss::TargetDeleted)=>Some("target_deleted"),RichSelectionMappingOutcome::Cleared(RichSelectionLoss::HiddenTable)=>Some("hidden_table"),RichSelectionMappingOutcome::Cleared(RichSelectionLoss::NoTextTarget)=>Some("no_text_target"),_=>None};
            Ok(json!({"name":name,"outcome":outcome,"reason":reason,"selection":mapping.selection().map(|selection|selection_json(edit.document(),selection)).transpose()?}))
        }).collect::<Result<Vec<_>,Error>>()?;
        let undo = edit
            .inverse()
            .apply(&context, edit.document())
            .map_err(contract)?
            .ok_or(Error::Contract("axis scenario inverse"))?;
        for (_, selection) in &selections {
            selection.resolve(undo.document()).map_err(contract)?;
        }
        let redo = undo
            .inverse()
            .apply(&context, undo.document())
            .map_err(contract)?
            .ok_or(Error::Contract("axis scenario redo"))?;
        cases.push(json!({"name":name,"changed":codec.encode(edit.document().document()).map_err(contract)?,"undone":codec.encode(undo.document().document()).map_err(contract)?,"redone":codec.encode(redo.document().document()).map_err(contract)?,"mapping":mappings}));
    }
    Ok(json!({"initial":initial,"cases":cases}).to_string())
}
