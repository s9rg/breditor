//! Explicit candidate V4 table captions: grammar, actions, history, table interactions,
//! navigation, search and clipboard.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichClipboardJsonCodec, RichSessionJsonCodec},
    document::TextFragment,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CausalStamp, CellId, ChangeId, ColumnId, FlowMove, MergeId, ReplicaId,
        RichBlockDraft, RichClipboardError, RichClipboardFragment, RichClipboardIdAllocator,
        RichClipboardIdentityKind, RichCoverageDomain, RichDocument, RichFlowParent,
        RichFlowPosition, RichLocalOutcome, RichLocalSession, RichLocalSessionError,
        RichSearchMode, RichSearchQuery, RichSearchReplacement, RichSearchReplacementMode,
        RichSelection, RichSelectionCoverage, RichSelectionKind, RichSelectionUpdate,
        RichTableCaptionError, RichTextPoint, RowId, TableCellDraft, TableColumnDraft, TableId,
        TableRowDraft,
        actions::{
            ClearTableCells, DeleteTableColumn, DeleteTableRow, InsertBlocks, InsertTableColumn,
            InsertTableRow, JoinTextBlocks, MergeTableCells, MoveBlock, MoveTableColumn,
            MoveTableRow, ResizeColumn, RichAction, RichActionError, SetHeading, SetTableCaption,
            SetTableHeader, SplitTableCell, SplitTextBlock,
        },
        find_rich_text, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

/// Candidate V4 fingerprint for schema `example/layout@1` with the standard inline preset,
/// pinned after the table-caption slice (a trailing caption paragraph below tables).
const V4_FINGERPRINT: &str =
    "sha256:6daf61c3c5a216bb4d831c8bd6b9b776044b0a4598a346270ecf6579373959c0";

fn schema(revision: u32) -> Result<CompiledSchema> {
    let id = SchemaId::new(QualifiedName::try_new("example/layout")?, SchemaVersion::try_new(1)?);
    let extensions =
        ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?;
    Ok(match revision {
        1 => CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
        2 => CompiledSchema::try_compile_rich_content_profile_v2(id, &extensions)?,
        3 => CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?,
        4 => CompiledSchema::try_compile_rich_content_profile_v4(id, &extensions)?,
        _ => return Err("revision".into()),
    })
}
fn context(revision: u32) -> Result<EditorContext> {
    Ok(EditorContext::new(schema(revision)?, breditor_core::schema::DocumentLimits::default()))
}
fn admit(c: &EditorContext, root: &Value) -> Result<RichDocument> {
    let mut input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/layout","version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":null});
    input["root"] = root.clone();
    Ok(RichDocument::try_admit(
        c.schema(),
        DocumentJsonCodecV2::new(c.schema().clone()).decode(&input.to_string())?,
        c.limits(),
    )?)
}
fn encode(c: &EditorContext, d: &RichDocument) -> Result<Value> {
    Ok(serde_json::from_str::<Value>(
        &DocumentJsonCodecV2::new(c.schema().clone()).encode(d.document())?,
    )?["root"]
        .clone())
}
fn document(children: Vec<Value>) -> Value {
    let mut root = fixture::element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn cell(row: &str, column: &str) -> Value {
    let mut node = fixture::element(
        "table-cell",
        &format!("cell-{row}-{column}"),
        vec![fixture::paragraph(&format!("p-{row}-{column}"), &format!("{row}{column}"))],
    );
    node["properties"]["breditor/column-id"] = json!(column);
    node["properties"]["breditor/header"] = json!(false);
    node
}
fn row(id: &str) -> Value {
    let mut node =
        fixture::element("table-row", &format!("row-{id}"), vec![cell(id, "c1"), cell(id, "c2")]);
    node["properties"]["breditor/row-id"] = json!(id);
    node
}
/// Table `t` (block `table`): rows r1, r2 × columns c1, c2, then `children_tail`.
fn table(tail: Vec<Value>) -> Value {
    let mut children = vec![row("r1"), row("r2")];
    children.extend(tail);
    let mut node = fixture::element("table", "table", children);
    node["properties"] = json!({"breditor/block-id":"table","breditor/table-id":"t","breditor/columns":[{"id":"c1","width":160},{"id":"c2","width":160}],"breditor/merges":[],"breditor/retracted-merges":[]});
    node
}
fn caption(text: &str) -> Value {
    fixture::paragraph("cap", text)
}
/// `p` "Before", table with caption `cap` "Caption text", `q` "After".
fn root() -> Value {
    document(vec![
        fixture::paragraph("p", "Before"),
        table(vec![caption("Caption text")]),
        fixture::paragraph("q", "After"),
    ])
}
fn plain() -> Value {
    document(vec![
        fixture::paragraph("p", "Before"),
        table(vec![]),
        fixture::paragraph("q", "After"),
    ])
}
fn id(value: &str) -> Result<BlockId> {
    Ok(BlockId::try_new(value)?)
}
fn tid() -> Result<TableId> {
    Ok(TableId::try_new("t")?)
}
fn point(block: &str, offset: u64) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(id(block)?, TextOffset::try_new(offset)?, Affinity::After))
}
fn caret(block: &str, offset: u64) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::TextRange { anchor: point(block, offset)?, focus: point(block, offset)? })
}
fn range(a: &str, x: u64, b: &str, y: u64) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::TextRange { anchor: point(a, x)?, focus: point(b, y)? })
}
fn grid(a: (&str, &str), b: (&str, &str)) -> Result<RichSelectionKind> {
    let c = |(r, k): (&str, &str)| -> Result<CellId> {
        Ok(CellId::new(tid()?, RowId::try_new(r)?, ColumnId::try_new(k)?))
    };
    Ok(RichSelectionKind::Grid { anchor: c(a)?, focus: c(b)? })
}
fn owner(c: &EditorContext, raw: &Value, selection: RichSelectionKind) -> Result<RichLocalSession> {
    Ok(RichLocalSession::try_new(
        c.clone(),
        admit(c, raw)?,
        Some(selection),
        HistoryCapacity::default(),
    )?)
}
fn run(a: &mut RichLocalSession, action: RichAction) -> Result<RichLocalOutcome> {
    Ok(a.dispatch(&a.snapshot(), &[action], RichSelectionUpdate::Map)?)
}
fn selection_of(a: &RichLocalSession) -> Option<RichSelectionKind> {
    a.state().selection().map(|s| s.kind().clone())
}
fn table_of(c: &EditorContext, a: &RichLocalSession) -> Result<Value> {
    Ok(encode(c, a.state().document())?["children"][1].clone())
}
fn last_child(node: &Value) -> Value {
    node["children"].as_array().and_then(|c| c.last()).cloned().unwrap_or(Value::Null)
}

