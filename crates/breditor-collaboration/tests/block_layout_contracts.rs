//! Explicit shared V3 layout, independent ownership, exact history and retained-source audit.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        ClipboardNamespace, Command, PasteTarget, RichReplica, SharedRichProfile,
        WriterGroupPreparation,
        actions::{
            CodeFormatPolicy, DeleteBlock, InsertBlocks, InsertText, JoinTextBlocks,
            SetBlockLayout, SetCodeBlock, SetHeading, SplitListItem, SplitTaskItem, SplitTextBlock,
        },
        selection::{CellTarget, Selection, TextPoint},
    },
};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::{Format, PropertyMap},
    identity::QualifiedName,
    rich_content::RichSelectionFormatChange,
};
use loro::{ExportMode, LoroDoc, ToJson};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn config(revision: u32) -> String {
    json!({"format":"breditor/shared-rich-profile","formatVersion":revision,"schema":{"name":"example/shared-layout","version":1},"extensions":[]}).to_string()
}
fn profile() -> Result<SharedRichProfile> {
    Ok(SharedRichProfile::from_standard_configuration_json_v3(&config(3))?)
}
fn source(p: &SharedRichProfile, root: &Value) -> String {
    json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/shared-layout","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string()
}
fn setup() -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let p = profile()?;
    let a = p.create(&source(&p, &fixture::root()), "101".into())?;
    let b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((p, a, b))
}
fn text(a: &str, x: u32, b: &str, y: u32) -> Selection {
    Selection::TextRange {
        anchor: TextPoint { block: a.into(), offset: x, affinity: Affinity::After },
        focus: TextPoint { block: b.into(), offset: y, affinity: Affinity::After },
    }
}
fn grid() -> Selection {
    let c = CellTarget { table: "t".into(), row: "r1".into(), column: "c1".into() };
    Selection::Grid { anchor: c.clone(), focus: c }
}
fn layout(block: &str, patch: &str) -> Command {
    Command::SetBlockLayout(SetBlockLayout { block: block.into(), patch_json: patch.into() })
}
fn set(a: &mut RichReplica, patch: &str) -> Result<bool> {
    Ok(a.change_selection_layout_json_guarded(&a.observe()?, patch)?)
}
fn saved(a: &RichReplica) -> Result<String> {
    Ok(if a.typing_history_enabled() { a.typing_checkpoint()? } else { a.checkpoint()? })
}
fn restore(p: &SharedRichProfile, a: &RichReplica) -> Result<RichReplica> {
    Ok(if a.typing_history_enabled() {
        p.restore_typing("room", &saved(a)?)?
    } else {
        p.restore("room", &saved(a)?)?
    })
}
fn future(p: &SharedRichProfile, a: &mut RichReplica) -> Result {
    let mut b = restore(p, a)?;
    assert_eq!(saved(a)?, saved(&b)?);
    let count = a.undo_count() + 1;
    for redo in [false, true, false, true] {
        for _ in 0..count {
            assert_eq!(
                if redo { a.redo()? } else { a.undo()? },
                if redo { b.redo()? } else { b.undo()? }
            );
            assert_eq!(saved(a)?, saved(&b)?);
        }
    }
    Ok(())
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> Result {
    let x = a.update_frame()?;
    let y = b.update_frame()?;
    a.receive_frame(&y)?;
    b.receive_frame(&x)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}
fn find<'a>(node: &'a Value, id: &str) -> Option<&'a Value> {
    if node["properties"]["breditor/block-id"] == id {
        return Some(node);
    }
    node.get("children")?.as_array()?.iter().find_map(|n| find(n, id))
}
fn find_mut<'a>(node: &'a mut Value, id: &str) -> Option<&'a mut Value> {
    if node["properties"]["breditor/block-id"] == id {
        return Some(node);
    }
    node.get_mut("children")?.as_array_mut()?.iter_mut().find_map(|n| find_mut(n, id))
}
fn properties(a: &RichReplica, block: &str) -> Result<Value> {
    let ast: Value = serde_json::from_str(a.document_json())?;
    Ok(find(&ast["root"], block).ok_or("missing block")?["properties"].clone())
}
fn read(a: &RichReplica) -> Result<Value> {
    Ok(serde_json::from_str(&a.block_layout_state_json_guarded(&a.observe()?)?)?)
}
fn raw(a: &RichReplica) -> Result<LoroDoc> {
    let d = LoroDoc::new();
    d.import(&a.updates()?)?;
    d.set_peer_id(303)?;
    Ok(d)
}
fn metadata(d: &LoroDoc, block: &str) -> Result<loro::LoroMap> {
    Ok(d.get_map("metadata").ensure_mergeable_map(block)?)
}
const FULL: &str = r#"{"alignment":"end","direction":"rtl","indent":3,"lineHeightPercent":150}"#;
#[test]
fn explicit_v3_factories_bind_model13_journal14_without_widening_old_selectors() -> Result {
    let (p, a, _) = setup()?;
    for descriptor in [p.descriptor_json(), a.descriptor_json()] {
        let v: Value = serde_json::from_str(&descriptor)?;
        assert_eq!(v["modelVersion"], 13);
        assert_eq!(v["journalVersion"], 14);
        assert_eq!(v["richLanguageVersion"], 3);
        assert_eq!(v["blockLayoutVersion"], 1);
    }
    assert_eq!((a.model_version(), a.journal_version()), (13, 14));
    assert!(SharedRichProfile::from_schema(p.schema().clone(), p.limits().clone()).is_err());
    assert!(SharedRichProfile::from_schema_v2(p.schema().clone(), p.limits().clone()).is_err());
    assert!(SharedRichProfile::from_configuration_json(&config(3)).is_err());
    assert!(SharedRichProfile::from_configuration_json_v2(&config(3)).is_err());
    for version in [1, 2, 4] {
        assert!(SharedRichProfile::from_configuration_json_v3(&config(version)).is_err());
        assert!(SharedRichProfile::from_standard_configuration_json_v3(&config(version)).is_err());
    }
    let codec = DocumentJsonCodecV2::new(p.schema().clone());
    assert!(RichReplica::new(codec.clone(), "not JSON", "1".into()).is_err());
    assert!(RichReplica::join_frame(codec.clone(), "room".into(), "1".into(), "not JSON").is_err());
    assert!(RichReplica::restore(codec, "room", "not JSON").is_err());
    Ok(())
}
#[test]
fn seeded_layout_uses_only_independent_owned_fields_and_reset_really_removes_properties() -> Result
{
    let p = profile()?;
    let mut root = fixture::root();
    let props = &mut find_mut(&mut root, "code").ok_or("code")?["properties"];
    for (name, n) in [
        ("block-align", 3),
        ("block-direction", 2),
        ("block-indent", 3),
        ("line-height-percent", 150),
    ] {
        props[format!("breditor/{name}")] = json!(n);
    }
    let input = source(&p, &root);
    let mut a = p.create(&input, "101".into())?;
    let codec = DocumentJsonCodecV2::new(p.schema().clone());
    assert_eq!(a.document_json(), codec.encode(&codec.decode(&input)?)?);
    let d = raw(&a)?;
    let meta = metadata(&d, "code")?.get_deep_value().to_json_value();
    for f in ["alignment", "direction", "indent", "line-height"] {
        assert_eq!(meta["effects"][format!("layout-{f}")].as_object().ok_or("field")?.len(), 1);
    }
    assert!(
        !meta["effects"]
            .as_object()
            .ok_or("effects")?
            .keys()
            .any(|s| s.starts_with("property:breditor/block-")
                || s == "property:breditor/line-height-percent")
    );
    a.set_selection(Some(&text("code", 0, "code", 0)))?;
    assert!(set(
        &mut a,
        r#"{"alignment":null,"direction":null,"indent":null,"lineHeightPercent":null}"#
    )?);
    let props = properties(&a, "code")?;
    for key in ["block-align", "block-direction", "block-indent", "line-height-percent"] {
        assert!(props.get(format!("breditor/{key}")).is_none());
    }
    a.undo()?;
    assert_eq!(a.document_json(), codec.encode(&codec.decode(&input)?)?);
    a.redo()?;
    future(&p, &mut a)
}
#[test]
fn covered_blocks_include_carets_code_empty_boundaries_nodes_and_merged_source_bodies() -> Result {
    for (selection, count) in [
        (text("empty", 0, "empty", 0), "1"),
        (text("code", 0, "code", 0), "1"),
        (text("code", 4, "task-head", 2), "3"),
        (grid(), "4"),
        (Selection::Node { block: "image".into() }, "1"),
        (Selection::Node { block: "list".into() }, "2"),
    ] {
        for typing in [false, true] {
            let (p, mut a, _) = setup()?;
            if typing {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            a.set_selection(Some(&selection))?;
            let original = a.document_json().to_owned();
            let guard = a.observe()?;
            let before = saved(&a)?;
            let frame = a.update_frame()?;
            assert_eq!(read(&a)?["blocks"], count);
            assert_eq!(saved(&a)?, before);
            assert_eq!(a.update_frame()?, frame);
            assert!(set(&mut a, FULL)?);
            assert_eq!(a.selection()?, Some(selection.clone()));
            assert!(a.block_layout_state_json_guarded(&guard).is_err());
            assert_eq!(a.undo_count(), 1);
            let state = read(&a)?;
            assert_eq!(state["alignment"]["value"], "end");
            assert_eq!(state["direction"]["value"], "rtl");
            assert_eq!(state["indent"]["value"], 3);
            assert_eq!(state["lineHeightPercent"]["value"], 150);
            let checkpoint = saved(&a)?;
            assert!(!set(&mut a, FULL)?);
            assert_eq!(saved(&a)?, checkpoint);
            a.undo()?;
            assert_eq!(a.document_json(), original);
            a.redo()?;
            future(&p, &mut a)?;
        }
    }
    Ok(())
}
#[test]
fn mixed_fields_keep_clear_and_pending_inline_formats_remain_distinct() -> Result {
    let (p, mut a, _) = setup()?;
    a.apply(vec![layout("q1", FULL), layout("q2", r#"{"alignment":"center"}"#)])?;
    a.set_selection(Some(&text("q2", 4, "q1", 1)))?;
    assert_eq!(read(&a)?["alignment"]["kind"], "mixed");
    assert_eq!(read(&a)?["direction"]["kind"], "mixed");
    set(&mut a, r#"{"alignment":null,"indent":0}"#)?;
    assert_eq!(read(&a)?["alignment"]["value"], Value::Null);
    assert_eq!(read(&a)?["indent"]["value"], 0);
    assert_eq!(read(&a)?["direction"]["kind"], "mixed");
    a.set_selection(Some(&text("empty", 0, "empty", 0)))?;
    let strong = Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::try_from_sorted(vec![])?,
    );
    a.change_selection_formats_guarded(&a.observe()?, &[RichSelectionFormatChange::Set(strong)])?;
    let pending = a.pending_formats().map(<[Value]>::to_vec);
    assert!(pending.is_some());
    set(&mut a, FULL)?;
    assert_eq!(a.pending_formats(), pending.as_deref());
    a.undo()?;
    assert_eq!(a.pending_formats(), pending.as_deref());
    a.redo()?;
    future(&p, &mut a)
}
#[test]
fn offline_disjoint_layout_fields_and_text_survive_selective_history_in_both_orders() -> Result {
    for reverse in [false, true] {
        let (p, mut a, mut b) = setup()?;
        a.apply(vec![layout("z-intro", r#"{"alignment":"start","indent":2}"#)])?;
        b.apply(vec![
            layout("z-intro", r#"{"direction":"rtl","lineHeightPercent":200}"#),
            Command::InsertText(InsertText {
                block: "z-intro".into(),
                offset: 1,
                text: "PEER".into(),
            }),
        ])?;
        if reverse {
            sync(&mut b, &mut a)?;
        } else {
            sync(&mut a, &mut b)?;
        }
        let props = properties(&a, "z-intro")?;
        assert_eq!(props["breditor/block-align"], 1);
        assert_eq!(props["breditor/block-direction"], 2);
        assert_eq!(props["breditor/block-indent"], 2);
        assert_eq!(props["breditor/line-height-percent"], 200);
        a.undo()?;
        let props = properties(&a, "z-intro")?;
        assert!(props.get("breditor/block-align").is_none());
        assert!(props.get("breditor/block-indent").is_none());
        assert_eq!(props["breditor/block-direction"], 2);
        assert_eq!(props["breditor/line-height-percent"], 200);
        assert!(a.document_json().contains("PEER"));
        a.redo()?;
        future(&p, &mut a)?;
    }
    Ok(())
}
#[test]
fn same_field_order_is_deterministic_and_redo_does_not_impersonate_a_later_writer() -> Result {
    for reverse in [false, true] {
        let (p, mut a, mut b) = setup()?;
        a.apply(vec![layout("q1", r#"{"alignment":"left"}"#)])?;
        b.apply(vec![layout("q1", r#"{"alignment":"right"}"#)])?;
        if reverse {
            sync(&mut b, &mut a)?;
        } else {
            sync(&mut a, &mut b)?;
        }
        assert_eq!(properties(&a, "q1")?["breditor/block-align"], 6);
        a.undo()?;
        a.redo()?;
        assert_eq!(properties(&a, "q1")?["breditor/block-align"], 6);
        b.undo()?;
        sync(&mut a, &mut b)?;
        assert_eq!(properties(&a, "q1")?["breditor/block-align"], 5);
        future(&p, &mut a)?;
    }
    Ok(())
}
#[test]
fn conversions_and_all_three_split_families_inherit_layout_without_competing_defaults() -> Result {
    let (p, mut a, _) = setup()?;
    a.apply(vec![layout("q1", FULL), layout("head", FULL), layout("task-head", FULL)])?;
    let props = properties(&a, "q1")?;
    a.apply(vec![Command::SetCodeBlock(SetCodeBlock {
        block: "q1".into(),
        language: Some("rust".into()),
        format_policy: CodeFormatPolicy::RejectFormatted,
    })])?;
    a.apply(vec![Command::SetHeading(SetHeading { block: "q1".into(), level: Some(3) })])?;
    assert_eq!(properties(&a, "q1")?["breditor/block-indent"], props["breditor/block-indent"]);
    for command in [
        Command::SplitTextBlock(SplitTextBlock {
            block: "q1".into(),
            offset: 2,
            right: "q-right".into(),
            right_heading: None,
        }),
        Command::SplitListItem(SplitListItem {
            block: "head".into(),
            offset: 2,
            new_item: "next-item".into(),
            right: "list-right".into(),
            right_heading: Some(2),
        }),
        Command::SplitTaskItem(SplitTaskItem {
            block: "task-head".into(),
            offset: 2,
            new_item: "next-task".into(),
            right: "task-right".into(),
            right_heading: None,
        }),
    ] {
        a.apply(vec![command])?;
    }
    for id in ["q-right", "list-right", "task-right"] {
        let props = properties(&a, id)?;
        assert_eq!(props["breditor/block-align"], 3, "{id}");
        assert_eq!(props["breditor/block-direction"], 2, "{id}");
        assert_eq!(props["breditor/block-indent"], 3, "{id}");
        assert_eq!(props["breditor/line-height-percent"], 150, "{id}");
        a.apply(vec![layout(id, r#"{"alignment":null}"#)])?;
        assert!(properties(&a, id)?.get("breditor/block-align").is_none());
    }
    a.apply(vec![Command::JoinTextBlocks(JoinTextBlocks {
        left: "q1".into(),
        right: "q-right".into(),
    })])?;
    assert_eq!(properties(&a, "q1")?["breditor/block-align"], 3);
    future(&p, &mut a)
}
#[test]
fn created_layout_and_foreign_edits_survive_creator_undo_and_deletion_undo() -> Result {
    let (p, mut a, mut b) = setup()?;
    let mut node = fixture::paragraph("born", "New");
    node["properties"]["breditor/block-align"] = json!(2);
    a.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent: None,
        before: None,
        nodes: vec![node],
    })])?;
    b.receive_frame(&a.update_frame()?)?;
    b.apply(vec![layout("born", r#"{"direction":"rtl"}"#)])?;
    a.receive_frame(&b.update_frame()?)?;
    a.undo()?;
    assert!(!a.document_json().contains("\"born\""));
    a.redo()?;
    assert_eq!(properties(&a, "born")?["breditor/block-direction"], 2);
    // The independent peer contribution remains valid even while the birth is hidden.
    future(&p, &mut a)?;
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "q1".into() })])?;
    b.apply(vec![layout("q1", FULL)])?;
    sync(&mut a, &mut b)?;
    assert!(!a.document_json().contains("\"q1\""));
    a.undo()?;
    assert_eq!(properties(&a, "q1")?["breditor/block-align"], 3);
    future(&p, &mut a)
}
#[test]
fn stale_readonly_bad_intents_nontext_and_late_group_failures_publish_nothing() -> Result {
    let (_, mut a, _) = setup()?;
    a.set_selection(Some(&text("q1", 0, "q1", 0)))?;
    let before = saved(&a)?;
    let frame = a.update_frame()?;
    let version = a.causal_version();
    for input in [
        "{}",
        "notJSON",
        r#"{"indent":13}"#,
        r#"{"lineHeightPercent":99}"#,
        r#"{"alignment":"left","alignment":"right"}"#,
        r#"{"alignment":"start","targets":[]}"#,
    ] {
        assert!(set(&mut a, input).is_err());
        assert_eq!(saved(&a)?, before);
    }
    for target in ["image", "table", "list", "tasks", "lead", "cell-0-0"] {
        assert!(a.apply(vec![layout("q1", FULL), layout(target, FULL)]).is_err());
        assert_eq!(saved(&a)?, before);
    }
    assert_eq!(a.update_frame()?, frame);
    assert_eq!(a.causal_version(), version);
    let stale = a.observe()?;
    a.set_read_only_guarded(&a.observe()?, true)?;
    let before = saved(&a)?;
    assert!(a.change_selection_layout_json_guarded(&stale, "notJSON").is_err());
    assert!(set(&mut a, FULL).is_err());
    assert!(a.apply(vec![layout("q1", FULL)]).is_err());
    assert_eq!(read(&a)?["alignment"]["kind"], "uniform");
    assert_eq!(saved(&a)?, before);
    Ok(())
}
#[test]
fn selection_command_ceiling_refuses_complete_wide_coverage_without_prefix_commit() -> Result {
    let (p, _, _) = setup()?;
    let mut root = fixture::root();
    root["children"].as_array_mut().ok_or("children")?.push(fixture::element(
        "blockquote",
        "wide",
        (0..65).map(|n| fixture::paragraph(&format!("wide-{n}"), "")).collect(),
    ));
    let mut a = p.create(&source(&p, &root), "101".into())?;
    a.set_selection(Some(&Selection::Node { block: "wide".into() }))?;
    let before = saved(&a)?;
    let frame = a.update_frame()?;
    let version = a.causal_version();
    assert!(set(&mut a, FULL).is_err());
    assert_eq!(saved(&a)?, before);
    assert_eq!(a.update_frame()?, frame);
    assert_eq!(a.causal_version(), version);
    Ok(())
}
#[test]
fn old_profiles_frames_checkpoints_and_markers_do_not_acquire_v3_semantics() -> Result {
    let (p, mut a, _) = setup()?;
    let before = saved(&a)?;
    for old in [
        SharedRichProfile::from_standard_configuration_json_v1(&config(1))?,
        SharedRichProfile::from_standard_configuration_json_v2(&config(2))?,
    ] {
        let mut root =
            fixture::element("document", "unused", vec![fixture::paragraph("p", "Text")]);
        root["properties"] = json!({"breditor/document-id":"room"});
        let mut b = old.create(&source(&old, &root), "404".into())?;
        let old_before = saved(&b)?;
        assert!(b.apply(vec![layout("p", FULL)]).is_err());
        assert!(b.block_layout_state_json_guarded(&b.observe()?).is_err());
        assert!(b.receive_frame(&a.update_frame()?).is_err());
        assert!(a.receive_frame(&b.update_frame()?).is_err());
        assert!(old.restore("room", &before).is_err());
        assert!(p.restore("room", &old_before).is_err());
        assert_eq!(saved(&b)?, old_before);
    }
    for marker in [None, Some("12"), Some("14")] {
        let d = raw(&a)?;
        if let Some(marker) = marker {
            d.get_map("binding").insert("model-version", marker)?;
        } else {
            d.get_map("binding").delete("model-version")?;
        }
        d.commit();
        assert!(a.receive(d.export(ExportMode::all_updates())?).is_err());
        assert_eq!(saved(&a)?, before);
    }
    Ok(())
}
#[test]
fn retained_invalid_values_foreign_slots_identity_and_defaults_refuse_before_cache_or_visibility()
-> Result {
    for hidden in [false, true] {
        let (_, mut a, _) = setup()?;
        a.apply(vec![layout("q1", FULL)])?;
        a.apply(vec![layout("q1", r#"{"alignment":"center"}"#)])?;
        if hidden {
            a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "q1".into() })])?;
        }
        let before = saved(&a)?;
        let frame = a.update_frame()?;
        for attack in 0..7 {
            let d = raw(&a)?;
            let meta = metadata(&d, "q1")?;
            let effects = meta.ensure_mergeable_map("effects")?;
            if attack < 5 {
                let values = effects.ensure_mergeable_map("layout-alignment")?;
                let raw = values.get_deep_value().to_json_value();
                let (key, value) = raw
                    .as_object()
                    .ok_or("values")?
                    .iter()
                    .min_by_key(|(_, v)| {
                        v["lamport"]
                            .as_str()
                            .and_then(|n| n.parse::<u64>().ok())
                            .unwrap_or(u64::MAX)
                    })
                    .ok_or("entry")?;
                // Alter a losing contribution with an otherwise real retained causal clock.
                let mut value = value.clone();
                value["value"] = json!(match attack {
                    0 => r#"{"sets":{"breditor/block-align":7},"removes":[]}"#,
                    1 => r#"{"sets":{"breditor/block-align":2.5},"removes":[]}"#,
                    2 => r#"{"sets":{"breditor/block-direction":2},"removes":[]}"#,
                    3 => r#"{"sets":{},"removes":[]}"#,
                    _ =>
                        r#"{"sets":{"breditor/block-align":2},"removes":["breditor/block-align"]}"#,
                });
                if attack == 2 {
                    effects
                        .ensure_mergeable_map("foreign-layout")?
                        .insert(key, serde_json::from_value::<loro::LoroValue>(value)?)?;
                } else {
                    values.insert(key, serde_json::from_value::<loro::LoroValue>(value)?)?;
                }
            } else {
                let name = if attack == 5 { "identity" } else { "defaults" };
                let mut value = if attack == 5 {
                    serde_json::from_str::<Value>(
                        &meta
                            .get(name)
                            .and_then(|v| {
                                v.as_value()
                                    .and_then(loro::LoroValue::as_string)
                                    .map(|s| s.to_string())
                            })
                            .ok_or("identity")?,
                    )?
                } else {
                    json!({})
                };
                value["breditor/block-align"] = json!(2);
                meta.insert(name, value.to_string())?;
            }
            d.commit();
            assert!(
                a.receive(d.export(ExportMode::all_updates())?).is_err(),
                "accepted attack={attack}, hidden={hidden}"
            );
            assert_eq!(saved(&a)?, before);
            assert_eq!(a.update_frame()?, frame);
        }
    }
    Ok(())
}
#[test]
fn writer_groups_bind_v3_and_recover_exact_causal_layout_receipts() -> Result {
    let (p, mut server, mut client) = setup()?;
    client.apply(vec![layout("q1", FULL)])?;
    let groups: Value =
        serde_json::from_str(&client.writer_groups_guarded(&client.observe()?, "0")?)?;
    for value in groups["groups"].as_array().ok_or("groups")? {
        let group = value.as_str().ok_or("group")?;
        assert_eq!(serde_json::from_str::<Value>(group)?["modelVersion"], 13);
        let WriterGroupPreparation::Prepared(prepared) =
            server.prepare_writer_group("202", group)?
        else {
            return Err("not prepared".into());
        };
        let expected = prepared.checkpoint()?;
        server.commit_writer_group(*prepared)?;
        assert_eq!(server.checkpoint()?, expected);
    }
    assert_eq!(server.document_json(), client.document_json());
    assert_eq!(saved(&server)?, saved(&restore(&p, &server)?)?);
    Ok(())
}
#[test]
fn nontext_metadata_owner_cannot_hide_layout_fields_outside_the_visible_projection() -> Result {
    let (_, mut a, _) = setup()?;
    a.apply(vec![layout("q1", FULL)])?;
    let before = saved(&a)?;
    for block in ["image", "table", "lead", "hidden"] {
        let d = raw(&a)?;
        let values = metadata(&d, "q1")?
            .ensure_mergeable_map("effects")?
            .ensure_mergeable_map("layout-alignment")?
            .get_deep_value()
            .to_json_value();
        let (key, value) = values.as_object().ok_or("values")?.iter().next().ok_or("entry")?;
        metadata(&d, block)?
            .ensure_mergeable_map("effects")?
            .ensure_mergeable_map("layout-alignment")?
            .insert(key, serde_json::from_value::<loro::LoroValue>(value.clone())?)?;
        d.commit();
        assert!(a.receive(d.export(ExportMode::all_updates())?).is_err());
        assert_eq!(saved(&a)?, before);
    }
    Ok(())
}
#[test]
fn clipboard_rekeys_caption_layout_without_importing_ownership_and_resets_newborn_fields() -> Result
{
    let (p, mut a, mut b) = setup()?;
    a.apply(vec![layout("caption", FULL)])?;
    a.set_selection(Some(&Selection::Node { block: "image".into() }))?;
    let clipboard = a.copy_clipboard_guarded(&a.observe()?)?.ok_or("clipboard")?;
    let before = a.document_json().to_owned();
    a.paste_clipboard_guarded(
        &a.observe()?,
        &clipboard.rich_json,
        PasteTarget::Flow { parent: None, before: None },
        &mut ClipboardNamespace::try_new("layout-paste")?,
    )?;
    let ast: Value = serde_json::from_str(a.document_json())?;
    let image = ast["root"]["children"].as_array().ok_or("children")?.last().ok_or("image")?;
    assert_eq!(image["type"], "breditor/image");
    assert_eq!(image["properties"]["breditor/asset-id"], "asset");
    let caption = &image["children"][0];
    let id = caption["properties"]["breditor/block-id"].as_str().ok_or("caption id")?.to_owned();
    assert_ne!(id, "caption");
    assert_eq!(properties(&a, &id)?["breditor/block-align"], 3);
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    a.undo()?;
    assert_eq!(a.document_json(), before);
    a.redo()?;
    a.apply(vec![layout(&id, r#"{"alignment":null}"#)])?;
    assert!(properties(&a, &id)?.get("breditor/block-align").is_none());
    assert_eq!(properties(&a, "caption")?["breditor/block-align"], 3);
    future(&p, &mut a)
}
#[test]
fn independent_resets_and_code_conversion_do_not_overwrite_other_writers_layout_or_text() -> Result
{
    let (p, mut a, mut b) = setup()?;
    a.apply(vec![layout("q1", FULL)])?;
    b.receive_frame(&a.update_frame()?)?;
    a.apply(vec![layout("q1", r#"{"alignment":null}"#)])?;
    b.apply(vec![
        layout("q1", r#"{"direction":"ltr"}"#),
        Command::SetCodeBlock(SetCodeBlock {
            block: "q1".into(),
            language: Some("rust".into()),
            format_policy: CodeFormatPolicy::RejectFormatted,
        }),
        Command::InsertText(InsertText { block: "q1".into(), offset: 0, text: "PEER".into() }),
    ])?;
    sync(&mut a, &mut b)?;
    assert!(properties(&a, "q1")?.get("breditor/block-align").is_none());
    assert_eq!(properties(&a, "q1")?["breditor/block-direction"], 1);
    assert_eq!(properties(&a, "q1")?["breditor/block-indent"], 3);
    a.undo()?;
    assert_eq!(properties(&a, "q1")?["breditor/block-align"], 3);
    assert_eq!(properties(&a, "q1")?["breditor/block-direction"], 1);
    assert!(a.document_json().contains("PEER"));
    a.redo()?;
    future(&p, &mut a)
}
#[test]
fn earlier_declared_birth_and_derived_empty_head_accept_layout_in_one_atomic_group() -> Result {
    let (p, mut a, _) = setup()?;
    a.apply(vec![
        Command::InsertBlocks(InsertBlocks {
            parent: None,
            before: None,
            nodes: vec![fixture::paragraph("same-group", "New")],
        }),
        layout("same-group", FULL),
    ])?;
    assert_eq!(a.undo_count(), 1);
    assert_eq!(properties(&a, "same-group")?["breditor/block-indent"], 3);
    future(&p, &mut a)?;
    // Bootstrap admits real flow; deleting the last real block creates the derived head.
    let mut root = fixture::element("document", "unused", vec![fixture::paragraph("last", "Text")]);
    root["properties"] = json!({"breditor/document-id":"room"});
    let mut a = p.create(&source(&p, &root), "505".into())?;
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "last".into() })])?;
    let ast: Value = serde_json::from_str(a.document_json())?;
    let id =
        ast["root"]["children"][0]["properties"]["breditor/block-id"].as_str().ok_or("fallback")?;
    let s = text(id, 0, id, 0);
    a.set_selection(Some(&s))?;
    assert!(set(&mut a, FULL)?);
    assert_eq!(a.selection()?, Some(s));
    assert_eq!(read(&a)?["alignment"]["value"], "end");
    future(&p, &mut a)
}
#[test]
fn late_native_property_budget_failure_rolls_back_an_earlier_valid_shared_target() -> Result {
    let p = profile()?;
    let p = SharedRichProfile::from_schema_v3(
        p.schema().clone(),
        p.limits().clone().with_max_properties_per_owner(2),
    )?;
    let mut q = fixture::element(
        "blockquote",
        "q",
        vec![fixture::paragraph("a", "A"), fixture::paragraph("b", "B")],
    );
    find_mut(&mut q, "b").ok_or("b")?["properties"]["breditor/block-direction"] = json!(2);
    let mut root = fixture::element("document", "unused", vec![q]);
    root["properties"] = json!({"breditor/document-id":"room"});
    let mut a = p.create(&source(&p, &root), "101".into())?;
    a.set_selection(Some(&Selection::Node { block: "q".into() }))?;
    let before = saved(&a)?;
    let frame = a.update_frame()?;
    let version = a.causal_version();
    assert!(set(&mut a, r#"{"alignment":"center"}"#).is_err());
    assert!(
        a.apply(vec![
            layout("a", r#"{"alignment":"center"}"#),
            layout("b", r#"{"alignment":"center"}"#)
        ])
        .is_err()
    );
    assert_eq!(saved(&a)?, before);
    assert_eq!(a.update_frame()?, frame);
    assert_eq!(a.causal_version(), version);
    Ok(())
}
