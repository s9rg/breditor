//! Native flow stops, read-only navigation and explicit atom-adjacent text with exact history.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec, RichTypingSessionJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, FlowMove, FlowNavigationOutcome, RichDocument, RichLocalOutcome, RichLocalSession,
        RichSelection, RichSelectionError, RichSelectionKind, RichTextPoint, navigate_flow,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn id(s: &str) -> Result<BlockId> {
    Ok(BlockId::try_new(s)?)
}
fn text(s: &str, start: u64, end: u64) -> Result<RichSelectionKind> {
    let p = |offset| -> Result<RichTextPoint> {
        Ok(RichTextPoint::new(id(s)?, TextOffset::try_new(offset)?, Affinity::After))
    };
    Ok(RichSelectionKind::TextRange { anchor: p(start)?, focus: p(end)? })
}
fn node(s: &str) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::Node(id(s)?))
}
fn prose(s: &str, value: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":s},"children":[{"kind":"text","text":value,"formats":[]}]})
}
fn count(v: &Value) -> usize {
    1 + v
        .get("children")
        .and_then(Value::as_array)
        .map_or(0, |a| a.iter().map(count).sum::<usize>())
}
fn find(v: &Value, id: &str) -> Option<Value> {
    if v.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(id) {
        return Some(v.clone());
    }
    v.get("children")?.as_array()?.iter().find_map(|n| find(n, id))
}
fn setup(language: u32, limits: DocumentLimits) -> Result<(EditorContext, RichLocalSession)> {
    let schema_id = SchemaId::new(
        QualifiedName::try_new("example/flow-navigation")?,
        SchemaVersion::try_new(1)?,
    );
    let extensions = ExtensionSet::try_new(vec![], ExtensionLimits::default())?;
    let schema = if language == 2 {
        CompiledSchema::try_compile_rich_content_profile_v2(schema_id, &extensions)?
    } else {
        CompiledSchema::try_compile_rich_content_profile(schema_id, &extensions)?
    };
    let c = EditorContext::new(schema, limits);
    let old: Value = serde_json::from_str(include_str!("fixtures/rich-local-root.json"))?;
    let mut root: Value = if language == 2 {
        serde_json::from_str(include_str!("fixtures/rich-code-exit-root.json"))?
    } else {
        old.clone()
    };
    let children = root["children"].as_array_mut().ok_or("root")?;
    children.insert(0, prose("before", "a🙂b"));
    if language == 2 {
        let mut hidden = children[1].clone();
        hidden["properties"]["breditor/block-id"] = json!("hidden-table");
        hidden["properties"]["breditor/table-id"] = json!("hidden-t");
        hidden["children"] = json!([]);
        children.insert(3, hidden);
        children.push(old["children"][0]["children"][0]["children"][0]["children"][1].clone());
    }
    children.push(prose("after", "End"));
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/flow-navigation","version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":root}).to_string();
    let doc = RichDocument::try_admit(
        c.schema(),
        DocumentJsonCodecV2::new(c.schema().clone())
            .with_limits(c.limits().clone())
            .decode(&input)?,
        c.limits(),
    )?;
    let a = RichLocalSession::try_new(
        c.clone(),
        doc,
        Some(text("before", 4, 4)?),
        HistoryCapacity::default(),
    )?;
    Ok((c, a))
}
fn saved(c: &EditorContext, a: &RichLocalSession) -> Result<String> {
    Ok(if a.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(c.clone()).encode(a)?
    } else {
        RichSessionJsonCodec::new(c.clone()).encode(a)?
    })
}
fn moved(
    a: &RichLocalSession,
    source: RichSelectionKind,
    direction: FlowMove,
) -> Result<RichSelectionKind> {
    let doc = a.state().document();
    let proof = RichSelection::try_new(doc, source)?;
    let FlowNavigationOutcome::Moved(result) = navigate_flow(doc, &proof, direction)? else {
        return Err("expected move".into());
    };
    Ok(result.kind().clone())
}
fn caret(kind: &RichSelectionKind, block: &str, offset: u64, affinity: Affinity) -> Result {
    let RichSelectionKind::TextRange { anchor, focus } = kind else {
        return Err("text result".into());
    };
    assert_eq!(anchor, focus);
    assert_eq!(focus.block().as_str(), block);
    assert_eq!(focus.offset().get(), offset);
    assert_eq!(focus.affinity(), affinity);
    Ok(())
}

