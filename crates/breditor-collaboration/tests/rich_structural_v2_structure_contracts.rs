//! Retained shared V2 structure, selective author history and exact native recovery.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedRichProfile,
        actions::{
            CodeFormatPolicy, DeleteBlock, DeleteHorizontalRule, DeleteText, ExitTaskItem,
            IndentTaskItems, InsertHorizontalRule, InsertText, JoinTaskItems, NewTaskItem,
            OutdentTaskItems, PasteBlocks, SetCodeBlock, SetCodeLanguage, SetTaskChecked,
            SplitTaskItem, UnwrapBlockquote, UnwrapTaskList, WrapBlockquote, WrapTaskList,
        },
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn element(kind: &str, id: &str, children: Vec<Value>) -> Value {
    let mut node = json!({"kind":"element","type":kind,"entityId":null,"properties":{"breditor/block-id":id},"children":[]});
    node["children"] = Value::Array(children);
    node
}
fn prose(id: &str, text: &str) -> Value {
    element(
        "breditor/paragraph",
        id,
        if text.is_empty() {
            vec![]
        } else {
            vec![json!({"kind":"text","text":text,"formats":[]})]
        },
    )
}
fn task(id: &str, text: &str, checked: bool, tail: Vec<Value>) -> Value {
    let mut body = vec![prose(&format!("{id}-head"), text)];
    body.extend(tail);
    let mut node = element("breditor/task-item", id, body);
    node["properties"]["breditor/checked"] = json!(checked);
    node
}
fn list(id: &str, items: Vec<Value>) -> Value {
    element("breditor/task-list", id, items)
}
fn quote(id: &str, body: Vec<Value>) -> Value {
    element("breditor/blockquote", id, body)
}
fn profile() -> Result<SharedRichProfile> {
    Ok(SharedRichProfile::from_standard_configuration_json_v2(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":2,"schema":{"name":"example/shared-structural-actions","version":2},"extensions":[]}"#,
    )?)
}
fn source(profile: &SharedRichProfile, children: Vec<Value>) -> String {
    let schema = profile.schema();
    let mut value = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[]}});
    value["root"]["children"] = Value::Array(children);
    value.to_string()
}
fn room(children: Vec<Value>) -> Result<(SharedRichProfile, RichReplica)> {
    let profile = profile()?;
    let owner = profile.create(&source(&profile, children), "101".into())?;
    Ok((profile, owner))
}
fn ast(owner: &RichReplica) -> Result<Value> {
    Ok(serde_json::from_str(owner.document_json())?)
}
fn find<'a>(node: &'a Value, id: &str) -> Option<&'a Value> {
    if node.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(id) {
        return Some(node);
    }
    node.get("children")?.as_array()?.iter().find_map(|child| find(child, id))
}
fn ids(node: &Value) -> Result<Vec<String>> {
    node["children"]
        .as_array()
        .ok_or("children")?
        .iter()
        .map(|child| {
            child
                .pointer("/properties/breditor~1block-id")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .ok_or("child identity".into())
        })
        .collect()
}
fn text(owner: &RichReplica, id: &str) -> Result<String> {
    Ok(find(&ast(owner)?["root"], id).ok_or("text block")?["children"]
        .as_array()
        .ok_or("runs")?
        .iter()
        .filter_map(|run| run["text"].as_str())
        .collect())
}
fn insert(block: &str, offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset, text: text.into() })
}
fn checked(block: &str, checked: bool) -> Command {
    Command::SetTaskChecked(SetTaskChecked { block: block.into(), checked })
}
fn apply(owner: &mut RichReplica, commands: Vec<Command>) -> Result<bool> {
    owner.apply(commands).map_err(|error| {
        format!(
            "shared structural action: {error}; checkpoint={}",
            owner.checkpoint().unwrap_or_else(|e| e.to_string())
        )
        .into()
    })
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> Result {
    let x = a.update_frame()?;
    let y = b.update_frame()?;
    a.receive_frame(&y)?;
    b.receive_frame(&x)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}
fn future(profile: &SharedRichProfile, owner: &mut RichReplica) -> Result {
    let checkpoint = owner.checkpoint()?;
    let mut restored = profile
        .restore("room", &checkpoint)
        .map_err(|error| format!("initial restore: {error}; checkpoint={checkpoint}"))?;
    let count = owner.undo_count() + 1;
    for redo in [false, true] {
        for _ in 0..count {
            let checkpoint = owner.checkpoint()?;
            let result = if redo { owner.redo() } else { owner.undo() }.map_err(|error| {
                format!("live history redo={redo}: {error}; checkpoint={checkpoint}")
            })?;
            let result2 =
                if redo { restored.redo() } else { restored.undo() }.map_err(|error| {
                    format!("restored history redo={redo}: {error}; checkpoint={checkpoint}")
                })?;
            assert_eq!(result, result2);
            assert_eq!(owner.checkpoint()?, restored.checkpoint()?);
        }
    }
    Ok(())
}

#[test]
fn quotes_wrap_and_unwrap_retained_flow_without_erasing_offline_text() -> Result {
    let (profile, mut a) = room(vec![
        prose("p", "a🙂b"),
        quote("inner", vec![prose("q", "Details")]),
        element("breditor/horizontal-rule", "rule", vec![]),
    ])?;
    let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
    apply(
        &mut a,
        vec![Command::WrapBlockquote(WrapBlockquote {
            first: "p".into(),
            last: "rule".into(),
            wrapper: "outer".into(),
        })],
    )?;
    apply(&mut b, vec![insert("p", 0, "Remote ")])?;
    sync(&mut a, &mut b)?;
    let projected = ast(&a)?;
    assert_eq!(ids(find(&projected["root"], "outer").ok_or("quote")?)?, ["p", "inner", "rule"]);
    assert_eq!(text(&a, "p")?, "Remote a🙂b");
    apply(&mut a, vec![Command::UnwrapBlockquote(UnwrapBlockquote { wrapper: "outer".into() })])?;
    assert_eq!(ids(&ast(&a)?["root"])?, ["p", "inner", "rule"]);
    future(&profile, &mut a)?;
    assert_eq!(text(&a, "p")?, "Remote a🙂b");
    Ok(())
}

#[test]
fn task_wrap_defaults_and_later_foreign_completion_survive_creator_undo() -> Result {
    let (profile, mut a) = room(vec![
        prose("p", "First"),
        element(
            "breditor/code-block",
            "code",
            vec![json!({"kind":"text","text":"let x = 1;","formats":[]})],
        ),
        prose("q", "Second"),
        quote("tail", vec![prose("tail-head", "Tail")]),
    ])?;
    let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
    apply(
        &mut a,
        vec![Command::WrapTaskList(WrapTaskList {
            first: "p".into(),
            last: "tail".into(),
            container: "tasks".into(),
            items: vec![
                NewTaskItem { block: "a".into(), checked: true },
                NewTaskItem { block: "b".into(), checked: false },
            ],
        })],
    )?;
    apply(&mut b, vec![insert("q", 0, "Remote ")])?;
    sync(&mut a, &mut b)?;
    apply(&mut b, vec![checked("b", true)])?;
    sync(&mut a, &mut b)?;
    let projected = ast(&a)?;
    assert_eq!(ids(find(&projected["root"], "a").ok_or("task")?)?, ["p", "code"]);
    assert_eq!(ids(find(&projected["root"], "b").ok_or("task")?)?, ["q", "tail"]);
    a.undo()?;
    assert_eq!(ids(&ast(&a)?["root"])?, ["p", "code", "q", "tail"]);
    assert_eq!(text(&a, "q")?, "Remote Second");
    a.redo()?;
    assert_eq!(find(&ast(&a)?["root"], "b").ok_or("task")?["properties"]["breditor/checked"], true);
    apply(&mut a, vec![Command::UnwrapTaskList(UnwrapTaskList { container: "tasks".into() })])?;
    assert_eq!(ids(&ast(&a)?["root"])?, ["p", "code", "q", "tail"]);
    future(&profile, &mut a)
}

#[test]
fn task_indent_and_promotion_preserve_completion_tails_and_foreign_body_edits() -> Result {
    let (profile, mut a) = room(vec![list(
        "tasks",
        vec![
            task("a", "A", true, vec![]),
            task("b", "B🙂", false, vec![quote("tail", vec![prose("tail-head", "Tail")])]),
            task("c", "C", true, vec![]),
        ],
    )])?;
    let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
    apply(
        &mut a,
        vec![Command::IndentTaskItems(IndentTaskItems {
            container: "tasks".into(),
            first: "b".into(),
            last: "c".into(),
            new_nested: Some("nested".into()),
        })],
    )?;
    apply(&mut b, vec![checked("b", true), insert("b-head", 0, "Remote ")])?;
    sync(&mut a, &mut b)?;
    assert_eq!(ids(find(&ast(&a)?["root"], "nested").ok_or("nested")?)?, ["b", "c"]);
    a.undo()?;
    assert_eq!(ids(find(&ast(&a)?["root"], "tasks").ok_or("tasks")?)?, ["a", "b", "c"]);
    assert_eq!(find(&ast(&a)?["root"], "b").ok_or("b")?["properties"]["breditor/checked"], true);
    a.redo()?;
    apply(
        &mut a,
        vec![Command::OutdentTaskItems(OutdentTaskItems {
            container: "nested".into(),
            first: "b".into(),
            last: "c".into(),
            fresh_tail: None,
        })],
    )?;
    assert_eq!(ids(find(&ast(&a)?["root"], "tasks").ok_or("tasks")?)?, ["a", "b", "c"]);
    assert_eq!(text(&a, "b-head")?, "Remote B🙂");
    assert!(find(&ast(&a)?["root"], "tail").is_some());
    future(&profile, &mut a)
}

#[test]
fn task_split_routes_offline_suffix_and_restores_both_completion_fields() -> Result {
    let (profile, mut a) = room(vec![list(
        "tasks",
        vec![task("a", "a🙂b", true, vec![quote("tail", vec![prose("tail-head", "Tail")])])],
    )])?;
    let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
    let point = TextPoint { block: "a-head".into(), offset: 3, affinity: Affinity::After };
    b.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    apply(
        &mut a,
        vec![Command::SplitTaskItem(SplitTaskItem {
            block: "a-head".into(),
            offset: 1,
            new_item: "right-task".into(),
            right: "right-head".into(),
            right_heading: Some(2),
        })],
    )?;
    apply(&mut b, vec![insert("a-head", 3, "R"), checked("a", false)])?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&a, "a-head")?, "a");
    assert_eq!(text(&a, "right-head")?, "🙂Rb");
    assert_eq!(
        ids(find(&ast(&a)?["root"], "right-task").ok_or("right task")?)?,
        ["right-head", "tail"]
    );
    assert_eq!(
        find(&ast(&a)?["root"], "right-task").ok_or("right task")?["properties"]["breditor/checked"],
        false
    );
    let Selection::TextRange { focus, .. } = b.selection()?.ok_or("mapped selection")? else {
        return Err("text selection".into());
    };
    assert_eq!(focus.block, "right-head");
    apply(&mut b, vec![checked("right-task", true)])?;
    sync(&mut a, &mut b)?;
    a.undo()?;
    assert_eq!(text(&a, "a-head")?, "a🙂Rb");
    assert_eq!(find(&ast(&a)?["root"], "a").ok_or("a")?["properties"]["breditor/checked"], false);
    a.redo()?;
    assert_eq!(
        find(&ast(&a)?["root"], "right-task").ok_or("right")?["properties"]["breditor/checked"],
        true
    );
    future(&profile, &mut a)
}