#[test]
fn v4_fingerprint_is_locked_and_v1_to_v3_stay_exact_without_captions() -> Result {
    let [a, b, c, d] = [schema(1)?, schema(2)?, schema(3)?, schema(4)?];
    for (old, expected) in [
        (&a, "sha256:26dcb0992f0814e1d18491134f70c5857efc01b0c28d07015199490389090278"),
        (&b, "sha256:2082e440c52cdef30f9fa46289cae3e378ea7673f05d20e6b71bb5797347b056"),
        (&c, "sha256:6667773591bde52ef650c498d908ccbe7e8d9303683be0ab7c55400db6dd52b4"),
    ] {
        assert_eq!(old.fingerprint().to_string(), expected);
        assert!(!old.supports_rich_table_captions());
    }
    assert_eq!(d.fingerprint().to_string(), V4_FINGERPRINT);
    assert!(d.supports_rich_table_captions() && d.supports_rich_details());
    Ok(())
}

#[test]
fn grammar_admits_one_trailing_caption_only_in_v4() -> Result {
    let c = context(4)?;
    let d = admit(&c, &root())?;
    assert_eq!(d.table_caption(&tid()?), Some(id("cap")?));
    assert_eq!(d.caption_table(&id("cap")?), Some(tid()?));
    assert_eq!(d.caption_table(&id("p")?), None);
    assert_eq!(d.caption_table(&id("p-r1-c1")?), None);
    // Rows keep their indices: the table view still has exactly two rows.
    assert_eq!(d.table(&tid()?)?.ok_or("view")?.rows().len(), 2);
    // Captions are ordinary paragraphs: formats, text language, mentions and layout.
    let mut formatted = caption("");
    formatted["children"] = json!([
        {"kind":"text","text":"Bold","formats":[{"type":"breditor/strong","properties":{}}]},
        {"kind":"text","text":" fr","formats":[{"type":"breditor/text-language","properties":{"breditor/language-tag":"fr"}}]}
    ]);
    formatted["properties"]["breditor/block-align"] = json!(2);
    admit(&c, &document(vec![table(vec![formatted])]))?;
    // An empty caption, and a caption on a hidden (rowless) table, are admitted.
    admit(&c, &document(vec![table(vec![caption("")])]))?;
    let mut hidden = table(vec![caption("Kept")]);
    hidden["children"] = json!([caption("Kept")]);
    admit(&c, &document(vec![hidden]))?;
    let heading = {
        let mut node = caption("H");
        node["type"] = json!("breditor/heading");
        node["properties"]["breditor/level"] = json!(2);
        node
    };
    let mut first = table(vec![]);
    first["children"] = json!([caption("First"), row("r1"), row("r2")]);
    let mut middle = table(vec![]);
    middle["children"] = json!([row("r1"), caption("Mid"), row("r2")]);
    for (label, raw) in [
        ("caption first", document(vec![first])),
        ("caption between rows", document(vec![middle])),
        (
            "two captions",
            document(vec![table(vec![caption("a"), fixture::paragraph("cap2", "b")])]),
        ),
        ("heading caption", document(vec![table(vec![heading])])),
        (
            "list caption",
            document(vec![table(vec![fixture::element("bullet-list", "ul", vec![])])]),
        ),
        (
            "duplicate identity",
            document(vec![fixture::paragraph("cap", "x"), table(vec![caption("y")])]),
        ),
    ] {
        assert!(admit(&c, &raw).is_err(), "{label} must be rejected");
    }
    // Every older language rejects a captioned table but keeps admitting the plain table.
    for revision in 1..=3 {
        let old = context(revision)?;
        assert!(admit(&old, &root()).is_err(), "V{revision}");
        admit(&old, &plain())?;
    }
    Ok(())
}

