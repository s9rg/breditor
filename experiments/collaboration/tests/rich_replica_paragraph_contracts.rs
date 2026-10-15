//! Real shared paragraph commands, source-aware carets and exact selective history.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate,
        actions::{
            DeleteBlock, DeleteText, InsertBlocks, InsertColumn, InsertRow, InsertText,
            JoinTextBlocks, MoveBlock, SetFormat, SplitTextBlock,
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
use loro::{ContainerID, ContainerType, LoroDoc};
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
    let schema = codec.schema();
    let root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let source = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),"root":root}).to_string();
    let a = RichReplica::new(codec.clone(), &source, "1".into())?;
    let b = RichReplica::join(codec, "room".into(), "2".into(), a.updates()?)?;
    Ok((a, b))
}
fn split(block: &str, offset: u32, right: &str) -> Command {
    Command::SplitTextBlock(SplitTextBlock {
        block: block.into(),
        offset,
        right: right.into(),
        right_heading: None,
    })
}
fn join(left: &str, right: &str) -> Command {
    Command::JoinTextBlocks(JoinTextBlocks { left: left.into(), right: right.into() })
}
fn insert(block: &str, offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset, text: text.into() })
}
fn caret(block: &str, offset: u32, affinity: Affinity) -> Selection {
    let point = TextPoint { block: block.into(), offset, affinity };
    Selection::TextRange { anchor: point.clone(), focus: point }
}
fn node<'a>(value: &'a Value, block: &str) -> Option<&'a Value> {
    if value.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(block) {
        return Some(value);
    }
    value.get("children").and_then(Value::as_array)?.iter().find_map(|value| node(value, block))
}
fn document(owner: &RichReplica) -> Result<Value, serde_json::Error> {
    serde_json::from_str(owner.document_json())
}
fn text(owner: &RichReplica, block: &str) -> Result<Option<String>, Box<dyn std::error::Error>> {
    Ok(node(&document(owner)?["root"], block).map(|node| {
        node["children"].as_array().map_or_else(String::new, |runs| {
            runs.iter().filter_map(|run| run["text"].as_str()).collect()
        })
    }))
}
fn children(owner: &RichReplica, block: &str) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    Ok(node(&document(owner)?["root"], block).ok_or("parent")?["children"]
        .as_array()
        .ok_or("children")?
        .iter()
        .filter_map(|node| {
            node.pointer("/properties/breditor~1block-id")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .collect())
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> TestResult {
    let aa = a.updates()?;
    let bb = b.updates()?;
    a.receive(bb)?;
    b.receive(aa)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}
fn source(owner: &RichReplica, block: &str) -> Result<String, Box<dyn std::error::Error>> {
    let doc = LoroDoc::new();
    doc.import(&owner.updates()?)?;
    let id = ContainerID::new_mergeable(
        &ContainerID::new_root("texts", ContainerType::Map),
        block,
        ContainerType::Text,
    );
    Ok(doc.try_get_text(id).ok_or("original source")?.to_string())
}
fn paragraph(block: &str, text: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":block},"children":[{"kind":"text","text":text,"formats":[]}]})
}

#[test]
fn shared_split_uses_core_semantics_and_maps_both_sides_of_a_causal_boundary() -> TestResult {
    let (mut a, _) = peers()?;
    let selection = Selection::TextRange {
        anchor: TextPoint { block: "p".into(), offset: 1, affinity: Affinity::Before },
        focus: TextPoint { block: "p".into(), offset: 1, affinity: Affinity::After },
    };
    a.set_selection(Some(&selection))?;
    a.set_pending_formats(Some(&[]))?;
    a.apply(vec![Command::SplitTextBlock(SplitTextBlock {
        block: "p".into(),
        offset: 1,
        right: "right".into(),
        right_heading: Some(2),
    })])?;
    assert_eq!(children(&a, "cell")?, ["p", "right", "image-block"]);
    assert_eq!(text(&a, "p")?.as_deref(), Some("a"));
    assert_eq!(text(&a, "right")?.as_deref(), Some("🙂b"));
    let doc = document(&a)?;
    let right = node(&doc["root"], "right").ok_or("right")?;
    assert_eq!(right["type"], "breditor/heading");
    assert_eq!(right["properties"]["breditor/level"], 2);
    assert_eq!(
        right["children"][0]["formats"],
        json!([{"type":"breditor/strong","properties":{}}])
    );
    assert_eq!(source(&a, "p")?, "a🙂b");
    assert_eq!(source(&a, "right")?, "");
    let Selection::TextRange { anchor, focus } = a.selection()?.ok_or("selection")? else {
        return Err("text selection".into());
    };
    assert_eq!((anchor.block.as_str(), anchor.offset), ("p", 1));
    assert_eq!((focus.block.as_str(), focus.offset), ("right", 0));
    assert!(a.pending_formats().is_none());
    a.undo()?;
    assert_eq!(a.selection()?, Some(selection));
    assert_eq!(a.pending_formats(), Some(&[][..]));
    a.redo()?;
    assert_eq!(text(&a, "right")?.as_deref(), Some("🙂b"));
    Ok(())
}

#[test]
fn offline_typing_and_owned_formatting_follow_the_original_split_characters() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.set_selection(Some(&caret("p", 1, Affinity::After)))?;
    b.set_selection(Some(&caret("p", 3, Affinity::After)))?;
    a.apply(vec![split("p", 1, "right")])?;
    b.apply(vec![
        insert("p", 3, "X"),
        Command::SetFormat(SetFormat {
            block: "p".into(),
            offset: 1,
            length: 3,
            format: json!({"type":"breditor/strong","properties":{}}),
            enabled: false,
        }),
    ])?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&a, "p")?.as_deref(), Some("a"));
    assert_eq!(text(&a, "right")?.as_deref(), Some("🙂Xb"));
    assert_eq!(b.selection()?, Some(caret("right", 3, Affinity::After)));
    assert_eq!(
        node(&document(&a)?["root"], "right").ok_or("right")?["children"][0]["formats"],
        json!([])
    );
    a.undo()?;
    assert_eq!(text(&a, "p")?.as_deref(), Some("a🙂Xb"));
    assert!(text(&a, "right")?.is_none());
    a.redo()?;
    assert_eq!(text(&a, "right")?.as_deref(), Some("🙂Xb"));
    Ok(())
}

