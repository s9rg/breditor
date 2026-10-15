//! Shared list commands preserve stable rich bodies, source characters and selective history.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate,
        actions::{
            DeleteBlock, IndentListItems, InsertBlocks, InsertColumn, InsertText, JoinListItems,
            ListStyle, NestedList, OutdentListItems, SetListKind, SplitListItem, UnwrapList,
            WrapList,
        },
        selection::{Selection, TextPoint},
    },
};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    schema::{CompiledSchema, SchemaId, SchemaVersion},
};
use serde_json::{Value, json};
type TestResult = Result<(), Box<dyn std::error::Error>>;
fn codec() -> Result<DocumentJsonCodecV2, Box<dyn std::error::Error>> {
    Ok(DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/shared-rich")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?))
}
fn peers() -> Result<(RichReplica, RichReplica), Box<dyn std::error::Error>> {
    let codec = codec()?;
    let root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let schema = codec.schema();
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),"root":root}).to_string();
    let a = RichReplica::new(codec.clone(), &input, "1".into())?;
    let b = RichReplica::join(codec, "room".into(), "2".into(), a.updates()?)?;
    Ok((a, b))
}
fn find<'a>(value: &'a Value, id: &str) -> Option<&'a Value> {
    if value.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(id) {
        return Some(value);
    }
    value.get("children").and_then(Value::as_array)?.iter().find_map(|v| find(v, id))
}
fn node(a: &RichReplica, id: &str) -> Value {
    let value: Value = serde_json::from_str(a.document_json()).expect("AST");
    find(&value["root"], id).cloned().unwrap_or(Value::Null)
}
fn text(a: &RichReplica, id: &str) -> String {
    node(a, id)["children"]
        .as_array()
        .expect("runs")
        .iter()
        .filter_map(|v| v["text"].as_str())
        .collect()
}
fn children(a: &RichReplica, id: &str) -> Vec<String> {
    node(a, id)["children"]
        .as_array()
        .expect("children")
        .iter()
        .filter_map(|v| {
            v.pointer("/properties/breditor~1block-id").and_then(Value::as_str).map(str::to_owned)
        })
        .collect()
}
fn paragraph(id: &str, text: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":id},"children":[{"kind":"text","text":text,"formats":[]}]})
}
fn add(a: &mut RichReplica, count: usize) -> TestResult {
    let mut nodes = vec![paragraph("end", "Tail🙂")];
    if count == 3 {
        nodes.push(paragraph("third", "Last"));
    }
    a.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent: Some("cell".into()),
        before: None,
        nodes,
    })])?;
    Ok(())
}
fn wrap(count: usize) -> Command {
    Command::WrapList(WrapList {
        first: "p".into(),
        last: if count == 3 { "third" } else { "end" }.into(),
        container: "list".into(),
        items: (1..=count).map(|i| format!("item-{i}")).collect(),
        style: ListStyle::Ordered { start: 3 },
    })
}
fn caret(block: &str, offset: u32) -> Selection {
    let p = TextPoint { block: block.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: p.clone(), focus: p }
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> TestResult {
    let x = a.updates()?;
    let y = b.updates()?;
    a.receive(y)?;
    b.receive(x)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}
fn typing(block: &str, offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset, text: text.into() })
}
fn indent(first: &str, last: &str, nested: bool) -> Command {
    Command::IndentListItems(IndentListItems {
        container: "list".into(),
        first: first.into(),
        last: last.into(),
        new_nested: nested
            .then(|| NestedList { block: "nested".into(), style: ListStyle::Ordered { start: 7 } }),
    })
}

