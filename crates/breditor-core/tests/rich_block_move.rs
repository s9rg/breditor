//! Local retained block moves: identity, admissions and exact one-group history.
#![cfg(feature = "experimental-rich-content")]

use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichLocalOutcome, RichLocalSession, RichLocalSessionError,
        RichSelectionKind, RichSelectionUpdate, RichTextPoint,
        actions::{MoveBlock, RichAction, RichActionError},
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type TestResult = Result<(), Box<dyn std::error::Error>>;

fn context() -> Result<EditorContext, Box<dyn std::error::Error>> {
    let selector =
        SchemaId::new(QualifiedName::try_new("example/block-move")?, SchemaVersion::try_new(1)?);
    let extensions = ExtensionSet::try_new(vec![], ExtensionLimits::default())?;
    let schema = CompiledSchema::try_compile_rich_content_profile_v2(selector, &extensions)?;
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}
fn id(value: &str) -> Result<BlockId, Box<dyn std::error::Error>> {
    Ok(BlockId::try_new(value)?)
}
fn node(kind: &str, block: &str, children: Vec<Value>) -> Value {
    let mut value = json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":block}});
    value["children"] = Value::Array(children);
    value
}
fn prose(block: &str, content: &str) -> Value {
    node("paragraph", block, vec![json!({"kind":"text","text":content,"formats":[]})])
}
fn task(block: &str, children: Vec<Value>) -> Value {
    let mut value = node("task-item", block, children);
    value["properties"]["breditor/checked"] = json!(false);
    value
}
fn table(prefix: &str, cell_body: Vec<Value>) -> Value {
    let cell = {
        let mut cell = node("table-cell", &format!("{prefix}cell"), cell_body);
        cell["properties"]["breditor/column-id"] = json!(format!("{prefix}c"));
        cell["properties"]["breditor/header"] = json!(false);
        cell
    };
    let mut row = node("table-row", &format!("{prefix}row"), vec![cell]);
    row["properties"]["breditor/row-id"] = json!(format!("{prefix}r"));
    let mut table = node("table", &format!("{prefix}table-block"), vec![row]);
    for (name, value) in [
        ("table-id", json!(format!("{prefix}t"))),
        ("columns", json!([{"id":format!("{prefix}c"),"width":120}])),
        ("merges", json!([])),
        ("retracted-merges", json!([])),
    ] {
        table["properties"][format!("breditor/{name}")] = value;
    }
    table
}
/// a, quote[q1, q2], list[i1[i1p, nested[n1[n1p]]], i2[i2p]], other[o1[o1p]], tasks[k1[k1p]],
/// table[cell[cp]], second table[cell[cp2]], z
fn fixture() -> Value {
    let mut root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"}});
    root["children"] = json!([
        prose("a", "Alpha"),
        node("blockquote", "quote", vec![prose("q1", "Q1"), prose("q2", "Q2")]),
        node(
            "bullet-list",
            "list",
            vec![
                node(
                    "list-item",
                    "i1",
                    vec![
                        prose("i1p", "One"),
                        node(
                            "bullet-list",
                            "nested",
                            vec![node("list-item", "n1", vec![prose("n1p", "Nested")])]
                        ),
                    ]
                ),
                node("list-item", "i2", vec![prose("i2p", "Two")]),
            ]
        ),
        node("bullet-list", "other", vec![node("list-item", "o1", vec![prose("o1p", "Other")])]),
        node("task-list", "tasks", vec![task("k1", vec![prose("k1p", "Task")])]),
        table("", vec![prose("cp", "Cell")]),
        table("second-", vec![prose("cp2", "Cell 2")]),
        prose("z", "Zulu"),
    ]);
    root
}
fn admit(
    context: &EditorContext,
    root: &Value,
) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let value = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":context.schema().id().name().as_str(),"version":1},
        "schemaFingerprint":context.schema().fingerprint().to_string(),"root":root});
    let document = DocumentJsonCodecV2::new(context.schema().clone()).decode(&value.to_string())?;
    Ok(RichDocument::try_admit(context.schema(), document, context.limits())?)
}
fn value(
    context: &EditorContext,
    document: &RichDocument,
) -> Result<Value, Box<dyn std::error::Error>> {
    Ok(serde_json::from_str(
        &DocumentJsonCodecV2::new(context.schema().clone()).encode(document.document())?,
    )?)
}
fn ids(value: &Value) -> Vec<String> {
    value["children"]
        .as_array()
        .map(|children| {
            children
                .iter()
                .filter_map(|child| child["properties"]["breditor/block-id"].as_str())
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}
fn find<'a>(value: &'a Value, block: &str) -> Option<&'a Value> {
    if value["properties"]["breditor/block-id"] == block {
        return Some(value);
    }
    value.get("children")?.as_array()?.iter().find_map(|child| find(child, block))
}
fn capture(
    document: &RichDocument,
    block: &str,
    parent: Option<&str>,
    before: Option<&str>,
) -> Result<MoveBlock, RichActionError> {
    let block = BlockId::try_new(block).map_err(|_| RichActionError::MissingTarget)?;
    let parent =
        parent.map(BlockId::try_new).transpose().map_err(|_| RichActionError::MissingTarget)?;
    let before =
        before.map(BlockId::try_new).transpose().map_err(|_| RichActionError::MissingTarget)?;
    MoveBlock::capture(document, &block, parent.as_ref(), before.as_ref())
}
fn caret(block: &str, offset: u64) -> Result<RichSelectionKind, Box<dyn std::error::Error>> {
    let point = RichTextPoint::new(id(block)?, TextOffset::try_new(offset)?, Affinity::After);
    Ok(RichSelectionKind::TextRange { anchor: point.clone(), focus: point })
}
fn session(
    context: &EditorContext,
    selection: Option<RichSelectionKind>,
) -> Result<RichLocalSession, Box<dyn std::error::Error>> {
    Ok(RichLocalSession::try_new(
        context.clone(),
        admit(context, &fixture())?,
        selection,
        HistoryCapacity::default(),
    )?)
}
fn step(
    owner: &mut RichLocalSession,
    block: &str,
    parent: Option<&str>,
    before: Option<&str>,
) -> Result<RichLocalOutcome, Box<dyn std::error::Error>> {
    let action = capture(owner.state().document(), block, parent, before)?;
    Ok(dispatch(owner, action)?)
}
fn dispatch(
    owner: &mut RichLocalSession,
    action: MoveBlock,
) -> Result<RichLocalOutcome, RichLocalSessionError> {
    owner.dispatch(&owner.snapshot(), &[RichAction::MoveBlock(action)], RichSelectionUpdate::Map)
}

