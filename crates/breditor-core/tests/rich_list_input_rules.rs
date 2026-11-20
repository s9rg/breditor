//! `markdown-v1` list continuation and code exit: existing-list task conversion, backward
//! adjacent-list joining and triple-Enter code exit, each one isolated exact Undo group.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec, RichTypingSessionJsonCodec},
    document::{NodeRef, PropertyInteger},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichInputRuleKind, RichInputRuleOutcome, RichInputRuleSet,
        RichInputRuleStep, RichListKind, RichLocalOutcome, RichLocalSession, RichSelectionKind,
        RichTextPoint, plan_rich_markdown_input_rule, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn setup(
    version: u8,
    children: Vec<Value>,
    natural: bool,
) -> Result<(EditorContext, RichLocalSession)> {
    let id =
        SchemaId::new(QualifiedName::try_new("example/input-rules")?, SchemaVersion::try_new(1)?);
    let extensions =
        ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?;
    let schema = match version {
        1 => CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
        2 => CompiledSchema::try_compile_rich_content_profile_v2(id, &extensions)?,
        _ => CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?,
    };
    let context = EditorContext::new(schema, DocumentLimits::default());
    let mut root = fixture::element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/input-rules","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":root});
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&input.to_string())?,
        context.limits(),
    )?;
    let mut owner =
        RichLocalSession::try_new(context.clone(), document, None, HistoryCapacity::try_new(128)?)?;
    if natural {
        owner.enable_typing_history(&owner.snapshot())?;
    }
    Ok((context, owner))
}
fn p(id: &str, text: &str) -> Value {
    fixture::paragraph(id, text)
}
fn item(id: &str, children: Vec<Value>) -> Value {
    fixture::element("list-item", id, children)
}
fn bullets(id: &str, items: Vec<Value>) -> Value {
    fixture::element("bullet-list", id, items)
}
fn numbered(id: &str, start: u32, items: Vec<Value>) -> Value {
    let mut list = fixture::element("ordered-list", id, items);
    list["properties"]["breditor/start"] = start.into();
    list
}
fn task(id: &str, checked: bool, children: Vec<Value>) -> Value {
    let mut task = fixture::element("task-item", id, children);
    task["properties"]["breditor/checked"] = json!(checked);
    task
}
fn tasks(id: &str, items: Vec<Value>) -> Value {
    fixture::element("task-list", id, items)
}
fn code(id: &str, text: &str) -> Value {
    json!({"kind":"element","type":"breditor/code-block","entityId":null,"properties":{"breditor/block-id":id},"children":if text.is_empty(){json!([])}else{json!([{"kind":"text","text":text,"formats":[]}])}})
}
fn select(owner: &mut RichLocalSession, id: &str, offset: usize) -> Result {
    let p = RichTextPoint::new(
        BlockId::try_new(id)?,
        TextOffset::try_new(offset as u64)?,
        Affinity::After,
    );
    owner.set_selection(
        &owner.snapshot(),
        Some(RichSelectionKind::TextRange { anchor: p.clone(), focus: p }),
    )?;
    Ok(())
}
/// Compact structural outline: `kind#id{checked}[children]`, text as `'…'`.
fn outline(node: &NodeRef) -> String {
    let Some(element) = node.as_element() else {
        return format!("'{}'", node.as_text().map_or("", |t| t.text()));
    };
    let mut out = element.kind().as_str().trim_start_matches("breditor/").to_owned();
    for (name, value) in element.properties() {
        match name.local_name() {
            "block-id" if !out.starts_with("document") => {
                out.push('#');
                out.push_str(value.as_string().unwrap_or("?"));
            }
            "checked" => out.push_str(if value.as_boolean() == Some(true) { "+" } else { "-" }),
            "start" => {
                out.push('@');
                out.push_str(&value.as_integer().map_or(0, PropertyInteger::get).to_string());
            }
            _ => {}
        }
    }
    let children: Vec<String> = element.children().iter().map(outline).collect();
    if !children.is_empty() {
        out.push('[');
        out.push_str(&children.join(","));
        out.push(']');
    }
    out
}
fn shape(owner: &RichLocalSession) -> String {
    outline(owner.state().document().document().root())
}
fn caret(owner: &RichLocalSession) -> Option<(String, u64)> {
    match owner.state().selection().map(|s| s.kind().clone()) {
        Some(RichSelectionKind::TextRange { focus, .. }) => {
            Some((focus.block().as_str().to_owned(), focus.offset().get()))
        }
        _ => None,
    }
}
fn saved(context: &EditorContext, owner: &RichLocalSession) -> Result<String> {
    Ok(if owner.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(context.clone()).encode(owner)?
    } else {
        RichSessionJsonCodec::new(context.clone()).encode(owner)?
    })
}
fn future(context: &EditorContext, owner: &mut RichLocalSession) -> Result {
    let mut twin = if owner.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(context.clone()).decode(&saved(context, owner)?)?
    } else {
        RichSessionJsonCodec::new(context.clone()).decode(&saved(context, owner)?)?
    };
    for undo in [true, false, true, false] {
        if undo {
            owner.undo(&owner.snapshot())?;
            twin.undo(&twin.snapshot())?;
        } else {
            owner.redo(&owner.snapshot())?;
            twin.redo(&twin.snapshot())?;
        }
        assert_eq!(saved(context, &twin)?, saved(context, owner)?);
    }
    Ok(())
}
fn type_rule(owner: &mut RichLocalSession, key: &str, ns: &str) -> Result<RichInputRuleOutcome> {
    Ok(if owner.typing_history_enabled() {
        owner.insert_typing_text_with_markdown_rules(&owner.snapshot(), key, 100, ns)?
    } else {
        owner.insert_plain_text_with_markdown_rules(&owner.snapshot(), key, ns)?
    })
}

