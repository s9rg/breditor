//! Explicit candidate V4 collapsible sections: grammar, actions, history, editing and clipboard.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichClipboardJsonCodec, RichSessionJsonCodec},
    document::{Format, PropertyMap},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CausalStamp, ChangeId, FlowMove, RICH_DETAILS_MAX_DEPTH, ReplicaId,
        RichBlockDraft, RichClipboardError, RichClipboardFragment, RichClipboardIdAllocator,
        RichClipboardIdentityKind, RichDetailsError, RichDocument, RichFlowParent,
        RichFlowPosition, RichLocalOutcome, RichLocalSession, RichSearchMode, RichSearchQuery,
        RichSearchReplacement, RichSearchReplacementMode, RichSelection, RichSelectionFormatChange,
        RichSelectionKind, RichSelectionUpdate, RichTextPoint,
        actions::{
            CodeFormatPolicy, InsertBlocks, JoinTextBlocks, MoveBlock, ReplaceTextRange,
            RichAction, RichActionError, SetCodeBlock, SetDetailsOpen, SetHeading, SplitTextBlock,
            UnwrapDetails, WrapDetails,
        },
        find_rich_text, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

/// Candidate V4 fingerprint for schema `example/layout@1` with the standard inline preset,
/// pinned after the table-caption slice (sections, mentions and table captions).
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
    Ok(EditorContext::new(schema(revision)?, DocumentLimits::default()))
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
fn text_block(kind: &str, id: &str, text: &str) -> Value {
    let mut node = fixture::paragraph(id, text);
    node["type"] = json!(format!("breditor/{kind}"));
    node
}
fn summary(id: &str, text: &str) -> Value {
    text_block("details-summary", id, text)
}
fn details(id: &str, open: bool, children: Vec<Value>) -> Value {
    let mut node = fixture::element("details", id, children);
    if open {
        node["properties"]["breditor/details-open"] = json!(true);
    }
    node
}
fn document(children: Vec<Value>) -> Value {
    let mut root = fixture::element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
/// `p` "Before", section `d` (summary `s` "Title", body `b1` "Body one", `b2` "Body two"), `q` "After".
fn root(open: bool) -> Value {
    document(vec![
        fixture::paragraph("p", "Before"),
        details(
            "d",
            open,
            vec![
                summary("s", "Title"),
                fixture::paragraph("b1", "Body one"),
                fixture::paragraph("b2", "Body two"),
            ],
        ),
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
fn range(a: &str, x: u64, b: &str, y: u64) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::TextRange { anchor: point(a, x)?, focus: point(b, y)? })
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
fn validation_code(c: &EditorContext, raw: &Value) -> Option<String> {
    match admit(c, raw) {
        Ok(_) => None,
        Err(error) => Some(format!("{error:?}")),
    }
}

#[test]
fn v4_fingerprint_is_locked_and_v1_to_v3_stay_exact_without_sections() -> Result {
    let [a, b, c, d] = [schema(1)?, schema(2)?, schema(3)?, schema(4)?];
    for (old, expected) in [
        (&a, "sha256:26dcb0992f0814e1d18491134f70c5857efc01b0c28d07015199490389090278"),
        (&b, "sha256:2082e440c52cdef30f9fa46289cae3e378ea7673f05d20e6b71bb5797347b056"),
        (&c, "sha256:6667773591bde52ef650c498d908ccbe7e8d9303683be0ab7c55400db6dd52b4"),
    ] {
        assert_eq!(old.fingerprint().to_string(), expected);
        assert!(!old.supports_rich_details());
    }
    assert_eq!(d.fingerprint().to_string(), V4_FINGERPRINT);
    assert!(
        d.supports_rich_details()
            && d.supports_rich_image_links()
            && d.supports_rich_text_language()
            && d.supports_rich_list_numbering()
    );
    Ok(())
}

#[test]
fn grammar_admits_sections_in_every_flow_container_only_in_v4() -> Result {
    let c = context(4)?;
    let section = |id: &str| {
        details(
            id,
            false,
            vec![summary(&format!("{id}-s"), ""), fixture::paragraph(&format!("{id}-b"), "x")],
        )
    };
    let mut item = fixture::element(
        "list-item",
        "li",
        vec![fixture::paragraph("li-p", "Item"), section("in-item")],
    );
    item["type"] = json!("breditor/list-item");
    let list = fixture::element("bullet-list", "ul", vec![item]);
    let quote = fixture::element("blockquote", "bq", vec![section("in-quote")]);
    let mut task = fixture::element(
        "task-item",
        "ti",
        vec![fixture::paragraph("ti-p", "Task"), section("in-task")],
    );
    task["properties"]["breditor/checked"] = json!(false);
    let tasks = fixture::element("task-list", "tl", vec![task]);
    let mut cell = fixture::element("table-cell", "cell", vec![section("in-cell")]);
    cell["properties"]["breditor/column-id"] = json!("col");
    cell["properties"]["breditor/header"] = json!(false);
    let mut row = fixture::element("table-row", "row", vec![cell]);
    row["properties"]["breditor/row-id"] = json!("r1");
    let mut table = fixture::element("table", "table", vec![row]);
    table["properties"] = json!({"breditor/block-id":"table","breditor/table-id":"t1","breditor/columns":[{"id":"col","width":160}],"breditor/merges":[],"breditor/retracted-merges":[]});
    let formatted =
        json!({"kind":"text","text":"Bold","formats":[{"type":"breditor/strong","properties":{}}]});
    let mut rich_summary = summary("fs", "");
    rich_summary["children"] = json!([formatted]);
    let nested = details(
        "outer",
        true,
        vec![summary("outer-s", "Outer"), section("inner"), fixture::paragraph("tail", "t")],
    );
    let raw = document(vec![
        list,
        quote,
        tasks,
        table,
        nested,
        details("fd", true, vec![rich_summary, fixture::paragraph("fd-b", "")]),
    ]);
    admit(&c, &raw)?;
    // Every older language rejects the section node itself.
    for revision in 1..=3 {
        assert!(admit(&context(revision)?, &root(true)).is_err(), "V{revision}");
    }
    Ok(())
}

#[test]
fn grammar_rejects_malformed_sections_open_values_and_excess_nesting() -> Result {
    let c = context(4)?;
    let body = || fixture::paragraph("b", "x");
    let mut open_false = details("d", false, vec![summary("s", ""), body()]);
    open_false["properties"]["breditor/details-open"] = json!(false);
    let mut open_string = details("d", false, vec![summary("s", ""), body()]);
    open_string["properties"]["breditor/details-open"] = json!("true");
    let mut paragraph_open = fixture::paragraph("p", "x");
    paragraph_open["properties"]["breditor/details-open"] = json!(true);
    let mut summary_layout = summary("s", "");
    summary_layout["properties"]["breditor/block-align"] = json!(2);
    let mut summary_open = summary("s", "");
    summary_open["properties"]["breditor/details-open"] = json!(true);
    let mut summary_entity = details("d", false, vec![summary("s", ""), body()]);
    summary_entity["children"][0]["children"] = json!([{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"x"},"children":[]}]);
    for (label, raw) in [
        ("no summary", document(vec![details("d", false, vec![body()])])),
        ("summary only", document(vec![details("d", false, vec![summary("s", "")])])),
        ("summary second", document(vec![details("d", false, vec![body(), summary("s", "")])])),
        (
            "two summaries",
            document(vec![details("d", false, vec![summary("s", ""), summary("t", ""), body()])]),
        ),
        ("loose summary", document(vec![summary("s", "")])),
        ("open false", document(vec![open_false])),
        ("open string", document(vec![open_string])),
        ("open on paragraph", document(vec![paragraph_open])),
        ("summary layout", document(vec![details("d", false, vec![summary_layout, body()])])),
        ("summary open", document(vec![details("d", false, vec![summary_open, body()])])),
        ("summary child element", document(vec![summary_entity])),
        ("missing id", {
            let mut node = details("d", false, vec![summary("s", ""), body()]);
            node["properties"] = json!({});
            document(vec![node])
        }),
    ] {
        assert!(validation_code(&c, &raw).is_some(), "{label} must be rejected");
    }
    // Exactly RICH_DETAILS_MAX_DEPTH nested sections are admitted; one more is not.
    let nest = |depth: usize| {
        let mut node = fixture::paragraph("leaf", "x");
        for level in (0..depth).rev() {
            node =
                details(&format!("n{level}"), true, vec![summary(&format!("s{level}"), ""), node]);
        }
        document(vec![node])
    };
    assert_eq!(RICH_DETAILS_MAX_DEPTH, 8);
    admit(&c, &nest(RICH_DETAILS_MAX_DEPTH))?;
    let error = validation_code(&c, &nest(RICH_DETAILS_MAX_DEPTH + 1)).ok_or("depth")?;
    assert!(error.contains("collapsible sections exceed the nesting bound"), "{error}");
    // A table below a section inside a table cell is still a nested table.
    let mut inner = fixture::element("table", "inner", vec![]);
    inner["properties"] = json!({"breditor/block-id":"inner","breditor/table-id":"t2","breditor/columns":[],"breditor/merges":[],"breditor/retracted-merges":[]});
    let mut cell = fixture::element(
        "table-cell",
        "cell",
        vec![details("d", false, vec![summary("s", ""), inner])],
    );
    cell["properties"]["breditor/column-id"] = json!("col");
    cell["properties"]["breditor/header"] = json!(false);
    let mut row = fixture::element("table-row", "row", vec![cell]);
    row["properties"]["breditor/row-id"] = json!("r1");
    let mut table = fixture::element("table", "table", vec![row]);
    table["properties"] = json!({"breditor/block-id":"table","breditor/table-id":"t1","breditor/columns":[{"id":"col","width":160}],"breditor/merges":[],"breditor/retracted-merges":[]});
    assert!(admit(&c, &document(vec![table])).is_err());
    Ok(())
}

#[test]
fn wrap_unwrap_and_toggle_are_exact_history_groups_with_checkpoint_restore() -> Result {
    let c = context(4)?;
    let raw = document(vec![
        fixture::paragraph("p", "One"),
        fixture::paragraph("p2", "Two"),
        fixture::paragraph("p3", "Three"),
    ]);
    let mut a = owner(&c, &raw, caret("p2", 1)?)?;
    let original = encode(&c, a.state().document())?;
    let wrap = WrapDetails::capture(
        a.state().document(),
        &id("p")?,
        &id("p2")?,
        &id("d")?,
        &id("s")?,
        true,
    )?;
    assert_eq!(run(&mut a, RichAction::WrapDetails(wrap))?, RichLocalOutcome::ContentCommitted);
    assert_eq!(a.undo_depth(), 1);
    let wrapped = encode(&c, a.state().document())?;
    assert_eq!(
        wrapped["children"][0],
        details(
            "d",
            true,
            vec![summary("s", ""), fixture::paragraph("p", "One"), fixture::paragraph("p2", "Two")]
        )
    );
    // The caret keeps its block and offset.
    assert_eq!(selection_of(&a), Some(caret("p2", 1)?));
    // Collapse, then expand: one group each; setting the same state is a no-op.
    let collapse = SetDetailsOpen::capture(a.state().document(), &id("d")?, false)?;
    assert_eq!(
        run(&mut a, RichAction::SetDetailsOpen(collapse))?,
        RichLocalOutcome::ContentCommitted
    );
    let collapsed = encode(&c, a.state().document())?;
    assert!(collapsed["children"][0]["properties"].get("breditor/details-open").is_none());
    let again = SetDetailsOpen::capture(a.state().document(), &id("d")?, false)?;
    assert_eq!(run(&mut a, RichAction::SetDetailsOpen(again))?, RichLocalOutcome::Unchanged);
    assert_eq!(a.undo_depth(), 2);
    // Type a summary, then unwrap: the summary becomes a paragraph with its identity.
    a.set_selection(&a.snapshot(), Some(caret("s", 0)?))?;
    a.insert_plain_text(&a.snapshot(), "Head")?;
    assert_eq!(a.undo_depth(), 3);
    let typed = encode(&c, a.state().document())?;
    let unwrap = UnwrapDetails::capture(a.state().document(), &id("d")?)?;
    assert_eq!(run(&mut a, RichAction::UnwrapDetails(unwrap))?, RichLocalOutcome::ContentCommitted);
    let unwrapped = encode(&c, a.state().document())?;
    assert_eq!(unwrapped["children"][0], fixture::paragraph("s", "Head"));
    assert_eq!(unwrapped["children"][1], fixture::paragraph("p", "One"));
    assert_eq!(unwrapped["children"][3], fixture::paragraph("p3", "Three"));
    // The caret in the summary maps to the same offset in the lifted paragraph.
    assert_eq!(selection_of(&a), Some(caret("s", 4)?));
    // A checkpoint restores the document and exact future history.
    let codec = RichSessionJsonCodec::new(c.clone());
    let mut b = codec.decode(&codec.encode(&a)?)?;
    assert_eq!(encode(&c, b.state().document())?, unwrapped);
    for expected in [&typed, &collapsed, &wrapped, &original] {
        b.undo(&b.snapshot())?;
        assert_eq!(&encode(&c, b.state().document())?, expected);
    }
    for expected in [&wrapped, &collapsed, &typed, &unwrapped] {
        b.redo(&b.snapshot())?;
        assert_eq!(&encode(&c, b.state().document())?, expected);
    }
    Ok(())
}

#[test]
fn collapsing_moves_a_hidden_selection_to_the_summary_end() -> Result {
    let c = context(4)?;
    // A caret in the body moves to the summary end in the same group.
    let mut a = owner(&c, &root(true), caret("b2", 3)?)?;
    a.set_details_open(&a.snapshot(), &id("d")?, false)?;
    assert_eq!(a.undo_depth(), 1);
    assert_eq!(
        selection_of(&a),
        Some(RichSelectionKind::TextRange {
            anchor: RichTextPoint::new(id("s")?, TextOffset::try_new(5)?, Affinity::Before),
            focus: RichTextPoint::new(id("s")?, TextOffset::try_new(5)?, Affinity::Before),
        })
    );
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, encode(&c, &admit(&c, &root(true))?)?);
    // A range ending in the body and a whole-node selection in the body also move.
    let mut b = owner(&c, &root(true), range("p", 1, "b1", 2)?)?;
    b.set_details_open(&b.snapshot(), &id("d")?, false)?;
    assert!(
        matches!(selection_of(&b), Some(RichSelectionKind::TextRange { ref anchor, .. }) if anchor.block() == &id("s")?)
    );
    // Selections in the summary or outside the section map unchanged; expanding never moves them.
    for selection in [caret("s", 2)?, caret("q", 1)?, range("p", 0, "s", 3)?] {
        let mut o = owner(&c, &root(true), selection.clone())?;
        o.set_details_open(&o.snapshot(), &id("d")?, false)?;
        assert_eq!(selection_of(&o), Some(selection.clone()));
        o.set_details_open(&o.snapshot(), &id("d")?, true)?;
        assert_eq!(selection_of(&o), Some(selection));
        assert_eq!(o.undo_depth(), 2);
    }
    // Read-only, stale, missing, non-section targets and V3 refuse atomically.
    let mut r = owner(&c, &root(true), caret("b1", 0)?)?;
    let stale = r.snapshot();
    r.set_selection(&r.snapshot(), Some(caret("p", 0)?))?;
    assert!(r.set_details_open(&stale, &id("d")?, false).is_err());
    assert!(r.set_details_open(&r.snapshot(), &id("nope")?, false).is_err());
    assert!(r.set_details_open(&r.snapshot(), &id("p")?, false).is_err());
    r.set_read_only(&r.snapshot(), true)?;
    assert!(r.set_details_open(&r.snapshot(), &id("d")?, false).is_err());
    assert_eq!(r.undo_depth(), 0);
    Ok(())
}

#[test]
fn old_profiles_refuse_every_section_action() -> Result {
    let c3 = context(3)?;
    let raw = document(vec![fixture::paragraph("p", "One")]);
    let mut a = owner(&c3, &raw, caret("p", 0)?)?;
    let wrap = WrapDetails::capture(
        a.state().document(),
        &id("p")?,
        &id("p")?,
        &id("d")?,
        &id("s")?,
        false,
    )?;
    let error =
        a.dispatch(&a.snapshot(), &[RichAction::WrapDetails(wrap)], RichSelectionUpdate::Map);
    assert!(error.is_err());
    assert!(a.set_details_open(&a.snapshot(), &id("p")?, true).is_err());
    assert!(a.enter_details_body(&a.snapshot(), &id("n")?).is_err());
    assert_eq!(a.undo_depth(), 0);
    Ok(())
}

#[test]
fn enter_in_a_summary_opens_a_fresh_first_body_paragraph() -> Result {
    let c = context(4)?;
    for open in [true, false] {
        let mut a = owner(&c, &root(open), caret("s", 2)?)?;
        let before = encode(&c, a.state().document())?;
        assert_eq!(
            a.enter_details_body(&a.snapshot(), &id("n")?)?,
            RichLocalOutcome::ContentCommitted
        );
        assert_eq!(a.undo_depth(), 1, "one group (open={open})");
        let after = encode(&c, a.state().document())?;
        let section = &after["children"][1];
        assert_eq!(section["properties"]["breditor/details-open"], json!(true));
        assert_eq!(section["children"][0], summary("s", "Title"), "summary is never split");
        assert_eq!(section["children"][1], fixture::paragraph("n", ""));
        assert_eq!(section["children"][2], fixture::paragraph("b1", "Body one"));
        assert_eq!(selection_of(&a), Some(caret("n", 0)?));
        a.undo(&a.snapshot())?;
        assert_eq!(encode(&c, a.state().document())?, before);
    }
    // Only a collapsed caret in a summary qualifies; identities must be fresh.
    let mut a = owner(&c, &root(true), caret("b1", 0)?)?;
    assert!(a.enter_details_body(&a.snapshot(), &id("n")?).is_err());
    a.set_selection(&a.snapshot(), Some(range("s", 0, "s", 2)?))?;
    assert!(a.enter_details_body(&a.snapshot(), &id("n")?).is_err());
    a.set_selection(&a.snapshot(), Some(caret("s", 0)?))?;
    assert!(a.enter_details_body(&a.snapshot(), &id("b1")?).is_err());
    assert_eq!(a.undo_depth(), 0);
    Ok(())
}

#[test]
fn summary_is_inline_text_but_never_split_joined_converted_or_moved() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root(true), range("s", 0, "s", 5)?)?;
    // Inline formats apply to summary text like a paragraph.
    let strong = Format::new(QualifiedName::try_new("breditor/strong")?, PropertyMap::default());
    a.change_selection_formats(&a.snapshot(), &[RichSelectionFormatChange::Set(strong)])?;
    let formatted = encode(&c, a.state().document())?;
    assert_eq!(
        formatted["children"][1]["children"][0]["children"][0]["formats"][0]["type"],
        "breditor/strong"
    );
    let d = a.state().document().clone();
    let text_error = |result: std::result::Result<_, RichActionError>| {
        matches!(result, Err(RichActionError::TextTarget))
    };
    assert!(text_error(SplitTextBlock::capture(&d, &point("s", 2)?, &id("n")?, None).map(|_| ())));
    assert!(text_error(JoinTextBlocks::capture(&d, &id("s")?, &id("b1")?).map(|_| ())));
    assert!(text_error(SetHeading::capture(&d, &id("s")?, Some(2)).map(|_| ())));
    assert!(text_error(
        SetCodeBlock::capture(&d, &id("s")?, None, CodeFormatPolicy::RemoveFormats).map(|_| ())
    ));
    assert!(matches!(
        MoveBlock::capture(&d, &id("s")?, None, None),
        Err(RichActionError::MoveSource)
    ));
    // Inserting before the summary or a whole-flow wrap that would include it is refused.
    let draft =
        RichBlockDraft::paragraph(&id("n")?, &breditor_core::document::TextFragment::empty())?;
    let before = InsertBlocks::capture(
        &d,
        &RichFlowPosition::new(RichFlowParent::Details(id("d")?), Some(id("s")?)),
        vec![draft],
    )?;
    assert!(RichAction::InsertBlocks(before).apply(&c, &d).is_err());
    assert!(matches!(
        WrapDetails::capture(&d, &id("s")?, &id("b1")?, &id("x")?, &id("y")?, true),
        Err(RichActionError::Details(RichDetailsError::Target))
    ));
    // Block-level input rules never convert a summary.
    let mut typed = owner(&c, &root(true), caret("s", 0)?)?;
    typed.insert_plain_text_with_markdown_rules(&typed.snapshot(), "#", "rule")?;
    let outcome = typed.insert_plain_text_with_markdown_rules(&typed.snapshot(), " ", "rule");
    assert!(outcome.is_ok());
    assert_eq!(
        encode(&c, typed.state().document())?["children"][1]["children"][0]["type"],
        "breditor/details-summary"
    );
    Ok(())
}

