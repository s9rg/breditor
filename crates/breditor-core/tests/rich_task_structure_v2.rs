//! Task-only indentation, promotion and empty-item exit with exact guarded local history.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichLocalSession, RichSelectionKind, RichSelectionUpdate,
        RichTextPoint,
        actions::{
            ExitTaskItem, IndentListItems, IndentTaskItems, OutdentListItems, OutdentTaskItems,
            RichAction, RichActionError, SetTaskChecked,
        },
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn id(value: &str) -> Result<BlockId> {
    Ok(BlockId::try_new(value)?)
}
fn context() -> Result<EditorContext> {
    let schema = CompiledSchema::try_compile_rich_content_profile_v2(
        SchemaId::new(
            QualifiedName::try_new("example/task-structure")?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}
fn node(kind: &str, block: &str, children: Vec<Value>) -> Value {
    let mut value = json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":block}});
    value["children"] = Value::Array(children);
    value
}
fn prose(block: &str, content: &str) -> Value {
    node(
        "paragraph",
        block,
        if content.is_empty() {
            vec![]
        } else {
            vec![json!({"kind":"text","text":content,"formats":[]})]
        },
    )
}
fn task(block: &str, checked: bool, content: &str, tail: Vec<Value>) -> Value {
    let mut body = vec![prose(&format!("{block}-head"), content)];
    body.extend(tail);
    let mut value = node("task-item", block, body);
    value["properties"]["breditor/checked"] = json!(checked);
    value
}
fn list(block: &str, items: Vec<Value>) -> Value {
    node("task-list", block, items)
}
fn root(children: Vec<Value>) -> Value {
    let mut value = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"}});
    value["children"] = Value::Array(children);
    value
}
fn admit(c: &EditorContext, root: Value) -> Result<RichDocument> {
    let mut input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":c.schema().id().name().as_str(),"version":1},"schemaFingerprint":c.schema().fingerprint().to_string()});
    input["root"] = root;
    let document = DocumentJsonCodecV2::new(c.schema().clone())
        .with_limits(c.limits().clone())
        .decode(&input.to_string())?;
    Ok(RichDocument::try_admit(c.schema(), document, c.limits())?)
}
fn session(c: &EditorContext, root: Value) -> Result<RichLocalSession> {
    Ok(RichLocalSession::try_new(c.clone(), admit(c, root)?, None, HistoryCapacity::default())?)
}
fn document(s: &RichLocalSession) -> Result<Value> {
    Ok(serde_json::from_str(
        &DocumentJsonCodecV2::new(s.context().schema().clone())
            .encode(s.state().document().document())?,
    )?)
}
fn find<'a>(value: &'a Value, block: &str) -> Option<&'a Value> {
    if let Some(root) = value.get("root") {
        return find(root, block);
    }
    if value["properties"]["breditor/block-id"] == block {
        return Some(value);
    }
    value.get("children")?.as_array()?.iter().find_map(|child| find(child, block))
}
fn run(s: &mut RichLocalSession, action: RichAction) -> Result {
    s.dispatch(&s.snapshot(), &[action], RichSelectionUpdate::Map)?;
    Ok(())
}
fn select(s: &mut RichLocalSession, a: &str, f: &str, offset: u64) -> Result {
    let point = |block| -> Result<RichTextPoint> {
        Ok(RichTextPoint::new(id(block)?, TextOffset::try_new(offset)?, Affinity::After))
    };
    s.dispatch(
        &s.snapshot(),
        &[],
        RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
            anchor: point(a)?,
            focus: point(f)?,
        })),
    )?;
    Ok(())
}
fn future(s: &mut RichLocalSession) -> Result {
    let codec = RichSessionJsonCodec::new(s.context().clone());
    let saved = codec.encode(s)?;
    let mut restored = codec.decode(&saved)?;
    assert_eq!(codec.encode(&restored)?, saved);
    let depth = s.undo_depth();
    for redo in [false, true] {
        for _ in 0..depth {
            if redo {
                s.redo(&s.snapshot())?;
                restored.redo(&restored.snapshot())?;
            } else {
                s.undo(&s.snapshot())?;
                restored.undo(&restored.snapshot())?;
            }
            assert_eq!(codec.encode(s)?, codec.encode(&restored)?);
        }
    }
    Ok(())
}