#[test]
fn atoms_are_single_stops_and_transparent_containers_keep_depth_first_reading_order() -> Result {
    let (_, a) = setup(2, DocumentLimits::default())?;
    assert_eq!(moved(&a, text("before", 4, 4)?, FlowMove::After)?, node("table-block")?);
    caret(&moved(&a, node("table-block")?, FlowMove::After)?, "code-root", 0, Affinity::After)?;
    assert_eq!(moved(&a, text("code-root", 7, 7)?, FlowMove::After)?, node("root-next")?);
    caret(&moved(&a, node("root-next")?, FlowMove::After)?, "code-quote", 0, Affinity::After)?;
    assert_eq!(moved(&a, text("code-quote", 0, 0)?, FlowMove::Before)?, node("root-next")?);
    caret(&moved(&a, node("quote")?, FlowMove::After)?, "item-head", 0, Affinity::After)?;
    caret(
        &moved(&a, text("item-head", 0, 0)?, FlowMove::Before)?,
        "quote-next",
        10,
        Affinity::Before,
    )?;
    caret(
        &moved(&a, text("task-head", 0, 0)?, FlowMove::Before)?,
        "list-next",
        9,
        Affinity::Before,
    )?;
    caret(&moved(&a, node("tasks")?, FlowMove::Before)?, "list-next", 9, Affinity::Before)?;
    assert_eq!(moved(&a, text("code-last", 0, 0)?, FlowMove::After)?, node("image-block")?);
    caret(&moved(&a, node("image-block")?, FlowMove::After)?, "after", 0, Affinity::After)?;
    caret(&moved(&a, node("image-block")?, FlowMove::Before)?, "code-last", 0, Affinity::Before)?;
    Ok(())
}

#[test]
fn table_cells_and_captions_are_domains_and_ranges_or_interior_carets_are_not_discarded() -> Result
{
    let (_, a) = setup(2, DocumentLimits::default())?;
    let doc = a.state().document();
    for (source, direction) in [
        (text("p", 0, 0)?, FlowMove::Before),
        (text("cell-next", 9, 9)?, FlowMove::After),
        (text("caption", 0, 0)?, FlowMove::Before),
        (text("caption", 4, 4)?, FlowMove::After),
        (text("before", 0, 0)?, FlowMove::Before),
        (text("after", 3, 3)?, FlowMove::After),
    ] {
        assert_eq!(
            navigate_flow(doc, &RichSelection::try_new(doc, source)?, direction)?,
            FlowNavigationOutcome::Boundary(direction)
        );
    }
    let cell = doc.cell_entries().next().ok_or("cell")?.0.clone();
    for source in [
        text("before", 1, 1)?,
        text("before", 4, 0)?,
        RichSelectionKind::TextRange {
            anchor: RichTextPoint::new(id("before")?, TextOffset::ZERO, Affinity::After),
            focus: RichTextPoint::new(id("after")?, TextOffset::ZERO, Affinity::Before),
        },
        RichSelectionKind::Grid { anchor: cell.clone(), focus: cell },
    ] {
        assert_eq!(
            navigate_flow(doc, &RichSelection::try_new(doc, source)?, FlowMove::After)?,
            FlowNavigationOutcome::NotApplicable
        );
    }
    Ok(())
}

#[test]
fn original_v1_image_and_table_stops_reuse_existing_selection_semantics() -> Result {
    let (_, a) = setup(1, DocumentLimits::default())?;
    assert_eq!(moved(&a, text("before", 4, 4)?, FlowMove::After)?, node("table-block")?);
    assert_eq!(moved(&a, text("p", 4, 4)?, FlowMove::After)?, node("image-block")?);
    caret(&moved(&a, node("image-block")?, FlowMove::Before)?, "p", 4, Affinity::Before)?;
    caret(&moved(&a, node("table-block")?, FlowMove::After)?, "after", 0, Affinity::After)?;
    Ok(())
}

#[test]
fn selection_only_navigation_is_read_only_legal_preserves_redo_and_noops_publish_nothing() -> Result
{
    for language in [1, 2] {
        let (c, mut a) = setup(language, DocumentLimits::default())?;
        a.insert_plain_text(&a.snapshot(), "Q")?;
        a.undo(&a.snapshot())?;
        assert_eq!(a.redo_depth(), 1);
        a.set_read_only(&a.snapshot(), true)?;
        let content = a.state().document().document().clone();
        assert_eq!(
            a.navigate_flow(&a.snapshot(), FlowMove::After)?,
            RichLocalOutcome::SelectionOnly
        );
        assert_eq!(a.state().selection().ok_or("selection")?.kind(), &node("table-block")?);
        assert_eq!(a.redo_depth(), 1);
        assert_eq!(a.undo_depth(), 0);
        assert_eq!(a.state().document().document(), &content);
        a.set_selection(&a.snapshot(), Some(text("before", 0, 0)?))?;
        let before = saved(&c, &a)?;
        let revision = a.state().revision();
        assert_eq!(a.navigate_flow(&a.snapshot(), FlowMove::Before)?, RichLocalOutcome::Unchanged);
        assert_eq!(a.state().revision(), revision);
        assert_eq!(saved(&c, &a)?, before);
        a.set_selection(&a.snapshot(), Some(text("before", 4, 0)?))?;
        let before = saved(&c, &a)?;
        assert_eq!(a.navigate_flow(&a.snapshot(), FlowMove::After)?, RichLocalOutcome::Unchanged);
        assert_eq!(saved(&c, &a)?, before);
    }
    Ok(())
}