#[test]
fn task_join_respects_left_rich_tail_and_undo_keeps_remote_right_completion() -> Result {
    for rich_tail in [false, true] {
        let tail =
            if rich_tail { vec![quote("tail", vec![prose("tail-head", "Tail")])] } else { vec![] };
        let (profile, mut a) = room(vec![list(
            "tasks",
            vec![task("a", "A", true, tail), task("b", "B🙂", false, vec![])],
        )])?;
        let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
        apply(
            &mut a,
            vec![Command::JoinTaskItems(JoinTaskItems {
                container: "tasks".into(),
                left: "a".into(),
                right: "b".into(),
            })],
        )?;
        apply(&mut b, vec![insert("b-head", 0, "Remote "), checked("b", true)])?;
        sync(&mut a, &mut b)?;
        assert_eq!(ids(find(&ast(&a)?["root"], "tasks").ok_or("tasks")?)?, ["a"]);
        if rich_tail {
            assert_eq!(
                ids(find(&ast(&a)?["root"], "a").ok_or("a")?)?,
                ["a-head", "tail", "b-head"]
            );
            assert_eq!(text(&a, "b-head")?, "Remote B🙂");
        } else {
            assert_eq!(text(&a, "a-head")?, "ARemote B🙂");
        }
        a.undo()?;
        assert_eq!(
            find(&ast(&a)?["root"], "b").ok_or("b")?["properties"]["breditor/checked"],
            true
        );
        assert_eq!(text(&a, "b-head")?, "Remote B🙂");
        a.redo()?;
        future(&profile, &mut a)?;
    }
    Ok(())
}