#[test]
fn add_and_remove_are_exact_history_groups_with_checkpoint_restore() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &plain(), caret("p-r2-c2", 1)?)?;
    let original = encode(&c, a.state().document())?;
    // Add: one group, empty caption last, caret in it.
    assert_eq!(
        a.add_table_caption(&a.snapshot(), &tid()?, &id("cap")?)?,
        RichLocalOutcome::ContentCommitted
    );
    assert_eq!(a.undo_depth(), 1);
    assert_eq!(selection_of(&a), Some(caret("cap", 0)?));
    let added = encode(&c, a.state().document())?;
    assert_eq!(last_child(&added["children"][1]), caption(""));
    // Typing, formatting and a hard break inside the caption are ordinary text edits.
    a.insert_plain_text(&a.snapshot(), "Cap")?;
    a.insert_hard_break(&a.snapshot())?;
    a.insert_plain_text(&a.snapshot(), "two")?;
    let typed = encode(&c, a.state().document())?;
    assert_eq!(last_child(&typed["children"][1]), caption("Cap\ntwo"));
    let typed_depth = a.undo_depth();
    a.set_selection(&a.snapshot(), Some(range("cap", 0, "cap", 3)?))?;
    a.change_selection_formats(
        &a.snapshot(),
        &[breditor_core::rich_content::RichSelectionFormatChange::Set(
            breditor_core::document::Format::new(
                QualifiedName::try_new("breditor/strong")?,
                breditor_core::document::PropertyMap::default(),
            ),
        )],
    )?;
    assert_eq!(a.undo_depth(), typed_depth + 1);
    let formatted = encode(&c, a.state().document())?;
    assert_eq!(
        last_child(&formatted["children"][1])["children"][0]["formats"][0]["type"],
        "breditor/strong"
    );
    // Adding again is refused; nothing is published.
    let error = a.add_table_caption(&a.snapshot(), &tid()?, &id("cap2")?).err().ok_or("exists")?;
    assert!(matches!(
        error,
        RichLocalSessionError::Action(RichActionError::TableCaption(RichTableCaptionError::Exists))
    ));
    // Remove: the caret in the caption becomes a node selection of the table.
    a.set_selection(&a.snapshot(), Some(caret("cap", 2)?))?;
    let depth = a.undo_depth();
    assert_eq!(a.remove_table_caption(&a.snapshot(), &tid()?)?, RichLocalOutcome::ContentCommitted);
    assert_eq!(a.undo_depth(), depth + 1);
    assert_eq!(selection_of(&a), Some(RichSelectionKind::Node(id("table")?)));
    let removed = encode(&c, a.state().document())?;
    assert_eq!(removed, original);
    // Removing an absent caption is an admitted no-op.
    assert_eq!(a.remove_table_caption(&a.snapshot(), &tid()?)?, RichLocalOutcome::Unchanged);
    assert_eq!(a.undo_depth(), depth + 1);
    // A checkpoint restores the document and exact history.
    let codec = RichSessionJsonCodec::new(c.clone());
    let mut b = codec.decode(&codec.encode(&a)?)?;
    assert_eq!(encode(&c, b.state().document())?, removed);
    b.undo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, formatted);
    while b.undo_depth() > 0 {
        b.undo(&b.snapshot())?;
    }
    assert_eq!(encode(&c, b.state().document())?, original);
    b.redo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, added);
    // Removing keeps an outside selection unchanged.
    let mut o = owner(&c, &root(), caret("p", 2)?)?;
    o.remove_table_caption(&o.snapshot(), &tid()?)?;
    assert_eq!(selection_of(&o), Some(caret("p", 2)?));
    o.undo(&o.snapshot())?;
    assert_eq!(encode(&c, o.state().document())?, encode(&c, &admit(&c, &root())?)?);
    Ok(())
}

