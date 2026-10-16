//! Opt-in semantic ranges repair normalized heads and final-only resource admission.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile, WriterGroupPreparation,
        actions::{DeleteBlock, InsertBlocks, InsertText, SetImageAlt, SplitTextBlock},
        selection::{Selection, TextPoint},
    },
};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::{FormatSet, TextFragment, TextRun},
    rich_content::{BlockId, RichDocument, actions::RichGeneralRangePlan},
    schema::DocumentLimits,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup(limits: DocumentLimits) -> Result<(SharedRichProfile, RichReplica)> {
    setup_root(limits, &fixture::root())
}
fn setup_root(limits: DocumentLimits, root: &Value) -> Result<(SharedRichProfile, RichReplica)> {
    setup_language(3, limits, root)
}
fn setup_language(
    revision: u32,
    limits: DocumentLimits,
    root: &Value,
) -> Result<(SharedRichProfile, RichReplica)> {
    let schema = json!({"name":"example/general-semantic","version":1});
    let configuration=json!({"format":"breditor/shared-rich-profile","formatVersion":revision,"schema":schema,"extensions":[]}).to_string();
    let p = match revision {
        1 => SharedRichProfile::from_standard_configuration_json_v1(&configuration)?,
        2 => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        3 => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
        _ => return Err("fixture rich revision".into()),
    };
    let p = match revision {
        1 => SharedRichProfile::from_schema(p.schema().clone(), limits)?,
        2 => SharedRichProfile::from_schema_v2(p.schema().clone(), limits)?,
        _ => SharedRichProfile::from_schema_v3(p.schema().clone(), limits)?,
    };
    let mut root = root.clone();
    if revision == 1 {
        root["children"].as_array_mut().ok_or("children")?.retain(|node| {
            !matches!(
                node["type"].as_str(),
                Some(
                    "breditor/blockquote"
                        | "breditor/task-list"
                        | "breditor/code-block"
                        | "breditor/horizontal-rule"
                )
            )
        });
    }
    let source=json!({"format":"breditor/document","formatVersion":2,"schema":schema,"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = p.create(&source, "101".into())?;
    Ok((p, a))
}
fn range(a: &str, x: u32, b: &str, y: u32) -> Selection {
    Selection::TextRange {
        anchor: TextPoint { block: a.into(), offset: x, affinity: Affinity::After },
        focus: TextPoint { block: b.into(), offset: y, affinity: Affinity::After },
    }
}
fn fragment(s: &str) -> Result<TextFragment> {
    Ok(if s.is_empty() {
        TextFragment::empty()
    } else {
        TextRun::try_new(s, FormatSet::try_from_formats(vec![])?)?.into()
    })
}
fn floors(a: &RichReplica, text: &TextFragment) -> Result<Vec<BlockId>> {
    let p = a.plan_general_selection_text_guarded(&a.observe()?, text)?;
    (0..p.empty_blocks().len())
        .map(|i| Ok(BlockId::try_new(format!("semantic-floor-{i}"))?))
        .collect()
}
fn expected(
    p: &SharedRichProfile,
    a: &RichReplica,
    text: &TextFragment,
    empty: &[BlockId],
    limits: DocumentLimits,
) -> Result<String> {
    let codec = DocumentJsonCodecV2::new(p.schema().clone()).with_limits(limits.clone());
    let context = EditorContext::new(p.schema().clone(), limits);
    let document =
        RichDocument::try_admit(p.schema(), codec.decode(a.document_json())?, context.limits())?;
    let selection = a.selection()?.ok_or("selection")?.admit(&document)?;
    let plan = RichGeneralRangePlan::capture(&document, &selection, text)?;
    Ok(codec.encode(
        plan.action(empty)?.apply(&context, &document)?.ok_or("native edit")?.document().document(),
    )?)
}
fn saved(a: &RichReplica) -> Result<String> {
    Ok(if a.typing_history_enabled() {
        a.general_typing_checkpoint()?
    } else {
        a.general_checkpoint()?
    })
}
fn future(p: &SharedRichProfile, a: &mut RichReplica) -> Result {
    let checkpoint = saved(a)?;
    assert!(p.restore("room", &checkpoint).is_err());
    assert!(p.restore_typing("room", &checkpoint).is_err());
    let mut b = if a.typing_history_enabled() {
        p.restore_general_typing("room", &checkpoint)?
    } else {
        p.restore_general("room", &checkpoint)?
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
fn find<'a>(n: &'a Value, id: &str) -> Option<&'a Value> {
    if n["properties"]["breditor/block-id"] == id {
        return Some(n);
    }
    n.get("children")?.as_array()?.iter().find_map(|c| find(c, id))
}
fn nodes(n: &Value) -> usize {
    1 + n.get("children").and_then(Value::as_array).map_or(0, |c| c.iter().map(nodes).sum())
}

#[test]
fn every_rich_language_selects_general_history_without_changing_its_causal_model() -> Result {
    for revision in 1..=3 {
        let (p, mut a) = setup_language(revision, DocumentLimits::default(), &fixture::root())?;
        let model = a.model_version();
        let journal = a.journal_version();
        let frame = a.update_frame()?;
        assert!(!a.general_ranges_enabled());
        a.enable_general_ranges_guarded(&a.observe()?)?;
        assert_eq!(a.model_version(), model);
        assert_eq!(a.journal_version(), journal);
        assert_eq!(a.update_frame()?, frame);
        a.set_selection(Some(&range("p-0-0", 1, "p-1-1", 3)))?;
        let inserted = fragment("X")?;
        let empty = floors(&a, &inserted)?;
        let native = expected(&p, &a, &inserted, &empty, DocumentLimits::default())?;
        a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &empty)?;
        assert_eq!(a.document_json(), native);
        future(&p, &mut a)?;
    }
    Ok(())
}

#[test]
fn semantic_writer_group_admits_atomically_on_an_original_history_receiver() -> Result {
    let (p, mut author) = setup(DocumentLimits::default())?;
    let mut server = p.join_frame("room".into(), "909".into(), &author.update_frame()?)?;
    author.enable_general_ranges_guarded(&author.observe()?)?;
    let through = server.writer_clock_v2("101")?.through;
    author.set_selection(Some(&range("p-0-0", 1, "p-1-1", 3)))?;
    let inserted = fragment("X")?;
    let empty = floors(&author, &inserted)?;
    author.replace_general_selection_text_guarded(&author.observe()?, &inserted, &empty)?;
    let packet: Value =
        serde_json::from_str(&author.writer_groups_v2_guarded(&author.observe()?, &through)?)?;
    assert_eq!(packet["formatVersion"], 2);
    let groups = packet["groups"].as_array().ok_or("groups")?;
    assert_eq!(groups.len(), 1);
    let input = groups[0].as_str().ok_or("group")?;
    let before = server.checkpoint()?;
    assert!(server.prepare_writer_group("101", input).is_err());
    // Frozen V1 hashes variable change chunks. This exact reproducer must not
    // silently acquire a different digest meaning under its original version.
    let original: Value =
        serde_json::from_str(&author.writer_groups_guarded(&author.observe()?, &through)?)?;
    let original = original["groups"][0].as_str().ok_or("original group")?;
    assert!(server.prepare_writer_group("101", original).is_err());
    assert!(server.prepare_writer_group_v2("101", original).is_err());
    let WriterGroupPreparation::Prepared(prepared) =
        server.prepare_writer_group_v2("101", input)?
    else {
        return Err("group did not prepare".into());
    };
    assert_eq!(server.checkpoint()?, before);
    assert_eq!(prepared.document_json(), author.document_json());
    let checkpoint = prepared.checkpoint()?;
    assert!(prepared.general_checkpoint().is_err());
    let restored = p.restore("room", &checkpoint)?;
    assert_eq!(restored.document_json(), author.document_json());
    server.commit_writer_group(*prepared)?;
    assert_eq!(server.checkpoint()?, checkpoint);
    assert!(!server.general_ranges_enabled());
    assert_eq!(server.writer_clock_v2("101")?, author.writer_clock_v2("101")?);
    assert!(matches!(
        server.prepare_writer_group_v2("101", input)?,
        WriterGroupPreparation::Duplicate(_)
    ));
    let mut acknowledged = packet["through"].as_str().ok_or("acknowledged head")?.to_owned();
    for redo in [false, true, false, true] {
        if redo {
            author.redo()?;
        } else {
            author.undo()?;
        }
        let packet: Value = serde_json::from_str(
            &author.writer_groups_v2_guarded(&author.observe()?, &acknowledged)?,
        )?;
        for input in packet["groups"].as_array().ok_or("future groups")? {
            let WriterGroupPreparation::Prepared(prepared) =
                server.prepare_writer_group_v2("101", input.as_str().ok_or("future group")?)?
            else {
                return Err("future preparation".into());
            };
            server.commit_writer_group(*prepared)?;
        }
        acknowledged = packet["through"].as_str().ok_or("future head")?.into();
        assert_eq!(server.document_json(), author.document_json());
        assert_eq!(server.writer_clock_v2("101")?, author.writer_clock_v2("101")?);
        server = p.restore("room", &server.checkpoint()?)?;
    }
    Ok(())
}

#[test]
fn first_key_replacement_and_following_input_are_one_group_with_exact_joined_recovery() -> Result {
    let (p, mut a) = setup(DocumentLimits::default())?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.enable_typing_history_guarded(&a.observe()?)?;
    let selection = range("p-0-0", 1, "p-1-1", 3);
    a.set_selection(Some(&selection))?;
    let before = a.document_json().to_owned();
    let empty = floors(&a, &fragment("X")?)?;
    assert!(a.replace_general_typing_text_guarded(&a.observe()?, "X", &empty, 1000)?);
    assert!(a.insert_typing_text_guarded(&a.observe()?, "Y🙂", 1050)?);
    assert_eq!(a.undo_count(), 1);
    assert_eq!(a.history_step_count(), 2);
    let checkpoint: Value = serde_json::from_str(&saved(&a)?)?;
    assert_eq!(checkpoint["joins"], json!([1]));
    assert!(a.undo()?);
    assert_eq!(a.document_json(), before);
    assert_eq!(a.selection()?, Some(selection));
    assert!(a.redo()?);
    future(&p, &mut a)?;
    Ok(())
}

#[test]
fn offline_peer_text_and_metadata_survive_selective_general_undo_and_restart() -> Result {
    let (p, mut a) = setup(DocumentLimits::default())?;
    let mut b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.set_selection(Some(&range("p-0-0", 1, "p-1-1", 3)))?;
    let inserted = fragment("X")?;
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
    let left = a.update_frame()?;
    let right = b.update_frame()?;
    a.receive_frame(&right)?;
    b.receive_frame(&left)?;
    assert_eq!(a.document_json(), b.document_json());
    let merged = a.document_json().to_owned();
    a.undo()?;
    let raw: Value = serde_json::from_str(a.document_json())?;
    let value = |id| -> Result<String> {
        Ok(find(&raw["root"], id).ok_or("text")?["children"]
            .as_array()
            .ok_or("runs")?
            .iter()
            .map(|run| run["text"].as_str().ok_or("run"))
            .collect::<std::result::Result<String, _>>()?)
    };
    assert_eq!(value("p-0-0")?, "La🙂b");
    assert_eq!(value("p-1-1")?, "a🙂bR");
    assert_eq!(
        find(&raw["root"], "image").ok_or("image")?["properties"]["breditor/alt-text"],
        "Peer diagram"
    );
    a.redo()?;
    assert_eq!(a.document_json(), merged);
    future(&p, &mut a)?;
    Ok(())
}

#[test]
fn late_historical_id_failure_stale_policy_and_final_text_limits_leave_every_field_unchanged()
-> Result {
    let (_, mut a) = setup(DocumentLimits::default())?;
    a.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent: None,
        before: Some("lead".into()),
        nodes: vec![fixture::paragraph("historical", "")],
    })])?;
    a.undo()?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.set_selection(Some(&range("p-0-0", 1, "p-1-1", 3)))?;
    let inserted = fragment("X")?;
    let mut empty = floors(&a, &inserted)?;
    empty[1] = BlockId::try_new("historical")?;
    let checkpoint = saved(&a)?;
    let frame = a.update_frame()?;
    let observation = a.observe()?;
    assert!(a.replace_general_selection_text_guarded(&observation, &inserted, &empty).is_err());
    assert_eq!(saved(&a)?, checkpoint);
    assert_eq!(a.update_frame()?, frame);
    assert!(a.plan_general_selection_text_guarded(&observation, &inserted).is_ok());
    a.set_read_only_guarded(&a.observe()?, true)?;
    let before = saved(&a)?;
    assert!(a.replace_general_selection_text_guarded(&observation, &inserted, &empty).is_err());
    assert!(a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &empty).is_err());
    assert_eq!(saved(&a)?, before);
    let (_, mut a) = setup(DocumentLimits::default().with_max_text_bytes(10))?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.set_selection(Some(&range("p-0-0", 1, "p-1-1", 3)))?;
    let inserted = fragment("zzzzzzzzzzz")?;
    let empty = floors(&a, &inserted)?;
    let before = saved(&a)?;
    let frame = a.update_frame()?;
    assert!(a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &empty).is_err());
    assert_eq!(saved(&a)?, before);
    assert_eq!(a.update_frame()?, frame);
    Ok(())
}