#[test]
fn sibling_move_is_one_history_group_retaining_ids_body_and_selection() -> TestResult {
    let c = context()?;
    let mut owner = session(&c, Some(caret("a", 2)?))?;
    let before = value(&c, owner.state().document())?;
    let action = capture(owner.state().document(), "a", None, Some("z"))?;
    assert_eq!(dispatch(&mut owner, action)?, RichLocalOutcome::ContentCommitted);
    let after = value(&c, owner.state().document())?;
    assert_eq!(
        ids(&after["root"]),
        ["quote", "list", "other", "tasks", "table-block", "second-table-block", "a", "z"]
    );
    assert_eq!(find(&after["root"], "a"), find(&before["root"], "a"), "body and id retained");
    let RichSelectionKind::TextRange { focus, .. } =
        owner.state().selection().ok_or("selection")?.kind()
    else {
        return Err("text selection".into());
    };
    assert_eq!((focus.block().as_str(), focus.offset().get()), ("a", 2));
    assert_eq!(owner.undo_depth(), 1);
    owner.set_selection(&owner.snapshot(), Some(caret("z", 1)?))?;
    owner.undo(&owner.snapshot())?;
    assert_eq!(value(&c, owner.state().document())?, before);
    let restored = owner.state().selection().ok_or("selection")?.kind().clone();
    assert_eq!(restored, caret("a", 2)?);
    owner.redo(&owner.snapshot())?;
    assert_eq!(value(&c, owner.state().document())?, after);
    // The durable checkpoint replays the same exact future history.
    let codec = RichSessionJsonCodec::new(owner.context().clone());
    let mut recovered = codec.decode(&codec.encode(&owner)?)?;
    recovered.undo(&recovered.snapshot())?;
    assert_eq!(value(&c, recovered.state().document())?, before);
    Ok(())
}

