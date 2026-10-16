//! General cross-container replacement is native, exact, bounded and old-checkpoint compatible.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec, RichTypingSessionJsonCodec},
    document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichLocalOutcome, RichLocalSession, RichSelection,
        RichSelectionCoverage, RichSelectionKind, RichTextPoint,
        actions::{
            ReplaceCoveredRange, ReplaceTextRange, RichActionError, RichGeneralRangeKind,
            RichGeneralRangePlan, RichRangeReplacementPlan, apply_batch,
        },
        standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
use std::collections::BTreeMap;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn id(s: &str) -> Result<BlockId> {
    Ok(BlockId::try_new(s)?)
}
fn point(s: &str, n: u64) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(id(s)?, TextOffset::try_new(n)?, Affinity::After))
}
fn range(a: &str, x: u64, b: &str, y: u64) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::TextRange { anchor: point(a, x)?, focus: point(b, y)? })
}
fn setup(root: Value) -> Result<(EditorContext, RichDocument)> {
    let schema = CompiledSchema::try_compile_rich_content_profile_v3(
        SchemaId::new(QualifiedName::try_new("example/general-range")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?,
    )?;
    let c = EditorContext::new(schema, DocumentLimits::default());
    let mut raw = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/general-range","version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":null});
    raw["root"] = root;
    let raw = raw.to_string();
    let d = RichDocument::try_admit(
        c.schema(),
        DocumentJsonCodecV2::new(c.schema().clone()).decode(&raw)?,
        c.limits(),
    )?;
    Ok((c, d))
}
fn text(value: &str) -> Result<TextFragment> {
    Ok(if value.is_empty() {
        TextFragment::empty()
    } else {
        TextRun::try_new(value, FormatSet::try_from_formats(vec![])?)?.into()
    })
}
fn source(d: &RichDocument, c: &EditorContext) -> Result<Value> {
    Ok(serde_json::from_str(&DocumentJsonCodecV2::new(c.schema().clone()).encode(d.document())?)?)
}
fn find<'a>(node: &'a Value, id: &str) -> Option<&'a Value> {
    if node["properties"]["breditor/block-id"] == id {
        Some(node)
    } else {
        node.get("children")?.as_array()?.iter().find_map(|child| find(child, id))
    }
}
fn texts(node: &Value, out: &mut BTreeMap<String, String>) -> Result {
    if ["breditor/paragraph", "breditor/heading", "breditor/code-block"]
        .iter()
        .any(|kind| node["type"] == *kind)
    {
        out.insert(
            node["properties"]["breditor/block-id"].as_str().ok_or("text identity")?.into(),
            node["children"]
                .as_array()
                .ok_or("text children")?
                .iter()
                .map(|child| child["text"].as_str().ok_or("text run"))
                .collect::<std::result::Result<String, _>>()?,
        );
    } else if let Some(children) = node["children"].as_array() {
        for child in children {
            texts(child, out)?;
        }
    }
    Ok(())
}
fn contents(d: &RichDocument, c: &EditorContext) -> Result<BTreeMap<String, String>> {
    let mut out = BTreeMap::new();
    texts(&source(d, c)?["root"], &mut out)?;
    Ok(out)
}
fn floors(p: &RichGeneralRangePlan) -> Result<Vec<BlockId>> {
    (0..p.empty_blocks().len()).map(|i| id(&format!("fresh-floor-{i}"))).collect()
}
fn saved(c: &EditorContext, s: &RichLocalSession) -> Result<String> {
    Ok(if s.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(c.clone()).encode(s)?
    } else {
        RichSessionJsonCodec::new(c.clone()).encode(s)?
    })
}
fn restored(c: &EditorContext, s: &RichLocalSession) -> Result<RichLocalSession> {
    Ok(if s.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(c.clone()).decode(&saved(c, s)?)?
    } else {
        RichSessionJsonCodec::new(c.clone()).decode(&saved(c, s)?)?
    })
}
fn mini(children: Vec<Value>) -> Value {
    let mut root = fixture::element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}

