//! Shared `markdown-v1` list continuation and code exit lower to original guarded commands
//! (wrap/move/outdent/insert), one selective Undo group, exact recovery and peer convergence.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedObservation, SharedRichProfile,
        actions::InsertText,
        selection::{Selection, TextPoint},
    },
};
use breditor_core::{document::NodeRef, rich_content::RichInputRuleOutcome};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn setup(version: u8, children: Vec<Value>) -> Result<(SharedRichProfile, RichReplica)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/input-rules","version":1},"extensions":[]}).to_string();
    let profile = match version {
        1 => SharedRichProfile::from_standard_configuration_json_v1(&configuration)?,
        2 => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        _ => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
    };
    let mut root = fixture::element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/input-rules","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let owner = profile.create(&input, "101".into())?;
    Ok((profile, owner))
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
fn tasks(id: &str, items: Vec<Value>) -> Value {
    fixture::element("task-list", id, items)
}
fn task(id: &str, checked: bool, children: Vec<Value>) -> Value {
    let mut task = fixture::element("task-item", id, children);
    task["properties"]["breditor/checked"] = json!(checked);
    task
}
fn numbered(id: &str, start: u32, items: Vec<Value>) -> Value {
    let mut list = fixture::element("ordered-list", id, items);
    list["properties"]["breditor/start"] = start.into();
    list
}
fn code(id: &str, text: &str) -> Value {
    json!({"kind":"element","type":"breditor/code-block","entityId":null,"properties":{"breditor/block-id":id},"children":[{"kind":"text","text":text,"formats":[]}]})
}
fn observed(owner: &RichReplica) -> Result<SharedObservation> {
    Ok(owner.observe()?)
}
fn select(owner: &mut RichReplica, block: &str, offset: u32) -> Result {
    let p = TextPoint { block: block.into(), offset, affinity: Affinity::After };
    owner.set_selection(Some(&Selection::TextRange { anchor: p.clone(), focus: p }))?;
    Ok(())
}
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
fn shape(owner: &RichReplica) -> String {
    outline(owner.document().document().root())
}
fn future(profile: &SharedRichProfile, owner: &mut RichReplica) -> Result {
    let save = |o: &RichReplica| -> Result<String> {
        Ok(if o.typing_history_enabled() { o.typing_checkpoint()? } else { o.checkpoint()? })
    };
    let bytes = save(owner)?;
    let mut twin = if owner.typing_history_enabled() {
        profile.restore_typing("room", &bytes)?
    } else {
        profile.restore("room", &bytes)?
    };
    for undo in [true, false, true, false] {
        if undo {
            owner.undo()?;
            twin.undo()?;
        } else {
            owner.redo()?;
            twin.redo()?;
        }
        assert_eq!(save(&twin)?, save(owner)?);
    }
    Ok(())
}
fn type_rule(owner: &mut RichReplica, key: &str, ns: &str) -> Result<RichInputRuleOutcome> {
    Ok(if owner.typing_history_enabled() {
        owner.insert_typing_text_with_markdown_rules_guarded(&observed(owner)?, key, 100, ns)?
    } else {
        owner.insert_plain_text_with_markdown_rules_guarded(&observed(owner)?, key, ns)?
    })
}

struct Case {
    version: u8,
    children: Vec<Value>,
    block: &'static str,
    offset: u32,
    key: &'static str,
    expected: &'static str,
}
fn cases() -> Vec<Case> {
    vec![
        Case {
            version: 3,
            children: vec![bullets(
                "l",
                vec![
                    item("i1", vec![p("a", "a")]),
                    item("i2", vec![p("h", "[x]rest")]),
                    item("i3", vec![p("c", "c")]),
                ],
            )],
            block: "h",
            offset: 3,
            key: " ",
            expected: "document[bullet-list#l[list-item#i1[paragraph#a['a']]],task-list#ns:rule:tasks[task-item#ns:rule:task+[paragraph#h['rest']]],bullet-list#ns:rule:tail[list-item#i3[paragraph#c['c']]]]",
        },
        Case {
            version: 3,
            children: vec![
                tasks("t", vec![task("t1", true, vec![p("tp", "done")])]),
                bullets("l", vec![item("i1", vec![p("a", "[ ]")]), item("i2", vec![p("b", "b")])]),
            ],
            block: "a",
            offset: 3,
            key: " ",
            expected: "document[task-list#t[task-item#t1+[paragraph#tp['done']],task-item#ns:rule:task-[paragraph#a]],bullet-list#l[list-item#i2[paragraph#b['b']]]]",
        },
        Case {
            version: 1,
            children: vec![bullets("l", vec![item("i", vec![p("a", "a")])]), p("b", "-b")],
            block: "b",
            offset: 1,
            key: " ",
            expected: "document[bullet-list#l[list-item#i[paragraph#a['a']],list-item#ns:rule:item[paragraph#b['b']]]]",
        },
        Case {
            version: 3,
            children: vec![numbered("l", 2, vec![item("i", vec![p("a", "a")])]), p("b", "3.")],
            block: "b",
            offset: 2,
            key: " ",
            expected: "document[ordered-list#l[list-item#i[paragraph#a['a']],list-item#ns:rule:item[paragraph#b]]]",
        },
        Case {
            version: 3,
            children: vec![
                bullets(
                    "l",
                    vec![item(
                        "i",
                        vec![p("a", "a"), bullets("n", vec![item("ni", vec![p("np", "n")])])],
                    )],
                ),
                p("b", "-"),
            ],
            block: "b",
            offset: 1,
            key: " ",
            expected: "document[bullet-list#l[list-item#i[paragraph#a['a'],bullet-list#n[list-item#ni[paragraph#np['n']]]],list-item#ns:rule:item[paragraph#b]]]",
        },
        Case {
            version: 2,
            children: vec![tasks("t", vec![task("t1", false, vec![p("a", "a")])]), p("b", "[ ]")],
            block: "b",
            offset: 3,
            key: " ",
            expected: "document[task-list#t[task-item#t1-[paragraph#a['a']],task-item#ns:rule:task-[paragraph#b]]]",
        },
        Case {
            version: 3,
            children: vec![code("c", "fn x\n\n"), p("after", "z")],
            block: "c",
            offset: 6,
            key: "\n",
            expected: "document[code-block#c['fn x'],paragraph#ns:rule:p,paragraph#after['z']]",
        },
    ]
}