#[test]
fn caption_actions_refuse_read_only_stale_missing_and_old_profiles() -> Result {
    let c = context(4)?;
    let mut r = owner(&c, &plain(), caret("p", 0)?)?;
    let stale = r.snapshot();
    r.set_selection(&r.snapshot(), Some(caret("p", 1)?))?;
    assert!(r.add_table_caption(&stale, &tid()?, &id("cap")?).is_err());
    assert!(r.remove_table_caption(&stale, &tid()?).is_err());
    assert!(matches!(
        r.add_table_caption(&r.snapshot(), &TableId::try_new("nope")?, &id("cap")?),
        Err(RichLocalSessionError::Action(RichActionError::TableCaption(
            RichTableCaptionError::Target
        )))
    ));
    // A reused identity fails admission atomically.
    assert!(r.add_table_caption(&r.snapshot(), &tid()?, &id("p")?).is_err());
    r.set_read_only(&r.snapshot(), true)?;
    assert!(r.add_table_caption(&r.snapshot(), &tid()?, &id("cap")?).is_err());
    assert!(r.remove_table_caption(&r.snapshot(), &tid()?).is_err());
    assert_eq!(r.undo_depth(), 0);
    for revision in 1..=3 {
        let old = context(revision)?;
        let mut a = owner(&old, &plain(), caret("p", 0)?)?;
        assert!(matches!(
            a.add_table_caption(&a.snapshot(), &tid()?, &id("cap")?),
            Err(RichLocalSessionError::Action(RichActionError::TableCaption(
                RichTableCaptionError::Profile
            )))
        ));
        assert!(a.remove_table_caption(&a.snapshot(), &tid()?).is_err());
        // The raw action is refused by the old grammar at admission.
        let draft = RichBlockDraft::paragraph(&id("cap")?, &TextFragment::empty())?;
        let action = SetTableCaption::capture(a.state().document(), &tid()?, Some(draft))?;
        assert!(
            a.dispatch(
                &a.snapshot(),
                &[RichAction::SetTableCaption(action)],
                RichSelectionUpdate::Map
            )
            .is_err()
        );
        assert_eq!(a.undo_depth(), 0);
    }
    // A non-paragraph caption draft is refused at capture.
    let d = admit(&c, &plain())?;
    let heading = RichBlockDraft::heading(&id("h")?, 2, &TextFragment::empty())?;
    assert!(SetTableCaption::capture(&d, &tid()?, Some(heading)).is_err());
    Ok(())
}

#[test]
fn caption_text_is_never_split_joined_converted_or_moved() -> Result {
    let c = context(4)?;
    let d = admit(&c, &root())?;
    let mut a = owner(&c, &root(), caret("cap", 3)?)?;
    let split = SplitTextBlock::capture(&d, &point("cap", 3)?, &id("right")?, None);
    assert!(split.is_err(), "split must be refused");
    assert!(JoinTextBlocks::capture(&d, &id("p-r2-c2")?, &id("cap")?).is_err());
    assert!(JoinTextBlocks::capture(&d, &id("cap")?, &id("q")?).is_err());
    // A heading conversion is refused by the caption's paragraph-only grammar.
    let heading = SetHeading::capture(&d, &id("cap")?, Some(2))?;
    assert!(run(&mut a, RichAction::SetHeading(heading)).is_err());
    assert!(matches!(
        MoveBlock::capture(&d, &id("cap")?, None, None),
        Err(RichActionError::MoveSource)
    ));
    // A general Enter in a caption is refused (the host inserts a line break instead).
    assert!(a.insert_general_paragraph(&a.snapshot(), &caret("cap", 3)?, "enter").is_err());
    assert_eq!(a.undo_depth(), 0);
    // A block Markdown shortcut typed at the caption start stays literal text.
    let mut m = owner(&c, &document(vec![table(vec![caption("")])]), caret("cap", 0)?)?;
    m.insert_plain_text_with_markdown_rules(&m.snapshot(), "#", "rule")?;
    m.insert_plain_text_with_markdown_rules(&m.snapshot(), " ", "rule")?;
    assert_eq!(last_child(&encode(&c, m.state().document())?["children"][0]), caption("# "));
    // Moving the table moves its caption with it.
    let mut m = owner(&c, &root(), caret("p", 0)?)?;
    let action = MoveBlock::capture(m.state().document(), &id("table")?, None, None)?;
    run(&mut m, RichAction::MoveBlock(action))?;
    let after = encode(&c, m.state().document())?;
    assert_eq!(after["children"][2]["type"], "breditor/table");
    assert_eq!(last_child(&after["children"][2]), caption("Caption text"));
    Ok(())
}