#[test]
fn block_moves_treat_sections_as_containers_with_a_fixed_summary() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root(true), caret("p", 0)?)?;
    // Move an outside paragraph into the body, then a body block out again.
    let into =
        MoveBlock::capture(a.state().document(), &id("q")?, Some(&id("d")?), Some(&id("b1")?))?;
    run(&mut a, RichAction::MoveBlock(into))?;
    let moved = encode(&c, a.state().document())?;
    assert_eq!(moved["children"][1]["children"][1], fixture::paragraph("q", "After"));
    let out = MoveBlock::capture(a.state().document(), &id("b2")?, None, None)?;
    run(&mut a, RichAction::MoveBlock(out))?;
    // A whole section moves with its summary and body.
    let section = MoveBlock::capture(a.state().document(), &id("d")?, None, Some(&id("p")?))?;
    run(&mut a, RichAction::MoveBlock(section))?;
    assert_eq!(encode(&c, a.state().document())?["children"][0]["type"], "breditor/details");
    assert_eq!(a.undo_depth(), 3);
    // Moving the last body block out, or before the summary, is refused.
    let single = owner(
        &c,
        &document(vec![
            details("d", true, vec![summary("s", ""), fixture::paragraph("b", "x")]),
            fixture::paragraph("p", ""),
        ]),
        caret("p", 0)?,
    )?;
    assert!(matches!(
        MoveBlock::capture(single.state().document(), &id("b")?, None, None),
        Err(RichActionError::Details(RichDetailsError::Shape))
    ));
    assert!(matches!(
        MoveBlock::capture(single.state().document(), &id("p")?, Some(&id("d")?), Some(&id("s")?)),
        Err(RichActionError::Details(RichDetailsError::Shape))
    ));
    Ok(())
}