#[test]
fn indent_creates_or_appends_only_a_trailing_task_list_and_retains_exact_tasks() -> Result {
    for existing in [false, true] {
        let c = context()?;
        let mut tail = vec![node("blockquote", "quote", vec![prose("quoted", "Earlier flow")])];
        if existing {
            tail.push(list("nested", vec![task("old", false, "Old", vec![])]));
        }
        let b = task("b", false, "🙂B", vec![node("horizontal-rule", "rule", vec![])]);
        let d = task(
            "d",
            true,
            "🙂D",
            vec![node("blockquote", "tail", vec![prose("tail-p", "Later")])],
        );
        let mut s = session(
            &c,
            root(vec![list("tasks", vec![task("a", true, "A", tail), b.clone(), d.clone()])]),
        )?;
        select(&mut s, "d-head", "b-head", 2)?;
        let selection = s.state().selection().cloned();
        let fresh = id("fresh")?;
        if existing {
            assert!(
                IndentTaskItems::capture(
                    s.state().document(),
                    &id("tasks")?,
                    &id("b")?,
                    &id("d")?,
                    Some(&fresh)
                )
                .is_err()
            );
        }
        let action = IndentTaskItems::capture(
            s.state().document(),
            &id("tasks")?,
            &id("b")?,
            &id("d")?,
            if existing { None } else { Some(&fresh) },
        )?;
        run(&mut s, RichAction::IndentTaskItems(action))?;
        let value = document(&s)?;
        assert_eq!(find(&value, "b"), Some(&b));
        assert_eq!(find(&value, "d"), Some(&d));
        let nested = find(&value, if existing { "nested" } else { "fresh" }).ok_or("nested")?;
        assert_eq!(
            nested["children"].as_array().ok_or("items")?.len(),
            if existing { 3 } else { 2 }
        );
        assert_eq!(
            s.state().selection().map(breditor_core::rich_content::RichSelection::kind),
            selection.as_ref().map(breditor_core::rich_content::RichSelection::kind)
        );
        assert_eq!(s.undo_depth(), 1);
        future(&mut s)?;
    }
    Ok(())
}

#[test]
fn nested_middle_outdent_retains_checked_values_prefix_suffix_and_parent_tail_order() -> Result {
    let c = context()?;
    let b =
        task("b", false, "B", vec![node("blockquote", "b-quote", vec![prose("b-tail", "B tail")])]);
    let d = task("d", true, "D", vec![]);
    let suffix = task("suffix", true, "Suffix", vec![]);
    let after = node("horizontal-rule", "after", vec![]);
    let source = root(vec![list(
        "outer",
        vec![
            task(
                "parent",
                true,
                "Parent",
                vec![
                    list(
                        "nested",
                        vec![
                            task("prefix", false, "Prefix", vec![]),
                            b.clone(),
                            d.clone(),
                            suffix.clone(),
                        ],
                    ),
                    after.clone(),
                ],
            ),
            task("last", false, "Last", vec![]),
        ],
    )]);
    let mut s = session(&c, source)?;
    select(&mut s, "b-head", "d-head", 0)?;
    let action = OutdentTaskItems::capture(
        s.state().document(),
        &id("nested")?,
        &id("b")?,
        &id("d")?,
        Some(&id("fresh-tail")?),
    )?;
    run(&mut s, RichAction::OutdentTaskItems(action))?;
    let value = document(&s)?;
    let outer = find(&value, "outer").ok_or("outer")?;
    assert_eq!(outer["children"][1], b);
    let mut expected = d;
    expected["children"]
        .as_array_mut()
        .ok_or("body")?
        .extend([list("fresh-tail", vec![suffix]), after]);
    assert_eq!(outer["children"][2], expected);
    assert_eq!(
        find(&value, "nested").ok_or("prefix")?["children"].as_array().ok_or("items")?.len(),
        1
    );
    assert_eq!(outer["children"][0]["properties"]["breditor/checked"], true);
    assert_eq!(s.undo_depth(), 1);
    future(&mut s)
}

#[test]
fn top_level_middle_outdent_preserves_every_rich_body_block_and_exact_completion_inverse() -> Result
{
    let c = context()?;
    let prefix = task("a", true, "A", vec![]);
    let selected = task(
        "b",
        false,
        "B",
        vec![
            node("blockquote", "quote", vec![prose("q", "Quoted")]),
            node("horizontal-rule", "rule", vec![]),
        ],
    );
    let suffix = task("d", true, "D", vec![]);
    let mut s = session(
        &c,
        root(vec![list("tasks", vec![prefix.clone(), selected.clone(), suffix.clone()])]),
    )?;
    let action = OutdentTaskItems::capture(
        s.state().document(),
        &id("tasks")?,
        &id("b")?,
        &id("b")?,
        Some(&id("suffix")?),
    )?;
    run(&mut s, RichAction::OutdentTaskItems(action))?;
    let mut expected = vec![list("tasks", vec![prefix])];
    expected.extend(selected["children"].as_array().ok_or("body")?.clone());
    expected.push(list("suffix", vec![suffix]));
    assert_eq!(document(&s)?["root"], root(expected));
    future(&mut s)
}

