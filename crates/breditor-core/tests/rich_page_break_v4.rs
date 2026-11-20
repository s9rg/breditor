//! Explicit candidate V4 page breaks: root-only grammar, insert/delete history, node
//! selection, navigation, block moves, search and clipboard.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
#[path = "support/rich_v4_frozen.rs"]
mod frozen;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichClipboardJsonCodec, RichSessionJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CausalStamp, ChangeId, FlowMove, RICH_PAGE_BREAK_KIND, ReplicaId, RichBlockDraft,
        RichClipboardError, RichClipboardFragment, RichClipboardIdAllocator,
        RichClipboardIdentityKind, RichDocument, RichFlowParent, RichFlowPosition,
        RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichPageBreakError,
        RichSearchMode, RichSearchQuery, RichSelection, RichSelectionKind, RichSelectionUpdate,
        RichTextPoint,
        actions::{InsertBlocks, MoveBlock, RichAction, RichActionError, WrapBlockquote},
        find_rich_text, selected_flow_atom, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use frozen::{FROZEN, V4_LAYOUT_FINGERPRINT as V4_FINGERPRINT};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

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
fn page_break(id: &str) -> Value {
    fixture::element("page-break", id, vec![])
}
/// `p` "Before", page break `pb`, `q` "After".
fn root() -> Value {
    document(vec![
        fixture::paragraph("p", "Before"),
        page_break("pb"),
        fixture::paragraph("q", "After"),
    ])
}
fn id(value: &str) -> Result<BlockId> {
    Ok(BlockId::try_new(value)?)
}
fn point(block: &str, offset: u64) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(id(block)?, TextOffset::try_new(offset)?, Affinity::After))
}
fn caret(block: &str, offset: u64) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::TextRange { anchor: point(block, offset)?, focus: point(block, offset)? })
}
fn node(block: &str) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::Node(id(block)?))
}
fn owner(c: &EditorContext, raw: &Value, selection: RichSelectionKind) -> Result<RichLocalSession> {
    Ok(RichLocalSession::try_new(
        c.clone(),
        admit(c, raw)?,
        Some(selection),
        HistoryCapacity::default(),
    )?)
}
fn selection_of(a: &RichLocalSession) -> Option<RichSelectionKind> {
    a.state().selection().map(|s| s.kind().clone())
}
fn root_position(before: Option<&str>) -> Result<RichFlowPosition> {
    Ok(RichFlowPosition::new(RichFlowParent::Document, before.map(id).transpose()?))
}
fn types(value: &Value) -> Vec<String> {
    value["children"]
        .as_array()
        .map(|c| c.iter().map(|n| n["type"].as_str().unwrap_or("").to_owned()).collect())
        .unwrap_or_default()
}
fn page_break_error(error: &RichLocalSessionError) -> Option<RichPageBreakError> {
    match error {
        RichLocalSessionError::Action(RichActionError::PageBreak(value)) => Some(*value),
        _ => None,
    }
}

#[test]
fn v4_fingerprint_is_locked_and_v1_to_v3_stay_exact_without_page_breaks() -> Result {
    let [a, b, c, d] = [schema(1)?, schema(2)?, schema(3)?, schema(4)?];
    for (old, expected) in [
        (&a, "sha256:26dcb0992f0814e1d18491134f70c5857efc01b0c28d07015199490389090278"),
        (&b, "sha256:2082e440c52cdef30f9fa46289cae3e378ea7673f05d20e6b71bb5797347b056"),
        (&c, "sha256:6667773591bde52ef650c498d908ccbe7e8d9303683be0ab7c55400db6dd52b4"),
    ] {
        assert_eq!(old.fingerprint().to_string(), expected);
        assert!(!old.supports_rich_page_breaks());
    }
    assert_eq!(d.fingerprint().to_string(), V4_FINGERPRINT, "{FROZEN}");
    assert!(d.supports_rich_page_breaks() && d.supports_rich_table_captions());
    assert_eq!(RICH_PAGE_BREAK_KIND, "breditor/page-break");
    Ok(())
}