#[test]
fn all_fixture_text_pairs_and_both_directions_remove_exactly_the_native_coverage_with_exact_inverse()
-> Result {
    let (c, d) = setup(fixture::root())?;
    let original = contents(&d, &c)?;
    let total: usize = original.values().map(|s| s.encode_utf16().count()).sum();
    let ids: Vec<_> = original.keys().cloned().collect();
    let mut covered = 0;
    let mut joined = 0;
    for (i, a) in ids.iter().enumerate() {
        for b in ids.iter().skip(i + 1) {
            for backwards in [false, true] {
                for insertion in ["", "Z🙂"] {
                    let s = range(a, 0, b, u64::try_from(original[b].encode_utf16().count())?)?;
                    let s = if backwards {
                        let RichSelectionKind::TextRange { anchor, focus } = s else {
                            return Err("text range fixture".into());
                        };
                        RichSelectionKind::TextRange { anchor: focus, focus: anchor }
                    } else {
                        s
                    };
                    let s = RichSelection::try_new(&d, s)?;
                    let coverage = RichSelectionCoverage::capture(&d, &s)?;
                    let p = RichGeneralRangePlan::capture(&d, &s, &text(insertion)?)?;
                    match p.kind() {
                        RichGeneralRangeKind::Joined => joined += 1,
                        RichGeneralRangeKind::PreservedBoundaries => covered += 1,
                    }
                    let action = p.action(&floors(&p)?)?;
                    let Some(edit) = action.apply(&c, &d)? else {
                        assert_eq!(coverage.selected_utf16(), 0);
                        assert!(insertion.is_empty());
                        assert_eq!(p.covered().ok_or("no-op coverage")?.operation_count(), 0);
                        continue;
                    };
                    let after = contents(edit.document(), &c)?;
                    let count: usize = after.values().map(|s| s.encode_utf16().count()).sum();
                    assert_eq!(
                        u64::try_from(count)?,
                        u64::try_from(total)? - coverage.selected_utf16()
                            + u64::try_from(insertion.encode_utf16().count())?,
                        "{a} -> {b}"
                    );
                    if p.kind() == RichGeneralRangeKind::PreservedBoundaries {
                        for (block, value) in &original {
                            let span =
                                coverage.text().iter().find(|span| span.block().as_str() == block);
                            match (after.get(block), span) {
                                (Some(actual), Some(span)) => {
                                    let chars: Vec<_> = value.encode_utf16().collect();
                                    let mut expected =
                                        chars[..usize::try_from(span.start().get())?].to_vec();
                                    if block
                                        == p.covered()
                                            .ok_or("coverage")?
                                            .insertion_start()
                                            .block()
                                            .as_str()
                                    {
                                        expected.extend(insertion.encode_utf16());
                                    }
                                    expected.extend(&chars[usize::try_from(span.end().get())?..]);
                                    assert_eq!(actual, &String::from_utf16(&expected)?);
                                }
                                (Some(actual), None) => assert_eq!(actual, value),
                                (None, Some(span)) => {
                                    assert_eq!(span.start().get(), 0);
                                    assert_eq!(
                                        span.end().get(),
                                        u64::try_from(value.encode_utf16().count())?
                                    );
                                }
                                (None, None) => {
                                    return Err(format!("unselected block lost: {block}").into());
                                }
                            }
                        }
                    }
                    let inverse = edit.inverse().apply(&c, edit.document())?.ok_or("inverse")?;
                    assert_eq!(inverse.document().document(), d.document());
                    let redo = inverse.inverse().apply(&c, inverse.document())?.ok_or("redo")?;
                    assert_eq!(redo.document().document(), edit.document().document());
                }
            }
        }
    }
    assert!(covered > 500);
    assert!(joined > 0);
    Ok(())
}
#[test]
fn partially_crossed_merged_table_retains_every_axis_merge_header_and_unselected_body() -> Result {
    let (c, d) = setup(fixture::root())?;
    let s = RichSelection::try_new(&d, range("p-0-0", 1, "p-1-1", 3)?)?;
    let plan = RichGeneralRangePlan::capture(&d, &s, &text("X")?)?;
    assert_eq!(plan.kind(), RichGeneralRangeKind::PreservedBoundaries);
    assert_eq!(plan.empty_blocks().len(), 4);
    let edit = plan.action(&floors(&plan)?)?.apply(&c, &d)?.ok_or("edit")?;
    let before = source(&d, &c)?;
    let after = source(edit.document(), &c)?;
    assert_eq!(
        find(&before["root"], "table").ok_or("before table")?["properties"],
        find(&after["root"], "table").ok_or("after table")?["properties"]
    );
    for r in 0..3 {
        for col in 0..4 {
            let key = format!("cell-{r}-{col}");
            assert_eq!(
                find(&before["root"], &key).ok_or("before cell")?["properties"],
                find(&after["root"], &key).ok_or("after cell")?["properties"]
            );
        }
    }
    assert_eq!(find(&before["root"], "p-2-2"), find(&after["root"], "p-2-2"));
    assert_eq!(contents(edit.document(), &c)?["p-0-0"], "aX");
    assert_eq!(contents(edit.document(), &c)?["p-1-1"], "b");
    Ok(())
}
#[test]
fn partial_item_needs_a_fresh_prose_head_without_flattening_the_unselected_quote_or_completion()
-> Result {
    let mut task = fixture::element(
        "task-item",
        "task",
        vec![
            fixture::paragraph("head", "Head"),
            fixture::element("blockquote", "quote", vec![fixture::paragraph("tail", "Tail")]),
        ],
    );
    task["properties"]["breditor/checked"] = json!(true);
    let (c, d) = setup(mini(vec![
        fixture::paragraph("intro", "Intro"),
        fixture::element("task-list", "tasks", vec![task]),
    ]))?;
    let s = RichSelection::try_new(&d, range("intro", 2, "tail", 2)?)?;
    let p = RichGeneralRangePlan::capture(&d, &s, &text("X")?)?;
    assert_eq!(p.empty_blocks().len(), 1);
    assert_eq!(p.empty_blocks()[0].parent(), Some(&id("task")?));
    assert_eq!(p.empty_blocks()[0].before(), Some(&id("quote")?));
    let after = p.action(&floors(&p)?)?.apply(&c, &d)?.ok_or("edit")?;
    let raw = source(after.document(), &c)?;
    let task = find(&raw["root"], "task").ok_or("task")?;
    assert_eq!(task["properties"]["breditor/checked"], true);
    assert_eq!(task["children"][0]["properties"]["breditor/block-id"], "fresh-floor-0");
    assert_eq!(task["children"][1]["type"], "breditor/blockquote");
    assert_eq!(contents(after.document(), &c)?["tail"], "il");
    Ok(())
}
#[test]
fn old_ranges_remain_strict_and_general_joined_ranges_keep_their_original_result() -> Result {
    let (c, d) = setup(fixture::root())?;
    let fragment = text("X")?;
    let cross = RichSelection::try_new(&d, range("z-intro", 1, "caption", 1)?)?;
    assert!(matches!(
        ReplaceTextRange::capture(&d, &cross, &fragment),
        Err(RichActionError::FlowRange)
    ));
    let legal = RichSelection::try_new(&d, range("q1", 2, "q2", 2)?)?;
    let old = ReplaceTextRange::capture(&d, &legal, &fragment)?;
    let p = RichGeneralRangePlan::capture(&d, &legal, &fragment)?;
    assert_eq!(p.kind(), RichGeneralRangeKind::Joined);
    assert!(p.empty_blocks().is_empty());
    assert_eq!(
        old.apply(&c, &d)?.ok_or("old edit")?.document().document(),
        p.action(&[])?.apply(&c, &d)?.ok_or("general edit")?.document().document()
    );
    Ok(())
}
#[test]
fn session_replacement_is_one_unit_with_exact_explicit_and_natural_restart_and_future_history()
-> Result {
    let (c, d) = setup(fixture::root())?;
    for natural in [false, true] {
        let selection = range("caption", 1, "z-intro", 1)?;
        let mut a = RichLocalSession::try_new(
            c.clone(),
            d.clone(),
            Some(selection.clone()),
            HistoryCapacity::default(),
        )?;
        if natural {
            a.enable_typing_history(&a.snapshot())?;
        }
        let before = saved(&c, &a)?;
        let fragment = text("X🙂")?;
        let plan = a.plan_general_selection_text(&a.snapshot(), &fragment)?;
        let ids = floors(&plan)?;
        assert_eq!(
            a.replace_general_selection_text(&a.snapshot(), &fragment, &ids)?,
            RichLocalOutcome::ContentCommitted
        );
        assert_eq!(a.undo_depth(), 1);
        let mut b = restored(&c, &a)?;
        for redo in [false, true, false, true] {
            let ax = if redo { a.redo(&a.snapshot())? } else { a.undo(&a.snapshot())? };
            let bx = if redo { b.redo(&b.snapshot())? } else { b.undo(&b.snapshot())? };
            assert_eq!(ax, bx);
            assert_eq!(saved(&c, &a)?, saved(&c, &b)?);
            if !redo {
                assert_eq!(a.state().selection().ok_or("restored selection")?.kind(), &selection);
                assert_eq!(a.state().document().document(), d.document());
            }
        }
        assert_ne!(before, saved(&c, &a)?);
    }
    Ok(())
}
#[test]
fn wrong_floor_counts_duplicates_and_source_identity_reuse_refuse_before_any_publication() -> Result
{
    let (c, d) = setup(fixture::root())?;
    let mut a = RichLocalSession::try_new(
        c.clone(),
        d,
        Some(range("p-0-0", 1, "p-1-1", 3)?),
        HistoryCapacity::default(),
    )?;
    let fragment = text("X")?;
    let p = a.plan_general_selection_text(&a.snapshot(), &fragment)?;
    let before = saved(&c, &a)?;
    let mut removed_id = floors(&p)?;
    removed_id[0] = id("p-0-1")?;
    for ids in [vec![], vec![id("dup")?; p.empty_blocks().len()], removed_id] {
        assert!(a.replace_general_selection_text(&a.snapshot(), &fragment, &ids).is_err());
        assert_eq!(saved(&c, &a)?, before);
    }
    Ok(())
}
#[test]
fn captured_action_rejects_changed_and_foreign_sources_and_final_limits_publish_nothing() -> Result
{
    let (c, d) = setup(fixture::root())?;
    let selection = RichSelection::try_new(&d, range("z-intro", 1, "caption", 1)?)?;
    let plan = RichGeneralRangePlan::capture(&d, &selection, &text("X")?)?;
    let action = plan.action(&floors(&plan)?)?;
    let changed = action.apply(&c, &d)?.ok_or("changed source")?;
    assert!(matches!(action.apply(&c, changed.document()), Err(RichActionError::StaleTarget)));
    let mut foreign = fixture::root();
    foreign["properties"]["breditor/document-id"] = json!("another-document");
    let (_, foreign) = setup(foreign)?;
    assert!(matches!(action.apply(&c, &foreign), Err(RichActionError::Binding)));

    let max_bytes = contents(&d, &c)?.values().map(String::len).max().ok_or("text blocks")?;
    let strict = EditorContext::new(
        c.schema().clone(),
        DocumentLimits::default().with_max_text_bytes(max_bytes),
    );
    let mut owner = RichLocalSession::try_new(
        strict.clone(),
        d,
        Some(selection.kind().clone()),
        HistoryCapacity::default(),
    )?;
    let before = saved(&strict, &owner)?;
    let fragment = text(&"x".repeat(max_bytes + 20))?;
    let plan = owner.plan_general_selection_text(&owner.snapshot(), &fragment)?;
    assert!(
        owner
            .replace_general_selection_text(&owner.snapshot(), &fragment, &floors(&plan)?)
            .is_err()
    );
    assert_eq!(saved(&strict, &owner)?, before);
    Ok(())
}
#[test]
fn collapsed_empty_replacement_preserves_affinity_redo_and_the_exact_observation() -> Result {
    let (c, d) = setup(fixture::root())?;
    let caret = RichTextPoint::new(id("caption")?, TextOffset::try_new(0)?, Affinity::Before);
    let selection = RichSelectionKind::TextRange { anchor: caret.clone(), focus: caret };
    let mut owner = RichLocalSession::try_new(
        c.clone(),
        d,
        Some(selection.clone()),
        HistoryCapacity::default(),
    )?;
    owner.replace_general_selection_text(&owner.snapshot(), &text("X")?, &[])?;
    owner.undo(&owner.snapshot())?;
    assert_eq!(owner.redo_depth(), 1);
    let before = saved(&c, &owner)?;
    let observation = owner.snapshot();
    assert_eq!(
        owner.replace_general_selection_text(&observation, &TextFragment::empty(), &[])?,
        RichLocalOutcome::Unchanged
    );
    assert_eq!(owner.state().selection().ok_or("selection")?.kind(), &selection);
    assert_eq!(saved(&c, &owner)?, before);
    // A true no-op does not invalidate the same observation or consume Redo.
    assert_eq!(owner.redo(&observation)?, RichLocalOutcome::RedoApplied);
    Ok(())
}
#[test]
fn stale_policy_invalid_code_formats_and_native_work_limits_are_atomic() -> Result {
    let (c, d) = setup(fixture::root())?;
    let selection = range("task-head", 1, "code", 2)?;
    let mut a = RichLocalSession::try_new(
        c.clone(),
        d.clone(),
        Some(selection),
        HistoryCapacity::default(),
    )?;
    let stale = a.snapshot();
    a.set_selection(&a.snapshot(), Some(range("code", 1, "code", 3)?))?;
    let current = saved(&c, &a)?;
    assert!(a.replace_general_selection_text(&stale, &text("X")?, &[]).is_err());
    assert_eq!(saved(&c, &a)?, current);
    let marks = FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::try_from_sorted(vec![])?,
    )])?;
    let fragment: TextFragment = TextRun::try_new("X", marks)?.into();
    assert!(a.replace_general_selection_text(&a.snapshot(), &fragment, &[]).is_err());
    assert_eq!(saved(&c, &a)?, current);
    a.set_read_only(&a.snapshot(), true)?;
    let current = saved(&c, &a)?;
    assert!(a.replace_general_selection_text(&a.snapshot(), &text("X")?, &[]).is_err());
    assert_eq!(saved(&c, &a)?, current);
    assert!(a.plan_general_selection_text(&a.snapshot(), &text("X")?).is_ok());
    let s = RichSelection::try_new(&d, range("p-0-0", 1, "p-1-1", 3)?)?;
    let plan = RichRangeReplacementPlan::capture(&d, &s, &text("X")?)?;
    let ids = (0..plan.empty_blocks().len())
        .map(|i| id(&format!("new-{i}")))
        .collect::<Result<Vec<_>>>()?;
    let action = ReplaceCoveredRange::capture(&plan, &ids)?;
    let strict = c.clone().with_max_operations_per_transaction(1);
    assert!(matches!(action.apply(&strict, &d), Err(RichActionError::TooManyActions)));
    Ok(())
}