#[test]
fn nested_task_outdent_keeps_prefix_suffix_and_later_parent_flow_in_reading_order() -> Result {
    let nested = list(
        "nested",
        vec![
            task("x", "X", true, vec![]),
            task("y", "Y", false, vec![]),
            task("z", "Z", true, vec![]),
        ],
    );
    let (profile, mut a) = room(vec![list(
        "tasks",
        vec![
            task("a", "A", true, vec![nested, quote("after", vec![prose("after-head", "After")])]),
            task("d", "D", false, vec![]),
        ],
    )])?;
    let before = a.checkpoint()?;
    assert!(
        apply(
            &mut a,
            vec![Command::OutdentTaskItems(OutdentTaskItems {
                container: "nested".into(),
                first: "y".into(),
                last: "y".into(),
                fresh_tail: None
            })]
        )
        .is_err()
    );
    assert_eq!(a.checkpoint()?, before);
    apply(
        &mut a,
        vec![Command::OutdentTaskItems(OutdentTaskItems {
            container: "nested".into(),
            first: "y".into(),
            last: "y".into(),
            fresh_tail: Some("suffix".into()),
        })],
    )?;
    let projected = ast(&a)?;
    assert_eq!(ids(find(&projected["root"], "tasks").ok_or("tasks")?)?, ["a", "y", "d"]);
    assert_eq!(ids(find(&projected["root"], "nested").ok_or("prefix")?)?, ["x"]);
    assert_eq!(
        ids(find(&projected["root"], "y").ok_or("promoted task")?)?,
        ["y-head", "suffix", "after"]
    );
    assert_eq!(ids(find(&projected["root"], "suffix").ok_or("suffix")?)?, ["z"]);
    future(&profile, &mut a)
}