/// Type `key` at (`block`, `offset`) with the rules, check the converted shape and caret,
/// then one Undo restores exactly the literal input and Redo the conversion.
fn convert(
    version: u8,
    children: &[Value],
    block: &str,
    offset: usize,
    key: &str,
    expected: &str,
    caret_at: (&str, u64),
) -> Result {
    for natural in [false, true] {
        let (context, mut owner) = setup(version, children.to_vec(), natural)?;
        select(&mut owner, block, offset)?;
        let (_, mut control) = setup(version, children.to_vec(), false)?;
        select(&mut control, block, offset)?;
        control.insert_plain_text(&control.snapshot(), key)?;
        let literal = shape(&control);
        let literal_caret = caret(&control);
        let depth = owner.undo_depth();
        assert_eq!(type_rule(&mut owner, key, "ns")?, RichInputRuleOutcome::Applied, "{expected}");
        assert_eq!(shape(&owner), expected);
        assert_eq!(caret(&owner), Some((caret_at.0.to_owned(), caret_at.1)));
        assert_eq!(owner.undo_depth(), depth + 2);
        owner.undo(&owner.snapshot())?;
        assert_eq!(shape(&owner), literal, "one Undo keeps the typed text");
        assert_eq!(caret(&owner), literal_caret);
        owner.redo(&owner.snapshot())?;
        assert_eq!(shape(&owner), expected);
        future(&context, &mut owner)?;
    }
    Ok(())
}
/// The rule does not match: the literal input stays and nothing else is published.
fn literal(version: u8, children: &[Value], block: &str, offset: usize, key: &str) -> Result {
    let (context, mut owner) = setup(version, children.to_vec(), false)?;
    select(&mut owner, block, offset)?;
    assert_eq!(type_rule(&mut owner, key, "ns")?, RichInputRuleOutcome::Inserted);
    let (_, mut control) = setup(version, children.to_vec(), false)?;
    select(&mut control, block, offset)?;
    control.insert_plain_text(&control.snapshot(), key)?;
    assert_eq!(saved(&context, &owner)?, saved(&context, &control)?);
    Ok(())
}