#[test]
fn surviving_text_maps_inverse_maps_and_removed_cell_fallback_use_exact_source_domains() -> Result {
    let (c, d) = setup(fixture::root())?;
    let selection = RichSelection::try_new(&d, range("p-0-0", 1, "p-1-1", 3)?)?;
    let p = RichGeneralRangePlan::capture(&d, &selection, &text("X")?)?;
    let edit = apply_batch(&c, &d, &[p.action(&floors(&p)?)?])?.ok_or("batch")?;
    for (block, before, after) in [("p-0-0", 4, 2), ("p-1-1", 4, 1)] {
        let caret = RichSelection::try_new(&d, range(block, before, block, before)?)?;
        let mapped = edit.map_selection(&caret)?.into_selection().ok_or("mapped")?;
        assert_eq!(mapped.kind(), &range(block, after, block, after)?);
        let inverse = apply_batch(&c, edit.document(), edit.inverse())?.ok_or("inverse")?;
        assert_eq!(
            inverse.map_selection(&mapped)?.selection().ok_or("mapped inverse")?.kind(),
            caret.kind()
        );
    }
    let removed = RichSelection::try_new(&d, range("p-0-1", 1, "p-0-1", 1)?)?;
    let mapped = edit.map_selection(&removed)?.into_selection().ok_or("cell fallback")?;
    let RichSelectionKind::TextRange { focus, .. } = mapped.kind() else {
        return Err("text fallback".into());
    };
    let raw = source(edit.document(), &c)?;
    let cell = find(&raw["root"], "cell-0-1").ok_or("cell")?;
    assert_eq!(cell["children"][0]["properties"]["breditor/block-id"], focus.block().as_str());
    assert_eq!(focus.offset().get(), 0);
    Ok(())
}
#[test]
fn caption_asset_layout_and_unselected_rich_suffix_survive_without_implicit_conversion() -> Result {
    fn change(node: &mut Value, id: &str, work: &mut dyn FnMut(&mut Value)) {
        if node["properties"]["breditor/block-id"] == id {
            work(node);
        } else if let Some(children) = node.get_mut("children").and_then(Value::as_array_mut) {
            for child in children {
                change(child, id, work);
            }
        }
    }
    let mut root = fixture::root();
    change(&mut root, "z-intro", &mut |node| {
        node["properties"]["breditor/block-align"] = json!(2);
        node["properties"]["breditor/line-height-percent"] = json!(150);
    });
    change(&mut root, "caption", &mut |node| {
        node["properties"]["breditor/block-direction"] = json!(2);
        node["properties"]["breditor/block-indent"] = json!(3);
        node["children"] = json!([{"kind":"text","text":"xy🙂","formats":[{"type":"breditor/strong","properties":{}}]}]);
    });
    let (c, d) = setup(root)?;
    let selection = RichSelection::try_new(&d, range("z-intro", 1, "caption", 1)?)?;
    let plan = RichGeneralRangePlan::capture(&d, &selection, &text("X")?)?;
    let edit = plan.action(&floors(&plan)?)?.apply(&c, &d)?.ok_or("edit")?;
    let before = source(&d, &c)?;
    let after = source(edit.document(), &c)?;
    for id in ["z-intro", "caption", "image"] {
        assert_eq!(
            find(&before["root"], id).ok_or("before")?["properties"],
            find(&after["root"], id).ok_or("after")?["properties"]
        );
    }
    let caption = find(&after["root"], "caption").ok_or("caption")?;
    assert_eq!(caption["children"][0]["text"], "y🙂");
    assert_eq!(caption["children"][0]["formats"][0]["type"], "breditor/strong");
    Ok(())
}
#[test]
fn general_code_boundaries_retain_both_kinds_and_reject_styled_insertion_atomically() -> Result {
    let code = fixture::element(
        "code-block",
        "code",
        vec![json!({"kind":"text","text":"abc","formats":[]})],
    );
    let (c, d) = setup(mini(vec![code, fixture::paragraph("tail", "Tail")]))?;
    let s = RichSelection::try_new(&d, range("code", 1, "tail", 2)?)?;
    let plan = RichGeneralRangePlan::capture(&d, &s, &text("X")?)?;
    assert_eq!(plan.kind(), RichGeneralRangeKind::PreservedBoundaries);
    let edit = plan.action(&[])?.apply(&c, &d)?.ok_or("edit")?;
    assert_eq!(contents(edit.document(), &c)?["code"], "aX");
    assert_eq!(contents(edit.document(), &c)?["tail"], "il");
    assert_eq!(
        find(&source(edit.document(), &c)?["root"], "code").ok_or("code")?["type"],
        "breditor/code-block"
    );
    let formats = FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::try_from_sorted(vec![])?,
    )])?;
    let inserted = TextRun::try_new("X", formats)?.into();
    let mut a = RichLocalSession::try_new(
        c.clone(),
        d,
        Some(s.kind().clone()),
        HistoryCapacity::default(),
    )?;
    let before = saved(&c, &a)?;
    assert!(a.replace_general_selection_text(&a.snapshot(), &inserted, &[]).is_err());
    assert_eq!(saved(&c, &a)?, before);
    Ok(())
}