#[test]
fn native_semantic_work_is_not_artificially_limited_to_sixty_four_expanded_commands() -> Result {
    let mut root = fixture::root();
    root["children"] = json!([
        fixture::element(
            "blockquote",
            "many",
            (0..72).map(|i| fixture::paragraph(&format!("many-{i}"), "Text")).collect()
        ),
        fixture::element(
            "code-block",
            "code",
            vec![json!({"kind":"text","text":"plain","formats":[]})]
        )
    ]);
    let (p, mut a) = setup_root(DocumentLimits::default(), &root)?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.set_selection(Some(&range("many-0", 1, "code", 1)))?;
    let inserted = TextFragment::empty();
    let plan = a.plan_general_selection_text_guarded(&a.observe()?, &inserted)?;
    assert!(plan.covered().ok_or("protected range")?.operation_count() > 64);
    let native = expected(&p, &a, &inserted, &[], DocumentLimits::default())?;
    a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &[])?;
    assert_eq!(a.document_json(), native);
    assert_eq!(a.undo_count(), 1);
    let raw: Value = serde_json::from_str(&saved(&a)?)?;
    assert_eq!(raw["entries"].as_array().ok_or("entries")?.len(), 1);
    future(&p, &mut a)?;
    Ok(())
}

#[test]
fn empty_typing_and_line_separators_keep_native_noop_and_isolation_contracts() -> Result {
    let (_, mut a) = setup(DocumentLimits::default())?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.enable_typing_history_guarded(&a.observe()?)?;
    a.set_selection(Some(&range("p-0-0", 1, "p-1-1", 3)))?;
    let before = saved(&a)?;
    let observation = a.observe()?;
    assert!(!a.replace_general_typing_text_guarded(&observation, "", &[], 1000)?);
    assert_eq!(saved(&a)?, before);
    let empty = floors(&a, &fragment("X\n")?)?;
    a.replace_general_typing_text_guarded(&observation, "X\n", &empty, 1000)?;
    a.insert_typing_text_guarded(&a.observe()?, "Y", 1050)?;
    assert_eq!(a.undo_count(), 2);
    Ok(())
}