#[test]
fn a_task_marker_on_a_bullet_item_head_converts_that_item_and_splits_the_list() -> Result {
    let list = |head: &str| {
        bullets(
            "l",
            vec![
                item("i1", vec![p("a", "a")]),
                item("i2", vec![p("h", head)]),
                item("i3", vec![p("c", "c")]),
            ],
        )
    };
    convert(
        3,
        &[list("[x]rest")],
        "h",
        3,
        " ",
        "document[bullet-list#l[list-item#i1[paragraph#a['a']]],task-list#ns:rule:tasks[task-item#ns:rule:task+[paragraph#h['rest']]],bullet-list#ns:rule:tail[list-item#i3[paragraph#c['c']]]]",
        ("h", 0),
    )?;
    convert(
        2,
        &[list("[ ]")],
        "h",
        3,
        " ",
        "document[bullet-list#l[list-item#i1[paragraph#a['a']]],task-list#ns:rule:tasks[task-item#ns:rule:task-[paragraph#h]],bullet-list#ns:rule:tail[list-item#i3[paragraph#c['c']]]]",
        ("h", 0),
    )?;
    // First and last items need no fresh suffix identity; the original list keeps its ID.
    let two = |first: &str, second: &str| {
        bullets("l", vec![item("i1", vec![p("a", first)]), item("i2", vec![p("b", second)])])
    };
    convert(
        3,
        &[two("[X]", "b")],
        "a",
        3,
        " ",
        "document[task-list#ns:rule:tasks[task-item#ns:rule:task+[paragraph#a]],bullet-list#l[list-item#i2[paragraph#b['b']]]]",
        ("a", 0),
    )?;
    convert(
        3,
        &[two("a", "[ ]")],
        "b",
        3,
        " ",
        "document[bullet-list#l[list-item#i1[paragraph#a['a']]],task-list#ns:rule:tasks[task-item#ns:rule:task-[paragraph#b]]]",
        ("b", 0),
    )
}

#[test]
fn item_task_conversion_keeps_rich_tails_works_in_containers_and_joins_a_preceding_task_list()
-> Result {
    // The nested list and quote stay in the new task body with their identities.
    let rich = bullets(
        "l",
        vec![item(
            "i",
            vec![
                p("h", "[ ]"),
                bullets("n", vec![item("ni", vec![p("np", "n")])]),
                fixture::element("blockquote", "q", vec![p("qp", "q")]),
            ],
        )],
    );
    convert(
        3,
        &[rich],
        "h",
        3,
        " ",
        "document[task-list#ns:rule:tasks[task-item#ns:rule:task-[paragraph#h,bullet-list#n[list-item#ni[paragraph#np['n']]],blockquote#q[paragraph#qp['q']]]]]",
        ("h", 0),
    )?;
    // Inside a quote, the list's flow parent receives the task list.
    let quoted = fixture::element(
        "blockquote",
        "q",
        vec![bullets("l", vec![item("i", vec![p("h", "[ ]")])])],
    );
    convert(
        3,
        &[quoted],
        "h",
        3,
        " ",
        "document[blockquote#q[task-list#ns:rule:tasks[task-item#ns:rule:task-[paragraph#h]]]]",
        ("h", 0),
    )?;
    // Converting a list's first item right after a task list appends to that task list,
    // so converting items one by one never leaves adjacent task lists.
    let after_tasks = [
        tasks("t", vec![task("t1", true, vec![p("tp", "done")])]),
        bullets("l", vec![item("i1", vec![p("a", "[ ]")]), item("i2", vec![p("b", "b")])]),
    ];
    convert(
        3,
        &after_tasks,
        "a",
        3,
        " ",
        "document[task-list#t[task-item#t1+[paragraph#tp['done']],task-item#ns:rule:task-[paragraph#a]],bullet-list#l[list-item#i2[paragraph#b['b']]]]",
        ("a", 0),
    )
}

#[test]
fn ordered_nested_multi_paragraph_task_and_old_grammar_items_keep_a_literal_marker() -> Result {
    let cases = [
        (3, vec![numbered("l", 1, vec![item("i", vec![p("h", "[ ]")])])]),
        (
            3,
            vec![bullets(
                "l",
                vec![item(
                    "i",
                    vec![p("a", "a"), bullets("n", vec![item("ni", vec![p("h", "[ ]")])])],
                )],
            )],
        ),
        (3, vec![bullets("l", vec![item("i", vec![p("h", "[ ]"), p("more", "more")])])]),
        (3, vec![tasks("t", vec![task("i", false, vec![p("h", "[ ]")])])]),
        (1, vec![bullets("l", vec![item("i", vec![p("h", "[ ]")])])]),
    ];
    for (version, children) in cases {
        literal(version, &children, "h", 3, " ")?;
    }
    // Other block markers on an item head still stay literal.
    for marker in ["-", "1.", ">", "```", "---"] {
        let children = vec![bullets("l", vec![item("i", vec![p("h", marker)])])];
        literal(3, &children, "h", marker.len(), " ")?;
    }
    Ok(())
}