#[test]
fn truly_empty_middle_task_exit_preserves_heading_and_concurrent_typing() -> Result {
    let mut empty = task("empty", "", true, vec![]);
    empty["children"][0]["type"] = json!("breditor/heading");
    empty["children"][0]["properties"]["breditor/level"] = json!(3);
    let (profile, mut a) = room(vec![quote(
        "quote",
        vec![list(
            "tasks",
            vec![task("a", "A", false, vec![]), empty, task("c", "C", true, vec![])],
        )],
    )])?;
    let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
    apply(
        &mut a,
        vec![Command::ExitTaskItem(ExitTaskItem {
            container: "tasks".into(),
            item: "empty".into(),
            fresh_tail: Some("suffix".into()),
        })],
    )?;
    apply(&mut b, vec![insert("empty-head", 0, "Remote ")])?;
    sync(&mut a, &mut b)?;
    let projected = ast(&a)?;
    assert_eq!(
        ids(find(&projected["root"], "quote").ok_or("quote")?)?,
        ["tasks", "empty-head", "suffix"]
    );
    assert_eq!(
        find(&projected["root"], "empty-head").ok_or("heading")?["properties"]["breditor/level"],
        3
    );
    assert_eq!(text(&a, "empty-head")?, "Remote ");
    a.undo()?;
    assert_eq!(
        find(&ast(&a)?["root"], "empty").ok_or("task")?["properties"]["breditor/checked"],
        true
    );
    assert_eq!(text(&a, "empty-head")?, "Remote ");
    a.redo()?;
    future(&profile, &mut a)
}

#[test]
fn deleting_a_task_or_quote_head_then_unwrapping_retains_the_normalized_source() -> Result {
    for is_task in [false, true] {
        let body = if is_task {
            list("wrapper", vec![task("a", "A", true, vec![])])
        } else {
            quote("wrapper", vec![prose("a-head", "A")])
        };
        let (profile, mut a) = room(vec![body, prose("after", "After")])?;
        let unwrap = if is_task {
            Command::UnwrapTaskList(UnwrapTaskList { container: "wrapper".into() })
        } else {
            Command::UnwrapBlockquote(UnwrapBlockquote { wrapper: "wrapper".into() })
        };
        apply(&mut a, vec![Command::DeleteBlock(DeleteBlock { block: "a-head".into() }), unwrap])?;
        let projected = ast(&a)?;
        let head = ids(&projected["root"])?[0].clone();
        assert!(head.starts_with("breditor-virtual:"));
        apply(&mut a, vec![insert(&head, 0, "Normalized")])?;
        assert_eq!(text(&a, &head)?, "Normalized");
        future(&profile, &mut a)?;
    }
    Ok(())
}