#[test]
fn paragraph_creation_beside_every_atom_preserves_original_source_and_exact_future_history()
-> Result {
    for language in [1, 2] {
        for target in if language == 1 {
            vec!["table-block", "image-block"]
        } else {
            vec!["table-block", "image-block", "root-next"]
        } {
            for direction in [FlowMove::Before, FlowMove::After] {
                for typing in [false, true] {
                    let (c, mut a) = setup(language, DocumentLimits::default())?;
                    if typing {
                        a.enable_typing_history(&a.snapshot())?;
                    }
                    a.set_selection(&a.snapshot(), Some(node(target)?))?;
                    let before_doc = a.state().document().clone();
                    let before = before_doc.document().clone();
                    let old_path = before_doc.block_path(&id(target)?).ok_or("atom path")?.clone();
                    let original = before.node_at(&old_path)?.clone();
                    a.insert_paragraph_adjacent(&a.snapshot(), &id("fresh")?, direction)?;
                    assert_eq!(a.undo_depth(), 1);
                    caret(
                        a.state().selection().ok_or("selection")?.kind(),
                        "fresh",
                        0,
                        Affinity::After,
                    )?;
                    let now = a.state().document();
                    let atom_path = now.block_path(&id(target)?).ok_or("atom")?;
                    let fresh = now.block_path(&id("fresh")?).ok_or("paragraph")?;
                    assert_eq!(now.document().node_at(atom_path)?, &original);
                    assert_eq!(atom_path.parent(), old_path.parent());
                    assert_eq!(fresh.parent(), old_path.parent());
                    let atom_index = atom_path.last_index().ok_or("atom index")?;
                    let fresh_index = fresh.last_index().ok_or("paragraph index")?;
                    assert_eq!(
                        fresh_index,
                        match direction {
                            FlowMove::Before => atom_index - 1,
                            FlowMove::After => atom_index + 1,
                        }
                    );
                    let checkpoint = saved(&c, &a)?;
                    let mut b = if typing {
                        RichTypingSessionJsonCodec::new(c.clone()).decode(&checkpoint)?
                    } else {
                        RichSessionJsonCodec::new(c.clone()).decode(&checkpoint)?
                    };
                    for redo in [false, true, false, true] {
                        if redo {
                            a.redo(&a.snapshot())?;
                            b.redo(&b.snapshot())?;
                        } else {
                            a.undo(&a.snapshot())?;
                            b.undo(&b.snapshot())?;
                            assert_eq!(a.state().document().document(), &before);
                        }
                        assert_eq!(self::saved(&c, &a)?, self::saved(&c, &b)?);
                    }
                }
            }
        }
    }
    Ok(())
}

#[test]
fn stale_foreign_invalid_targets_and_late_limits_are_atomic() -> Result {
    let (c, mut a) = setup(2, DocumentLimits::default())?;
    let (_, other) = setup(2, DocumentLimits::default())?;
    let before = saved(&c, &a)?;
    assert!(a.navigate_flow(&other.snapshot(), FlowMove::After).is_err());
    assert!(a.insert_paragraph_adjacent(&a.snapshot(), &id("fresh")?, FlowMove::After).is_err());
    assert_eq!(saved(&c, &a)?, before);
    let old_selection = RichSelection::try_new(a.state().document(), node("table-block")?)?;
    a.insert_plain_text(&a.snapshot(), "Q")?;
    assert_eq!(
        navigate_flow(a.state().document(), &old_selection, FlowMove::After),
        Err(RichSelectionError::StaleSnapshot)
    );
    a.set_selection(&a.snapshot(), Some(node("table-block")?))?;
    let stale = a.snapshot();
    a.set_read_only(&a.snapshot(), true)?;
    let before = saved(&c, &a)?;
    assert!(a.navigate_flow(&stale, FlowMove::After).is_err());
    assert!(a.insert_paragraph_adjacent(&a.snapshot(), &id("fresh")?, FlowMove::After).is_err());
    assert_eq!(saved(&c, &a)?, before);
    a.set_read_only(&a.snapshot(), false)?;
    let before = saved(&c, &a)?;
    assert!(a.insert_paragraph_adjacent(&a.snapshot(), &id("before")?, FlowMove::Before).is_err());
    assert_eq!(saved(&c, &a)?, before);
    let v: Value = serde_json::from_str(
        &DocumentJsonCodecV2::new(c.schema().clone()).encode(a.state().document().document())?,
    )?;
    let (c, mut a) = setup(2, DocumentLimits::default().with_max_nodes(count(&v["root"])))?;
    a.set_selection(&a.snapshot(), Some(node("table-block")?))?;
    let before = saved(&c, &a)?;
    assert!(a.insert_paragraph_adjacent(&a.snapshot(), &id("fresh")?, FlowMove::After).is_err());
    assert_eq!(saved(&c, &a)?, before);
    Ok(())
}