#[test]
fn ranges_across_a_section_boundary_keep_the_summary_and_a_body() -> Result {
    let c = context(4)?;
    let d = admit(&c, &root(true))?;
    // The original sibling join refuses a summary endpoint instead of merging it.
    let from_summary = RichSelection::try_new(&d, range("s", 2, "b1", 4)?)?;
    assert!(matches!(
        ReplaceTextRange::capture(
            &d,
            &from_summary,
            &breditor_core::document::TextFragment::empty()
        ),
        Err(RichActionError::FlowRange)
    ));
    // The general planner keeps both boundary blocks distinct.
    let mut a = owner(&c, &root(true), range("s", 2, "b1", 4)?)?;
    a.replace_general_range_plain_text(&a.snapshot(), &range("s", 2, "b1", 4)?, "", &[])?;
    let section = encode(&c, a.state().document())?["children"][1].clone();
    assert_eq!(section["children"][0], summary("s", "Ti"));
    assert_eq!(section["children"][1], fixture::paragraph("b1", " one"));
    assert_eq!(a.undo_depth(), 1);
    // A range from before the section into its body empties the wholly covered summary but
    // keeps it, and the retained body suffix stays in place.
    let mut before = owner(&c, &root(true), caret("p", 0)?)?;
    before.replace_general_range_plain_text(
        &before.snapshot(),
        &range("p", 3, "b2", 4)?,
        "X",
        &[],
    )?;
    let after = encode(&c, before.state().document())?;
    assert_eq!(after["children"][0], fixture::paragraph("p", "BefX"));
    assert_eq!(after["children"][1]["children"][0], summary("s", ""));
    assert_eq!(after["children"][1]["children"][1], fixture::paragraph("b2", " two"));
    // Deleting the whole body from inside the section requires one fresh floor paragraph.
    let mut emptied = owner(&c, &root(true), caret("p", 0)?)?;
    let target = range("s", 5, "q", 0)?;
    assert!(
        emptied.replace_general_range_plain_text(&emptied.snapshot(), &target, "", &[]).is_err()
    );
    emptied.replace_general_range_plain_text(&emptied.snapshot(), &target, "", &[id("floor")?])?;
    let floored = encode(&c, emptied.state().document())?;
    assert_eq!(floored["children"][1]["children"][1], fixture::paragraph("floor", ""));
    // A sibling range around a whole section keeps the original join and removes it.
    let mut around = owner(&c, &root(true), caret("p", 0)?)?;
    around.replace_general_range_plain_text(
        &around.snapshot(),
        &range("p", 6, "q", 0)?,
        "",
        &[],
    )?;
    let whole = encode(&c, around.state().document())?;
    assert_eq!(whole["children"], json!([fixture::paragraph("p", "BeforeAfter")]));
    Ok(())
}

