//! Native opt-in structural causal model; V1 factories and byte meanings stay separate.
use breditor_collaboration::{
    Error,
    anchor::Affinity,
    rich_replica::{
        Command, PresenceResolution, RichReplica, SharedRichProfile, WriterGroupPreparation,
        actions::{
            CodeFormatPolicy, DeleteBlock, InsertBlocks, InsertText, SetCodeBlock, SetCodeLanguage,
            SetFormat, SetHeading, SetTaskChecked,
        },
        selection::{Selection, TextPoint},
    },
};
use breditor_core::codec::DocumentJsonCodecV2;
use loro::LoroDoc;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn configuration(revision: u32) -> Value {
    json!({"format":"breditor/shared-rich-profile","formatVersion":revision,"schema":{"name":"example/structural-shared","version":revision},"extensions":[]})
}
fn profile() -> Result<SharedRichProfile> {
    Ok(SharedRichProfile::from_standard_configuration_json_v2(&configuration(2).to_string())?)
}
fn element(kind: &str, id: &str, children: Vec<Value>) -> Value {
    let mut node = json!({"kind":"element","type":kind,"entityId":null,"properties":{"breditor/block-id":id},"children":[]});
    node["children"] = Value::Array(children);
    node
}
fn prose(id: &str, text: &str) -> Value {
    element("breditor/paragraph", id, vec![json!({"kind":"text","text":text,"formats":[]})])
}
fn structural() -> Vec<Value> {
    let mut code = element(
        "breditor/code-block",
        "code",
        vec![json!({"kind":"text","text":"a🙂\t\n\rb","formats":[]})],
    );
    code["properties"]["breditor/language"] = json!("rust");
    let mut task = element(
        "breditor/task-item",
        "task",
        vec![
            prose("task-head", "Do it"),
            element("breditor/blockquote", "task-quote", vec![prose("quote-head", "Details")]),
        ],
    );
    task["properties"]["breditor/checked"] = json!(false);
    vec![
        code,
        element("breditor/task-list", "tasks", vec![task]),
        element("breditor/horizontal-rule", "rule", vec![]),
    ]
}
fn input(profile: &SharedRichProfile, structural_content: bool) -> Result<String> {
    let mut root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    if structural_content {
        root["children"].as_array_mut().ok_or("children")?.extend(structural());
    }
    let schema = profile.schema();
    Ok(json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),"root":root}).to_string())
}
fn insert(block: &str, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: text.into() })
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> Result {
    let x = a.update_frame()?;
    let y = b.update_frame()?;
    a.receive_frame(&y).map_err(|e| {
        format!("sync first: {e}; checkpoint={}", a.checkpoint().unwrap_or_else(|e| e.to_string()))
    })?;
    b.receive_frame(&x).map_err(|e| {
        format!("sync second: {e}; checkpoint={}", b.checkpoint().unwrap_or_else(|e| e.to_string()))
    })?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}

#[test]
fn factories_select_closed_protocols_without_widening_original_entrypoints() -> Result {
    let profile = profile()?;
    let descriptor: Value = serde_json::from_str(&profile.descriptor_json())?;
    assert_eq!(descriptor["modelVersion"], 12);
    assert_eq!(descriptor["journalVersion"], 13);
    assert_eq!(descriptor["richLanguageVersion"], 2);
    assert!(SharedRichProfile::from_configuration_json(&configuration(2).to_string()).is_err());
    assert!(SharedRichProfile::from_configuration_json_v2(&configuration(1).to_string()).is_err());
    assert!(
        SharedRichProfile::from_schema(profile.schema().clone(), profile.limits().clone()).is_err()
    );
    let codec = DocumentJsonCodecV2::new(profile.schema().clone());
    assert!(matches!(
        RichReplica::new(codec.clone(), "not JSON", "1".into()),
        Err(Error::Contract("shared model 11 requires rich-language V1"))
    ));
    assert!(matches!(
        RichReplica::join_frame(codec.clone(), "room".into(), "1".into(), "not JSON"),
        Err(Error::Contract("shared model 11 requires rich-language V1"))
    ));
    assert!(matches!(
        RichReplica::restore(codec, "room", "not JSON"),
        Err(Error::Contract("shared model 11 requires rich-language V1"))
    ));
    let old = SharedRichProfile::from_configuration_json(&configuration(1).to_string())?;
    let descriptor: Value = serde_json::from_str(&old.descriptor_json())?;
    assert_eq!(descriptor["modelVersion"], 11);
    assert_eq!(descriptor["journalVersion"], 12);
    assert!(descriptor.get("richLanguageVersion").is_none());
    assert!(SharedRichProfile::from_schema_v2(old.schema().clone(), old.limits().clone()).is_err());
    Ok(())
}