fn empty_cell(row: &str, column: &str) -> Result<TableCellDraft> {
    Ok(TableCellDraft::try_new(
        &id(&format!("new-cell-{row}-{column}"))?,
        ColumnId::try_new(column)?,
        false,
        vec![RichBlockDraft::paragraph(
            &id(&format!("new-p-{row}-{column}"))?,
            &TextFragment::empty(),
        )?],
    )?)
}

fn stamp() -> Result<CausalStamp> {
    Ok(CausalStamp::new(1, ChangeId::new(ReplicaId::try_new(1)?, 1)))
}

type Builder = Box<dyn Fn(&RichDocument) -> Result<RichAction>>;

/// Every row, column and cell action, captured against a fresh captioned table.
#[allow(clippy::too_many_lines)]
fn table_actions() -> Vec<(&'static str, Builder)> {
    vec![
        (
            "insert row at end",
            Box::new(|d| {
                let draft = TableRowDraft::try_new(
                    &id("row-r3")?,
                    RowId::try_new("r3")?,
                    vec![empty_cell("r3", "c1")?, empty_cell("r3", "c2")?],
                )?;
                Ok(RichAction::InsertTableRow(InsertTableRow::capture(d, &tid()?, None, draft)?))
            }),
        ),
        (
            "insert row before",
            Box::new(|d| {
                let draft = TableRowDraft::try_new(
                    &id("row-r3")?,
                    RowId::try_new("r3")?,
                    vec![empty_cell("r3", "c1")?, empty_cell("r3", "c2")?],
                )?;
                Ok(RichAction::InsertTableRow(InsertTableRow::capture(
                    d,
                    &tid()?,
                    Some(&RowId::try_new("r1")?),
                    draft,
                )?))
            }),
        ),
        (
            "delete row",
            Box::new(|d| {
                Ok(RichAction::DeleteTableRow(DeleteTableRow::capture(
                    d,
                    &tid()?,
                    &RowId::try_new("r2")?,
                )?))
            }),
        ),
        (
            "move row to end",
            Box::new(|d| {
                Ok(RichAction::MoveTableRow(MoveTableRow::capture(
                    d,
                    &tid()?,
                    &RowId::try_new("r1")?,
                    None,
                )?))
            }),
        ),
        (
            "insert column",
            Box::new(|d| {
                let column = TableColumnDraft::try_new(ColumnId::try_new("c3")?, 120)?;
                let cells = vec![
                    (RowId::try_new("r1")?, empty_cell("r1", "c3")?),
                    (RowId::try_new("r2")?, empty_cell("r2", "c3")?),
                ];
                Ok(RichAction::InsertTableColumn(InsertTableColumn::capture(
                    d,
                    &tid()?,
                    None,
                    &column,
                    cells,
                )?))
            }),
        ),
        (
            "delete column",
            Box::new(|d| {
                Ok(RichAction::DeleteTableColumn(DeleteTableColumn::capture(
                    d,
                    &tid()?,
                    &ColumnId::try_new("c1")?,
                )?))
            }),
        ),
        (
            "move column",
            Box::new(|d| {
                Ok(RichAction::MoveTableColumn(MoveTableColumn::capture(
                    d,
                    &tid()?,
                    &ColumnId::try_new("c1")?,
                    None,
                )?))
            }),
        ),
        (
            "resize column",
            Box::new(|d| {
                Ok(RichAction::ResizeColumn(ResizeColumn::capture(
                    d,
                    &tid()?,
                    &ColumnId::try_new("c2")?,
                    300,
                )?))
            }),
        ),
        (
            "merge",
            Box::new(|d| {
                let selection = RichSelection::try_new(d, grid(("r1", "c1"), ("r2", "c2"))?)?;
                Ok(RichAction::MergeTableCells(MergeTableCells::capture(
                    d,
                    &selection,
                    MergeId::try_new("m1")?,
                    stamp()?,
                )?))
            }),
        ),
        (
            "header",
            Box::new(|d| {
                let selection = RichSelection::try_new(d, grid(("r1", "c1"), ("r1", "c2"))?)?;
                Ok(RichAction::SetTableHeader(SetTableHeader::capture(d, &selection, true)?))
            }),
        ),
        (
            "clear",
            Box::new(|d| {
                let selection = RichSelection::try_new(d, grid(("r1", "c1"), ("r2", "c1"))?)?;
                Ok(RichAction::ClearTableCells(ClearTableCells::capture(
                    d,
                    &selection,
                    &[id("e1")?, id("e2")?],
                )?))
            }),
        ),
    ]
}

