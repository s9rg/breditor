//! Native general-range lowering, original causal records and exact selective recovery.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::{DeleteBlock, InsertBlocks, InsertText, SetHeading, SetImageAlt, SplitTextBlock},
        selection::{Selection, TextPoint},
    },
};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    rich_content::{BlockId, RichDocument},
    schema::DocumentLimits,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

#[test]
fn replacing_a_whole_source_run_keeps_an_admitted_caret_and_exact_future_history() -> Result {
    for revision in 1..=3 {
        for document in [false, true] {
            for natural in [false, true] {
                for (before, after) in [("#", " "), ("a🙂", "猫🙂"), ("abc", ""), ("猫", "x")]
                {
                    let mut root = fixture::root();
                    root["children"] = json!([
                        fixture::paragraph("body", before),
                        fixture::paragraph("other", "untouched")
                    ]);
                    let (profile, mut owner) = setup(revision, root)?;
                    if document {
                        owner.enable_document_selection_guarded(&owner.observe()?)?;
                    } else {
                        owner.enable_general_ranges_guarded(&owner.observe()?)?;
                    }
                    let observe = |owner: &RichReplica| {
                        if document { owner.observe_document() } else { owner.observe() }
                    };
                    if natural {
                        owner.enable_typing_history_guarded(&observe(&owner)?)?;
                    }
                    let target =
                        range("body", 0, "body", u32::try_from(before.encode_utf16().count())?);
                    owner.set_selection(Some(&target))?;
                    assert!(owner.replace_general_range_plain_text_guarded(
                        &observe(&owner)?,
                        &target,
                        after,
                        &[]
                    )?);
                    assert_eq!(owner.undo_count(), 1);
                    let selection = owner.selection()?.ok_or("caret")?;
                    assert_eq!(
                        selection,
                        range(
                            "body",
                            u32::try_from(after.encode_utf16().count())?,
                            "body",
                            u32::try_from(after.encode_utf16().count())?
                        )
                    );
                    let save = |owner: &RichReplica| {
                        if document {
                            if natural {
                                owner.document_typing_checkpoint()
                            } else {
                                owner.document_checkpoint()
                            }
                        } else if natural {
                            owner.general_typing_checkpoint()
                        } else {
                            owner.general_checkpoint()
                        }
                    };
                    let bytes = save(&owner)?;
                    let mut restored = if document {
                        if natural {
                            profile.restore_document_typing("room", &bytes)?
                        } else {
                            profile.restore_document("room", &bytes)?
                        }
                    } else if natural {
                        profile.restore_general_typing("room", &bytes)?
                    } else {
                        profile.restore_general("room", &bytes)?
                    };
                    assert_eq!(save(&restored)?, bytes);
                    for undo in [true, false, true, false] {
                        if undo {
                            owner.undo()?;
                            restored.undo()?;
                        } else {
                            owner.redo()?;
                            restored.redo()?;
                        }
                        assert_eq!(save(&owner)?, save(&restored)?);
                        let document: Value = serde_json::from_str(owner.document_json())?;
                        let text: String = document["root"]["children"][0]["children"]
                            .as_array()
                            .ok_or("body runs")?
                            .iter()
                            .filter_map(|n| n["text"].as_str())
                            .collect();
                        assert_eq!(text, if undo { before } else { after });
                    }
                }
            }
        }
    }
    Ok(())
}