#[test]
fn atom_only_documents_gain_reachable_text_without_changing_or_normalizing_the_atom() -> Result {
    for language in [1, 2] {
        let (c, seed) = setup(language, DocumentLimits::default())?;
        for target in if language == 1 {
            vec!["table-block", "image-block"]
        } else {
            vec!["table-block", "image-block", "root-next"]
        } {
            let doc = seed.state().document();
            let path = doc.block_path(&id(target)?).ok_or("atom")?;
            let atom: Value = serde_json::from_str::<Value>(
                &DocumentJsonCodecV2::new(c.schema().clone()).encode(doc.document())?,
            )?["root"]
                .clone();
            let mut source = atom;
            let node = doc.document().node_at(path)?.clone();
            source["children"] = json!([find(&source, target).ok_or("serialized atom")?]);
            for direction in [FlowMove::Before, FlowMove::After] {
                let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/flow-navigation","version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":source}).to_string();
                let rich = RichDocument::try_admit(
                    c.schema(),
                    DocumentJsonCodecV2::new(c.schema().clone()).decode(&input)?,
                    c.limits(),
                )?;
                let mut a = RichLocalSession::try_new(
                    c.clone(),
                    rich,
                    Some(self::node(target)?),
                    HistoryCapacity::default(),
                )?;
                let before = a.state().document().document().clone();
                assert_eq!(a.navigate_flow(&a.snapshot(), direction)?, RichLocalOutcome::Unchanged);
                a.insert_paragraph_adjacent(&a.snapshot(), &id("fresh")?, direction)?;
                let actual = a.state().document();
                assert_eq!(
                    actual
                        .document()
                        .node_at(actual.block_path(&id(target)?).ok_or("retained atom")?)?,
                    &node
                );
                caret(
                    a.state().selection().ok_or("selection")?.kind(),
                    "fresh",
                    0,
                    Affinity::After,
                )?;
                a.insert_plain_text(&a.snapshot(), "Plain 🙂")?;
                a.undo(&a.snapshot())?;
                a.undo(&a.snapshot())?;
                assert_eq!(a.state().document().document(), &before);
            }
        }
    }
    Ok(())
}

#[test]
fn navigation_and_atom_insertion_fence_native_typing_without_losing_exact_future_groups() -> Result
{
    for language in [1, 2] {
        let (c, mut a) = setup(language, DocumentLimits::default())?;
        a.enable_typing_history(&a.snapshot())?;
        for (clock, value) in [(1, "X"), (2, "Y")] {
            a.insert_typing_text(&a.snapshot(), value, clock)?;
        }
        let first = a.state().document().document().clone();
        a.navigate_flow(&a.snapshot(), FlowMove::After)?;
        a.insert_paragraph_adjacent(&a.snapshot(), &id("fresh")?, FlowMove::After)?;
        for (clock, value) in [(3, "A"), (4, "B")] {
            a.insert_typing_text(&a.snapshot(), value, clock)?;
        }
        assert_eq!(a.undo_depth(), 3);
        let mut recovered = RichTypingSessionJsonCodec::new(c.clone()).decode(&saved(&c, &a)?)?;
        for redo in [false, false, false, true, true, true] {
            if redo {
                a.redo(&a.snapshot())?;
                recovered.redo(&recovered.snapshot())?;
            } else {
                a.undo(&a.snapshot())?;
                recovered.undo(&recovered.snapshot())?;
            }
            assert_eq!(saved(&c, &a)?, saved(&c, &recovered)?);
            if a.undo_depth() == 1 {
                assert_eq!(a.state().document().document(), &first);
            }
        }
    }
    Ok(())
}