#[test]
fn empty_exit_handles_first_middle_last_and_sole_tasks_without_new_text_identity() -> Result {
    for (prefix, suffix) in [(false, false), (false, true), (true, false), (true, true)] {
        let c = context()?;
        let mut items = vec![];
        if prefix {
            items.push(task("prefix", true, "Before", vec![]));
        }
        items.push(task("empty", true, "", vec![]));
        if suffix {
            items.push(task("suffix", false, "After", vec![]));
        }
        let mut s = session(&c, root(vec![list("tasks", items)]))?;
        select(&mut s, "empty-head", "empty-head", 0)?;
        let tail = id("fresh-tail")?;
        let action = ExitTaskItem::capture(
            s.state().document(),
            &id("tasks")?,
            &id("empty")?,
            if prefix && suffix { Some(&tail) } else { None },
        )?;
        run(&mut s, RichAction::ExitTaskItem(action))?;
        let value = document(&s)?;
        assert!(find(&value, "empty").is_none());
        assert_eq!(find(&value, "empty-head"), Some(&prose("empty-head", "")));
        let RichSelectionKind::TextRange { focus, .. } =
            s.state().selection().ok_or("selection")?.kind()
        else {
            return Err("caret".into());
        };
        assert_eq!(focus.block().as_str(), "empty-head");
        assert_eq!(focus.offset().get(), 0);
        future(&mut s)?;
    }
    Ok(())
}

#[test]
fn nested_empty_exit_promotes_one_level_and_retains_its_completion_and_following_flow() -> Result {
    let c = context()?;
    let after = prose("after", "Parent tail");
    let mut empty = task("empty", true, "", vec![]);
    empty["children"][0]["type"] = json!("breditor/heading");
    empty["children"][0]["properties"]["breditor/level"] = json!(6);
    let mut s = session(
        &c,
        root(vec![list(
            "outer",
            vec![task(
                "parent",
                false,
                "P",
                vec![list("nested", vec![empty.clone()]), after.clone()],
            )],
        )]),
    )?;
    let action = ExitTaskItem::capture(s.state().document(), &id("nested")?, &id("empty")?, None)?;
    run(&mut s, RichAction::ExitTaskItem(action))?;
    empty["children"].as_array_mut().ok_or("body")?.push(after);
    let value = document(&s)?;
    assert_eq!(find(&value, "outer").ok_or("outer")?["children"][1], empty);
    assert!(find(&value, "nested").is_none());
    future(&mut s)
}

#[test]
fn task_actions_reject_wrong_kinds_missing_unused_ids_and_nonempty_exit() -> Result {
    let c = context()?;
    let value = root(vec![
        list(
            "tasks",
            vec![
                task("a", false, "A", vec![]),
                task("b", true, "", vec![node("horizontal-rule", "rule", vec![])]),
            ],
        ),
        node(
            "bullet-list",
            "ordinary",
            vec![node("list-item", "item", vec![prose("ordinary-head", "O")])],
        ),
    ]);
    let s = session(&c, value)?;
    let d = s.state().document();
    assert!(
        IndentTaskItems::capture(d, &id("tasks")?, &id("a")?, &id("a")?, Some(&id("fresh")?))
            .is_err()
    );
    assert!(IndentTaskItems::capture(d, &id("tasks")?, &id("b")?, &id("b")?, None).is_err());
    assert!(
        IndentTaskItems::capture(d, &id("ordinary")?, &id("item")?, &id("item")?, None).is_err()
    );
    assert!(OutdentTaskItems::capture(d, &id("tasks")?, &id("b")?, &id("a")?, None).is_err());
    assert!(
        OutdentTaskItems::capture(d, &id("tasks")?, &id("a")?, &id("a")?, Some(&id("unused")?))
            .is_err()
    );
    assert!(matches!(
        ExitTaskItem::capture(d, &id("tasks")?, &id("a")?, None),
        Err(RichActionError::TaskNotEmpty)
    ));
    assert!(matches!(
        ExitTaskItem::capture(d, &id("tasks")?, &id("b")?, None),
        Err(RichActionError::TaskNotEmpty)
    ));
    assert!(IndentListItems::capture(d, &id("tasks")?, &id("b")?, &id("b")?, None).is_err());
    assert!(OutdentListItems::capture(d, &id("tasks")?, &id("a")?, &id("a")?, None).is_err());
    Ok(())
}