#[test]
fn rule_insert_retains_normalized_text_and_delete_requires_explicit_replacement() -> Result {
    let (profile, mut a) = room(vec![prose("seed", "Seed")])?;
    apply(&mut a, vec![Command::DeleteBlock(DeleteBlock { block: "seed".into() })])?;
    let empty = ids(&ast(&a)?["root"])?[0].clone();
    apply(
        &mut a,
        vec![Command::InsertHorizontalRule(InsertHorizontalRule {
            block: "rule".into(),
            parent: None,
            before: None,
        })],
    )?;
    assert_eq!(ids(&ast(&a)?["root"])?, [empty.clone(), "rule".into()]);
    apply(
        &mut a,
        vec![Command::DeleteHorizontalRule(DeleteHorizontalRule {
            block: "rule".into(),
            replacement: None,
        })],
    )?;
    assert_eq!(ids(&ast(&a)?["root"])?, [empty]);
    future(&profile, &mut a)?;

    let (profile, mut a) =
        room(vec![quote("quote", vec![element("breditor/horizontal-rule", "rule", vec![])])])?;
    let before = a.checkpoint()?;
    assert!(
        apply(
            &mut a,
            vec![Command::DeleteHorizontalRule(DeleteHorizontalRule {
                block: "rule".into(),
                replacement: None
            })]
        )
        .is_err()
    );
    assert_eq!(a.checkpoint()?, before);
    apply(
        &mut a,
        vec![
            Command::DeleteHorizontalRule(DeleteHorizontalRule {
                block: "rule".into(),
                replacement: Some(prose("replacement", "")),
            }),
            insert("replacement", 0, "New prose"),
        ],
    )?;
    assert_eq!(ids(find(&ast(&a)?["root"], "quote").ok_or("quote")?)?, ["replacement"]);
    assert_eq!(text(&a, "replacement")?, "New prose");
    future(&profile, &mut a)
}

#[test]
fn rule_replacement_supports_complete_fresh_task_flow_with_remote_retention() -> Result {
    let (profile, mut a) = room(vec![element("breditor/horizontal-rule", "rule", vec![])])?;
    apply(
        &mut a,
        vec![Command::DeleteHorizontalRule(DeleteHorizontalRule {
            block: "rule".into(),
            replacement: Some(list(
                "tasks",
                vec![task("a", "A", true, vec![quote("tail", vec![prose("tail-head", "Tail")])])],
            )),
        })],
    )?;
    let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
    apply(&mut b, vec![insert("a-head", 0, "Remote "), checked("a", false)])?;
    sync(&mut a, &mut b)?;
    a.undo()?;
    assert_eq!(ids(&ast(&a)?["root"])?, ["rule"]);
    a.redo()?;
    assert_eq!(text(&a, "a-head")?, "Remote A");
    assert_eq!(find(&ast(&a)?["root"], "a").ok_or("a")?["properties"]["breditor/checked"], false);
    future(&profile, &mut a)
}

#[test]
fn new_quote_and_rule_then_explicit_rule_replacement_compose_in_one_group() -> Result {
    let (profile, mut a) = room(vec![prose("p", "Prose")])?;
    let original = a.document_json().to_owned();
    apply(
        &mut a,
        vec![
            Command::WrapBlockquote(WrapBlockquote {
                first: "p".into(),
                last: "p".into(),
                wrapper: "quote".into(),
            }),
            Command::InsertHorizontalRule(InsertHorizontalRule {
                block: "rule".into(),
                parent: Some("quote".into()),
                before: None,
            }),
            Command::DeleteHorizontalRule(DeleteHorizontalRule {
                block: "rule".into(),
                replacement: Some(prose("after", "After")),
            }),
        ],
    )?;
    assert_eq!(a.undo_count(), 1);
    assert_eq!(ids(find(&ast(&a)?["root"], "quote").ok_or("quote")?)?, ["p", "after"]);
    a.undo()?;
    assert_eq!(a.document_json(), original);
    a.redo()?;
    future(&profile, &mut a)
}

#[test]
fn simultaneous_task_indents_keep_one_body_and_undo_reveals_the_other_owned_placement() -> Result {
    for reverse in [false, true] {
        let (profile, mut a) = room(vec![list(
            "tasks",
            vec![task("a", "A", true, vec![]), task("b", "B", false, vec![])],
        )])?;
        let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
        for (owner, nested) in [(&mut a, "nested-a"), (&mut b, "nested-b")] {
            apply(
                owner,
                vec![Command::IndentTaskItems(IndentTaskItems {
                    container: "tasks".into(),
                    first: "b".into(),
                    last: "b".into(),
                    new_nested: Some(nested.into()),
                })],
            )?;
        }
        if reverse {
            sync(&mut b, &mut a)?;
        } else {
            sync(&mut a, &mut b)?;
        }
        assert!(find(&ast(&a)?["root"], "nested-b").is_some());
        b.undo()?;
        assert!(find(&ast(&b)?["root"], "nested-a").is_some());
        assert!(find(&ast(&b)?["root"], "nested-b").is_none());
        b.redo()?;
        assert_eq!(ids(find(&ast(&b)?["root"], "nested-b").ok_or("winning nested")?)?, ["b"]);
        future(&profile, &mut b)?;
    }
    Ok(())
}