#[test]
fn exclusive_calls_lower_each_rule_to_one_selective_group_with_exact_recovery() -> Result {
    for case in cases() {
        for natural in [false, true] {
            let (profile, mut owner) = setup(case.version, case.children.clone())?;
            if natural {
                owner.enable_typing_history_guarded(&observed(&owner)?)?;
            }
            select(&mut owner, case.block, case.offset)?;
            let (_, mut control) = setup(case.version, case.children.clone())?;
            select(&mut control, case.block, case.offset)?;
            control.insert_plain_text_guarded(&observed(&control)?, case.key)?;
            let literal = control.document_json().to_owned();
            let depth = owner.undo_count();
            assert_eq!(
                type_rule(&mut owner, case.key, "ns")?,
                RichInputRuleOutcome::Applied,
                "{}",
                case.expected
            );
            assert_eq!(shape(&owner), case.expected);
            assert_eq!(owner.undo_count(), depth + 2);
            let converted = owner.document_json().to_owned();
            owner.undo()?;
            assert_eq!(owner.document_json(), literal, "one Undo keeps the typed text");
            owner.redo()?;
            assert_eq!(owner.document_json(), converted);
            future(&profile, &mut owner)?;
        }
    }
    Ok(())
}

#[test]
fn peer_text_in_moved_and_split_content_survives_conversion_undo_and_redo() -> Result {
    for case in cases() {
        let (profile, mut a) = setup(case.version, case.children.clone())?;
        select(&mut a, case.block, case.offset)?;
        a.insert_plain_text_guarded(&observed(&a)?, case.key)?;
        let mut b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
        assert!(a.apply_markdown_input_rule_guarded(&observed(&a)?, case.key, "ns")?);
        // The peer types at the end of the retained source block concurrently.
        let end = u32::try_from(
            b.document()
                .document()
                .node_at(
                    b.document()
                        .block_path(&breditor_core::rich_content::BlockId::try_new(case.block)?)
                        .ok_or("missing")?,
                )?
                .as_element()
                .ok_or("kind")?
                .children()
                .iter()
                .map(|n| n.as_text().map_or(0, |t| t.text().encode_utf16().count()))
                .sum::<usize>(),
        )?;
        b.apply(vec![Command::InsertText(InsertText {
            block: case.block.into(),
            offset: end,
            text: "PEER".into(),
        })])?;
        a.receive_frame(&b.update_frame()?)?;
        b.receive_frame(&a.update_frame()?)?;
        assert_eq!(a.document_json(), b.document_json());
        assert!(a.document_json().contains("PEER"), "{}", case.expected);
        for undo in [true, false] {
            if undo {
                a.undo()?;
            } else {
                a.redo()?;
            }
            b.receive_frame(&a.update_frame()?)?;
            assert_eq!(a.document_json(), b.document_json());
            assert!(a.document_json().contains("PEER"));
        }
        future(&profile, &mut a)?;
    }
    Ok(())
}

#[test]
fn literal_shapes_readonly_stale_and_reused_identities_change_nothing() -> Result {
    // Nested, ordered and multi-paragraph items and too-short code stay literal.
    for (children, block, offset, key) in [
        (vec![numbered("l", 1, vec![item("i", vec![p("h", "[ ]")])])], "h", 3, " "),
        (vec![bullets("l", vec![item("i", vec![p("h", "[ ]"), p("m", "m")])])], "h", 3, " "),
        (vec![code("c", "x\n")], "c", 2, "\n"),
    ] {
        let (_, mut owner) = setup(3, children.clone())?;
        select(&mut owner, block, offset)?;
        assert_eq!(type_rule(&mut owner, key, "ns")?, RichInputRuleOutcome::Inserted);
        assert_eq!(owner.undo_count(), 1);
    }
    let (_, mut owner) =
        setup(3, vec![bullets("l", vec![item("i", vec![p("a", "a")])]), p("b", "- ")])?;
    select(&mut owner, "b", 2)?;
    let old = observed(&owner)?;
    assert!(owner.apply_markdown_input_rule_guarded(&old, " ", "rule")?);
    owner.undo()?;
    let before = owner.checkpoint()?;
    assert!(owner.apply_markdown_input_rule_guarded(&old, " ", "fresh").is_err());
    assert!(owner.apply_markdown_input_rule_guarded(&observed(&owner)?, " ", "rule").is_err());
    assert_eq!(owner.checkpoint()?, before);
    owner.set_read_only_guarded(&observed(&owner)?, true)?;
    assert!(owner.apply_markdown_input_rule_guarded(&observed(&owner)?, " ", "fresh").is_err());
    Ok(())
}