#[test]
fn a_list_marker_after_a_compatible_list_appends_one_item_to_that_list() -> Result {
    for version in 1..=3 {
        convert(
            version,
            &[bullets("l", vec![item("i", vec![p("a", "a")])]), p("b", "*b")],
            "b",
            1,
            " ",
            "document[bullet-list#l[list-item#i[paragraph#a['a']],list-item#ns:rule:item[paragraph#b['b']]]]",
            ("b", 0),
        )?;
        // A numbered marker joins only as the list's next ordinal.
        convert(
            version,
            &[
                numbered("l", 4, vec![item("i", vec![p("a", "a")]), item("j", vec![p("c", "c")])]),
                p("b", "6)"),
            ],
            "b",
            2,
            " ",
            "document[ordered-list#l@4[list-item#i[paragraph#a['a']],list-item#j[paragraph#c['c']],list-item#ns:rule:item[paragraph#b]]]",
            ("b", 0),
        )?;
        convert(
            version,
            &[numbered("l", 4, vec![item("i", vec![p("a", "a")])]), p("b", "1.")],
            "b",
            2,
            " ",
            "document[ordered-list#l@4[list-item#i[paragraph#a['a']]],ordered-list#ns:rule:list@1[list-item#ns:rule:item[paragraph#b]]]",
            ("b", 0),
        )?;
        // Different kinds stay separate adjacent lists.
        convert(
            version,
            &[numbered("l", 1, vec![item("i", vec![p("a", "a")])]), p("b", "-")],
            "b",
            1,
            " ",
            "document[ordered-list#l@1[list-item#i[paragraph#a['a']]],bullet-list#ns:rule:list[list-item#ns:rule:item[paragraph#b]]]",
            ("b", 0),
        )?;
    }
    // The last item's trailing nested list stays before the appended item.
    convert(
        3,
        &[
            bullets(
                "l",
                vec![item(
                    "i",
                    vec![p("a", "a"), bullets("n", vec![item("ni", vec![p("np", "n")])])],
                )],
            ),
            p("b", "-"),
        ],
        "b",
        1,
        " ",
        "document[bullet-list#l[list-item#i[paragraph#a['a'],bullet-list#n[list-item#ni[paragraph#np['n']]]],list-item#ns:rule:item[paragraph#b]]]",
        ("b", 0),
    )?;
    // A later paragraph inside an item joins the nested list directly before it.
    convert(
        3,
        &[bullets(
            "l",
            vec![item(
                "i",
                vec![p("a", "a"), bullets("n", vec![item("ni", vec![p("np", "n")])]), p("b", "-")],
            )],
        )],
        "b",
        1,
        " ",
        "document[bullet-list#l[list-item#i[paragraph#a['a'],bullet-list#n[list-item#ni[paragraph#np['n']],list-item#ns:rule:item[paragraph#b]]]]]",
        ("b", 0),
    )?;
    // Tasks join a preceding task list; the typed completion is kept.
    convert(
        3,
        &[tasks("t", vec![task("t1", false, vec![p("a", "a")])]), p("b", "[x]")],
        "b",
        3,
        " ",
        "document[task-list#t[task-item#t1-[paragraph#a['a']],task-item#ns:rule:task+[paragraph#b]]]",
        ("b", 0),
    )?;
    // Only the directly preceding sibling counts; a following list never joins.
    convert(
        3,
        &[
            bullets("l", vec![item("i", vec![p("a", "a")])]),
            p("x", "x"),
            p("b", "-"),
            bullets("m", vec![item("j", vec![p("c", "c")])]),
        ],
        "b",
        1,
        " ",
        "document[bullet-list#l[list-item#i[paragraph#a['a']]],paragraph#x['x'],bullet-list#ns:rule:list[list-item#ns:rule:item[paragraph#b]],bullet-list#m[list-item#j[paragraph#c['c']]]]",
        ("b", 0),
    )
}