#[test]
fn grammar_admits_page_breaks_only_in_the_v4_document_root() -> Result {
    let c = context(4)?;
    let d = admit(&c, &root())?;
    assert!(d.is_page_break(&id("pb")?));
    assert!(!d.is_page_break(&id("p")?));
    // Leading, trailing, consecutive and sole page breaks are admitted at the root.
    admit(&c, &document(vec![page_break("a"), page_break("b")]))?;
    admit(&c, &document(vec![page_break("only")]))?;
    // Every non-root flow container refuses a page break.
    let quote = fixture::element("blockquote", "bq", vec![page_break("x")]);
    let item = fixture::element(
        "bullet-list",
        "list",
        vec![fixture::element(
            "list-item",
            "li",
            vec![fixture::paragraph("h", "H"), page_break("x")],
        )],
    );
    let mut task =
        fixture::element("task-item", "ti", vec![fixture::paragraph("th", "T"), page_break("x")]);
    task["properties"]["breditor/checked"] = json!(false);
    let tasks = fixture::element("task-list", "tl", vec![task]);
    let section = fixture::element(
        "details",
        "d",
        vec![fixture::element("details-summary", "s", vec![]), page_break("x")],
    );
    let mut cell = fixture::element("table-cell", "cell", vec![page_break("x")]);
    cell["properties"]["breditor/column-id"] = json!("c1");
    cell["properties"]["breditor/header"] = json!(false);
    let mut row = fixture::element("table-row", "row", vec![cell]);
    row["properties"]["breditor/row-id"] = json!("r1");
    let mut table = fixture::element("table", "table", vec![row]);
    table["properties"] = json!({"breditor/block-id":"table","breditor/table-id":"t","breditor/columns":[{"id":"c1","width":160}],"breditor/merges":[],"breditor/retracted-merges":[]});
    let mut image = fixture::element("image", "img", vec![page_break("x")]);
    image["properties"] = json!({"breditor/block-id":"img","breditor/image-id":"i","breditor/asset-id":"a","breditor/asset-generation":"g","breditor/decorative":false,"breditor/alt-text":"Alt"});
    for misplaced in [quote, item, tasks, section, table, image] {
        assert!(admit(&c, &document(vec![misplaced.clone()])).is_err(), "{misplaced}");
    }
    // Content, extra properties and a missing identity are rejected.
    let mut text = page_break("x");
    text["children"] = json!([{"kind":"text","text":"a","formats":[]}]);
    let mut extra = page_break("x");
    extra["properties"]["breditor/block-align"] = json!(2);
    let mut anonymous = page_break("x");
    anonymous["properties"] = json!({});
    let duplicate = document(vec![fixture::paragraph("x", "A"), page_break("x")]);
    for invalid in
        [document(vec![text]), document(vec![extra]), document(vec![anonymous]), duplicate]
    {
        assert!(admit(&c, &invalid).is_err(), "{invalid}");
    }
    // V1–V3 never admit the kind.
    for revision in 1..=3 {
        assert!(admit(&context(revision)?, &root()).is_err());
    }
    Ok(())
}

#[test]
fn insert_and_delete_are_exact_history_groups_with_checkpoint_restore() -> Result {
    let c = context(4)?;
    let raw = document(vec![fixture::paragraph("p", "One"), fixture::paragraph("q", "Two")]);
    let mut a = owner(&c, &raw, caret("p", 2)?)?;
    let original = encode(&c, a.state().document())?;
    let outcome = a.insert_page_break(&a.snapshot(), &root_position(Some("q"))?, &id("pb")?)?;
    assert_eq!(outcome, RichLocalOutcome::ContentCommitted);
    assert_eq!(a.undo_depth(), 1);
    let inserted = encode(&c, a.state().document())?;
    assert_eq!(inserted["children"][1], page_break("pb"));
    // The caret is mapped, not moved.
    assert_eq!(selection_of(&a), Some(caret("p", 2)?));
    // Appending at the end of the root.
    a.insert_page_break(&a.snapshot(), &root_position(None)?, &id("end")?)?;
    assert_eq!(a.undo_depth(), 2);
    let appended = encode(&c, a.state().document())?;
    assert_eq!(
        types(&appended),
        ["breditor/paragraph", "breditor/page-break", "breditor/paragraph", "breditor/page-break"]
    );
    // Deleting with an unrelated caret maps the caret and needs no floor paragraph.
    a.delete_page_break(&a.snapshot(), &id("pb")?, &id("floor")?)?;
    assert_eq!(a.undo_depth(), 3);
    let deleted = encode(&c, a.state().document())?;
    assert_eq!(
        types(&deleted),
        ["breditor/paragraph", "breditor/paragraph", "breditor/page-break"]
    );
    assert_eq!(selection_of(&a), Some(caret("p", 2)?));
    let codec = RichSessionJsonCodec::new(c.clone());
    let mut b = codec.decode(&codec.encode(&a)?)?;
    assert_eq!(encode(&c, b.state().document())?, deleted);
    for expected in [&appended, &inserted, &original] {
        b.undo(&b.snapshot())?;
        assert_eq!(&encode(&c, b.state().document())?, expected);
    }
    for expected in [&inserted, &appended, &deleted] {
        b.redo(&b.snapshot())?;
        assert_eq!(&encode(&c, b.state().document())?, expected);
    }
    Ok(())
}