#[test]
fn table_actions_keep_the_caption_last_and_undo_exactly() -> Result {
    let c = context(4)?;
    for (label, make) in table_actions() {
        let mut a = owner(&c, &root(), caret("cap", 4)?)?;
        let before = encode(&c, a.state().document())?;
        let action = make(a.state().document())?;
        assert_eq!(run(&mut a, action)?, RichLocalOutcome::ContentCommitted, "{label}");
        let after = table_of(&c, &a)?;
        assert_eq!(last_child(&after), caption("Caption text"), "{label}");
        // The caption caret is untouched by every grid edit.
        assert_eq!(selection_of(&a), Some(caret("cap", 4)?), "{label}");
        a.undo(&a.snapshot())?;
        assert_eq!(encode(&c, a.state().document())?, before, "{label}");
        a.redo(&a.snapshot())?;
        assert_eq!(table_of(&c, &a)?, after, "{label}");
    }
    Ok(())
}

#[test]
fn split_and_deleting_every_row_keep_the_caption() -> Result {
    let c = context(4)?;
    // Split after merge keeps the caption, and deleting every row keeps a hidden table
    // that retains its caption.
    let mut a = owner(&c, &root(), caret("p", 0)?)?;
    let selection =
        RichSelection::try_new(a.state().document(), grid(("r1", "c1"), ("r1", "c2"))?)?;
    let merge = MergeTableCells::capture(
        a.state().document(),
        &selection,
        MergeId::try_new("m1")?,
        stamp()?,
    )?;
    run(&mut a, RichAction::MergeTableCells(merge))?;
    let cell = CellId::new(tid()?, RowId::try_new("r1")?, ColumnId::try_new("c1")?);
    let split = SplitTableCell::capture(a.state().document(), &cell)?;
    run(&mut a, RichAction::SplitTableCell(split))?;
    assert_eq!(last_child(&table_of(&c, &a)?), caption("Caption text"));
    for r in ["r1", "r2"] {
        let delete = DeleteTableRow::capture(a.state().document(), &tid()?, &RowId::try_new(r)?)?;
        run(&mut a, RichAction::DeleteTableRow(delete))?;
    }
    let hidden = table_of(&c, &a)?;
    assert_eq!(hidden["children"], json!([caption("Caption text")]));
    assert!(a.state().document().table(&tid()?)?.ok_or("view")?.geometry().is_hidden());
    // Removing a hidden table's caption from a caret inside it clears the selection
    // (a hidden table cannot be node-selected); Undo restores both.
    a.set_selection(&a.snapshot(), Some(caret("cap", 2)?))?;
    a.remove_table_caption(&a.snapshot(), &tid()?)?;
    assert_eq!(selection_of(&a), None);
    assert_eq!(table_of(&c, &a)?["children"], json!([]));
    a.undo(&a.snapshot())?;
    assert_eq!(table_of(&c, &a)?["children"], json!([caption("Caption text")]));
    Ok(())
}

#[test]
fn grid_selections_and_coverage_never_include_the_caption() -> Result {
    let c = context(4)?;
    let d = admit(&c, &root())?;
    let all = RichSelection::try_new(&d, grid(("r1", "c1"), ("r2", "c2"))?)?;
    let coverage = RichSelectionCoverage::capture(&d, &all)?;
    let caption_id = id("cap")?;
    assert!(coverage.text().iter().all(|span| span.block() != &caption_id));
    assert_eq!(coverage.text().len(), 4);
    // Grid copy never carries the caption.
    let fragment = RichClipboardFragment::copy_selection(&c, &d, &all)?.ok_or("fragment")?;
    let json = RichClipboardJsonCodec::new(c.clone()).encode(&fragment)?;
    assert!(!json.contains("Caption text"), "{json}");
    // A caption text range has its own table-caption domain.
    let text = RichSelection::try_new(&d, range("cap", 0, "cap", 7)?)?;
    let coverage = RichSelectionCoverage::capture(&d, &text)?;
    assert_eq!(coverage.text()[0].domain(), &RichCoverageDomain::TableCaption(tid()?));
    // The whole document covers the caption after every cell, in its own domain.
    let whole = RichSelectionCoverage::document(&d)?;
    let blocks: Vec<_> = whole.text().iter().map(|s| s.block().as_str().to_owned()).collect();
    assert_eq!(blocks, ["p", "p-r1-c1", "p-r1-c2", "p-r2-c1", "p-r2-c2", "cap", "q"]);
    Ok(())
}