#[test]
fn wrapping_and_unwrapping_preserve_rich_order_remote_text_and_saved_selection() -> TestResult {
    let (mut a, mut b) = peers()?;
    add(&mut a, 2)?;
    b.receive(a.updates()?)?;
    a.set_selection(Some(&caret("caption", 2)))?;
    let before = a.document_json().to_owned();
    a.apply(vec![wrap(2)])?;
    assert_eq!(children(&a, "item-1"), ["p", "image-block"]);
    assert_eq!(children(&a, "item-2"), ["end"]);
    assert_eq!(a.selection()?, Some(caret("caption", 2)));
    a.undo()?;
    assert_eq!(a.document_json(), before);
    a.redo()?;
    b.apply(vec![typing("p", 1, "R"), typing("caption", 0, "remote")])?;
    sync(&mut a, &mut b)?;
    a.apply(vec![Command::UnwrapList(UnwrapList { container: "list".into() })])?;
    assert_eq!(children(&a, "cell"), ["p", "image-block", "end"]);
    assert_eq!(text(&a, "p"), "aR🙂b");
    assert_eq!(text(&a, "caption"), "remotexy🙂");
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    for _ in 0..3 {
        a.undo()?;
        restored.undo()?;
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        a.redo()?;
        restored.redo()?;
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    }
    Ok(())
}
#[test]
fn concurrent_style_pairs_and_masked_undo_keep_each_writers_kind_and_ordinal() -> TestResult {
    let (mut a, mut b) = peers()?;
    add(&mut a, 2)?;
    a.apply(vec![wrap(2)])?;
    b.receive(a.updates()?)?;
    let style = |style| Command::SetListKind(SetListKind { container: "list".into(), style });
    a.apply(vec![style(ListStyle::Bullet)])?;
    b.apply(vec![style(ListStyle::Ordered { start: 6 })])?;
    sync(&mut a, &mut b)?;
    assert_eq!(node(&a, "list")["properties"]["breditor/start"], 6);
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(node(&a, "list")["properties"]["breditor/start"], 6);
    b.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(node(&a, "list")["properties"]["breditor/start"], 3);
    a.redo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(node(&a, "list")["type"], "breditor/bullet-list");
    assert!(node(&a, "list")["properties"].get("breditor/start").is_none());
    b.redo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(node(&a, "list")["properties"]["breditor/start"], 6);
    Ok(())
}
#[test]
fn indentation_reuses_a_compatible_nested_list_and_nested_outdent_keeps_tail_order() -> TestResult {
    let (mut a, _) = peers()?;
    add(&mut a, 3)?;
    a.apply(vec![wrap(3)])?;
    a.apply(vec![indent("item-2", "item-2", true)])?;
    assert_eq!(children(&a, "item-1"), ["p", "image-block", "nested"]);
    a.apply(vec![indent("item-3", "item-3", false)])?;
    assert_eq!(children(&a, "nested"), ["item-2", "item-3"]);
    let before = a.document_json().to_owned();
    a.apply(vec![Command::OutdentListItems(OutdentListItems {
        container: "nested".into(),
        first: "item-2".into(),
        last: "item-2".into(),
        fresh_tail: None,
    })])?;
    assert_eq!(children(&a, "list"), ["item-1", "item-2"]);
    assert_eq!(children(&a, "item-1"), ["p", "image-block"]);
    assert_eq!(children(&a, "item-2"), ["end", "nested"]);
    assert_eq!(node(&a, "nested")["properties"]["breditor/start"], 8);
    a.undo()?;
    assert_eq!(a.document_json(), before);
    a.redo()?;
    Ok(())
}
#[test]
fn partial_top_level_unlisting_keeps_prefix_tail_ordinals_and_exact_history() -> TestResult {
    let (mut a, _) = peers()?;
    add(&mut a, 3)?;
    a.apply(vec![wrap(3)])?;
    let before = a.document_json().to_owned();
    a.apply(vec![Command::OutdentListItems(OutdentListItems {
        container: "list".into(),
        first: "item-2".into(),
        last: "item-2".into(),
        fresh_tail: Some("tail-list".into()),
    })])?;
    assert_eq!(children(&a, "cell"), ["list", "end", "tail-list"]);
    assert_eq!(children(&a, "list"), ["item-1"]);
    assert_eq!(children(&a, "tail-list"), ["item-3"]);
    assert_eq!(node(&a, "list")["properties"]["breditor/start"], 3);
    assert_eq!(node(&a, "tail-list")["properties"]["breditor/start"], 5);
    a.undo()?;
    assert_eq!(a.document_json(), before);
    a.redo()?;
    Ok(())
}
#[test]
fn list_enter_and_join_retain_original_sources_offline_typing_and_media_tails() -> TestResult {
    let (mut a, mut b) = peers()?;
    add(&mut a, 2)?;
    a.apply(vec![wrap(2)])?;
    b.receive(a.updates()?)?;
    a.set_selection(Some(&caret("p", 3)))?;
    a.apply(vec![Command::SplitListItem(SplitListItem {
        block: "p".into(),
        offset: 1,
        new_item: "right-item".into(),
        right: "right".into(),
        right_heading: Some(2),
    })])?;
    assert_eq!(children(&a, "item-1"), ["p"]);
    assert_eq!(children(&a, "right-item"), ["right", "image-block"]);
    b.apply(vec![typing("p", 3, "R")])?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&a, "p"), "a");
    assert_eq!(text(&a, "right"), "🙂Rb");
    assert_eq!(node(&a, "right")["properties"]["breditor/level"], 2);
    let before = a.document_json().to_owned();
    a.apply(vec![Command::JoinListItems(JoinListItems {
        container: "list".into(),
        left: "item-1".into(),
        right: "right-item".into(),
    })])?;
    assert_eq!(text(&a, "p"), "a🙂Rb");
    assert_eq!(children(&a, "item-1"), ["p", "image-block"]);
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    for _ in 0..3 {
        a.undo()?;
        restored.undo()?;
        assert_eq!(a.document_json(), before);
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        a.redo()?;
        restored.redo()?;
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    }
    Ok(())
}
#[test]
fn join_with_a_left_media_tail_keeps_the_right_head_as_a_later_body_block() -> TestResult {
    let (mut a, mut b) = peers()?;
    add(&mut a, 2)?;
    a.apply(vec![wrap(2)])?;
    b.receive(a.updates()?)?;
    a.apply(vec![Command::JoinListItems(JoinListItems {
        container: "list".into(),
        left: "item-1".into(),
        right: "item-2".into(),
    })])?;
    assert_eq!(children(&a, "item-1"), ["p", "image-block", "end"]);
    assert_eq!(text(&a, "p"), "a🙂b");
    b.apply(vec![typing("end", 0, "R")])?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&a, "end"), "RTail🙂");
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(children(&a, "item-2"), ["end"]);
    assert_eq!(text(&a, "end"), "RTail🙂");
    Ok(())
}
#[test]
fn composed_list_groups_and_late_shape_failure_keep_one_atomic_history_boundary() -> TestResult {
    let (mut a, _) = peers()?;
    add(&mut a, 2)?;
    let before = a.checkpoint()?;
    let observed = a.observe()?;
    assert!(
        a.apply_guarded(
            &observed,
            vec![wrap(2), indent("item-1", "item-1", true)],
            SelectionUpdate::Map,
            PendingFormatsUpdate::Map
        )
        .is_err()
    );
    assert_eq!(a.checkpoint()?, before);
    a.check(&observed)?;
    let document = a.document_json().to_owned();
    let depth = a.undo_count();
    a.apply(vec![
        wrap(2),
        indent("item-2", "item-2", true),
        Command::SetListKind(SetListKind {
            container: "nested".into(),
            style: ListStyle::Ordered { start: 9 },
        }),
    ])?;
    assert_eq!(node(&a, "nested")["properties"]["breditor/start"], 9);
    assert_eq!(a.undo_count(), depth + 1);
    a.undo()?;
    assert_eq!(a.document_json(), document);
    a.redo()?;
    Ok(())
}

