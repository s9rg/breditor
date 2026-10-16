//! Explicit document-tool proofs and single semantic groups preserve old getters and exact recovery.
use breditor_collaboration::rich_replica::{
    Command, RichReplica, SharedRichProfile,
    actions::{
        ChangeDocumentFormatsV1, ChangeDocumentLayoutV1, InsertText, SetBlockLayout, SetFormat,
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup(count: usize, code: bool) -> Result<(SharedRichProfile, RichReplica)> {
    let p=SharedRichProfile::from_standard_configuration_json_v3(&json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/document-tools","version":1},"extensions":[]}).to_string())?;
    let children=(0..count).map(|i|json!({"kind":"element","type":if code&&i==0{"breditor/code-block"}else{"breditor/paragraph"},"entityId":null,"properties":{"breditor/block-id":format!("p{i}")},"children":[{"kind":"text","text":"x","formats":[]}]})).collect::<Vec<_>>();
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/document-tools","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":children}}).to_string();
    let a = p.create(&input, "101".into())?;
    Ok((p, a))
}
fn enable(a: &mut RichReplica, natural: bool) -> Result {
    a.enable_document_selection_guarded(&a.observe()?)?;
    if natural {
        a.enable_typing_history_guarded(&a.observe_document()?)?;
    }
    a.select_document_guarded(&a.observe_document()?)?;
    Ok(())
}
fn save(a: &RichReplica) -> Result<String> {
    Ok(if a.typing_history_enabled() {
        a.document_typing_checkpoint()?
    } else {
        a.document_checkpoint()?
    })
}
fn restore(p: &SharedRichProfile, a: &RichReplica, s: &str) -> Result<RichReplica> {
    Ok(if a.typing_history_enabled() {
        p.restore_document_typing("room", s)?
    } else {
        p.restore_document("room", s)?
    })
}
fn bold() -> String {
    json!({"changes":[{"kind":"set","formatsJson":"[{\"type\":\"breditor/strong\",\"properties\":{}}]"}]}).to_string()
}
#[test]
fn document_reads_are_explicit_pure_guarded_and_old_getters_stay_closed() -> Result {
    let (_, mut a) = setup(2, true)?;
    let (_, foreign) = setup(2, false)?;
    assert!(a.document_selection_coverage_json_guarded(&a.observe()?, "document").is_err());
    enable(&mut a, false)?;
    a.set_read_only_guarded(&a.observe_document()?, true)?;
    let exact = save(&a)?;
    let o = a.observe_document()?;
    assert!(a.selection_coverage_json_guarded(&o, "selection").is_err());
    assert!(a.selection_format_state_json_guarded(&o, "breditor/strong").is_err());
    assert!(a.block_layout_state_json_guarded(&o).is_err());
    assert!(a.document_selection_coverage_json_guarded(&foreign.observe()?, "selection").is_err());
    assert!(a.document_selection_coverage_json_guarded(&o, "auto").is_err());
    let state: Value = serde_json::from_str(
        &a.document_selection_format_state_json_guarded(&o, "breditor/strong")?,
    )?;
    assert_eq!(state["state"]["kind"], "unavailable");
    let layout: Value = serde_json::from_str(&a.document_block_layout_state_json_guarded(&o)?)?;
    assert_eq!(layout["blocks"], "2");
    a.document_selection_coverage_json_guarded(&o, "selection")?;
    assert_eq!(save(&a)?, exact);
    assert!(a.change_document_selection_formats_json_guarded(&o, "bad").is_err());
    assert!(a.change_document_selection_layout_json_guarded(&o, "bad").is_err());
    assert_eq!(save(&a)?, exact);
    a.set_read_only_guarded(&a.observe_document()?, false)?;
    let exact = save(&a)?;
    assert!(
        a.change_document_selection_formats_json_guarded(&a.observe_document()?, &bold()).is_err()
    );
    assert_eq!(save(&a)?, exact);
    Ok(())
}
#[test]
fn seventy_blocks_format_and_layout_are_single_exact_document_actions() -> Result {
    for natural in [false, true] {
        let (p, mut a) = setup(70, false)?;
        enable(&mut a, natural)?;
        let source = a.document_json().to_owned();
        let old = a.observe_document()?;
        assert!(a.change_document_selection_formats_json_guarded(&old, &bold())?);
        assert_eq!((a.undo_count(), a.history_step_count()), (1, 1));
        assert!(a.document_selected());
        assert!(a.change_document_selection_formats_json_guarded(&old, &bold()).is_err());
        let mut bytes = save(&a)?;
        assert!(bytes.contains("change_document_formats_v1"));
        let mut b = restore(&p, &a, &bytes)?;
        assert_eq!(save(&b)?, bytes);
        for undo in [true, false, true, false] {
            if undo {
                a.undo()?;
                b.undo()?;
                assert_eq!(a.document_json(), source);
            } else {
                a.redo()?;
                b.redo()?;
            }
            assert_eq!(save(&a)?, save(&b)?);
        }
        let before = a.document_json().to_owned();
        assert!(a.change_document_selection_layout_json_guarded(
            &a.observe_document()?,
            "{\"alignment\":\"center\",\"direction\":\"rtl\"}"
        )?);
        assert_eq!((a.undo_count(), a.history_step_count()), (2, 2));
        bytes = save(&a)?;
        assert!(bytes.contains("change_document_layout_v1"));
        let mut b = restore(&p, &a, &bytes)?;
        assert_eq!(save(&b)?, bytes);
        for undo in [true, false, true, false] {
            if undo {
                a.undo()?;
                b.undo()?;
                assert_eq!(a.document_json(), before);
            } else {
                a.redo()?;
                b.redo()?;
            }
            assert_eq!(save(&a)?, save(&b)?);
        }
        let exact = save(&a)?;
        for bad in [
            "bad",
            "{\"alignment\":\"center\",\"alignment\":\"end\"}",
            "{\"alignment\":\"center\",\"extra\":true}",
        ] {
            assert!(
                a.change_document_selection_layout_json_guarded(&a.observe_document()?, bad)
                    .is_err()
            );
            assert_eq!(save(&a)?, exact);
        }
        assert!(
            a.change_selection_layout_json_guarded(
                &a.observe_document()?,
                "{\"alignment\":\"end\"}"
            )
            .is_err()
        );
        assert!(a.change_selection_formats_json_guarded(&a.observe_document()?, &bold()).is_err());
        assert_eq!(save(&a)?, exact);
    }
    Ok(())
}
#[test]
fn peer_text_and_independent_fields_survive_document_tools_undo_and_replay() -> Result {
    for natural in [false, true] {
        let (p, mut a) = setup(2, false)?;
        let mut peer = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
        enable(&mut a, natural)?;
        peer.apply(vec![
            Command::InsertText(InsertText { block: "p0".into(), offset: 1, text: "PEER".into() }),
            Command::SetBlockLayout(SetBlockLayout {
                block: "p0".into(),
                patch_json: "{\"direction\":\"rtl\"}".into(),
            }),
            Command::SetFormat(SetFormat {
                block: "p0".into(),
                offset: 0,
                length: 5,
                format: json!({"type":"breditor-inline/italic","properties":{}}),
                enabled: true,
            }),
        ])?;
        a.change_document_selection_layout_json_guarded(
            &a.observe_document()?,
            "{\"alignment\":\"center\"}",
        )?;
        a.change_document_selection_formats_json_guarded(&a.observe_document()?, &bold())?;
        a.receive_frame(&peer.update_frame()?)?;
        peer.receive_frame(&a.update_frame()?)?;
        assert_eq!(a.document_json(), peer.document_json());
        let bytes = save(&a)?;
        let mut recovered = restore(&p, &a, &bytes)?;
        assert_eq!(save(&recovered)?, bytes);
        for undo in [true, true, false, false] {
            if undo {
                a.undo()?;
                recovered.undo()?;
            } else {
                a.redo()?;
                recovered.redo()?;
            }
            peer.receive_frame(&a.update_frame()?)?;
            assert_eq!(a.document_json(), peer.document_json());
            assert_eq!(save(&a)?, save(&recovered)?);
            assert!(a.document_json().contains("PEER"));
            assert!(a.document_json().contains("breditor-inline/italic"));
            let value: Value = serde_json::from_str(a.document_json())?;
            assert!(
                value["root"]["children"][0]["properties"]
                    .get("breditor/block-direction")
                    .is_some()
            );
        }
    }
    Ok(())
}
#[test]
fn one_document_priority_is_independent_from_seventy_block_traversal() -> Result {
    for layout in [false, true] {
        let (p, mut a) = setup(70, false)?;
        let mut peer = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
        enable(&mut a, false)?;
        if layout {
            peer.apply(vec![Command::SetBlockLayout(SetBlockLayout {
                block: "p69".into(),
                patch_json: "{\"alignment\":\"end\"}".into(),
            })])?;
            a.change_document_selection_layout_json_guarded(
                &a.observe_document()?,
                "{\"alignment\":\"center\"}",
            )?;
        } else {
            peer.apply(vec![Command::SetFormat(SetFormat {
                block: "p69".into(),
                offset: 0,
                length: 1,
                format: json!({"type":"breditor/strong","properties":{}}),
                enabled: false,
            })])?;
            a.change_document_selection_formats_json_guarded(&a.observe_document()?, &bold())?;
        }
        let expected: Value = serde_json::from_str(peer.document_json())?;
        a.receive_frame(&peer.update_frame()?)?;
        peer.receive_frame(&a.update_frame()?)?;
        assert_eq!(a.document_json(), peer.document_json());
        for undo in [false, true, false] {
            if undo {
                a.undo()?;
            } else if a.redo_count() > 0 {
                a.redo()?;
            }
            peer.receive_frame(&a.update_frame()?)?;
            assert_eq!(a.document_json(), peer.document_json());
            let actual: Value = serde_json::from_str(a.document_json())?;
            if layout {
                assert_eq!(
                    actual["root"]["children"][69]["properties"],
                    expected["root"]["children"][69]["properties"]
                );
            } else {
                assert_eq!(
                    actual["root"]["children"][69]["children"],
                    expected["root"]["children"][69]["children"]
                );
            }
        }
    }
    Ok(())
}
#[test]
fn document_commands_require_their_family_scope_and_sole_group() -> Result {
    for command in [
        Command::ChangeDocumentFormatsV1(ChangeDocumentFormatsV1 { changes_json: bold() }),
        Command::ChangeDocumentLayoutV1(ChangeDocumentLayoutV1 {
            patch_json: "{\"alignment\":\"center\"}".into(),
        }),
    ] {
        let (_, mut a) = setup(2, false)?;
        let original = a.checkpoint()?;
        assert!(a.apply(vec![command.clone()]).is_err());
        assert_eq!(a.checkpoint()?, original);
        enable(&mut a, false)?;
        a.set_selection_guarded(&a.observe_document()?, None)?;
        let exact = save(&a)?;
        assert!(a.apply(vec![command.clone()]).is_err());
        assert_eq!(save(&a)?, exact);
        a.select_document_guarded(&a.observe_document()?)?;
        let exact = save(&a)?;
        assert!(a.apply(vec![command.clone(), command]).is_err());
        assert_eq!(save(&a)?, exact);
    }
    Ok(())
}