#[test]
fn observed_right_typing_survives_split_undo_as_retained_content_and_redo() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![split("p", 1, "right")])?;
    b.receive(a.updates()?)?;
    b.set_selection(Some(&caret("right", 0, Affinity::After)))?;
    b.insert_plain_text("R")?;
    a.receive(b.updates()?)?;
    a.undo()?;
    assert_eq!(text(&a, "p")?.as_deref(), Some("a🙂b"));
    assert!(text(&a, "right")?.is_none());
    assert!(source(&a, "p")?.contains('R'));
    a.redo()?;
    assert_eq!(text(&a, "right")?.as_deref(), Some("R🙂b"));
    Ok(())
}

#[test]
fn shared_join_preserves_offline_typing_and_saved_source_carets_through_repeated_history()
-> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![split("p", 1, "right")])?;
    b.receive(a.updates()?)?;
    a.set_selection(Some(&caret("right", 2, Affinity::After)))?;
    a.apply(vec![join("p", "right")])?;
    b.apply(vec![insert("right", 2, "X")])?;
    a.receive(b.updates()?)?;
    assert_eq!(text(&a, "p")?.as_deref(), Some("a🙂Xb"));
    assert!(text(&a, "right")?.is_none());
    assert_eq!(a.selection()?, Some(caret("p", 4, Affinity::After)));
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    for _ in 0..3 {
        a.undo()?;
        restored.undo()?;
        assert_eq!(text(&a, "right")?.as_deref(), Some("🙂Xb"));
        assert_eq!(a.selection()?, Some(caret("right", 3, Affinity::After)));
        assert_eq!(a.view_json()?, restored.view_json()?);
        assert_eq!(a.updates()?, restored.updates()?);
        a.redo()?;
        restored.redo()?;
        assert_eq!(text(&a, "p")?.as_deref(), Some("a🙂Xb"));
        assert_eq!(a.view_json()?, restored.view_json()?);
        assert_eq!(a.updates()?, restored.updates()?);
    }
    Ok(())
}