#[test]
fn fresh_tasks_completion_and_indent_are_one_atomic_group() -> Result {
    let (profile, mut a) = room(vec![prose("p", "P"), prose("q", "Q")])?;
    let original = a.document_json().to_owned();
    apply(
        &mut a,
        vec![
            Command::WrapTaskList(WrapTaskList {
                first: "p".into(),
                last: "q".into(),
                container: "tasks".into(),
                items: vec![
                    NewTaskItem { block: "a".into(), checked: false },
                    NewTaskItem { block: "b".into(), checked: true },
                ],
            }),
            checked("a", true),
            Command::IndentTaskItems(IndentTaskItems {
                container: "tasks".into(),
                first: "b".into(),
                last: "b".into(),
                new_nested: Some("nested".into()),
            }),
        ],
    )?;
    assert_eq!(a.undo_count(), 1);
    assert_eq!(ids(find(&ast(&a)?["root"], "nested").ok_or("nested")?)?, ["b"]);
    assert_eq!(find(&ast(&a)?["root"], "a").ok_or("a")?["properties"]["breditor/checked"], true);
    a.undo()?;
    assert_eq!(a.document_json(), original);
    a.redo()?;
    future(&profile, &mut a)
}

#[test]
fn empty_exit_never_discards_a_rich_tail_and_unused_ids_reject_atomically() -> Result {
    let (profile, mut a) = room(vec![list(
        "tasks",
        vec![
            task("a", "A", false, vec![]),
            task("b", "B", true, vec![quote("tail", vec![prose("tail-head", "Tail")])]),
        ],
    )])?;
    apply(
        &mut a,
        vec![Command::DeleteText(DeleteText { block: "b-head".into(), offset: 0, length: 1 })],
    )?;
    let before = a.checkpoint()?;
    let guard = a.observe()?;
    assert!(
        apply(
            &mut a,
            vec![Command::ExitTaskItem(ExitTaskItem {
                container: "tasks".into(),
                item: "b".into(),
                fresh_tail: None
            })]
        )
        .is_err()
    );
    assert!(
        apply(
            &mut a,
            vec![Command::IndentTaskItems(IndentTaskItems {
                container: "tasks".into(),
                first: "a".into(),
                last: "a".into(),
                new_nested: Some("unused".into())
            })]
        )
        .is_err()
    );
    assert_eq!(a.checkpoint()?, before);
    a.check(&guard)?;
    apply(
        &mut a,
        vec![Command::SplitTaskItem(SplitTaskItem {
            block: "b-head".into(),
            offset: 0,
            new_item: "right".into(),
            right: "right-head".into(),
            right_heading: None,
        })],
    )?;
    assert_eq!(ids(find(&ast(&a)?["root"], "right").ok_or("right")?)?, ["right-head", "tail"]);
    future(&profile, &mut a)
}

#[test]
fn original_model_rejects_every_structural_command_before_target_or_value_work() -> Result {
    let profile = SharedRichProfile::from_standard_configuration_json_v1(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":1,"schema":{"name":"example/original","version":1},"extensions":[]}"#,
    )?;
    let mut owner = profile.create(&source(&profile, vec![prose("p", "P")]), "101".into())?;
    let before = owner.checkpoint()?;
    let observation = owner.observe()?;
    let commands = vec![
        Command::WrapBlockquote(WrapBlockquote {
            first: "missing".into(),
            last: "missing".into(),
            wrapper: "fresh".into(),
        }),
        Command::UnwrapBlockquote(UnwrapBlockquote { wrapper: "missing".into() }),
        Command::WrapTaskList(WrapTaskList {
            first: "missing".into(),
            last: "missing".into(),
            container: "fresh".into(),
            items: vec![],
        }),
        Command::UnwrapTaskList(UnwrapTaskList { container: "missing".into() }),
        Command::IndentTaskItems(IndentTaskItems {
            container: "missing".into(),
            first: "missing".into(),
            last: "missing".into(),
            new_nested: None,
        }),
        Command::OutdentTaskItems(OutdentTaskItems {
            container: "missing".into(),
            first: "missing".into(),
            last: "missing".into(),
            fresh_tail: None,
        }),
        Command::ExitTaskItem(ExitTaskItem {
            container: "missing".into(),
            item: "missing".into(),
            fresh_tail: None,
        }),
        Command::SplitTaskItem(SplitTaskItem {
            block: "missing".into(),
            offset: u32::MAX,
            new_item: "fresh".into(),
            right: "fresh-head".into(),
            right_heading: Some(255),
        }),
        Command::JoinTaskItems(JoinTaskItems {
            container: "missing".into(),
            left: "missing".into(),
            right: "missing".into(),
        }),
        Command::InsertHorizontalRule(InsertHorizontalRule {
            block: "fresh".into(),
            parent: Some("missing".into()),
            before: None,
        }),
        Command::DeleteHorizontalRule(DeleteHorizontalRule {
            block: "missing".into(),
            replacement: None,
        }),
        Command::SetCodeBlock(SetCodeBlock {
            block: "missing".into(),
            language: None,
            format_policy: CodeFormatPolicy::RejectFormatted,
        }),
        Command::SetCodeLanguage(SetCodeLanguage {
            block: "missing".into(),
            language: Some("bad token".into()),
        }),
        checked("missing", true),
    ];
    for command in commands {
        assert!(matches!(
            owner.apply(vec![command]),
            Err(breditor_collaboration::Error::Contract(
                "shared structural V2 command requires model 12"
            ))
        ));
        assert_eq!(owner.checkpoint()?, before);
        owner.check(&observation)?;
    }
    Ok(())
}