#[test]
fn seed_join_and_restart_project_exact_mixed_structural_ast() -> Result {
    let profile = profile()?;
    let source = input(&profile, true)?;
    let codec = DocumentJsonCodecV2::new(profile.schema().clone());
    codec.decode(&source)?;
    let a = profile.create(&source, "101".into())?;
    assert_eq!(a.document_json(), codec.encode(&codec.decode(&source)?)?);
    assert_eq!((a.model_version(), a.journal_version(), a.undo_count()), (12, 13, 0));
    assert_eq!(serde_json::from_str::<Value>(&a.descriptor_json())?["richLanguageVersion"], 2);
    let b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    assert_eq!(a.checkpoint()?, profile.restore("room", &a.checkpoint()?)?.checkpoint()?);
    assert_eq!(b.checkpoint()?, profile.restore("room", &b.checkpoint()?)?.checkpoint()?);
    Ok(())
}

#[test]
fn offline_code_and_task_typing_keep_causal_selection_and_selective_history() -> Result {
    let profile = profile()?;
    let mut a = profile.create(&input(&profile, true)?, "101".into())?;
    let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
    let point = TextPoint { block: "code".into(), offset: 1, affinity: Affinity::After };
    b.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    let presence = b.presence_frame_guarded(&b.observe()?)?;
    a.apply(vec![insert("code", "Local\n")])?;
    b.apply(vec![insert("task-head", "Remote ")])?;
    sync(&mut a, &mut b)?;
    let point = TextPoint { block: "code".into(), offset: 7, affinity: Affinity::After };
    assert_eq!(
        a.resolve_presence_frame(&presence)?,
        PresenceResolution::Resolved {
            writer: "102".into(),
            selection: Some(Selection::TextRange { anchor: point.clone(), focus: point })
        }
    );
    let mut restored = profile.restore("room", &a.checkpoint()?)?;
    for redo in [false, true, false, true] {
        assert_eq!(
            if redo { a.redo()? } else { a.undo()? },
            if redo { restored.redo()? } else { restored.undo()? }
        );
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        assert!(a.document_json().contains("Remote Do it"));
        b.receive_frame(&a.update_frame()?)?;
        assert_eq!(a.document_json(), b.document_json());
    }
    let before = a.checkpoint()?;
    assert!(
        a.apply(vec![Command::SetFormat(SetFormat {
            block: "code".into(),
            offset: 0,
            length: 1,
            format: json!({"type":"breditor/strong","properties":{}}),
            enabled: true
        })])
        .is_err()
    );
    assert_eq!(a.checkpoint()?, before);
    Ok(())
}

#[test]
fn insert_and_delete_structural_flow_replays_without_replacing_other_writers() -> Result {
    let profile = profile()?;
    let mut a = profile.create(&input(&profile, false)?, "101".into())?;
    let initial = a.document_json().to_owned();
    a.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent: None,
        before: None,
        nodes: structural(),
    })])?;
    let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
    b.apply(vec![insert("code", "Remote ")])?;
    a.receive_frame(&b.update_frame()?)?;
    a.undo()?;
    assert_eq!(a.document_json(), initial);
    a.redo()?;
    assert!(a.document_json().contains("Remote a🙂"));
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "task-head".into() })])?;
    assert!(!a.document_json().contains("Do it"));
    // Required task prose head is normalized without copying or dropping its rich tail.
    assert!(a.document_json().contains("Details"));
    let mut restored = profile.restore("room", &a.checkpoint()?)?;
    a.undo()?;
    restored.undo()?;
    assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    assert!(a.document_json().contains("Do it"));
    Ok(())
}