#[test]
fn one_group_can_type_split_type_a_new_target_and_join_without_undoing_definitions() -> TestResult {
    let (mut a, _) = peers()?;
    let initial = a.document_json().to_owned();
    a.set_selection(Some(&caret("p", 1, Affinity::Before)))?;
    a.apply_with_state(
        vec![
            insert("p", 0, "Q"),
            split("p", 2, "right"),
            insert("right", 0, "R"),
            join("p", "right"),
        ],
        SelectionUpdate::Set(Some(caret("p", 6, Affinity::After))),
        PendingFormatsUpdate::Map,
    )?;
    assert_eq!(a.undo_count(), 1);
    assert_eq!(text(&a, "p")?.as_deref(), Some("QaR🙂b"));
    assert_eq!(children(&a, "cell")?, ["p", "image-block"]);
    for _ in 0..3 {
        a.undo()?;
        assert_eq!(a.document_json(), initial);
        assert_eq!(a.selection()?, Some(caret("p", 1, Affinity::Before)));
        a.redo()?;
        assert_eq!(text(&a, "p")?.as_deref(), Some("QaR🙂b"));
        assert_eq!(a.selection()?, Some(caret("p", 6, Affinity::After)));
    }
    Ok(())
}

#[test]
fn a_split_uses_the_parent_after_an_earlier_move_in_the_same_group() -> TestResult {
    let (mut a, _) = peers()?;
    a.apply(vec![
        Command::MoveBlock(MoveBlock {
            block: "p".into(),
            parent: None,
            before: Some("table-block".into()),
        }),
        split("p", 1, "right"),
    ])?;
    let doc = document(&a)?;
    let blocks: Vec<_> = doc["root"]["children"]
        .as_array()
        .ok_or("root")?
        .iter()
        .filter_map(|node| node.pointer("/properties/breditor~1block-id").and_then(Value::as_str))
        .collect();
    assert_eq!(blocks, ["p", "right", "table-block"]);
    assert_eq!(children(&a, "cell")?, ["image-block"]);
    a.undo()?;
    assert_eq!(children(&a, "cell")?, ["p", "image-block"]);
    Ok(())
}

#[test]
fn invalid_caption_scalar_kind_and_cross_parent_joins_are_atomic_and_keep_guards_live() -> TestResult
{
    let (mut a, _) = peers()?;
    let before = a.checkpoint()?;
    let observation = a.observe()?;
    for command in [
        split("caption", 1, "new-caption"),
        split("p", 2, "half-emoji"),
        Command::SplitTextBlock(SplitTextBlock {
            block: "p".into(),
            offset: 1,
            right: "bad-rank".into(),
            right_heading: Some(7),
        }),
        join("p", "caption"),
    ] {
        assert!(a.apply(vec![command]).is_err());
        assert_eq!(a.checkpoint()?, before);
        a.check(&observation)?;
    }
    Ok(())
}

#[test]
fn a_split_id_cannot_be_reused_after_undo_and_old_shared_contracts_reject() -> TestResult {
    let (mut a, _) = peers()?;
    a.apply(vec![split("p", 1, "right")])?;
    a.undo()?;
    let before = a.checkpoint()?;
    assert!(a.apply(vec![split("p", 3, "right")]).is_err());
    assert_eq!(a.checkpoint()?, before);
    for version in 1..10 {
        let mut old: Value = serde_json::from_str(&before)?;
        old["version"] = json!(version);
        assert!(RichReplica::restore(codec()?, "room", &old.to_string()).is_err());
    }
    let mut frame: Value = serde_json::from_str(&a.update_frame()?)?;
    frame["modelVersion"] = json!(2);
    assert!(a.receive_frame(&frame.to_string()).is_err());
    assert_eq!(a.checkpoint()?, before);
    Ok(())
}

#[test]
fn splitting_a_normalized_empty_cell_keeps_both_empty_paragraphs_and_exact_history() -> TestResult {
    let (mut a, _) = peers()?;
    a.apply(vec![
        Command::DeleteBlock(DeleteBlock { block: "p".into() }),
        Command::DeleteBlock(DeleteBlock { block: "image-block".into() }),
    ])?;
    let fallback = children(&a, "cell")?.first().ok_or("fallback")?.clone();
    let before = a.document_json().to_owned();
    a.set_selection(Some(&caret(&fallback, 0, Affinity::After)))?;
    a.apply(vec![split(&fallback, 0, "right")])?;
    assert_eq!(children(&a, "cell")?, [fallback.clone(), "right".into()]);
    assert_eq!(a.selection()?, Some(caret("right", 0, Affinity::After)));
    a.undo()?;
    assert_eq!(a.document_json(), before);
    assert_eq!(a.selection()?, Some(caret(&fallback, 0, Affinity::After)));
    a.redo()?;
    assert_eq!(children(&a, "cell")?, [fallback, "right".into()]);
    Ok(())
}