#[test]
fn whole_source_replacement_preserves_concurrent_peer_text_through_selective_history() -> Result {
    let mut root = fixture::root();
    root["children"] =
        json!([fixture::paragraph("body", "#"), fixture::paragraph("other", "untouched")]);
    let (profile, mut a) = setup(3, root)?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    let target = range("body", 0, "body", 1);
    a.set_selection(Some(&target))?;
    let mut b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "body".into(),
        offset: 1,
        text: "PEER".into(),
    })])?;
    a.replace_general_range_plain_text_guarded(&a.observe()?, &target, " ", &[])?;
    a.receive_frame(&b.update_frame()?)?;
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    assert!(a.document_json().contains("PEER"));
    for undo in [true, false, true, false] {
        if undo {
            a.undo()?;
        } else {
            a.redo()?;
        }
        b.receive_frame(&a.update_frame()?)?;
        assert_eq!(a.document_json(), b.document_json());
        assert!(a.document_json().contains("PEER"));
        assert!(a.selection()?.is_some());
        let bytes = a.general_checkpoint()?;
        let restored = profile.restore_general("room", &bytes)?;
        assert_eq!(restored.general_checkpoint()?, bytes);
    }
    Ok(())
}
fn profile(revision: u32) -> Result<SharedRichProfile> {
    let config = json!({"format":"breditor/shared-rich-profile","formatVersion":revision,
        "schema":{"name":"example/shared-general-range","version":1},"extensions":[]})
    .to_string();
    Ok(match revision {
        1 => SharedRichProfile::from_standard_configuration_json_v1(&config)?,
        2 => SharedRichProfile::from_standard_configuration_json_v2(&config)?,
        3 => SharedRichProfile::from_standard_configuration_json_v3(&config)?,
        _ => return Err("fixture revision".into()),
    })
}
fn source(profile: &SharedRichProfile, root: &Value) -> String {
    json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/shared-general-range","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root})
    .to_string()
}
fn setup(revision: u32, mut root: Value) -> Result<(SharedRichProfile, RichReplica)> {
    let p = profile(revision)?;
    if revision == 1 {
        root["children"].as_array_mut().ok_or("root children")?.retain(|node| {
            !matches!(
                node["type"].as_str(),
                Some(
                    "breditor/horizontal-rule"
                        | "breditor/blockquote"
                        | "breditor/task-list"
                        | "breditor/code-block"
                )
            )
        });
    }
    let owner = p.create(&source(&p, &root), "101".into())?;
    Ok((p, owner))
}
fn range(a: &str, x: u32, b: &str, y: u32) -> Selection {
    Selection::TextRange {
        anchor: TextPoint { block: a.into(), offset: x, affinity: Affinity::After },
        focus: TextPoint { block: b.into(), offset: y, affinity: Affinity::After },
    }
}
fn fragment(value: &str, strong: bool) -> Result<TextFragment> {
    Ok(if value.is_empty() {
        TextFragment::empty()
    } else {
        let marks = if strong {
            vec![Format::new(
                QualifiedName::try_new("breditor/strong")?,
                PropertyMap::try_from_sorted(vec![])?,
            )]
        } else {
            vec![]
        };
        TextRun::try_new(value, FormatSet::try_from_formats(marks)?)?.into()
    })
}
fn floors(owner: &RichReplica, inserted: &TextFragment) -> Result<Vec<BlockId>> {
    let plan = owner.plan_general_selection_text_guarded(&owner.observe()?, inserted)?;
    (0..plan.empty_blocks().len())
        .map(|index| Ok(BlockId::try_new(format!("fresh-floor-{index}"))?))
        .collect()
}
fn expected(
    p: &SharedRichProfile,
    a: &RichReplica,
    inserted: &TextFragment,
    empty: &[BlockId],
) -> Result<String> {
    expected_with_limits(p, a, inserted, empty, DocumentLimits::default())
}
fn expected_with_limits(
    p: &SharedRichProfile,
    a: &RichReplica,
    inserted: &TextFragment,
    empty: &[BlockId],
    limits: DocumentLimits,
) -> Result<String> {
    let codec = DocumentJsonCodecV2::new(p.schema().clone()).with_limits(limits.clone());
    let c = EditorContext::new(p.schema().clone(), limits);
    let d = RichDocument::try_admit(p.schema(), codec.decode(a.document_json())?, c.limits())?;
    let selection = a.selection()?.ok_or("source selection")?.admit(&d)?;
    let plan = breditor_core::rich_content::actions::RichGeneralRangePlan::capture(
        &d, &selection, inserted,
    )?;
    let edit = plan.action(empty)?.apply(&c, &d)?.ok_or("native edit")?;
    Ok(codec.encode(edit.document().document())?)
}
fn saved(a: &RichReplica) -> Result<String> {
    Ok(if a.typing_history_enabled() { a.typing_checkpoint()? } else { a.checkpoint()? })
}
fn future(p: &SharedRichProfile, a: &mut RichReplica) -> Result {
    let mut b = if a.typing_history_enabled() {
        p.restore_typing("room", &saved(a)?)?
    } else {
        p.restore("room", &saved(a)?)?
    };
    assert_eq!(saved(a)?, saved(&b)?);
    for redo in [false, true, false, true] {
        assert_eq!(
            if redo { a.redo()? } else { a.undo()? },
            if redo { b.redo()? } else { b.undo()? }
        );
        assert_eq!(saved(a)?, saved(&b)?);
        assert_eq!(a.document_json(), b.document_json());
    }
    Ok(())
}
fn find<'a>(node: &'a Value, id: &str) -> Option<&'a Value> {
    if node["properties"]["breditor/block-id"] == id {
        return Some(node);
    }
    node.get("children")?.as_array()?.iter().find_map(|child| find(child, id))
}
fn text(a: &RichReplica, id: &str) -> Result<String> {
    let raw: Value = serde_json::from_str(a.document_json())?;
    Ok(find(&raw["root"], id).ok_or("text target")?["children"]
        .as_array()
        .ok_or("runs")?
        .iter()
        .map(|run| run["text"].as_str().ok_or("run"))
        .collect::<std::result::Result<String, _>>()?)
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> Result {
    let first = a.update_frame()?;
    let second = b.update_frame()?;
    a.receive_frame(&second)?;
    b.receive_frame(&first)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}

#[test]
fn protected_ranges_match_native_both_directions_and_original_history_families() -> Result {
    for (first, x, last, y, strong) in [
        ("p-0-0", 1, "p-1-1", 3, true),
        ("z-intro", 1, "caption", 1, true),
        ("z-intro", 1, "nested-text", 2, false),
        ("q1", 2, "q2", 2, true),
        ("code", 1, "task-head", 2, false),
    ] {
        for backwards in [false, true] {
            for natural in [false, true] {
                let (p, mut a) = setup(3, fixture::root())?;
                if natural {
                    a.enable_typing_history_guarded(&a.observe()?)?;
                }
                let selection =
                    if backwards { range(last, y, first, x) } else { range(first, x, last, y) };
                a.set_selection(Some(&selection))?;
                let before = a.document_json().to_owned();
                let inserted = fragment("X🙂", strong)?;
                let empty = floors(&a, &inserted)?;
                let final_document = expected(&p, &a, &inserted, &empty)?;
                assert!(a.replace_general_selection_text_guarded(
                    &a.observe()?,
                    &inserted,
                    &empty
                )?);
                assert_eq!(a.document_json(), final_document);
                assert_eq!(a.undo_count(), 1);
                let after = a.document_json().to_owned();
                assert!(a.undo()?);
                assert_eq!(a.document_json(), before);
                assert_eq!(a.selection()?, Some(selection));
                assert!(a.redo()?);
                assert_eq!(a.document_json(), after);
                future(&p, &mut a)?;
            }
        }
    }
    Ok(())
}
#[test]
fn original_v1_v2_and_v3_keep_their_model_and_journal_with_general_cell_replacement() -> Result {
    for revision in 1..=3 {
        let (p, mut a) = setup(revision, fixture::root())?;
        a.set_selection(Some(&range("p-0-0", 1, "p-1-1", 3)))?;
        let model = a.model_version();
        let journal = a.journal_version();
        let inserted = fragment("X", true)?;
        let empty = floors(&a, &inserted)?;
        let final_document = expected(&p, &a, &inserted, &empty)?;
        a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &empty)?;
        assert_eq!(a.document_json(), final_document);
        assert_eq!(a.model_version(), model);
        assert_eq!(a.journal_version(), journal);
        let checkpoint: Value = serde_json::from_str(&a.checkpoint()?)?;
        let serialized = checkpoint.to_string();
        assert!(!serialized.contains("replace_general"));
        assert!(!serialized.contains("replace_covered"));
        future(&p, &mut a)?;
    }
    Ok(())
}
#[test]
fn offline_peer_prefix_suffix_and_image_fields_survive_selective_undo_and_restart() -> Result {
    let (p, mut a) = setup(3, fixture::root())?;
    let mut b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    a.set_selection(Some(&range("p-0-0", 1, "p-1-1", 3)))?;
    let inserted = fragment("X", true)?;
    let empty = floors(&a, &inserted)?;
    a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &empty)?;
    b.apply(vec![
        Command::InsertText(InsertText { block: "p-0-0".into(), offset: 0, text: "L".into() }),
        Command::InsertText(InsertText { block: "p-1-1".into(), offset: 4, text: "R".into() }),
        Command::SetImageAlt(SetImageAlt {
            block: "image".into(),
            text: "Peer diagram".into(),
            decorative: false,
        }),
    ])?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&a, "p-0-0")?, "LaX");
    assert_eq!(text(&a, "p-1-1")?, "bR");
    assert!(a.undo()?);
    assert_eq!(text(&a, "p-0-0")?, "La🙂b");
    assert_eq!(text(&a, "p-1-1")?, "a🙂bR");
    let raw: Value = serde_json::from_str(a.document_json())?;
    assert_eq!(
        find(&raw["root"], "image").ok_or("image")?["properties"]["breditor/alt-text"],
        "Peer diagram"
    );
    assert!(a.redo()?);
    future(&p, &mut a)?;
    sync(&mut a, &mut b)?;
    Ok(())
}
#[test]
fn wrong_ids_stale_read_only_and_code_refusals_are_atomic() -> Result {
    let mut root = fixture::root();
    root["children"]
        .as_array_mut()
        .ok_or("root children")?
        .push(fixture::paragraph("after-code", "After"));
    let (_, mut a) = setup(3, root)?;
    a.set_selection(Some(&range("p-0-0", 1, "p-1-1", 3)))?;
    let inserted = fragment("X", true)?;
    let empty = floors(&a, &inserted)?;
    let before = saved(&a)?;
    let frame = a.update_frame()?;
    let view = a.view_json()?;
    let mut reused = empty.clone();
    reused[0] = BlockId::try_new("p-0-1")?;
    for ids in [vec![], vec![BlockId::try_new("dup")?; empty.len()], reused] {
        assert!(a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &ids).is_err());
        assert_eq!(saved(&a)?, before);
        assert_eq!(a.update_frame()?, frame);
        assert_eq!(a.view_json()?, view);
    }
    let stale = a.observe()?;
    a.set_selection(Some(&range("code", 1, "after-code", 2)))?;
    let before = saved(&a)?;
    assert!(a.replace_general_selection_text_guarded(&stale, &inserted, &empty).is_err());
    assert!(a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &[]).is_err());
    assert_eq!(saved(&a)?, before);
    a.set_read_only_guarded(&a.observe()?, true)?;
    let before = saved(&a)?;
    assert!(a.plan_general_selection_text_guarded(&a.observe()?, &fragment("X", false)?).is_ok());
    assert!(
        a.replace_general_selection_text_guarded(&a.observe()?, &fragment("X", false)?, &[])
            .is_err()
    );
    assert_eq!(saved(&a)?, before);
    Ok(())
}
#[test]
fn changed_first_block_is_not_required_for_later_trim_and_noop_caret_preserves_redo() -> Result {
    let (p, mut a) = setup(3, fixture::root())?;
    // The first selected character is already the complete insertion: native ranges
    // omit that unchanged block. A lowering must not insert the same character twice.
    a.set_selection(Some(&range("z-intro", 3, "caption", 1)))?;
    let inserted = fragment("b", false)?;
    let empty = floors(&a, &inserted)?;
    let final_document = expected(&p, &a, &inserted, &empty)?;
    a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &empty)?;
    assert_eq!(a.document_json(), final_document);
    assert_eq!(text(&a, "z-intro")?, "a🙂b");
    a.undo()?;
    let caret = TextPoint { block: "caption".into(), offset: 0, affinity: Affinity::Before };
    a.set_selection(Some(&Selection::TextRange { anchor: caret.clone(), focus: caret }))?;
    let before = saved(&a)?;
    let observation = a.observe()?;
    assert!(!a.replace_general_selection_text_guarded(
        &observation,
        &TextFragment::empty(),
        &[]
    )?);
    assert_eq!(saved(&a)?, before);
    assert!(a.redo()?);
    Ok(())
}
#[test]
fn emptied_normalized_source_cell_gets_an_explicit_native_floor_and_exact_future_history() -> Result
{
    let (p, mut a) = setup(3, fixture::root())?;
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "p-0-1".into() })])?;
    let raw: Value = serde_json::from_str(a.document_json())?;
    let virtual_head = find(&raw["root"], "cell-0-1").ok_or("cell")?["children"][0]["properties"]["breditor/block-id"].as_str().ok_or("normalization head")?.to_owned();
    a.apply(vec![Command::SetHeading(SetHeading { block: virtual_head.clone(), level: Some(2) })])?;
    a.set_selection(Some(&range("p-0-0", 1, "p-1-1", 3)))?;
    let inserted = fragment("X", false)?;
    let empty = floors(&a, &inserted)?;
    let final_document = expected(&p, &a, &inserted, &empty)?;
    a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &empty)?;
    assert_eq!(a.document_json(), final_document);
    assert!(!a.document_json().contains(&virtual_head));
    future(&p, &mut a)?;
    Ok(())
}
#[test]
fn normalized_head_with_a_retained_sibling_exposes_the_remaining_lowering_gap_atomically() -> Result
{
    let (p, mut a) = setup(3, fixture::root())?;
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "p-0-1".into() })])?;
    let raw: Value = serde_json::from_str(a.document_json())?;
    let head = find(&raw["root"], "cell-0-1").ok_or("cell")?["children"][0]["properties"]["breditor/block-id"].as_str().ok_or("head")?.to_owned();
    a.set_selection(Some(&range(&head, 0, &head, 0)))?;
    a.insert_plain_text("ab")?;
    a.apply(vec![Command::SplitTextBlock(SplitTextBlock {
        block: head.clone(),
        offset: 1,
        right: "retained-right".into(),
        right_heading: None,
    })])?;
    a.set_selection(Some(&range("p-0-0", 1, "retained-right", 1)))?;
    let inserted = fragment("X", false)?;
    let empty = floors(&a, &inserted)?;
    assert!(empty.is_empty());
    let native = expected(&p, &a, &inserted, &empty)?;
    assert!(!native.contains(&head));
    let before = saved(&a)?;
    let frame = a.update_frame()?;
    // This is a tracked integration gap, not an acceptance case proving support.
    assert!(a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &empty).is_err());
    assert_eq!(saved(&a)?, before);
    assert_eq!(a.update_frame()?, frame);
    Ok(())
}