#[test]
fn flow_navigation_skips_a_collapsed_body() -> Result {
    let c = context(4)?;
    // Forward from the summary end skips the hidden body to the next block.
    let mut a = owner(&c, &root(false), caret("s", 5)?)?;
    a.navigate_flow(&a.snapshot(), FlowMove::After)?;
    assert!(
        matches!(selection_of(&a), Some(RichSelectionKind::TextRange { ref focus, .. }) if focus.block() == &id("q")?)
    );
    // Backward from the next block enters the summary, not the hidden body.
    let mut b = owner(&c, &root(false), caret("q", 0)?)?;
    b.navigate_flow(&b.snapshot(), FlowMove::Before)?;
    assert!(
        matches!(selection_of(&b), Some(RichSelectionKind::TextRange { ref focus, .. }) if focus.block() == &id("s")?)
    );
    // An open body is an ordinary stop.
    let mut o = owner(&c, &root(true), caret("s", 5)?)?;
    o.navigate_flow(&o.snapshot(), FlowMove::After)?;
    assert!(
        matches!(selection_of(&o), Some(RichSelectionKind::TextRange { ref focus, .. }) if focus.block() == &id("b1")?)
    );
    Ok(())
}

#[test]
fn search_and_replace_traverse_summary_and_body_text() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root(false), caret("p", 0)?)?;
    let query = RichSearchQuery::try_new("o", RichSearchMode::Literal, true, false)?;
    let results = find_rich_text(a.state().document(), &query)?;
    let blocks: Vec<_> = results.matches().iter().map(|m| m.block().as_str().to_owned()).collect();
    assert_eq!(blocks, ["p", "b1", "b1", "b2", "b2"]);
    let title = find_rich_text(
        a.state().document(),
        &RichSearchQuery::try_new("Title", RichSearchMode::Literal, true, false)?,
    )?;
    assert_eq!(title.matches().len(), 1);
    assert_eq!(title.matches()[0].block(), &id("s")?);
    a.replace_search_all(
        &a.snapshot(),
        &title,
        &RichSearchReplacement::try_new("Heading", RichSearchReplacementMode::Literal)?,
    )?;
    assert_eq!(
        encode(&c, a.state().document())?["children"][1]["children"][0],
        summary("s", "Heading")
    );
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
    assert_eq!(a.undo_depth(), 1);
    encode(c, a.state().document())
}