#[test]
fn a_new_axis_derived_cell_can_split_and_type_without_changing_geometry() -> TestResult {
    let (mut a, _) = peers()?;
    a.apply(vec![Command::InsertColumn(InsertColumn {
        block: "table-block".into(),
        column: "new-column".into(),
        width: 140,
        before: None,
    })])?;
    let doc = document(&a)?;
    let cell = &node(&doc["root"], "row").ok_or("row")?["children"][1];
    let cell_id = cell["properties"]["breditor/block-id"].as_str().ok_or("cell id")?.to_owned();
    let fallback = cell["children"][0]["properties"]["breditor/block-id"]
        .as_str()
        .ok_or("fallback")?
        .to_owned();
    a.apply(vec![split(&fallback, 0, "right"), insert("right", 0, "Typed🙂")])?;
    assert_eq!(children(&a, &cell_id)?, [fallback, "right".into()]);
    assert_eq!(text(&a, "right")?.as_deref(), Some("Typed🙂"));
    a.undo()?;
    assert_eq!(children(&a, &cell_id)?.len(), 1);
    Ok(())
}

#[test]
fn text_boundaries_inside_a_list_item_retain_the_list_and_rich_flow_order() -> TestResult {
    let (mut a, _) = peers()?;
    let item = json!({"kind":"element","type":"breditor/list-item","entityId":null,"properties":{"breditor/block-id":"item"},"children":[paragraph("lp","one🙂two")]});
    let list = json!({"kind":"element","type":"breditor/bullet-list","entityId":null,"properties":{"breditor/block-id":"list"},"children":[item]});
    a.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent: None,
        before: None,
        nodes: vec![list],
    })])?;
    a.apply(vec![split("lp", 3, "right")])?;
    assert_eq!(children(&a, "item")?, ["lp", "right"]);
    assert_eq!(text(&a, "lp")?.as_deref(), Some("one"));
    assert_eq!(text(&a, "right")?.as_deref(), Some("🙂two"));
    a.apply(vec![join("lp", "right")])?;
    assert_eq!(text(&a, "lp")?.as_deref(), Some("one🙂two"));
    assert_eq!(children(&a, "item")?, ["lp"]);
    Ok(())
}

#[test]
fn joined_logical_range_format_and_deletion_route_to_reordered_original_intervals() -> TestResult {
    let (mut a, _) = peers()?;
    a.apply(vec![split("p", 3, "right")])?;
    a.apply(vec![Command::MoveBlock(MoveBlock {
        block: "right".into(),
        parent: Some("cell".into()),
        before: Some("p".into()),
    })])?;
    a.apply(vec![join("right", "p")])?;
    assert_eq!(text(&a, "right")?.as_deref(), Some("ba🙂"));
    a.apply(vec![
        Command::SetFormat(SetFormat {
            block: "right".into(),
            offset: 0,
            length: 2,
            format: json!({"type":"breditor/strong","properties":{}}),
            enabled: false,
        }),
        Command::DeleteText(DeleteText { block: "right".into(), offset: 0, length: 2 }),
    ])?;
    assert_eq!(text(&a, "right")?.as_deref(), Some("🙂"));
    assert_eq!(source(&a, "p")?, "🙂");
    a.undo()?;
    assert_eq!(text(&a, "right")?.as_deref(), Some("ba🙂"));
    Ok(())
}

#[test]
fn format_undo_retracts_its_inherited_annotation_on_offline_insertions() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![Command::SetFormat(SetFormat {
        block: "p".into(),
        offset: 0,
        length: 4,
        format: json!({"type":"breditor/strong","properties":{}}),
        enabled: false,
    })])?;
    b.apply(vec![insert("p", 1, "X")])?;
    sync(&mut a, &mut b)?;
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    for _ in 0..3 {
        a.undo()?;
        restored.undo()?;
        assert_eq!(
            node(&document(&a)?["root"], "p").ok_or("p")?["children"],
            json!([{"kind":"text","text":"aX🙂b","formats":[{"type":"breditor/strong","properties":{}}]}])
        );
        assert_eq!(a.updates()?, restored.updates()?);
        a.redo()?;
        restored.redo()?;
        assert_eq!(
            node(&document(&a)?["root"], "p").ok_or("p")?["children"],
            json!([{"kind":"text","text":"aX🙂b","formats":[]}])
        );
        assert_eq!(a.updates()?, restored.updates()?);
    }
    Ok(())
}