#[test]
fn native_work_above_the_original_shared_command_ceiling_refuses_without_a_prefix() -> Result {
    let mut root = fixture::root();
    root["children"] = json!([
        fixture::element(
            "blockquote",
            "many",
            (0..72).map(|index| fixture::paragraph(&format!("many-{index}"), "Text")).collect()
        ),
        fixture::element(
            "code-block",
            "code",
            vec![json!({"kind":"text","text":"plain","formats":[]})]
        )
    ]);
    let (p, mut a) = setup(3, root)?;
    a.set_selection(Some(&range("many-0", 1, "code", 1)))?;
    let inserted = TextFragment::empty();
    let plan = a.plan_general_selection_text_guarded(&a.observe()?, &inserted)?;
    assert!(plan.covered().ok_or("protected range")?.operation_count() > 64);
    assert!(plan.empty_blocks().is_empty());
    assert_ne!(expected(&p, &a, &inserted, &[])?, a.document_json());
    let before = saved(&a)?;
    let frame = a.update_frame()?;
    assert!(a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &[]).is_err());
    assert_eq!(saved(&a)?, before);
    assert_eq!(a.update_frame()?, frame);
    Ok(())
}

#[test]
fn sequential_paste_headroom_is_a_reproduced_integration_limit_not_a_native_final_limit() -> Result
{
    fn nodes(node: &Value) -> usize {
        1 + node
            .get("children")
            .and_then(Value::as_array)
            .map_or(0, |children| children.iter().map(nodes).sum())
    }
    let root = fixture::root();
    let maximum = nodes(&root);
    let p = profile(3)?;
    let limits = DocumentLimits::default().with_max_nodes(maximum);
    let p = SharedRichProfile::from_schema_v3(p.schema().clone(), limits.clone())?;
    let mut a = p.create(&source(&p, &root), "101".into())?;
    a.set_selection(Some(&range("p-0-0", 1, "p-1-1", 3)))?;
    let inserted = fragment("X", false)?;
    let empty = floors(&a, &inserted)?;
    assert!(!empty.is_empty());
    let final_document = expected_with_limits(&p, &a, &inserted, &empty, limits)?;
    let final_tree: Value = serde_json::from_str(&final_document)?;
    assert!(nodes(&final_tree["root"]) <= maximum);
    let before = saved(&a)?;
    let frame = a.update_frame()?;
    // Original insertion admission precedes removals. A complete semantic lowerer
    // must remove this unnecessary transient resource requirement.
    assert!(a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &empty).is_err());
    assert_eq!(saved(&a)?, before);
    assert_eq!(a.update_frame()?, frame);
    Ok(())
}

#[test]
fn hidden_historical_floor_id_is_rejected_without_consuming_redo_or_the_observation() -> Result {
    let (p, mut a) = setup(3, fixture::root())?;
    a.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent: None,
        before: Some("lead".into()),
        nodes: vec![fixture::paragraph("historical-floor", "")],
    })])?;
    assert!(a.undo()?);
    a.set_selection(Some(&range("p-0-0", 1, "p-1-1", 3)))?;
    let inserted = fragment("X", false)?;
    let mut empty = floors(&a, &inserted)?;
    empty[0] = BlockId::try_new("historical-floor")?;
    // The current AST cannot prove historical freshness. The shared definition
    // directory must reject the reused identity even though native admission fits.
    expected(&p, &a, &inserted, &empty)?;
    let before = saved(&a)?;
    let frame = a.update_frame()?;
    let observation = a.observe()?;
    assert!(a.replace_general_selection_text_guarded(&observation, &inserted, &empty).is_err());
    assert_eq!(saved(&a)?, before);
    assert_eq!(a.update_frame()?, frame);
    assert!(a.plan_general_selection_text_guarded(&observation, &inserted).is_ok());
    assert!(a.redo()?);
    Ok(())
}
