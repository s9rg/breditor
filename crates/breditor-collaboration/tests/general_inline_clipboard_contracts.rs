//! Native closed clipboard paste retains exact general-family selective history and original records.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::{InsertText, SetImageAlt},
        selection::{Selection, TextPoint},
    },
};
use breditor_core::schema::DocumentLimits;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn range(a: &str, x: u32, b: &str, y: u32) -> Selection {
    Selection::TextRange {
        anchor: TextPoint { block: a.into(), offset: x, affinity: Affinity::After },
        focus: TextPoint { block: b.into(), offset: y, affinity: Affinity::After },
    }
}
fn setup(language: u32, limits: DocumentLimits) -> Result<(SharedRichProfile, RichReplica)> {
    let config=json!({"format":"breditor/shared-rich-profile","formatVersion":language,"schema":{"name":"example/shared-general-clipboard","version":1},"extensions":[]}).to_string();
    let p = match language {
        1 => SharedRichProfile::from_standard_configuration_json_v1(&config)?,
        2 => SharedRichProfile::from_standard_configuration_json_v2(&config)?,
        _ => SharedRichProfile::from_standard_configuration_json_v3(&config)?,
    };
    let p = match language {
        1 => SharedRichProfile::from_schema(p.schema().clone(), limits)?,
        2 => SharedRichProfile::from_schema_v2(p.schema().clone(), limits)?,
        _ => SharedRichProfile::from_schema_v3(p.schema().clone(), limits)?,
    };
    let mut root = fixture::root();
    if language == 1 {
        root["children"].as_array_mut().ok_or("children")?.retain(|n| {
            !matches!(
                n["type"].as_str(),
                Some(
                    "breditor/horizontal-rule"
                        | "breditor/blockquote"
                        | "breditor/task-list"
                        | "breditor/code-block"
                )
            )
        });
    }
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/shared-general-clipboard","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = p.create(&input, "101".into())?;
    Ok((p, a))
}
fn clipboard(p: &SharedRichProfile) -> Value {
    json!({"format":"breditor/rich-clipboard","formatVersion":1,"kind":"text","document":{"format":"breditor/document","formatVersion":2,"schema":{"name":"example/shared-general-clipboard","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"breditor-clipboard"},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"clipboard-text"},"children":[{"kind":"text","text":"Q🙂","formats":[{"type":"breditor/strong","properties":{}}]},{"kind":"text","text":"R","formats":[]}]}]}}})
}
#[test]
fn general_copy_is_pure_read_only_guarded_and_keeps_shape_without_outside_content() -> Result {
    for language in [1, 2, 3] {
        let (_p, mut a) = setup(language, DocumentLimits::default())?;
        let selected = range("p-0-0", 1, "p-1-1", 3);
        a.set_selection(Some(&selected))?;
        let observation = a.observe()?;
        let exact = a.checkpoint()?;
        assert!(a.copy_clipboard_guarded(&observation).is_err());
        let content = a.copy_general_clipboard_guarded(&observation)?.ok_or("copy")?;
        let value: Value = serde_json::from_str(&content.rich_json)?;
        assert_eq!(value["formatVersion"], 1);
        assert_eq!(
            value["document"]["root"]["children"][0]["children"].as_array().ok_or("rows")?.len(),
            3
        );
        assert!(!content.rich_json.contains("Diagram"));
        assert_eq!(a.checkpoint()?, exact);
        a.set_read_only_guarded(&a.observe()?, true)?;
        assert!(a.copy_general_clipboard_guarded(&observation).is_err());
        let copy = a.copy_general_clipboard_guarded(&a.observe()?)?.ok_or("read only copy")?;
        assert_eq!(copy.rich_json, content.rich_json);
        assert_eq!(copy.plain_text, content.plain_text);
    }
    Ok(())
}
fn request(p: &SharedRichProfile, selection: &Selection, prefix: &str) -> Value {
    json!({"selection":selection,"clipboardJson":clipboard(p).to_string(),"prefix":prefix})
}
fn saved(a: &RichReplica) -> Result<String> {
    Ok(if a.typing_history_enabled() {
        a.general_typing_checkpoint()?
    } else {
        a.general_checkpoint()?
    })
}
fn future(p: &SharedRichProfile, a: &mut RichReplica) -> Result {
    let exact = saved(a)?;
    let mut b = if a.typing_history_enabled() {
        p.restore_general_typing("room", &exact)?
    } else {
        p.restore_general("room", &exact)?
    };
    assert!(saved(&b)? == exact);
    for redo in [false, true, false, true] {
        if redo {
            assert_eq!(a.redo()?, b.redo()?);
        } else {
            assert_eq!(a.undo()?, b.undo()?);
        }
        assert!(saved(a)? == saved(&b)?);
    }
    Ok(())
}
#[test]
fn rich_inline_paste_preserves_partial_cells_real_before_ui_and_all_language_history_bindings()
-> Result {
    for language in [1, 2, 3] {
        for natural in [false, true] {
            for backwards in [false, true] {
                let (p, mut a) = setup(language, DocumentLimits::default())?;
                a.enable_general_ranges_guarded(&a.observe()?)?;
                if natural {
                    a.enable_typing_history_guarded(&a.observe()?)?;
                }
                let before = range("p-2-3", 1, "p-2-3", 1);
                a.set_selection(Some(&before))?;
                let marks = vec![json!({"type":"breditor-inline/italic","properties":{}})];
                a.set_pending_formats(Some(&marks))?;
                let source = a.document_json().to_owned();
                let target = if backwards {
                    range("p-1-1", 3, "p-0-0", 1)
                } else {
                    range("p-0-0", 1, "p-1-1", 3)
                };
                assert!(a.paste_general_inline_clipboard_namespace_json_guarded(
                    &a.observe()?,
                    &request(&p, &target, "clipboard-floor").to_string()
                )?);
                let after = a.document_json().to_owned();
                assert!(after.contains("Q🙂"));
                assert!(after.contains("breditor/strong"));
                assert_eq!(a.undo_count(), 1);
                assert_eq!(a.pending_formats(), Some([].as_slice()));
                a.undo()?;
                assert_eq!(a.document_json(), source);
                assert_eq!(a.selection()?, Some(before));
                assert_eq!(a.pending_formats(), Some(marks.as_slice()));
                a.redo()?;
                future(&p, &mut a)?;
            }
        }
    }
    Ok(())
}
#[test]
fn caption_replacement_and_deleted_before_caret_survive_exact_recovery_at_source_node_limit()
-> Result {
    for natural in [false, true] {
        for (start, x, end, y) in [("caption", 1, "q1", 2), ("z-intro", 1, "code", 1)] {
            let (_, probe) = setup(3, DocumentLimits::default())?;
            let raw: Value = serde_json::from_str(probe.document_json())?;
            fn count(node: &Value) -> usize {
                1 + node["children"].as_array().map_or(0, |nodes| nodes.iter().map(count).sum())
            }
            let limits = DocumentLimits::default().with_max_nodes(count(&raw["root"]));
            let (p, mut a) = setup(3, limits)?;
            a.enable_general_ranges_guarded(&a.observe()?)?;
            if natural {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            let before = range("q2", 2, "q2", 2);
            a.set_selection(Some(&before))?;
            let source = a.document_json().to_owned();
            assert!(a.paste_general_inline_clipboard_namespace_json_guarded(
                &a.observe()?,
                &request(&p, &range(start, x, end, y), "limit-floor").to_string()
            )?);
            let after = a.document_json().to_owned();
            a.undo()?;
            assert_eq!(a.document_json(), source);
            assert_eq!(a.selection()?, Some(before));
            a.redo()?;
            assert_eq!(a.document_json(), after);
            future(&p, &mut a)?;
        }
    }
    Ok(())
}
#[test]
fn general_clipboard_decoding_refuses_unknown_duplicate_wrong_kind_and_unadmitted_schema_fields_atomically()
-> Result {
    let (p, mut a) = setup(3, DocumentLimits::default())?;
    let valid = request(&p, &range("p-0-0", 1, "p-1-1", 3), "clipboard-floor");
    assert!(a.paste_general_inline_clipboard_namespace_json_guarded(&a.observe()?, "bad").is_err());
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.set_selection(Some(&range("q2", 1, "q2", 1)))?;
    a.insert_plain_text("prior")?;
    a.undo()?;
    let exact = saved(&a)?;
    let frame = a.update_frame()?;
    for (key, value) in [
        ("extra", json!(true)),
        ("clipboardJson", json!(4)),
        ("prefix", json!("x".repeat(91))),
        ("selection", json!({"kind":"node","block":"quote"})),
    ] {
        let mut bad = valid.clone();
        bad[key] = value;
        assert!(
            a.paste_general_inline_clipboard_namespace_json_guarded(
                &a.observe()?,
                &bad.to_string()
            )
            .is_err()
        );
        assert!(saved(&a)? == exact);
        assert_eq!(a.update_frame()?, frame);
    }
    for (key, value) in
        [("kind", json!("flow")), ("extra", json!(true)), ("formatVersion", json!(2))]
    {
        let mut clip = clipboard(&p);
        clip[key] = value;
        let mut bad = valid.clone();
        bad["clipboardJson"] = json!(clip.to_string());
        assert!(
            a.paste_general_inline_clipboard_namespace_json_guarded(
                &a.observe()?,
                &bad.to_string()
            )
            .is_err()
        );
        assert!(saved(&a)? == exact);
    }
    let mut clip = clipboard(&p);
    clip["document"]["schemaFingerprint"] = json!("sha256:bad");
    let mut bad = valid.clone();
    bad["clipboardJson"] = json!(clip.to_string());
    assert!(
        a.paste_general_inline_clipboard_namespace_json_guarded(&a.observe()?, &bad.to_string())
            .is_err()
    );
    assert!(saved(&a)? == exact);
    let raw = format!(
        "{{\"selection\":{},\"prefix\":\"floor\",\"clipboardJson\":{},\"clipboardJson\":{}}}",
        valid["selection"], valid["clipboardJson"], valid["clipboardJson"]
    );
    assert!(a.paste_general_inline_clipboard_namespace_json_guarded(&a.observe()?, &raw).is_err());
    assert!(saved(&a)? == exact);
    let stale = a.observe()?;
    a.set_selection(Some(&range("q2", 2, "q2", 2)))?;
    assert!(a.paste_general_inline_clipboard_namespace_json_guarded(&stale, "bad").is_err());
    a.set_read_only_guarded(&a.observe()?, true)?;
    let exact = saved(&a)?;
    assert!(a.paste_general_inline_clipboard_namespace_json_guarded(&a.observe()?, "bad").is_err());
    assert!(saved(&a)? == exact);
    Ok(())
}
#[test]
fn offline_peer_text_and_image_fields_survive_selective_paste_undo_and_saved_redo() -> Result {
    let (p, mut a) = setup(3, DocumentLimits::default())?;
    let mut b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.set_selection(Some(&range("q2", 2, "q2", 2)))?;
    a.paste_general_inline_clipboard_namespace_json_guarded(
        &a.observe()?,
        &request(&p, &range("caption", 1, "q1", 2), "peer-floor").to_string(),
    )?;
    b.apply(vec![
        Command::InsertText(InsertText { block: "caption".into(), offset: 0, text: "Peer".into() }),
        Command::SetImageAlt(SetImageAlt {
            block: "image".into(),
            text: "Peer alt".into(),
            decorative: false,
        }),
    ])?;
    let left = a.update_frame()?;
    let right = b.update_frame()?;
    a.receive_frame(&right)?;
    b.receive_frame(&left)?;
    assert_eq!(a.document_json(), b.document_json());
    let after = a.document_json().to_owned();
    a.undo()?;
    assert!(a.document_json().contains("Peer"));
    assert!(a.document_json().contains("Peer alt"));
    a.redo()?;
    assert_eq!(a.document_json(), after);
    future(&p, &mut a)?;
    Ok(())
}