#[test]
fn rule_replacement_checks_final_budget_without_requiring_both_old_and_new_subtrees() -> Result {
    let profile = SharedRichProfile::from_standard_configuration_json_v2(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":2,"schema":{"name":"example/budget","version":2},"extensions":[],"limits":{"maxNodes":5}}"#,
    )?;
    let mut a = profile.create(
        &source(&profile, vec![element("breditor/horizontal-rule", "rule", vec![])]),
        "101".into(),
    )?;
    apply(
        &mut a,
        vec![Command::DeleteHorizontalRule(DeleteHorizontalRule {
            block: "rule".into(),
            replacement: Some(list("tasks", vec![task("a", "A", false, vec![])])),
        })],
    )?;
    assert_eq!(ids(&ast(&a)?["root"])?, ["tasks"]);
    future(&profile, &mut a)?;
    let profile = SharedRichProfile::from_standard_configuration_json_v2(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":2,"schema":{"name":"example/budget","version":2},"extensions":[],"limits":{"maxNodes":3}}"#,
    )?;
    let mut a = profile.create(&source(&profile, vec![prose("p", "P")]), "101".into())?;
    let before = a.checkpoint()?;
    let observation = a.observe()?;
    assert!(
        apply(
            &mut a,
            vec![Command::WrapTaskList(WrapTaskList {
                first: "p".into(),
                last: "p".into(),
                container: "tasks".into(),
                items: vec![NewTaskItem { block: "a".into(), checked: false }]
            })]
        )
        .is_err()
    );
    assert_eq!(a.checkpoint()?, before);
    a.check(&observation)?;
    Ok(())
}

#[test]
fn semantic_flow_paste_uses_quote_and_task_parents_without_losing_original_bodies() -> Result {
    let (profile, mut a) =
        room(vec![quote("quote", vec![list("tasks", vec![task("a", "A", false, vec![])])])])?;
    apply(
        &mut a,
        vec![Command::PasteBlocks(PasteBlocks {
            parent: Some("a".into()),
            before: None,
            nodes: vec![element(
                "breditor/code-block",
                "code",
                vec![json!({"kind":"text","text":"x🙂\n","formats":[]})],
            )],
        })],
    )?;
    apply(
        &mut a,
        vec![Command::PasteBlocks(PasteBlocks {
            parent: Some("quote".into()),
            before: None,
            nodes: vec![list("pasted-tasks", vec![task("pasted-task", "Pasted", true, vec![])])],
        })],
    )?;
    assert_eq!(ids(find(&ast(&a)?["root"], "a").ok_or("a")?)?, ["a-head", "code"]);
    assert_eq!(ids(find(&ast(&a)?["root"], "quote").ok_or("quote")?)?, ["tasks", "pasted-tasks"]);
    assert_eq!(text(&a, "code")?, "x🙂\n");
    future(&profile, &mut a)
}