#[test]
fn clipboard_copies_whole_and_partial_sections_and_v3_refuses_them() -> Result {
    let c = context(4)?;
    let raw = root(true);
    let d = admit(&c, &raw)?;
    // A whole section (node selection) round-trips with fresh identities and its open state.
    let node = RichSelection::try_new(&d, RichSelectionKind::Node(id("d")?))?;
    let fragment = RichClipboardFragment::copy_selection(&c, &d, &node)?.ok_or("fragment")?;
    let json = RichClipboardJsonCodec::new(c.clone()).encode(&fragment)?;
    let pasted = paste(&c, &raw, &json)?;
    let copy = pasted["children"].as_array().ok_or("children")?.last().ok_or("last")?.clone();
    assert_eq!(copy["type"], "breditor/details");
    assert_eq!(copy["properties"]["breditor/details-open"], json!(true));
    assert_eq!(copy["children"][0]["type"], "breditor/details-summary");
    assert_eq!(copy["children"][0]["children"][0]["text"], "Title");
    assert_ne!(copy["properties"]["breditor/block-id"], json!("d"));
    // A V3 owner refuses the record outright.
    assert!(RichClipboardJsonCodec::new(context(3)?).decode(&json).is_err());
    // A sibling copy from the summary into the body is ordinary flow (summary → paragraph).
    let partial = RichSelection::try_new(&d, range("s", 2, "b1", 4)?)?;
    let fragment = RichClipboardFragment::copy_selection(&c, &d, &partial)?.ok_or("fragment")?;
    let json = RichClipboardJsonCodec::new(c.clone()).encode(&fragment)?;
    assert!(!json.contains("details-summary"), "{json}");
    let pasted = paste(&c, &raw, &json)?;
    let tail: Vec<_> = pasted["children"].as_array().ok_or("children")?[3..].to_vec();
    assert_eq!(
        tail.iter().map(|n| n["type"].clone()).collect::<Vec<_>>(),
        [json!("breditor/paragraph"), json!("breditor/paragraph")]
    );
    assert_eq!(tail[0]["children"][0]["text"], "tle");
    assert_eq!(tail[1]["children"][0]["text"], "Body");
    Ok(())
}