#[test]
fn insert_and_delete_refuse_placement_target_profile_and_owner_state() -> Result {
    let c = context(4)?;
    let quoted = document(vec![fixture::element(
        "blockquote",
        "bq",
        vec![fixture::paragraph("p", "Quote")],
    )]);
    let mut a = owner(&c, &quoted, caret("p", 0)?)?;
    let inside = RichFlowPosition::new(RichFlowParent::Blockquote(id("bq")?), None);
    let error = a.insert_page_break(&a.snapshot(), &inside, &id("pb")?).err().ok_or("placement")?;
    assert_eq!(page_break_error(&error), Some(RichPageBreakError::Placement));
    // A raw insertion into a quote is refused by the grammar as well.
    let draft = RichBlockDraft::page_break(&id("pb")?)?;
    let raw = InsertBlocks::capture(a.state().document(), &inside, vec![draft])?;
    assert!(
        a.dispatch(&a.snapshot(), &[RichAction::InsertBlocks(raw)], RichSelectionUpdate::Map)
            .is_err()
    );
    assert_eq!(a.undo_depth(), 0);
    // A reused identity and a missing anchor are atomic failures.
    let mut b = owner(&c, &root(), caret("p", 0)?)?;
    assert!(b.insert_page_break(&b.snapshot(), &root_position(None)?, &id("q")?).is_err());
    assert!(
        b.insert_page_break(&b.snapshot(), &root_position(Some("missing"))?, &id("n")?).is_err()
    );
    // Deleting a non-page-break is refused.
    let error =
        b.delete_page_break(&b.snapshot(), &id("p")?, &id("floor")?).err().ok_or("target")?;
    assert_eq!(page_break_error(&error), Some(RichPageBreakError::Target));
    // Stale observations and read-only owners are refused without publication.
    let stale = b.snapshot();
    b.set_selection(&b.snapshot(), Some(caret("q", 1)?))?;
    assert!(matches!(
        b.insert_page_break(&stale, &root_position(None)?, &id("n")?),
        Err(RichLocalSessionError::StaleSnapshot)
    ));
    b.set_read_only(&b.snapshot(), true)?;
    assert!(matches!(
        b.insert_page_break(&b.snapshot(), &root_position(None)?, &id("n")?),
        Err(RichLocalSessionError::ReadOnly)
    ));
    assert!(matches!(
        b.delete_page_break(&b.snapshot(), &id("pb")?, &id("floor")?),
        Err(RichLocalSessionError::ReadOnly)
    ));
    assert_eq!(b.undo_depth(), 0);
    // V1–V3 owners refuse both commands as a profile error.
    for revision in 1..=3 {
        let old = context(revision)?;
        let plain = document(vec![fixture::paragraph("p", "A")]);
        let mut o = owner(&old, &plain, caret("p", 0)?)?;
        let error = o
            .insert_page_break(&o.snapshot(), &root_position(None)?, &id("pb")?)
            .err()
            .ok_or("v")?;
        assert_eq!(page_break_error(&error), Some(RichPageBreakError::Profile));
        let error = o.delete_page_break(&o.snapshot(), &id("p")?, &id("f")?).err().ok_or("v")?;
        assert_eq!(page_break_error(&error), Some(RichPageBreakError::Profile));
    }
    Ok(())
}