#[test]
fn concurrent_code_conversion_and_task_wrap_normalize_a_head_without_losing_code() -> Result {
    let (profile, mut a) = room(vec![prose("p", "P🙂")])?;
    let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
    apply(
        &mut a,
        vec![Command::WrapTaskList(WrapTaskList {
            first: "p".into(),
            last: "p".into(),
            container: "tasks".into(),
            items: vec![NewTaskItem { block: "a".into(), checked: true }],
        })],
    )?;
    apply(
        &mut b,
        vec![Command::SetCodeBlock(SetCodeBlock {
            block: "p".into(),
            language: Some("rust".into()),
            format_policy: CodeFormatPolicy::RejectFormatted,
        })],
    )?;
    sync(&mut a, &mut b)?;
    let projected = ast(&a)?;
    let body = ids(find(&projected["root"], "a").ok_or("a")?)?;
    assert_eq!(body.len(), 2);
    assert!(body[0].starts_with("breditor-virtual:"));
    assert_eq!(body[1], "p");
    assert_eq!(find(&projected["root"], "p").ok_or("code")?["type"], "breditor/code-block");
    assert_eq!(text(&a, "p")?, "P🙂");
    a.undo()?;
    assert_eq!(ids(&ast(&a)?["root"])?, ["p"]);
    a.redo()?;
    future(&profile, &mut a)
}

#[test]
fn top_level_task_removal_uses_actual_cell_or_ordinary_list_flow_without_flattening() -> Result {
    for in_cell in [false, true] {
        let tasks = list(
            "tasks",
            vec![
                task("a", "A", true, vec![]),
                task("b", "B", false, vec![quote("tail", vec![prose("tail-head", "Tail")])]),
                task("c", "C", true, vec![]),
            ],
        );
        let (body, parent) = if in_cell {
            let root: Value = serde_json::from_str(include_str!(
                "../../breditor-core/tests/fixtures/rich-local-root.json"
            ))?;
            let mut table = root["children"][0].clone();
            table["children"][0]["children"][0]["children"]
                .as_array_mut()
                .ok_or("cell body")?
                .push(tasks);
            (table, "cell")
        } else {
            (
                element(
                    "breditor/bullet-list",
                    "ordinary-list",
                    vec![element(
                        "breditor/list-item",
                        "ordinary-item",
                        vec![prose("ordinary-head", "Lead"), tasks],
                    )],
                ),
                "ordinary-item",
            )
        };
        let (profile, mut a) = room(vec![body])?;
        let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
        apply(
            &mut a,
            vec![Command::OutdentTaskItems(OutdentTaskItems {
                container: "tasks".into(),
                first: "b".into(),
                last: "b".into(),
                fresh_tail: Some("suffix".into()),
            })],
        )?;
        apply(&mut b, vec![checked("b", true), insert("b-head", 0, "Remote ")])?;
        sync(&mut a, &mut b)?;
        let projected = ast(&a)?;
        let ids = ids(find(&projected["root"], parent).ok_or("actual parent")?)?;
        let position = ids.iter().position(|id| id == "tasks").ok_or("task position")?;
        assert_eq!(&ids[position..], ["tasks", "b-head", "tail", "suffix"]);
        assert_eq!(text(&a, "b-head")?, "Remote B");
        if in_cell {
            assert!(find(&projected["root"], "image-block").is_some());
        }
        a.undo()?;
        assert_eq!(
            find(&ast(&a)?["root"], "b").ok_or("b")?["properties"]["breditor/checked"],
            true
        );
        a.redo()?;
        future(&profile, &mut a)?;
    }
    Ok(())
}

#[test]
fn deleting_all_task_head_text_then_exiting_keeps_restorable_history_cursors() -> Result {
    let (profile, mut a) = room(vec![list(
        "tasks",
        vec![task("a", "First", true, vec![]), task("b", "Review", true, vec![])],
    )])?;
    let point = |offset| TextPoint { block: "b-head".into(), offset, affinity: Affinity::After };
    let caret = Selection::TextRange { anchor: point(2), focus: point(2) };
    a.set_selection_guarded(&a.observe()?, Some(&caret))?;
    let range = Selection::TextRange { anchor: point(0), focus: point(6) };
    a.replace_plain_text_guarded(&a.observe()?, &range, "")?;
    let empty = a.document_json().to_owned();
    a.apply_guarded(
        &a.observe()?,
        vec![Command::ExitTaskItem(ExitTaskItem {
            container: "tasks".into(),
            item: "b".into(),
            fresh_tail: None,
        })],
        SelectionUpdate::Set(Some(Selection::TextRange { anchor: point(0), focus: point(0) })),
        PendingFormatsUpdate::Map,
    )?;
    let checkpoint = a.checkpoint()?;
    a.undo().map_err(|error| format!("empty task exit Undo: {error}; checkpoint={checkpoint}"))?;
    assert_eq!(a.document_json(), empty);
    assert!(a.redo()?);
    future(&profile, &mut a)
}