#[test]
fn three_enters_at_the_end_of_code_leave_it_and_one_undo_restores_every_line_feed() -> Result {
    convert(
        3,
        &[code("c", "fn x\n\n"), p("after", "z")],
        "c",
        6,
        "\n",
        "document[code-block#c['fn x'],paragraph#ns:rule:p,paragraph#after['z']]",
        ("ns:rule:p", 0),
    )?;
    convert(
        2,
        &[code("c", "\n\n")],
        "c",
        2,
        "\n",
        "document[code-block#c,paragraph#ns:rule:p]",
        ("ns:rule:p", 0),
    )?;
    // In a list item the paragraph stays in the item's flow.
    convert(
        3,
        &[bullets("l", vec![item("i", vec![p("a", "a"), code("c", "x\n\n")])])],
        "c",
        3,
        "\n",
        "document[bullet-list#l[list-item#i[paragraph#a['a'],code-block#c['x'],paragraph#ns:rule:p]]]",
        ("ns:rule:p", 0),
    )?;
    // Fewer empty lines, a caret before the end, and prose line feeds stay literal.
    literal(3, &[code("c", "x\n")], "c", 2, "\n")?;
    literal(3, &[code("c", "x\n\n\ny")], "c", 4, "\n")?;
    literal(3, &[p("b", "x\n\n")], "b", 3, "\n")?;
    Ok(())
}

#[test]
fn code_exit_derives_fresh_pending_formats_and_needs_the_markdown_selection() -> Result {
    let (_, mut owner) = setup(3, vec![code("c", "x\n\n")], false)?;
    select(&mut owner, "c", 3)?;
    let outcome = owner.insert_plain_text_with_input_rules(
        &owner.snapshot(),
        "\n",
        "ns",
        RichInputRuleSet::AUTOLINK_V1,
    )?;
    assert_eq!(outcome, RichInputRuleOutcome::Inserted);
    owner.undo(&owner.snapshot())?;
    assert_eq!(type_rule(&mut owner, "\n", "ns")?, RichInputRuleOutcome::Applied);
    assert_eq!(owner.state().pending_formats(), None);
    Ok(())
}

#[test]
fn plans_expose_retained_identity_steps_and_reject_reused_or_invalid_identities() -> Result {
    let children = vec![bullets("l", vec![item("i", vec![p("a", "a")])]), p("b", "- ")];
    let (context, mut owner) = setup(3, children, false)?;
    select(&mut owner, "b", 2)?;
    let plan = plan_rich_markdown_input_rule(
        &context,
        owner.state().document(),
        owner.state().selection(),
        " ",
        "ns",
    )?
    .ok_or("missing plan")?;
    assert_eq!(plan.kind(), &RichInputRuleKind::ListJoin(RichListKind::Bullet));
    let id = |v: &str| BlockId::try_new(v);
    assert_eq!(
        plan.steps(),
        &[
            RichInputRuleStep::Delete { start: TextOffset::ZERO, end: TextOffset::try_new(2)? },
            RichInputRuleStep::List {
                container: id("ns:rule:list")?,
                item: id("ns:rule:item")?,
                kind: RichListKind::Bullet
            },
            RichInputRuleStep::MoveBlock {
                block: id("ns:rule:list")?,
                parent: Some(id("i")?),
                before: None
            },
            RichInputRuleStep::OutdentListItem {
                container: id("ns:rule:list")?,
                item: id("ns:rule:item")?,
                fresh_tail: None
            },
        ]
    );
    let before = saved(&context, &owner)?;
    assert!(owner.apply_markdown_input_rule(&owner.snapshot(), " ", "bad namespace").is_err());
    assert_eq!(saved(&context, &owner)?, before);
    // Read-only and stale observations reject before planning.
    let stale = owner.snapshot();
    owner.set_read_only(&owner.snapshot(), true)?;
    assert!(owner.apply_markdown_input_rule(&stale, " ", "ns").is_err());
    assert!(owner.apply_markdown_input_rule(&owner.snapshot(), " ", "ns").is_err());
    // A conversion whose derived identity is already visible fails closed.
    let children = vec![
        bullets(
            "l",
            vec![
                item("i1", vec![p("a", "a")]),
                item("i2", vec![p("h", "[ ] ")]),
                item("i3", vec![p("c", "c")]),
            ],
        ),
        p("ns:rule:tail", "taken"),
    ];
    let (context, mut owner) = setup(3, children, false)?;
    select(&mut owner, "h", 4)?;
    let before = saved(&context, &owner)?;
    assert!(owner.apply_markdown_input_rule(&owner.snapshot(), " ", "ns").is_err());
    assert_eq!(saved(&context, &owner)?, before);
    assert_eq!(
        owner.apply_markdown_input_rule(&owner.snapshot(), " ", "other")?,
        RichLocalOutcome::ContentCommitted
    );
    Ok(())
}