#[test]
fn crossed_versions_reject_before_opaque_engine_import_without_publication() -> Result {
    let profile = profile()?;
    let mut owner = profile.create(&input(&profile, true)?, "101".into())?;
    let before = owner.checkpoint()?;
    let mut frame: Value = serde_json::from_str(&owner.update_frame()?)?;
    frame["modelVersion"] = json!(11);
    frame["bytes"] = json!([255]);
    assert!(matches!(
        owner.receive_frame(&frame.to_string()),
        Err(Error::Contract("rich update protocol binding"))
    ));
    assert!(matches!(
        profile.join_frame("room".into(), "102".into(), &frame.to_string()),
        Err(Error::Contract("rich update protocol binding"))
    ));
    let mut journal: Value = serde_json::from_str(&before)?;
    journal["version"] = json!(12);
    assert!(matches!(
        profile.restore("room", &journal.to_string()),
        Err(Error::Contract("rich replica journal version"))
    ));
    let mut presence: Value =
        serde_json::from_str(&owner.presence_frame_guarded(&owner.observe()?)?)?;
    presence["modelVersion"] = json!(11);
    assert!(matches!(
        owner.resolve_presence_frame(&presence.to_string()),
        Err(Error::Contract("shared presence binding"))
    ));
    let peer = profile.join_frame("room".into(), "102".into(), &owner.update_frame()?)?;
    let groups: Value =
        serde_json::from_str(&owner.writer_groups_guarded(&owner.observe()?, "0")?)?;
    let first = groups["groups"][0].as_str().ok_or("genesis group")?;
    let mut group: Value = serde_json::from_str(first)?;
    assert_eq!(group["modelVersion"], 12);
    group["modelVersion"] = json!(11);
    group["bytes"] = json!([255]);
    assert!(matches!(
        peer.prepare_writer_group("101", &group.to_string()),
        Err(Error::Contract("shared writer group protocol binding"))
    ));
    assert_eq!(owner.checkpoint()?, before);
    Ok(())
}

#[test]
fn bound_model_marker_cannot_be_removed_or_relabelled_by_remote_updates() -> Result {
    let profile = profile()?;
    let mut owner = profile.create(&input(&profile, true)?, "101".into())?;
    let original = owner.updates()?;
    let before = owner.checkpoint()?;
    for marker in [None, Some("11"), Some("13")] {
        let doc = LoroDoc::new();
        doc.import(&original)?;
        doc.set_peer_id(103)?;
        if let Some(marker) = marker {
            doc.get_map("binding").insert("model-version", marker)?;
        } else {
            doc.get_map("binding").delete("model-version")?;
        }
        doc.commit();
        assert!(owner.receive(doc.export(loro::ExportMode::all_updates())?).is_err());
        assert_eq!(owner.checkpoint()?, before);
    }
    Ok(())
}

#[test]
fn native_writer_groups_accept_v2_and_keep_exact_restart_receipts() -> Result {
    let profile = profile()?;
    let mut server = profile.create(&input(&profile, true)?, "101".into())?;
    let mut client = profile.join_frame("room".into(), "102".into(), &server.update_frame()?)?;
    client.apply(vec![insert("code", "Client ")])?;
    let groups: Value =
        serde_json::from_str(&client.writer_groups_guarded(&client.observe()?, "0")?)?;
    for group in groups["groups"].as_array().ok_or("groups")? {
        let WriterGroupPreparation::Prepared(prepared) =
            server.prepare_writer_group("102", group.as_str().ok_or("group")?)?
        else {
            return Err("expected prepared group".into());
        };
        let expected = prepared.checkpoint()?;
        server.commit_writer_group(*prepared)?;
        assert_eq!(server.checkpoint()?, expected);
    }
    assert_eq!(server.document_json(), client.document_json());
    assert_eq!(server.checkpoint()?, profile.restore("room", &server.checkpoint()?)?.checkpoint()?);
    Ok(())
}