fn normalized(a: &RichReplica, parent: &str) -> Result<String, Box<dyn std::error::Error>> {
    Ok(node(a, parent)["children"][0]["properties"]["breditor/block-id"]
        .as_str()
        .ok_or("normalized text")?
        .into())
}
#[test]
fn an_empty_normalized_cell_can_be_wrapped_typed_and_restored_without_duplicate_ids() -> TestResult
{
    let (mut a, _) = peers()?;
    a.apply(vec![
        Command::DeleteBlock(DeleteBlock { block: "p".into() }),
        Command::DeleteBlock(DeleteBlock { block: "image-block".into() }),
    ])?;
    let id = normalized(&a, "cell")?;
    let before = a.document_json().to_owned();
    a.set_selection(Some(&caret(&id, 0)))?;
    a.apply(vec![Command::WrapList(WrapList {
        first: id.clone(),
        last: id.clone(),
        container: "empty-list".into(),
        items: vec!["empty-item".into()],
        style: ListStyle::Bullet,
    })])?;
    a.insert_plain_text("Typed🙂")?;
    assert_eq!(text(&a, &id), "Typed🙂");
    assert_eq!(children(&a, "cell"), ["empty-list"]);
    a.undo()?;
    a.undo()?;
    assert_eq!(a.document_json(), before);
    a.redo()?;
    a.redo()?;
    assert_eq!(text(&a, &id), "Typed🙂");
    Ok(())
}
#[test]
fn a_derived_axis_cell_can_wrap_its_empty_text_then_type_in_the_same_identity() -> TestResult {
    let (mut a, _) = peers()?;
    a.apply(vec![Command::InsertColumn(InsertColumn {
        block: "table-block".into(),
        column: "new-column".into(),
        width: 140,
        before: None,
    })])?;
    let cell = children(&a, "row")[1].clone();
    let id = normalized(&a, &cell)?;
    a.apply(vec![Command::WrapList(WrapList {
        first: id.clone(),
        last: id.clone(),
        container: "new-list".into(),
        items: vec!["new-item".into()],
        style: ListStyle::Ordered { start: 4 },
    })])?;
    a.set_selection(Some(&caret(&id, 0)))?;
    a.insert_plain_text("Cell")?;
    assert_eq!(text(&a, &id), "Cell");
    assert_eq!(children(&a, &cell), ["new-list"]);
    Ok(())
}
#[test]
fn unwrapping_and_unlisting_empty_item_heads_retain_their_normalized_identity() -> TestResult {
    for unwrap in [false, true] {
        let (mut a, _) = peers()?;
        add(&mut a, 2)?;
        a.apply(vec![wrap(2)])?;
        a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "p".into() })])?;
        let id = normalized(&a, "item-1")?;
        let before = a.document_json().to_owned();
        let command = if unwrap {
            Command::UnwrapList(UnwrapList { container: "list".into() })
        } else {
            Command::OutdentListItems(OutdentListItems {
                container: "list".into(),
                first: "item-1".into(),
                last: "item-1".into(),
                fresh_tail: None,
            })
        };
        a.apply(vec![command])?;
        a.set_selection(Some(&caret(&id, 0)))?;
        a.insert_plain_text("Retained")?;
        assert_eq!(text(&a, &id), "Retained");
        a.undo()?;
        a.undo()?;
        assert_eq!(a.document_json(), before);
    }
    Ok(())
}