#[test]
fn moves_cross_containers_and_list_items_between_lists() -> TestResult {
    let c = context()?;
    let mut owner = session(&c, None)?;
    // Root paragraph into a blockquote, between its children.
    step(&mut owner, "a", Some("quote"), Some("q2"))?;
    // A blockquote child out to the root, before the list.
    step(&mut owner, "q1", None, Some("list"))?;
    // A list item into another list (append).
    step(&mut owner, "i2", Some("other"), None)?;
    // A whole nested list out of its item to the root, before a later root sibling.
    step(&mut owner, "nested", None, Some("other"))?;
    // A paragraph into a table cell and a task item tail.
    step(&mut owner, "z", Some("cell"), None)?;
    step(&mut owner, "q1", Some("k1"), None)?;
    let after = value(&c, owner.state().document())?;
    let root = &after["root"];
    assert_eq!(
        ids(root),
        ["quote", "list", "nested", "other", "tasks", "table-block", "second-table-block"]
    );
    assert_eq!(ids(find(root, "quote").ok_or("quote")?), ["a", "q2"]);
    assert_eq!(ids(find(root, "other").ok_or("other")?), ["o1", "i2"]);
    assert_eq!(ids(find(root, "i1").ok_or("i1")?), ["i1p"]);
    assert_eq!(ids(find(root, "k1").ok_or("k1")?), ["k1p", "q1"]);
    assert_eq!(ids(find(root, "cell").ok_or("cell")?), ["cp", "z"]);
    assert_eq!(owner.undo_depth(), 6);
    for _ in 0..6 {
        owner.undo(&owner.snapshot())?;
    }
    assert_eq!(value(&c, owner.state().document())?, value(&c, &admit(&c, &fixture())?)?);
    Ok(())
}

#[test]
fn rejects_missing_cyclic_foreign_anchor_and_non_flow_sources() -> TestResult {
    let c = context()?;
    let document = admit(&c, &fixture())?;
    let reject = |block, parent, before| capture(&document, block, parent, before).err();
    assert!(matches!(reject("missing", None, None), Some(RichActionError::MissingTarget)));
    assert!(matches!(reject("a", Some("missing"), None), Some(RichActionError::MissingTarget)));
    assert!(matches!(reject("a", None, Some("missing")), Some(RichActionError::MissingTarget)));
    assert!(matches!(reject("list", Some("list"), None), Some(RichActionError::MoveCycle)));
    assert!(matches!(reject("list", Some("n1"), None), Some(RichActionError::MoveCycle)));
    assert!(matches!(reject("a", None, Some("q1")), Some(RichActionError::MoveAnchor)));
    assert!(matches!(reject("a", Some("quote"), Some("z")), Some(RichActionError::MoveAnchor)));
    assert!(matches!(reject("row", None, None), Some(RichActionError::MoveSource)));
    assert!(matches!(reject("cell", None, None), Some(RichActionError::MoveSource)));
    assert!(matches!(reject("a", Some("i1p"), None), Some(RichActionError::FlowParent)));
    assert!(matches!(reject("a", Some("table-block"), None), Some(RichActionError::FlowParent)));
    Ok(())
}

#[test]
fn rejects_emptying_containers_and_item_lead_violations() -> TestResult {
    let c = context()?;
    let document = admit(&c, &fixture())?;
    let reject = |block, parent, before| capture(&document, block, parent, before).err();
    assert!(matches!(reject("cp", None, None), Some(RichActionError::FlowWouldBeEmpty)));
    assert!(matches!(reject("o1", Some("list"), None), Some(RichActionError::FlowWouldBeEmpty)));
    assert!(matches!(reject("k1p", None, None), Some(RichActionError::FlowWouldBeEmpty)));
    // The lead paragraph cannot leave while a nested list would become first.
    assert!(matches!(reject("i1p", None, None), Some(RichActionError::MoveItemLead)));
    // Nothing but a paragraph or heading may become an item's first child.
    assert!(matches!(
        reject("quote", Some("i2"), Some("i2p")),
        Some(RichActionError::MoveItemLead)
    ));
    assert!(matches!(
        reject("nested", Some("k1"), Some("k1p")),
        Some(RichActionError::MoveItemLead)
    ));
    // A heading-led or paragraph-led position remains admitted.
    assert!(capture(&document, "a", Some("i2"), Some("i2p")).is_ok());
    Ok(())
}