fn value(owner: &RichReplica) -> Result<Value> {
    Ok(serde_json::from_str(owner.document_json())?)
}
fn find<'a>(node: &'a Value, block: &str) -> Option<&'a Value> {
    if node.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(block) {
        return Some(node);
    }
    node.get("children")?.as_array()?.iter().find_map(|child| find(child, block))
}
fn code(block: &str, policy: CodeFormatPolicy, language: Option<&str>) -> Command {
    Command::SetCodeBlock(SetCodeBlock {
        block: block.into(),
        language: language.map(str::to_owned),
        format_policy: policy,
    })
}
fn heading(block: &str, level: Option<u8>) -> Command {
    Command::SetHeading(SetHeading { block: block.into(), level })
}
fn language(block: &str, language: Option<&str>) -> Command {
    Command::SetCodeLanguage(SetCodeLanguage {
        block: block.into(),
        language: language.map(str::to_owned),
    })
}
fn checked(value: bool) -> Command {
    Command::SetTaskChecked(SetTaskChecked { block: "task".into(), checked: value })
}
fn plain(owner: &RichReplica, block: &str) -> Result {
    assert!(
        find(&value(owner)?["root"], block).ok_or("block")?["children"]
            .as_array()
            .ok_or("runs")?
            .iter()
            .all(|run| run["formats"] == json!([]))
    );
    Ok(())
}
fn traced_history(owner: &mut RichReplica, redo: bool, label: &str) -> Result<bool> {
    let checkpoint = owner.checkpoint()?;
    (if redo { owner.redo() } else { owner.undo() })
        .map_err(|error| format!("{label}: {error}; checkpoint={checkpoint}").into())
}
fn exact_future(profile: &SharedRichProfile, owner: &mut RichReplica) -> Result {
    let checkpoint = owner.checkpoint()?;
    let mut restored = profile
        .restore("room", &checkpoint)
        .map_err(|error| format!("future initial restore: {error}; checkpoint={checkpoint}"))?;
    for redo in [false, false, false, true, true, true] {
        assert_eq!(
            traced_history(owner, redo, "future live")?,
            traced_history(&mut restored, redo, "future restored")?
        );
        assert_eq!(owner.checkpoint()?, restored.checkpoint()?);
    }
    Ok(())
}

#[test]
fn code_conversion_rejects_implicit_loss_and_owns_observed_format_removal() -> Result {
    let profile = profile()?;
    let mut a = profile.create(&input(&profile, true)?, "101".into())?;
    // A formatted table-cell paragraph may become code, but never a required task head/caption.
    let original = a.document_json().to_owned();
    let before = a.checkpoint()?;
    assert!(a.apply(vec![code("p", CodeFormatPolicy::RejectFormatted, None)]).is_err());
    assert_eq!(a.checkpoint()?, before);
    assert!(a.apply(vec![code("task-head", CodeFormatPolicy::RemoveFormats, None)]).is_err());
    assert!(a.apply(vec![code("caption", CodeFormatPolicy::RemoveFormats, None)]).is_err());
    assert!(a.apply(vec![language("p", Some("rust"))]).is_err());
    assert!(a.apply(vec![language("code", Some("not a token"))]).is_err());
    assert_eq!(a.checkpoint()?, before);
    a.apply(vec![code("p", CodeFormatPolicy::RemoveFormats, Some("rust"))])?;
    plain(&a, "p")?;
    assert_eq!(find(&value(&a)?["root"], "p").ok_or("p")?["type"], "breditor/code-block");
    a.undo()?;
    assert_eq!(a.document_json(), original);
    a.redo()?;
    a.apply(vec![heading("p", Some(3))])?;
    plain(&a, "p")?;
    let projected = value(&a)?;
    let p = find(&projected["root"], "p").ok_or("p")?;
    assert_eq!(p["properties"]["breditor/level"], 3);
    assert!(p["properties"].get("breditor/language").is_none());
    exact_future(&profile, &mut a)
}

#[test]
fn code_kind_language_and_remote_typing_keep_independent_selective_undo() -> Result {
    let profile = profile()?;
    let mut a = profile.create(&input(&profile, true)?, "101".into())?;
    let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
    a.apply(vec![heading("code", None)])?;
    b.apply(vec![language("code", Some("typescript")), insert("code", "Remote ")])?;
    sync(&mut a, &mut b)?;
    assert_eq!(find(&value(&a)?["root"], "code").ok_or("code")?["type"], "breditor/paragraph");
    a.undo()?;
    let projected = value(&a)?;
    let c = find(&projected["root"], "code").ok_or("code")?;
    assert_eq!(c["type"], "breditor/code-block");
    assert_eq!(c["properties"]["breditor/language"], "typescript");
    assert!(a.document_json().contains("Remote a🙂"));
    a.apply(vec![language("code", None)])?;
    assert!(
        find(&value(&a)?["root"], "code").ok_or("code")?["properties"]
            .get("breditor/language")
            .is_none()
    );
    a.undo()?;
    assert_eq!(
        find(&value(&a)?["root"], "code").ok_or("code")?["properties"]["breditor/language"],
        "typescript"
    );
    exact_future(&profile, &mut a)
}