#[test]
fn empty_exit_in_quotes_cells_and_ordinary_item_tails_keeps_its_actual_flow_parent() -> Result {
    for parent in ["quote", "cell", "ordinary"] {
        let c = context()?;
        let tasks = list("tasks", vec![task("empty", true, "", vec![])]);
        let source = match parent {
            "quote" => node("blockquote", "quote", vec![tasks]),
            "ordinary" => node(
                "bullet-list",
                "ordinary",
                vec![node(
                    "list-item",
                    "ordinary-item",
                    vec![prose("ordinary-head", "Ordinary"), tasks],
                )],
            ),
            _ => {
                let mut table = node(
                    "table",
                    "table-block",
                    vec![node(
                        "table-row",
                        "row-block",
                        vec![node("table-cell", "cell-block", vec![tasks])],
                    )],
                );
                table["properties"] = json!({"breditor/block-id":"table-block","breditor/table-id":"t","breditor/columns":[{"id":"c","width":120}],"breditor/merges":[],"breditor/retracted-merges":[]});
                table["children"][0]["properties"]["breditor/row-id"] = json!("r");
                table["children"][0]["children"][0]["properties"]["breditor/column-id"] =
                    json!("c");
                table["children"][0]["children"][0]["properties"]["breditor/header"] = json!(false);
                table
            }
        };
        let mut s = session(&c, root(vec![source]))?;
        let action =
            ExitTaskItem::capture(s.state().document(), &id("tasks")?, &id("empty")?, None)?;
        run(&mut s, RichAction::ExitTaskItem(action))?;
        let value = document(&s)?;
        let parent_id = match parent {
            "quote" => "quote",
            "ordinary" => "ordinary-item",
            _ => "cell-block",
        };
        let children =
            find(&value, parent_id).ok_or("parent")?["children"].as_array().ok_or("children")?;
        assert_eq!(children.last(), Some(&prose("empty-head", "")));
        if parent == "ordinary" {
            assert_eq!(children.first(), Some(&prose("ordinary-head", "Ordinary")));
        }
        assert!(find(&value, "tasks").is_none());
        future(&mut s)?;
    }
    Ok(())
}

#[test]
fn stale_duplicate_late_batch_and_tight_policy_fail_without_partial_history() -> Result {
    let c = context()?;
    let source = root(vec![list(
        "tasks",
        vec![task("a", false, "A", vec![]), task("b", true, "B", vec![])],
    )]);
    let mut s = session(&c, source)?;
    let codec = RichSessionJsonCodec::new(c.clone());
    let before = codec.encode(&s)?;
    let capture = |s: &RichLocalSession, nested: &str| -> Result<RichAction> {
        Ok(RichAction::IndentTaskItems(IndentTaskItems::capture(
            s.state().document(),
            &id("tasks")?,
            &id("b")?,
            &id("b")?,
            Some(&id(nested)?),
        )?))
    };
    assert!(
        s.dispatch(&s.snapshot(), &[capture(&s, "a-head")?], RichSelectionUpdate::Map).is_err()
    );
    assert_eq!(codec.encode(&s)?, before);
    let first = capture(&s, "fresh")?;
    let late =
        RichAction::SetTaskChecked(SetTaskChecked::capture(s.state().document(), &id("a")?, true)?);
    assert!(s.dispatch(&s.snapshot(), &[first.clone(), late], RichSelectionUpdate::Map).is_err());
    assert_eq!(codec.encode(&s)?, before);
    for limits in [
        DocumentLimits::default().with_max_nodes(8),
        DocumentLimits::default().with_max_node_depth(5),
    ] {
        let tight = EditorContext::new(c.schema().clone(), limits);
        RichDocument::try_admit(
            tight.schema(),
            s.state().document().clone().into_document(),
            tight.limits(),
        )?;
        assert!(first.apply(&tight, s.state().document()).is_err());
    }
    let observation = s.snapshot();
    let change = SetTaskChecked::capture(s.state().document(), &id("b")?, false)?;
    run(&mut s, RichAction::SetTaskChecked(change))?;
    let changed = codec.encode(&s)?;
    assert!(
        s.dispatch(&observation, std::slice::from_ref(&first), RichSelectionUpdate::Map).is_err()
    );
    assert_eq!(codec.encode(&s)?, changed);
    assert!(first.apply(&c, s.state().document()).is_err());
    future(&mut s)
}