#[test]
fn a_page_break_is_a_node_selectable_atom_with_recovery_on_delete() -> Result {
    let c = context(4)?;
    let d = admit(&c, &root())?;
    let selected = RichSelection::try_new(&d, node("pb")?)?;
    assert_eq!(selected_flow_atom(&d, &selected)?, id("pb")?);
    // Deleting the node-selected page break recovers to the next stop in one group.
    let mut a = owner(&c, &root(), node("pb")?)?;
    a.delete_page_break(&a.snapshot(), &id("pb")?, &id("floor")?)?;
    assert_eq!(types(&encode(&c, a.state().document())?), ["breditor/paragraph"; 2]);
    assert!(
        matches!(selection_of(&a), Some(RichSelectionKind::TextRange { ref focus, .. }) if focus.block() == &id("q")?)
    );
    assert_eq!(a.undo_depth(), 1);
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, root());
    // Generic whole-atom deletion works the same way.
    let mut g = owner(&c, &root(), node("pb")?)?;
    g.delete_atom(&g.snapshot(), &id("floor")?, FlowMove::Before)?;
    assert!(
        matches!(selection_of(&g), Some(RichSelectionKind::TextRange { ref focus, .. }) if focus.block() == &id("p")?)
    );
    // A sole page break leaves a fresh floor paragraph with the caret in it.
    let sole = document(vec![page_break("pb")]);
    let mut s = owner(&c, &sole, node("pb")?)?;
    s.delete_page_break(&s.snapshot(), &id("pb")?, &id("floor")?)?;
    assert_eq!(
        encode(&c, s.state().document())?["children"],
        json!([fixture::paragraph("floor", "")])
    );
    assert_eq!(selection_of(&s), Some(caret("floor", 0)?));
    let mut t = owner(&c, &document(vec![page_break("pb"), page_break("pc")]), node("pc")?)?;
    t.delete_page_break(&t.snapshot(), &id("pb")?, &id("floor")?)?;
    assert_eq!(selection_of(&t), Some(node("pc")?));
    // Enter-equivalent: a paragraph can be inserted after a selected page break.
    let mut e = owner(&c, &root(), node("pb")?)?;
    e.insert_paragraph_adjacent(&e.snapshot(), &id("n")?, FlowMove::After)?;
    assert_eq!(encode(&c, e.state().document())?["children"][2], fixture::paragraph("n", ""));
    assert_eq!(selection_of(&e), Some(caret("n", 0)?));
    Ok(())
}

#[test]
fn flow_navigation_stops_on_a_page_break() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root(), caret("p", 6)?)?;
    a.navigate_flow(&a.snapshot(), FlowMove::After)?;
    assert_eq!(selection_of(&a), Some(node("pb")?));
    a.navigate_flow(&a.snapshot(), FlowMove::After)?;
    assert!(
        matches!(selection_of(&a), Some(RichSelectionKind::TextRange { ref focus, .. }) if focus.block() == &id("q")?)
    );
    a.navigate_flow(&a.snapshot(), FlowMove::Before)?;
    assert_eq!(selection_of(&a), Some(node("pb")?));
    Ok(())
}

#[test]
fn block_moves_keep_page_breaks_in_the_root() -> Result {
    let c = context(4)?;
    let raw = document(vec![
        fixture::paragraph("p", "Before"),
        page_break("pb"),
        fixture::paragraph("q", "After"),
        fixture::element("blockquote", "bq", vec![fixture::paragraph("r", "Quote")]),
    ]);
    let mut a = owner(&c, &raw, caret("p", 0)?)?;
    let moved = MoveBlock::capture(a.state().document(), &id("pb")?, None, Some(&id("p")?))?;
    a.dispatch(&a.snapshot(), &[RichAction::MoveBlock(moved)], RichSelectionUpdate::Map)?;
    assert_eq!(encode(&c, a.state().document())?["children"][0], page_break("pb"));
    assert_eq!(a.undo_depth(), 1);
    // Moving it into a quote (or wrapping it into one) is refused by the grammar.
    let into = MoveBlock::capture(a.state().document(), &id("pb")?, Some(&id("bq")?), None);
    let refused = into.map_or(true, |action| {
        a.dispatch(&a.snapshot(), &[RichAction::MoveBlock(action)], RichSelectionUpdate::Map)
            .is_err()
    });
    assert!(refused);
    let wrap = WrapBlockquote::capture(a.state().document(), &id("pb")?, &id("p")?, &id("w")?);
    let refused = wrap.map_or(true, |action| {
        a.dispatch(&a.snapshot(), &[RichAction::WrapBlockquote(action)], RichSelectionUpdate::Map)
            .is_err()
    });
    assert!(refused);
    assert_eq!(a.undo_depth(), 1);
    Ok(())
}