#[test]
fn unseen_remote_styles_are_masked_in_code_but_restored_by_selective_undo() -> Result {
    for reverse in [false, true] {
        let profile = profile()?;
        let mut a = profile.create(&input(&profile, true)?, "101".into())?;
        let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
        a.apply(vec![code("p", CodeFormatPolicy::RemoveFormats, None)])?;
        b.apply(vec![Command::SetFormat(SetFormat {
            block: "p".into(),
            offset: 1,
            length: 2,
            format: json!({"type":"breditor-inline/italic","properties":{}}),
            enabled: true,
        })])?;
        if reverse {
            sync(&mut b, &mut a)?;
        } else {
            sync(&mut a, &mut b)?;
        }
        plain(&a, "p")?;
        traced_history(&mut a, false, &format!("unseen style initial undo reverse={reverse}"))?;
        let projected = value(&a)?;
        let runs =
            find(&projected["root"], "p").ok_or("p")?["children"].as_array().ok_or("runs")?;
        assert!(runs.iter().any(|run| {
            run["formats"]
                .as_array()
                .is_some_and(|f| f.iter().any(|f| f["type"] == "breditor-inline/italic"))
        }));
        traced_history(&mut a, true, &format!("unseen style initial redo reverse={reverse}"))?;
        // Explicit prose conversion preserves the visible plain code semantics,
        // authoring disables rather than deleting the retained remote annotation.
        a.apply(vec![heading("p", None)]).map_err(|e| {
            format!(
                "unseen style prose conversion reverse={reverse}: {e}; checkpoint={}",
                a.checkpoint().unwrap_or_else(|e| e.to_string())
            )
        })?;
        plain(&a, "p")?;
        exact_future(&profile, &mut a)?;
    }
    Ok(())
}

#[test]
fn task_completion_conflicts_converge_without_overwriting_body_or_remote_value() -> Result {
    let profile = profile()?;
    let mut a = profile.create(&input(&profile, true)?, "101".into())?;
    let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
    let before = a.checkpoint()?;
    assert!(!a.apply(vec![checked(false)])?);
    assert_eq!(a.checkpoint()?, before);
    a.apply(vec![checked(true)])?;
    b.apply(vec![checked(true), insert("task-head", "Remote ")])?;
    sync(&mut a, &mut b)?;
    a.undo()?;
    assert_eq!(
        find(&value(&a)?["root"], "task").ok_or("task")?["properties"]["breditor/checked"],
        true
    );
    assert!(a.document_json().contains("Remote Do it"));
    a.redo()?;
    a.apply(vec![checked(false)])?;
    assert_eq!(
        find(&value(&a)?["root"], "task").ok_or("task")?["properties"]["breditor/checked"],
        false
    );
    exact_future(&profile, &mut a)
}