#[test]
fn grammar_violations_reject_on_apply_without_publication() -> TestResult {
    let c = context()?;
    let mut owner = session(&c, None)?;
    let before = owner.state().revision();
    for (block, parent, before_anchor) in [
        ("a", Some("list"), None),  // paragraph directly into a list
        ("i2", None, None),         // list item into flow
        ("k1", Some("list"), None), // task item into a bullet list
        ("second-table-block", Some("cell"), None), // table inside a table cell
        ("o1", Some("tasks"), None), // list item into a task list
    ] {
        let action = match capture(owner.state().document(), block, parent, before_anchor) {
            Ok(action) => action,
            // Capture may already prove an empty source; either way nothing publishes.
            Err(RichActionError::FlowWouldBeEmpty) => continue,
            Err(error) => return Err(format!("{block}: unexpected {error:?}").into()),
        };
        assert!(dispatch(&mut owner, action).is_err(), "{block} admitted");
        assert_eq!(owner.state().revision(), before);
    }
    assert_eq!(owner.undo_depth(), 0);
    Ok(())
}

#[test]
fn unchanged_moves_are_no_ops_and_read_only_refuses() -> TestResult {
    let c = context()?;
    let mut owner = session(&c, None)?;
    let observed = owner.state().revision();
    for (block, before) in [("a", Some("a")), ("a", Some("quote")), ("z", None)] {
        let action = capture(owner.state().document(), block, None, before)?;
        assert_eq!(dispatch(&mut owner, action)?, RichLocalOutcome::Unchanged);
    }
    assert_eq!(owner.state().revision(), observed);
    owner.set_read_only(&owner.snapshot(), true)?;
    let action = capture(owner.state().document(), "a", None, Some("z"))?;
    assert!(matches!(dispatch(&mut owner, action), Err(RichLocalSessionError::ReadOnly)));
    assert_eq!(owner.undo_depth(), 0);
    Ok(())
}

#[test]
fn exact_inverse_restores_bytes_and_stale_guard_rejects() -> TestResult {
    let c = context()?;
    let document = admit(&c, &fixture())?;
    let action = RichAction::MoveBlock(capture(&document, "i2", Some("other"), None)?);
    let edit = action.apply(&c, &document)?.ok_or("edit")?;
    let undo = edit.inverse().apply(&c, edit.document())?.ok_or("undo")?;
    assert_eq!(value(&c, undo.document())?, value(&c, &document)?);
    // Applying the original capture again against the moved snapshot is stale.
    assert!(action.apply(&c, edit.document()).is_err());
    Ok(())
}

#[test]
fn image_captions_are_not_general_flow_children() -> TestResult {
    let selector =
        SchemaId::new(QualifiedName::try_new("example/block-move")?, SchemaVersion::try_new(1)?);
    let extensions = ExtensionSet::try_new(vec![], ExtensionLimits::default())?;
    let c = EditorContext::new(
        CompiledSchema::try_compile_rich_content_profile(selector, &extensions)?,
        DocumentLimits::default(),
    );
    let root: Value = serde_json::from_str(include_str!("fixtures/rich-local-root.json"))?;
    let document = admit(&c, &root)?;
    assert!(matches!(capture(&document, "caption", None, None), Err(RichActionError::MoveSource)));
    assert!(matches!(
        capture(&document, "p", Some("image-block"), None),
        Err(RichActionError::FlowParent)
    ));
    // The whole image (with its caption) moves as one retained subtree in V1 too.
    let action = RichAction::MoveBlock(capture(&document, "image-block", Some("cell"), Some("p"))?);
    let edit = action.apply(&c, &document)?.ok_or("edit")?;
    let after = value(&c, edit.document())?;
    assert_eq!(ids(find(&after["root"], "cell").ok_or("cell")?), ["image-block", "p"]);
    assert_eq!(ids(find(&after["root"], "image-block").ok_or("image")?), ["caption"]);
    Ok(())
}