#[test]
fn block_layout_skips_summaries() -> Result {
    use breditor_core::rich_content::{
        RichBlockAlignment, RichBlockLayoutPatch, RichLayoutChange, inspect_block_layout,
    };
    let c = context(4)?;
    let patch = RichBlockLayoutPatch::try_new(
        RichLayoutChange::Set(RichBlockAlignment::Center),
        RichLayoutChange::Keep,
        RichLayoutChange::Keep,
        RichLayoutChange::Keep,
    )?;
    // A summary caret has no layout target: the read reports zero blocks and a change is refused.
    let mut a = owner(&c, &root(true), caret("s", 1)?)?;
    let read = inspect_block_layout(&c, a.state().document(), a.state().selection())?;
    assert_eq!(read.blocks, 0);
    assert!(a.change_selection_layout(&a.snapshot(), &patch).is_err());
    // A range across the summary changes only the paragraphs around it.
    a.set_selection(&a.snapshot(), Some(range("p", 0, "b1", 2)?))?;
    assert_eq!(inspect_block_layout(&c, a.state().document(), a.state().selection())?.blocks, 2);
    a.change_selection_layout(&a.snapshot(), &patch)?;
    let after = encode(&c, a.state().document())?;
    assert_eq!(after["children"][0]["properties"]["breditor/block-align"], json!(2));
    assert!(
        after["children"][1]["children"][0]["properties"].get("breditor/block-align").is_none()
    );
    assert_eq!(after["children"][1]["children"][1]["properties"]["breditor/block-align"], json!(2));
    assert_eq!(a.undo_depth(), 1);
    Ok(())
}