fn empty(a: &mut RichReplica) -> TestResult {
    a.apply(vec![
        Command::DeleteBlock(DeleteBlock { block: "p".into() }),
        Command::DeleteBlock(DeleteBlock { block: "image-block".into() }),
    ])?;
    Ok(())
}
fn wrap_empty(id: &str, list: &str, item: &str) -> Command {
    Command::WrapList(WrapList {
        first: id.into(),
        last: id.into(),
        container: list.into(),
        items: vec![item.into()],
        style: ListStyle::Bullet,
    })
}
#[test]
fn independent_wrapping_of_one_normalized_head_merges_without_duplicate_occurrences() -> TestResult
{
    let (mut a, mut b) = peers()?;
    empty(&mut a)?;
    b.receive(a.updates()?)?;
    let id = normalized(&a, "cell")?;
    a.apply(vec![wrap_empty(&id, "list-a", "item-a")])?;
    b.apply(vec![wrap_empty(&id, "list-b", "item-b")])?;
    b.set_selection(Some(&caret(&id, 0)))?;
    b.insert_plain_text("Remote")?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&a, &id), "Remote");
    assert_eq!(children(&a, "cell").len(), 2);
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(children(&a, "cell"), ["list-b"]);
    assert_eq!(text(&a, &id), "Remote");
    a.redo()?;
    sync(&mut a, &mut b)?;
    Ok(())
}
#[test]
fn spare_normalization_slots_do_not_leak_empty_paragraphs_into_older_undo_states() -> TestResult {
    let (mut a, _) = peers()?;
    empty(&mut a)?;
    let original = normalized(&a, "cell")?;
    a.apply(vec![wrap_empty(&original, "old-list", "old-item")])?;
    a.set_selection(Some(&caret(&original, 0)))?;
    a.insert_plain_text("Old")?;
    let old = a.document_json().to_owned();
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "old-list".into() })])?;
    let spare = normalized(&a, "cell")?;
    assert_ne!(original, spare);
    assert_eq!(text(&a, &spare), "");
    a.apply(vec![wrap_empty(&spare, "new-list", "new-item")])?;
    a.set_selection(Some(&caret(&spare, 0)))?;
    a.insert_plain_text("New")?;
    let current = a.document_json().to_owned();
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    for _ in 0..3 {
        a.undo()?;
        restored.undo()?;
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    }
    assert_eq!(a.document_json(), old);
    for _ in 0..3 {
        a.redo()?;
        restored.redo()?;
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    }
    assert_eq!(a.document_json(), current);
    Ok(())
}
#[test]
fn matching_list_style_is_a_complete_noop_with_a_live_observation() -> TestResult {
    let (mut a, _) = peers()?;
    add(&mut a, 2)?;
    a.apply(vec![wrap(2)])?;
    let observed = a.observe()?;
    let before = a.checkpoint()?;
    assert!(!a.apply_guarded(
        &observed,
        vec![Command::SetListKind(SetListKind {
            container: "list".into(),
            style: ListStyle::Ordered { start: 3 }
        })],
        SelectionUpdate::Map,
        PendingFormatsUpdate::Map
    )?);
    assert_eq!(a.checkpoint()?, before);
    a.check(&observed)?;
    Ok(())
}
#[test]
fn empty_item_enter_and_join_keep_two_empty_sources_and_one_saved_caret() -> TestResult {
    let (mut a, _) = peers()?;
    add(&mut a, 2)?;
    a.apply(vec![wrap(2)])?;
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "end".into() })])?;
    let id = normalized(&a, "item-2")?;
    a.set_selection(Some(&caret(&id, 0)))?;
    let before = a.document_json().to_owned();
    a.apply(vec![Command::SplitListItem(SplitListItem {
        block: id.clone(),
        offset: 0,
        new_item: "empty-right-item".into(),
        right: "empty-right".into(),
        right_heading: None,
    })])?;
    assert_eq!(children(&a, "list"), ["item-1", "item-2", "empty-right-item"]);
    assert_eq!(text(&a, &id), "");
    assert_eq!(text(&a, "empty-right"), "");
    a.apply(vec![Command::JoinListItems(JoinListItems {
        container: "list".into(),
        left: "item-2".into(),
        right: "empty-right-item".into(),
    })])?;
    a.undo()?;
    a.undo()?;
    assert_eq!(a.document_json(), before);
    assert_eq!(a.selection()?, Some(caret(&id, 0)));
    Ok(())
}