#[test]
fn flow_navigation_leaves_the_caption_through_its_table() -> Result {
    let c = context(4)?;
    let moved = |raw: &Value, from: RichSelectionKind, movement| -> Result<_> {
        let mut session = owner(&c, raw, from)?;
        session.navigate_flow(&session.snapshot(), movement)?;
        Ok(selection_of(&session))
    };
    let node = Some(RichSelectionKind::Node(id("table")?));
    let after = |selection: Option<RichSelectionKind>| -> Result<bool> {
        Ok(
            matches!(selection, Some(RichSelectionKind::TextRange { ref focus, .. }) if focus.block() == &id("q")?),
        )
    };
    // Backward from the caption start selects the table (its outer stop).
    assert_eq!(moved(&root(), caret("cap", 0)?, FlowMove::Before)?, node);
    // Forward from the caption end continues after the table.
    assert!(after(moved(&root(), caret("cap", 12)?, FlowMove::After)?)?);
    // The table stays one outer stop: its caption is not a flow stop.
    assert!(after(moved(&root(), RichSelectionKind::Node(id("table")?), FlowMove::After)?)?);
    assert_eq!(moved(&root(), caret("q", 0)?, FlowMove::Before)?, node);
    // A last table with a caption: forward from the caption end is a boundary.
    let tail = document(vec![fixture::paragraph("p", "Before"), table(vec![caption("End")])]);
    assert_eq!(moved(&tail, caret("cap", 3)?, FlowMove::After)?, Some(caret("cap", 3)?));
    Ok(())
}

#[test]
fn search_and_replace_cover_the_caption_after_the_cells() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root(), caret("p", 0)?)?;
    let query = RichSearchQuery::try_new("t", RichSearchMode::Literal, true, false)?;
    let results = find_rich_text(a.state().document(), &query)?;
    let blocks: Vec<_> = results.matches().iter().map(|m| m.block().as_str().to_owned()).collect();
    assert_eq!(blocks, ["cap", "cap", "cap", "q"]);
    let caption_query = RichSearchQuery::try_new("Caption", RichSearchMode::Literal, true, false)?;
    let found = find_rich_text(a.state().document(), &caption_query)?;
    a.replace_search_all(
        &a.snapshot(),
        &found,
        &RichSearchReplacement::try_new("Legend", RichSearchReplacementMode::Literal)?,
    )?;
    assert_eq!(last_child(&table_of(&c, &a)?), caption("Legend text"));
    assert_eq!(a.undo_depth(), 1);
    Ok(())
}

#[derive(Default)]
struct Ids(u64);
impl RichClipboardIdAllocator for Ids {
    fn next(
        &mut self,
        kind: RichClipboardIdentityKind,
    ) -> std::result::Result<String, RichClipboardError> {
        self.0 += 1;
        Ok(format!("paste-{kind:?}-{}", self.0))
    }
    fn merge_stamp(&mut self) -> std::result::Result<CausalStamp, RichClipboardError> {
        Ok(CausalStamp::new(
            1,
            ChangeId::new(ReplicaId::try_new(7).map_err(|_| RichClipboardError::Allocation)?, 1),
        ))
    }
}

fn paste(c: &EditorContext, raw: &Value, json: &str) -> Result<Value> {
    let decoded = RichClipboardJsonCodec::new(c.clone()).decode(json)?;
    let drafts = decoded.flow_drafts(c, &mut Ids::default())?;
    let mut a = owner(c, raw, caret("p", 0)?)?;
    let action = InsertBlocks::capture(
        a.state().document(),
        &RichFlowPosition::new(RichFlowParent::Document, None),
        drafts,
    )?;
    run(&mut a, RichAction::InsertBlocks(action))?;
    encode(c, a.state().document())
}

