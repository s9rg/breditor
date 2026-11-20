//! Exact shared slash-command batches (`mountSharedSlashCommands`): the trigger `delete_text`
//! followed by one standard item's structural command is ONE writer-local history group under
//! explicit, natural-typing, general-range and document-selection owners, and peers never gain a local Undo step.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedRichProfile,
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn prose(kind: &str, id: &str, text: &str) -> Value {
    let mut node = json!({"kind":"element","type":kind,"entityId":null,"properties":{"breditor/block-id":id},"children":[{"kind":"text","text":text,"formats":[]}]});
    if kind == "breditor/heading" {
        node["properties"]["breditor/level"] = json!(2);
    }
    node
}
fn profile() -> Result<SharedRichProfile> {
    Ok(SharedRichProfile::from_standard_configuration_json_v2(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":2,"schema":{"name":"example/shared-slash","version":2},"extensions":[]}"#,
    )?)
}
fn room(profile: &SharedRichProfile, first: &str) -> Result<RichReplica> {
    let schema = profile.schema();
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),
        "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[
            prose("breditor/paragraph","intro","Intro"),prose(first,"p","a🙂b"),prose("breditor/paragraph","tail","Tail")]}});
    Ok(profile.create(&document.to_string(), "101".into())?)
}
/// The document root (content only; the envelope never changes).
fn ast(owner: &RichReplica) -> Result<Value> {
    let document: Value = serde_json::from_str(owner.document_json())?;
    Ok(document["root"].clone())
}
fn find<'a>(node: &'a Value, id: &str) -> Option<&'a Value> {
    if node.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(id) {
        return Some(node);
    }
    node.get("children")?.as_array()?.iter().find_map(|child| find(child, id))
}
fn text(node: &Value) -> String {
    node["children"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|run| run["text"].as_str())
        .collect()
}
fn caret(block: &str, offset: u32) -> Selection {
    let point = TextPoint { block: block.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: point.clone(), focus: point }
}
/// The exact `{commands:[...]}` the adapter sends: trigger removal, then the captured toolbar command.
fn batch(block: &str, start: u32, length: u32, item: &Value) -> Result<Vec<Command>> {
    let commands =
        json!([{"kind":"delete_text","data":{"block":block,"offset":start,"length":length}},item]);
    Ok(serde_json::from_value(commands)?)
}
fn table() -> Value {
    let cell = |block: &str, column: &str, p: &str| json!({"kind":"element","type":"breditor/table-cell","entityId":null,"properties":{"breditor/block-id":block,"breditor/column-id":column,"breditor/header":false},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":p},"children":[]}]});
    let row = |block: &str, id: &str, n: &str| json!({"kind":"element","type":"breditor/table-row","entityId":null,"properties":{"breditor/block-id":block,"breditor/row-id":id},"children":[cell(&format!("{n}-c1"),"c1",&format!("{n}-p1")),cell(&format!("{n}-c2"),"c2",&format!("{n}-p2"))]});
    json!({"kind":"element","type":"breditor/table","entityId":null,"properties":{"breditor/block-id":"tb","breditor/table-id":"t","breditor/columns":[{"id":"c1","width":160},{"id":"c2","width":160}],"breditor/merges":[],"breditor/retracted-merges":[]},
        "children":[row("rb1","r1","a"),row("rb2","r2","b")]})
}
/// (item id, follow-up command, block type the trigger paragraph starts as, check on the result)
type Check = fn(&Value) -> bool;
fn items() -> Vec<(&'static str, Value, &'static str, Check)> {
    vec![
        (
            "heading-1",
            json!({"kind":"set_heading","data":{"block":"p","level":1}}),
            "breditor/paragraph",
            |d| find(d, "p").is_some_and(|p| p["type"] == "breditor/heading"),
        ),
        (
            "paragraph",
            json!({"kind":"set_heading","data":{"block":"p","level":null}}),
            "breditor/heading",
            |d| find(d, "p").is_some_and(|p| p["type"] == "breditor/paragraph"),
        ),
        (
            "bullet-list",
            json!({"kind":"wrap_list","data":{"first":"p","last":"p","container":"L","items":["I"],"style":{"kind":"bullet"}}}),
            "breditor/paragraph",
            |d| find(d, "L").is_some_and(|l| l["type"] == "breditor/bullet-list"),
        ),
        (
            "numbered-list",
            json!({"kind":"wrap_list","data":{"first":"p","last":"p","container":"L","items":["I"],"style":{"kind":"ordered","start":1}}}),
            "breditor/paragraph",
            |d| find(d, "L").is_some_and(|l| l["type"] == "breditor/ordered-list"),
        ),
        (
            "task-list",
            json!({"kind":"wrap_task_list","data":{"first":"p","last":"p","container":"T","items":[{"block":"t1","checked":false}]}}),
            "breditor/paragraph",
            |d| find(d, "T").is_some_and(|l| l["type"] == "breditor/task-list"),
        ),
        (
            "blockquote",
            json!({"kind":"wrap_blockquote","data":{"first":"p","last":"p","wrapper":"Q"}}),
            "breditor/paragraph",
            |d| find(d, "Q").is_some_and(|q| q["type"] == "breditor/blockquote"),
        ),
        (
            "code-block",
            json!({"kind":"set_code_block","data":{"block":"p","language":null,"format_policy":"reject_formatted"}}),
            "breditor/paragraph",
            |d| find(d, "p").is_some_and(|p| p["type"] == "breditor/code-block"),
        ),
        (
            "horizontal-rule",
            json!({"kind":"insert_horizontal_rule","data":{"parent":null,"before":"tail","block":"rule"}}),
            "breditor/paragraph",
            |d| find(d, "rule").is_some_and(|r| r["type"] == "breditor/horizontal-rule"),
        ),
        (
            "table",
            json!({"kind":"insert_blocks","data":{"parent":null,"before":"tail","nodes":[table()]}}),
            "breditor/paragraph",
            |d| find(d, "tb").is_some_and(|t| t["type"] == "breditor/table"),
        ),
    ]
}

#[derive(Clone, Copy, Debug)]
enum Mode {
    Explicit,
    Typing,
    GeneralTyping,
    DocumentTyping,
}
fn prepare(profile: &SharedRichProfile, first: &str, mode: Mode) -> Result<RichReplica> {
    let mut a = room(profile, first)?;
    if matches!(mode, Mode::GeneralTyping) {
        a.enable_general_ranges_guarded(&a.observe()?)?;
    }
    if matches!(mode, Mode::DocumentTyping) {
        a.enable_document_selection_guarded(&a.observe()?)?;
    }
    if !matches!(mode, Mode::Explicit) {
        a.enable_typing_history_guarded(&a.observe()?)?;
    }
    a.set_selection_guarded(&a.observe()?, Some(&caret("p", 4)))?;
    // The user types `/x` after "a🙂b" (four UTF-16 units): one typing burst or one explicit group.
    if matches!(mode, Mode::Explicit) {
        a.apply(serde_json::from_value(
            json!([{"kind":"insert_text","data":{"block":"p","offset":4,"text":"/x"}}]),
        )?)?;
    } else {
        a.insert_typing_text_guarded(&a.observe()?, "/", 100)?;
        a.insert_typing_text_guarded(&a.observe()?, "x", 101)?;
    }
    Ok(a)
}

#[test]
fn every_standard_shared_slash_batch_is_one_undo_group_in_every_history_mode() -> Result {
    let profile = profile()?;
    for mode in [Mode::Explicit, Mode::Typing, Mode::GeneralTyping, Mode::DocumentTyping] {
        for (id, item, first, converted) in items() {
            let mut a = prepare(&profile, first, mode)?;
            let typed = ast(&a)?;
            assert_eq!(
                text(find(&typed, "p").ok_or_else(|| format!("typed {id} {mode:?} {typed}"))?),
                "a🙂b/x",
                "{id} {mode:?}"
            );
            let groups = a.undo_count();
            assert!(
                a.apply_with_state(
                    batch("p", 4, 2, &item)?,
                    SelectionUpdate::Map,
                    PendingFormatsUpdate::Map
                )?,
                "{id} {mode:?}"
            );
            let after = ast(&a)?;
            assert!(converted(&after), "{id} {mode:?} converted");
            assert_eq!(
                text(find(&after, "p").ok_or_else(|| format!("{id} {mode:?} {after}"))?),
                "a🙂b",
                "{id} {mode:?} trigger removed"
            );
            assert_eq!(a.undo_count(), groups + 1, "{id} {mode:?} one group");
            // One Undo restores the typed trigger and the original block; Redo replays the whole batch.
            assert!(a.undo()?);
            assert_eq!(ast(&a)?, typed, "{id} {mode:?} undo");
            assert!(a.redo()?);
            assert_eq!(ast(&a)?, after, "{id} {mode:?} redo");
            // The typing that produced `/x` stays its own earlier group.
            a.undo()?;
            a.undo()?;
            let original = ast(&a)?;
            assert_eq!(
                text(
                    find(&original, "p")
                        .ok_or_else(|| format!("original {id} {mode:?} {original}"))?
                ),
                "a🙂b",
                "{id} {mode:?} typing undone"
            );
            assert_eq!(
                find(&original, "p").ok_or_else(|| format!("original {id} {mode:?} {original}"))?["type"],
                first,
                "{id} {mode:?}"
            );
        }
    }
    Ok(())
}

#[test]
fn a_refused_batch_publishes_nothing_and_leaves_the_typed_trigger() -> Result {
    let profile = profile()?;
    let mut a = prepare(&profile, "breditor/paragraph", Mode::Typing)?;
    let (typed, groups) = (ast(&a)?, a.undo_count());
    // A stale structural target (block removed concurrently) refuses the whole batch atomically.
    let stale =
        json!({"kind":"wrap_blockquote","data":{"first":"missing","last":"missing","wrapper":"Q"}});
    assert!(
        a.apply_with_state(
            batch("p", 4, 2, &stale)?,
            SelectionUpdate::Map,
            PendingFormatsUpdate::Map
        )
        .is_err()
    );
    assert_eq!(ast(&a)?, typed);
    assert_eq!(a.undo_count(), groups);
    Ok(())
}

#[test]
fn peers_receive_the_batch_without_a_local_undo_step_and_see_its_undo() -> Result {
    let profile = profile()?;
    let mut a = prepare(&profile, "breditor/paragraph", Mode::Typing)?;
    let mut b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    let typed = ast(&a)?;
    assert_eq!(ast(&b)?, typed);
    let item = json!({"kind":"set_heading","data":{"block":"p","level":2}});
    a.apply_with_state(batch("p", 4, 2, &item)?, SelectionUpdate::Map, PendingFormatsUpdate::Map)?;
    let peer_groups = b.undo_count();
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(ast(&b)?, ast(&a)?);
    assert_eq!(b.undo_count(), peer_groups);
    a.undo()?;
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(ast(&b)?, typed);
    Ok(())
}