#[test]
fn deleting_a_head_then_unwrapping_in_one_group_prepares_the_new_implicit_target() -> TestResult {
    let (mut a, _) = peers()?;
    add(&mut a, 2)?;
    a.apply(vec![wrap(2)])?;
    let before = a.document_json().to_owned();
    let depth = a.undo_count();
    a.apply(vec![
        Command::DeleteBlock(DeleteBlock { block: "p".into() }),
        Command::UnwrapList(UnwrapList { container: "list".into() }),
    ])?;
    let id = normalized(&a, "cell")?;
    assert!(id.starts_with("breditor-virtual:"));
    assert_eq!(text(&a, &id), "");
    assert_eq!(children(&a, "cell"), [id, "image-block".into(), "end".into()]);
    assert_eq!(a.undo_count(), depth + 1);
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    for _ in 0..3 {
        a.undo()?;
        restored.undo()?;
        assert_eq!(a.document_json(), before);
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        a.redo()?;
        restored.redo()?;
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    }
    Ok(())
}
#[test]
fn a_fresh_split_item_can_synthesize_its_head_and_unwrap_in_one_atomic_group() -> TestResult {
    let (mut a, _) = peers()?;
    add(&mut a, 2)?;
    a.apply(vec![wrap(2)])?;
    let before = a.document_json().to_owned();
    a.apply(vec![
        Command::SplitListItem(SplitListItem {
            block: "p".into(),
            offset: 1,
            new_item: "right-item".into(),
            right: "right".into(),
            right_heading: None,
        }),
        Command::DeleteBlock(DeleteBlock { block: "right".into() }),
        Command::UnwrapList(UnwrapList { container: "list".into() }),
    ])?;
    let ids = children(&a, "cell");
    assert_eq!(ids[0], "p");
    assert!(ids[1].starts_with("breditor-virtual:"));
    assert_eq!(&ids[2..], ["image-block", "end"]);
    assert_eq!(text(&a, "p"), "a");
    assert_eq!(text(&a, &ids[1]), "");
    a.undo()?;
    assert_eq!(a.document_json(), before);
    a.redo()?;
    Ok(())
}