#[test]
fn clipboard_keeps_whole_and_covered_captions_and_v3_refuses_them() -> Result {
    let c = context(4)?;
    let raw = root();
    let d = admit(&c, &raw)?;
    let codec = RichClipboardJsonCodec::new(c.clone());
    // A whole table (node selection) keeps its caption, rekeyed.
    let node = RichSelection::try_new(&d, RichSelectionKind::Node(id("table")?))?;
    let fragment = RichClipboardFragment::copy_selection(&c, &d, &node)?.ok_or("fragment")?;
    assert_eq!(fragment.plain_text()?, "r1c1\tr1c2\nr2c1\tr2c2\nCaption text");
    let json = codec.encode(&fragment)?;
    let pasted = paste(&c, &raw, &json)?;
    let copy = pasted["children"].as_array().ok_or("children")?.last().ok_or("last")?.clone();
    assert_eq!(copy["type"], "breditor/table");
    let copied_caption = last_child(&copy);
    assert_eq!(copied_caption["children"][0]["text"], "Caption text");
    assert_ne!(copied_caption["properties"]["breditor/block-id"], json!("cap"));
    // Old owners refuse the record outright.
    for revision in 1..=3 {
        assert!(
            RichClipboardJsonCodec::new(context(revision)?).decode(&json).is_err(),
            "V{revision}"
        );
    }
    // The whole document keeps the caption.
    let all = RichSelection::try_new(&d, RichSelectionKind::Document)?;
    let fragment = RichClipboardFragment::copy_selection(&c, &d, &all)?.ok_or("document")?;
    assert!(codec.encode(&fragment)?.contains("Caption text"));
    // A general range from before the table into the caption keeps the covered caption slice.
    let partial = RichSelection::try_new(&d, range("p", 3, "cap", 7)?)?;
    let fragment =
        RichClipboardFragment::copy_general_selection(&c, &d, &partial)?.ok_or("partial")?;
    let json = codec.encode(&fragment)?;
    let value: Value = serde_json::from_str(&json)?;
    let copied = serde_json::to_string(&value)?;
    assert!(copied.contains("\"Caption\""), "{copied}");
    let pasted = paste(&c, &raw, &json)?;
    let copy = pasted["children"].as_array().ok_or("children")?.last().ok_or("last")?.clone();
    assert_eq!(last_child(&copy)["children"][0]["text"], "Caption");
    // A general range ending before the caption copies no caption.
    let cells = RichSelection::try_new(&d, range("p", 3, "p-r2-c2", 2)?)?;
    let fragment = RichClipboardFragment::copy_general_selection(&c, &d, &cells)?.ok_or("cells")?;
    assert!(!codec.encode(&fragment)?.contains("Caption"));
    // A text copy inside the caption is ordinary text.
    let inside = RichSelection::try_new(&d, range("cap", 0, "cap", 7)?)?;
    let fragment = RichClipboardFragment::copy_selection(&c, &d, &inside)?.ok_or("inside")?;
    assert_eq!(fragment.plain_text()?, "Caption");
    // A forged grid record with a caption is not a grid.
    let grid_json = {
        let all = RichSelection::try_new(&d, grid(("r1", "c1"), ("r2", "c2"))?)?;
        let fragment = RichClipboardFragment::copy_selection(&c, &d, &all)?.ok_or("grid")?;
        codec.encode(&fragment)?
    };
    let mut forged: Value = serde_json::from_str(&grid_json)?;
    let table = forged
        .pointer_mut("/document/root/children/0/children")
        .and_then(Value::as_array_mut)
        .ok_or("forged table")?;
    table.push(fixture::paragraph("forged-cap", "x"));
    assert!(codec.decode(&forged.to_string()).is_err());
    Ok(())
}

#[test]
fn general_ranges_into_the_caption_keep_it_a_caption() -> Result {
    let c = context(4)?;
    // Deleting from before the table into the caption keeps both boundary blocks distinct.
    let mut a = owner(&c, &root(), caret("p", 0)?)?;
    // Every wholly covered cell keeps one fresh empty floor paragraph, as before captions.
    let floors = ["f1", "f2", "f3", "f4"].map(id).into_iter().collect::<Result<Vec<_>>>()?;
    assert!(
        a.replace_general_range_plain_text(&a.snapshot(), &range("p", 3, "cap", 8)?, "", &[])
            .is_err()
    );
    a.replace_general_range_plain_text(&a.snapshot(), &range("p", 3, "cap", 8)?, "", &floors)?;
    let after = encode(&c, a.state().document())?;
    assert_eq!(after["children"][0], fixture::paragraph("p", "Bef"));
    assert_eq!(after["children"][1]["type"], "breditor/table");
    assert_eq!(
        after["children"][1]["children"][0]["children"][0]["children"][0],
        fixture::paragraph("f1", "")
    );
    assert_eq!(last_child(&after["children"][1]), caption("text"));
    assert_eq!(a.undo_depth(), 1);
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, encode(&c, &admit(&c, &root())?)?);
    // Deleting from the caption into the next paragraph never merges them.
    let mut b = owner(&c, &root(), caret("p", 0)?)?;
    b.replace_general_range_plain_text(&b.snapshot(), &range("cap", 7, "q", 2)?, "", &[])?;
    let after = encode(&c, b.state().document())?;
    assert_eq!(last_child(&after["children"][1]), caption("Caption"));
    assert_eq!(after["children"][2], fixture::paragraph("q", "ter"));
    // A range covering the whole table (and its caption) removes it.
    let mut w = owner(&c, &root(), caret("p", 0)?)?;
    w.replace_general_range_plain_text(&w.snapshot(), &range("p", 6, "q", 0)?, "", &[])?;
    let whole = encode(&c, w.state().document())?;
    assert_eq!(whole["children"], json!([fixture::paragraph("p", "BeforeAfter")]));
    Ok(())
}