#[test]
fn normalized_head_removal_with_retained_sibling_is_fixed_with_exact_future_history() -> Result {
    for natural in [false, true] {
        let (p, mut a) = setup(DocumentLimits::default())?;
        a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "p-0-1".into() })])?;
        let raw: Value = serde_json::from_str(a.document_json())?;
        let head=find(&raw["root"],"cell-0-1").ok_or("cell")?["children"][0]["properties"]["breditor/block-id"].as_str().ok_or("head")?.to_owned();
        a.set_selection(Some(&range(&head, 0, &head, 0)))?;
        a.insert_plain_text("ab")?;
        a.apply(vec![Command::SplitTextBlock(SplitTextBlock {
            block: head.clone(),
            offset: 1,
            right: "retained-right".into(),
            right_heading: None,
        })])?;
        if natural {
            a.enable_typing_history_guarded(&a.observe()?)?;
        }
        a.enable_general_ranges_guarded(&a.observe()?)?;
        a.set_selection(Some(&range("p-0-0", 1, "retained-right", 1)))?;
        let before = a.document_json().to_owned();
        let inserted = fragment("X")?;
        let empty = floors(&a, &inserted)?;
        assert!(empty.is_empty());
        let native = expected(&p, &a, &inserted, &empty, DocumentLimits::default())?;
        assert!(!native.contains(&head));
        assert!(a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &empty)?);
        assert_eq!(a.document_json(), native);
        assert!(a.undo()?);
        assert_eq!(a.document_json(), before);
        assert!(a.redo()?);
        future(&p, &mut a)?;
    }
    Ok(())
}
#[test]
fn final_fitting_cell_replacement_no_longer_requires_transient_node_headroom() -> Result {
    let limits = DocumentLimits::default().with_max_nodes(nodes(&fixture::root()));
    let (p, mut a) = setup(limits.clone())?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.set_selection(Some(&range("p-0-0", 1, "p-1-1", 3)))?;
    let inserted = fragment("X🙂")?;
    let empty = floors(&a, &inserted)?;
    assert_eq!(empty.len(), 4);
    let native = expected(&p, &a, &inserted, &empty, limits)?;
    assert!(a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &empty)?);
    assert_eq!(a.document_json(), native);
    future(&p, &mut a)?;
    Ok(())
}
#[test]
fn deletion_and_unicode_replacement_match_native_in_both_directions_and_history_families() -> Result
{
    for natural in [false, true] {
        for backwards in [false, true] {
            for text in ["", "X🙂"] {
                let (p, mut a) = setup(DocumentLimits::default())?;
                a.enable_general_ranges_guarded(&a.observe()?)?;
                if natural {
                    a.enable_typing_history_guarded(&a.observe()?)?;
                }
                let selection = if backwards {
                    range("caption", 1, "z-intro", 1)
                } else {
                    range("z-intro", 1, "caption", 1)
                };
                a.set_selection(Some(&selection))?;
                let inserted = fragment(text)?;
                let empty = floors(&a, &inserted)?;
                let native = expected(&p, &a, &inserted, &empty, DocumentLimits::default())?;
                assert!(a.replace_general_selection_text_guarded(
                    &a.observe()?,
                    &inserted,
                    &empty
                )?);
                assert_eq!(a.document_json(), native);
                assert_eq!(a.undo_count(), 1);
                future(&p, &mut a)?;
            }
        }
    }
    Ok(())
}
#[test]
fn enabling_the_new_family_preserves_old_stacks_frames_and_both_typing_enable_orders() -> Result {
    for typing_first in [false, true] {
        let (p, mut a) = setup(DocumentLimits::default())?;
        a.apply(vec![Command::InsertText(InsertText {
            block: "p-0-0".into(),
            offset: 0,
            text: "P".into(),
        })])?;
        a.undo()?;
        assert_eq!(a.redo_count(), 1);
        if typing_first {
            a.enable_typing_history_guarded(&a.observe()?)?;
        }
        let frame = a.update_frame()?;
        let original = if typing_first { a.typing_checkpoint()? } else { a.checkpoint()? };
        let stale = a.observe()?;
        assert!(a.enable_general_ranges_guarded(&stale)?);
        assert!(a.general_ranges_enabled());
        assert_eq!(a.update_frame()?, frame);
        assert_eq!(a.redo_count(), 1);
        assert!(a.checkpoint().is_err());
        assert!(a.typing_checkpoint().is_err());
        assert!(a.set_selection_guarded(&stale, None).is_err());
        assert!(p.restore_general("room", &original).is_err());
        assert!(p.restore_general_typing("room", &original).is_err());
        if !typing_first {
            a.enable_typing_history_guarded(&a.observe()?)?;
        }
        assert!(a.redo()?);
        future(&p, &mut a)?;
    }
    Ok(())
}
#[test]
fn relabeling_semantic_records_as_original_journals_never_reinterprets_old_formats() -> Result {
    let (p, mut a) = setup(DocumentLimits::default())?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.set_selection(Some(&range("p-0-0", 1, "p-1-1", 3)))?;
    let inserted = fragment("X")?;
    let empty = floors(&a, &inserted)?;
    a.replace_general_selection_text_guarded(&a.observe()?, &inserted, &empty)?;
    let checkpoint = saved(&a)?;
    let mut raw: Value = serde_json::from_str(&checkpoint)?;
    assert_eq!(raw["entries"][0]["kind"], "general_range_v1");
    raw["format"] = json!("breditor/rich-replica-journal");
    raw["version"] = json!(14);
    assert!(p.restore("room", &raw.to_string()).is_err());
    assert!(p.restore_general("room", &raw.to_string()).is_err());
    let mut raw: Value = serde_json::from_str(&checkpoint)?;
    raw["entries"][0]["action"]["empty"][0] = json!("p-0-1");
    assert!(p.restore_general("room", &raw.to_string()).is_err());
    assert_eq!(saved(&a)?, checkpoint);
    Ok(())
}