#[test]
fn code_plain_typing_never_accepts_pending_styles_or_changes_source_line_endings() -> Result {
    let profile = profile()?;
    let mut a = profile.create(&input(&profile, true)?, "101".into())?;
    let p = TextPoint { block: "code".into(), offset: 1, affinity: Affinity::After };
    a.set_selection(Some(&Selection::TextRange { anchor: p.clone(), focus: p }))?;
    let before = a.checkpoint()?;
    assert!(a.set_pending_formats_json(r#"[{"type":"breditor/strong","properties":{}}]"#).is_err());
    assert_eq!(a.checkpoint()?, before);
    assert_eq!(a.caret_formats_json_guarded(&a.observe()?)?, "[]");
    a.insert_plain_text("\r\n\t🙂")?;
    plain(&a, "code")?;
    assert!(a.document_json().contains("a\\r\\n\\t🙂🙂\\t\\n\\rb"));
    exact_future(&profile, &mut a)
}

#[test]
fn sequential_conversion_language_and_prose_batches_are_one_exact_atomic_group() -> Result {
    let profile = profile()?;
    let mut a = profile.create(&input(&profile, true)?, "101".into())?;
    let original = a.document_json().to_owned();
    assert!(a.apply(vec![
        code("p", CodeFormatPolicy::RemoveFormats, None),
        language("p", Some("rust"))
    ])?);
    assert_eq!(a.undo_count(), 1);
    assert_eq!(
        find(&value(&a)?["root"], "p").ok_or("p")?["properties"]["breditor/language"],
        "rust"
    );
    a.undo()?;
    assert_eq!(a.document_json(), original);
    a.redo()?;
    let before = a.checkpoint()?;
    // An invalid later format cannot leave an earlier code-language edit behind.
    assert!(
        a.apply(vec![
            language("p", Some("typescript")),
            Command::SetFormat(SetFormat {
                block: "p".into(),
                offset: 0,
                length: 1,
                format: json!({"type":"breditor/strong","properties":{}}),
                enabled: true
            })
        ])
        .is_err()
    );
    assert_eq!(a.checkpoint()?, before);
    a.apply(vec![
        heading("p", Some(2)),
        code("p", CodeFormatPolicy::RejectFormatted, Some("text")),
        language("p", None),
    ])?;
    assert!(
        find(&value(&a)?["root"], "p").ok_or("p")?["properties"].get("breditor/language").is_none()
    );
    plain(&a, "p")?;
    exact_future(&profile, &mut a)
}

#[test]
fn original_model_never_adopts_the_structural_causal_marker() -> Result {
    let profile = SharedRichProfile::from_configuration_json(&configuration(1).to_string())?;
    let mut owner = profile.create(&input(&profile, false)?, "101".into())?;
    let before = owner.checkpoint()?;
    let doc = LoroDoc::new();
    doc.import(&owner.updates()?)?;
    doc.set_peer_id(102)?;
    doc.get_map("binding").insert("model-version", "12")?;
    doc.commit();
    assert!(matches!(
        owner.receive(doc.export(loro::ExportMode::all_updates())?),
        Err(Error::Contract("immutable shared causal model binding"))
    ));
    assert_eq!(owner.checkpoint()?, before);
    assert!(matches!(
        owner.apply(vec![code("p", CodeFormatPolicy::RemoveFormats, None)]),
        Err(Error::Contract(_))
    ));
    assert_eq!(owner.checkpoint()?, before);
    Ok(())
}

#[test]
fn multiple_observed_style_runs_are_removed_in_one_reversible_conversion() -> Result {
    let profile = profile()?;
    let mut a = profile.create(&input(&profile, true)?, "101".into())?;
    a.apply(vec![
        Command::SetFormat(SetFormat {
            block: "p".into(),
            offset: 1,
            length: 2,
            format: json!({"type":"breditor-inline/italic","properties":{}}),
            enabled: true,
        }),
        Command::SetFormat(SetFormat {
            block: "p".into(),
            offset: 0,
            length: 4,
            format: json!({"type":"breditor-inline/underline","properties":{}}),
            enabled: true,
        }),
    ])?;
    let styled = a.document_json().to_owned();
    a.apply(vec![code("p", CodeFormatPolicy::RemoveFormats, None)])?;
    plain(&a, "p")?;
    a.undo()?;
    assert_eq!(a.document_json(), styled);
    a.redo()?;
    a.apply(vec![heading("p", None)])?;
    plain(&a, "p")?;
    exact_future(&profile, &mut a)
}

#[test]
fn selected_code_replacement_is_plain_scalar_aligned_and_keeps_offline_suffix() -> Result {
    for reverse in [false, true] {
        let profile = profile()?;
        let mut a = profile.create(&input(&profile, true)?, "101".into())?;
        let mut b = profile.join_frame("room".into(), "102".into(), &a.update_frame()?)?;
        let point = |offset| TextPoint { block: "code".into(), offset, affinity: Affinity::After };
        let (anchor, focus) = if reverse { (point(3), point(1)) } else { (point(1), point(3)) };
        a.set_selection(Some(&Selection::TextRange { anchor, focus }))?;
        let before = a.checkpoint()?;
        let bad = serde_json::from_value(
            json!({"kind":"replace_text_range","data":{"anchor":{"block":"code","offset":"1","affinity":"after"},"focus":{"block":"code","offset":"3","affinity":"after"},"runs":[{"text":"styled","formats":[{"type":"breditor/strong","properties":{}}]}]}}),
        )?;
        assert!(a.apply(vec![bad]).is_err());
        assert_eq!(a.checkpoint()?, before);
        assert!(a.insert_plain_text("X\r\n")?);
        b.apply(vec![Command::InsertText(InsertText {
            block: "code".into(),
            offset: 7,
            text: "Remote".into(),
        })])?;
        sync(&mut a, &mut b)?;
        let text = |owner: &RichReplica| -> Result<String> {
            Ok(find(&value(owner)?["root"], "code").ok_or("code")?["children"]
                .as_array()
                .ok_or("runs")?
                .iter()
                .filter_map(|run| run["text"].as_str())
                .collect())
        };
        assert_eq!(text(&a)?, "aX\r\n\t\n\rbRemote");
        plain(&a, "code")?;
        a.undo()?;
        assert_eq!(text(&a)?, "a🙂\t\n\rbRemote");
        a.redo()?;
        exact_future(&profile, &mut a)?;
    }
    Ok(())
}