#[test]
fn search_skips_page_breaks() -> Result {
    let c = context(4)?;
    let d = admit(&c, &root())?;
    let query = RichSearchQuery::try_new("e", RichSearchMode::Literal, true, false)?;
    let blocks: Vec<_> = find_rich_text(&d, &query)?
        .matches()
        .iter()
        .map(|m| m.block().as_str().to_owned())
        .collect();
    assert_eq!(blocks, ["p", "p", "q"]);
    Ok(())
}

#[test]
fn a_general_range_across_a_page_break_removes_it_in_one_group() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root(), caret("p", 0)?)?;
    let target = RichSelectionKind::TextRange { anchor: point("p", 3)?, focus: point("q", 2)? };
    a.replace_general_range_plain_text(&a.snapshot(), &target, "-", &[])?;
    let edited = encode(&c, a.state().document())?;
    assert_eq!(edited["children"], json!([fixture::paragraph("p", "Bef-ter")]));
    assert_eq!(a.undo_depth(), 1);
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, root());
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

#[test]
fn clipboard_keeps_page_breaks_in_v4_and_v3_refuses_them() -> Result {
    let c = context(4)?;
    let raw = root();
    let d = admit(&c, &raw)?;
    // A node copy carries the page break; paste rekeys its identity.
    let selected = RichSelection::try_new(&d, node("pb")?)?;
    let fragment = RichClipboardFragment::copy_selection(&c, &d, &selected)?.ok_or("fragment")?;
    let json = RichClipboardJsonCodec::new(c.clone()).encode(&fragment)?;
    assert!(json.contains(RICH_PAGE_BREAK_KIND), "{json}");
    let decoded = RichClipboardJsonCodec::new(c.clone()).decode(&json)?;
    let drafts = decoded.flow_drafts(&c, &mut Ids::default())?;
    let mut a = owner(&c, &raw, caret("p", 0)?)?;
    let action = InsertBlocks::capture(a.state().document(), &root_position(None)?, drafts)?;
    a.dispatch(&a.snapshot(), &[RichAction::InsertBlocks(action)], RichSelectionUpdate::Map)?;
    let pasted = encode(&c, a.state().document())?;
    let copy = pasted["children"].as_array().ok_or("children")?.last().ok_or("last")?.clone();
    assert_eq!(copy["type"], RICH_PAGE_BREAK_KIND);
    assert_ne!(copy["properties"]["breditor/block-id"], json!("pb"));
    // A whole-document copy keeps it in order; its plain text is an empty line.
    let all = RichSelection::try_new(&d, RichSelectionKind::Document)?;
    let whole = RichClipboardFragment::copy_selection(&c, &d, &all)?.ok_or("fragment")?;
    assert_eq!(whole.plain_text()?, "Before\n\nAfter");
    // A V3 owner refuses the record outright.
    assert!(RichClipboardJsonCodec::new(context(3)?).decode(&json).is_err());
    // Pasting the record into a quote is refused by the grammar.
    let quoted = document(vec![fixture::element(
        "blockquote",
        "bq",
        vec![fixture::paragraph("r", "Quote")],
    )]);
    let mut q = owner(&c, &quoted, caret("r", 0)?)?;
    let drafts = decoded.flow_drafts(&c, &mut Ids::default())?;
    let inside = RichFlowPosition::new(RichFlowParent::Blockquote(id("bq")?), None);
    let action = InsertBlocks::capture(q.state().document(), &inside, drafts)?;
    assert!(
        q.dispatch(&q.snapshot(), &[RichAction::InsertBlocks(action)], RichSelectionUpdate::Map)
            .is_err()
    );
    Ok(())
}