#[test]
fn explicit_namespace_target_ignores_an_unrelated_caret_style_and_undo_restores_actual_ui() -> Result
{
    for backwards in [false, true] {
        let (p, mut a) = setup(DocumentLimits::default())?;
        a.enable_general_ranges_guarded(&a.observe()?)?;
        let before = range("q2", 2, "q2", 2);
        a.set_selection(Some(&before))?;
        let marks = vec![json!({"type":"breditor/strong","properties":{}})];
        a.set_pending_formats(Some(&marks))?;
        let source = a.document_json().to_owned();
        let target =
            if backwards { range("p-1-1", 3, "p-0-0", 1) } else { range("p-0-0", 1, "p-1-1", 3) };
        let input = json!({"selection":target,"text":"Q🙂","prefix":"explicit-input"}).to_string();
        assert!(a.replace_general_range_plain_text_namespace_json_guarded(&a.observe()?, &input)?);
        assert_eq!(a.pending_formats(), Some([].as_slice()));
        a.undo()?;
        assert_eq!(a.document_json(), source);
        assert_eq!(a.selection()?, Some(before));
        assert_eq!(a.pending_formats(), Some(marks.as_slice()));
        a.redo()?;
        future(&p, &mut a)?;
    }
    Ok(())
}
#[test]
fn explicit_namespace_first_key_keeps_boundary_caret_styles_and_exact_joined_recovery() -> Result {
    let (p, mut a) = setup(DocumentLimits::default())?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.enable_typing_history_guarded(&a.observe()?)?;
    let before = range("p-0-0", 1, "p-0-0", 1);
    a.set_selection(Some(&before))?;
    let marks = vec![json!({"type":"breditor/strong","properties":{}})];
    a.set_pending_formats(Some(&marks))?;
    let source = a.document_json().to_owned();
    let input=json!({"selection":range("p-0-0",1,"p-1-1",3),"text":"Q","prefix":"explicit-typing","clockMs":"1000"}).to_string();
    a.replace_general_range_typing_text_namespace_json_guarded(&a.observe()?, &input)?;
    a.insert_typing_text_guarded(&a.observe()?, "Y🙂", 1050)?;
    assert_eq!((a.undo_count(), a.history_step_count()), (1, 2));
    assert_eq!(a.pending_formats(), Some(marks.as_slice()));
    a.undo()?;
    assert_eq!(a.document_json(), source);
    assert_eq!(a.selection()?, Some(before));
    a.redo()?;
    future(&p, &mut a)?;
    Ok(())
}
#[test]
fn explicit_namespace_rich_runs_use_native_literals_and_no_current_selection_is_required() -> Result
{
    let (p, mut a) = setup(DocumentLimits::default())?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.set_selection(None)?;
    let source = a.document_json().to_owned();
    let input=json!({"selection":range("p-0-0",1,"p-1-1",3),"runs":[{"text":"Q🙂","formatsJson":"[{\"type\":\"breditor/strong\",\"properties\":{}}]"},{"text":"R","formatsJson":"[]"}],"prefix":"rich-input"}).to_string();
    assert!(a.replace_general_range_text_namespace_json_guarded(&a.observe()?, &input)?);
    assert!(a.document_json().contains("Q🙂"));
    a.undo()?;
    assert_eq!(a.document_json(), source);
    assert_eq!(a.selection()?, None);
    a.redo()?;
    future(&p, &mut a)?;
    Ok(())
}
#[test]
fn closed_namespace_request_failures_stale_policy_and_late_history_reuse_are_atomic() -> Result {
    let (_, mut a) = setup(DocumentLimits::default())?;
    let request = json!({"selection":range("p-0-0",1,"p-1-1",3),"text":"Q","prefix":"reserved"});
    let before = a.checkpoint()?;
    assert!(
        a.replace_general_range_plain_text_namespace_json_guarded(
            &a.observe()?,
            &request.to_string()
        )
        .is_err()
    );
    assert_eq!(a.checkpoint()?, before);
    a.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent: None,
        before: Some("lead".into()),
        nodes: vec![fixture::paragraph("reserved:range:1", "")],
    })])?;
    a.undo()?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    let before = saved(&a)?;
    let frame = a.update_frame()?;
    let observation = a.observe()?;
    for input in [
        request.to_string(),
        json!({"selection":range("p-0-0",2,"p-1-1",3),"text":"Q","prefix":"fresh"}).to_string(),
        json!({"selection":range("p-0-0",1,"p-1-1",3),"text":"Q","prefix":"fresh","extra":true})
            .to_string(),
        json!({"selection":range("p-0-0",1,"p-1-1",3),"text":"Q","prefix":"x".repeat(91)})
            .to_string(),
    ] {
        assert!(
            a.replace_general_range_plain_text_namespace_json_guarded(&observation, &input)
                .is_err()
        );
        assert_eq!(saved(&a)?, before);
        assert_eq!(a.update_frame()?, frame);
    }
    a.enable_typing_history_guarded(&a.observe()?)?;
    let before = saved(&a)?;
    for clock in [json!(1), json!("01"), json!("18446744073709551616")] {
        let mut r = request.clone();
        r["clockMs"] = clock;
        assert!(
            a.replace_general_range_typing_text_namespace_json_guarded(
                &a.observe()?,
                &r.to_string()
            )
            .is_err()
        );
        assert_eq!(saved(&a)?, before);
    }
    a.set_read_only_guarded(&a.observe()?, true)?;
    let before = saved(&a)?;
    assert!(
        a.replace_general_range_plain_text_namespace_json_guarded(&observation, "not json")
            .is_err()
    );
    assert!(matches!(
        a.replace_general_range_plain_text_namespace_json_guarded(&a.observe()?, "not json"),
        Err(breditor_collaboration::Error::ReadOnly)
    ));
    assert_eq!(saved(&a)?, before);
    Ok(())
}