#[test]
fn independent_right_source_typing_and_end_bindings_restore_through_history_and_join() -> TestResult
{
    let (mut a, _) = peers()?;
    a.set_selection(Some(&caret("p", 4, Affinity::After)))?;
    a.apply(vec![split("p", 4, "right")])?;
    a.insert_plain_text("New🙂")?;
    assert_eq!(source(&a, "p")?, "a🙂b");
    assert_eq!(source(&a, "right")?, "New🙂");
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    for _ in 0..3 {
        a.undo()?;
        restored.undo()?;
        assert_eq!(a.selection()?, Some(caret("right", 0, Affinity::After)));
        a.redo()?;
        restored.redo()?;
        assert_eq!(a.selection()?, Some(caret("right", 5, Affinity::After)));
        assert_eq!(a.view_json()?, restored.view_json()?);
        assert_eq!(a.updates()?, restored.updates()?);
    }
    a.set_selection(Some(&caret("right", 3, Affinity::Before)))?;
    a.apply(vec![join("p", "right")])?;
    assert_eq!(text(&a, "p")?.as_deref(), Some("a🙂bNew🙂"));
    assert_eq!(a.selection()?, Some(caret("p", 7, Affinity::Before)));
    a.undo()?;
    assert_eq!(a.selection()?, Some(caret("right", 3, Affinity::Before)));
    a.redo()?;
    assert_eq!(a.selection()?, Some(caret("p", 7, Affinity::Before)));
    Ok(())
}

#[test]
fn concurrent_cuts_at_different_offsets_keep_paragraphs_in_original_character_order() -> TestResult
{
    for (first, second) in [(1, 3), (3, 1)] {
        for reverse in [false, true] {
            let (mut a, mut b) = peers()?;
            a.apply(vec![split("p", first, "right-a")])?;
            b.apply(vec![split("p", second, "right-b")])?;
            if reverse {
                sync(&mut b, &mut a)?;
            } else {
                sync(&mut a, &mut b)?;
            }
            let mut combined = String::new();
            for block in children(&a, "cell")? {
                if block != "image-block" {
                    combined.push_str(&text(&a, &block)?.ok_or("paragraph")?);
                }
            }
            assert_eq!(combined, "a🙂b");
        }
    }
    Ok(())
}

#[test]
fn atomic_split_join_maps_typing_state_once_at_the_final_group_boundary() -> TestResult {
    let (mut a, _) = peers()?;
    a.set_selection(Some(&caret("p", 1, Affinity::After)))?;
    a.set_pending_formats(Some(&[]))?;
    a.apply(vec![split("p", 1, "right"), join("p", "right")])?;
    assert_eq!(a.selection()?, Some(caret("p", 1, Affinity::After)));
    assert_eq!(a.pending_formats(), Some(&[][..]));
    assert_eq!(a.undo_count(), 1);
    a.undo()?;
    assert_eq!(a.pending_formats(), Some(&[][..]));
    a.redo()?;
    assert_eq!(a.pending_formats(), Some(&[][..]));
    Ok(())
}

#[test]
fn atomic_axis_edits_cannot_reclassify_a_new_row_as_an_original_grid_fallback() -> TestResult {
    use breditor_collab_feasibility::rich_replica::selection::CellTarget;
    let (mut a, _) = peers()?;
    let cell = CellTarget { table: "t".into(), row: "r".into(), column: "c".into() };
    a.set_selection(Some(&Selection::Grid { anchor: cell.clone(), focus: cell.clone() }))?;
    a.apply(vec![
        Command::InsertRow(InsertRow {
            block: "table-block".into(),
            row_block: "new-row".into(),
            row: "new-r".into(),
            before: None,
        }),
        Command::DeleteBlock(DeleteBlock { block: "row".into() }),
    ])?;
    assert!(a.selection()?.is_none());
    a.undo()?;
    assert_eq!(a.selection()?, Some(Selection::Grid { anchor: cell.clone(), focus: cell }));
    a.redo()?;
    assert!(a.selection()?.is_none());
    Ok(())
}
