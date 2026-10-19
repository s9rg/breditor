//! Prompt reads retain exact shared observations, read-only policy and future history.
use breditor_collaboration::rich_replica::{
    Command, RichReplica, SharedObservation, SharedRichProfile, actions::InsertText,
};
use serde_json::json;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup(version: u8) -> Result<(SharedRichProfile, RichReplica)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/placeholder","version":1},"extensions":[]}).to_string();
    let p = match version {
        1 => SharedRichProfile::from_standard_configuration_json_v1(&configuration)?,
        2 => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        _ => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
    };
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/placeholder","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"body"},"children":[]}]}}).to_string();
    let owner = p.create(&document, "101".into())?;
    Ok((p, owner))
}
fn observed(o: &RichReplica) -> Result<SharedObservation> {
    Ok(if o.document_selection_enabled() { o.observe_document()? } else { o.observe()? })
}
fn saved(o: &RichReplica) -> Result<String> {
    Ok(if o.document_selection_enabled() {
        if o.typing_history_enabled() {
            o.document_typing_checkpoint()?
        } else {
            o.document_checkpoint()?
        }
    } else if o.general_ranges_enabled() {
        if o.typing_history_enabled() {
            o.general_typing_checkpoint()?
        } else {
            o.general_checkpoint()?
        }
    } else if o.typing_history_enabled() {
        o.typing_checkpoint()?
    } else {
        o.checkpoint()?
    })
}
fn insert(o: &mut RichReplica) -> Result {
    o.apply(vec![Command::InsertText(InsertText {
        block: "body".into(),
        offset: 0,
        text: "X".into(),
    })])?;
    Ok(())
}

#[test]
fn prompt_reads_preserve_all_grammar_scope_history_configurations_and_readonly_redo() -> Result {
    for version in 1..=3 {
        for scope in 0..3 {
            for natural in [false, true] {
                let (p, mut o) = setup(version)?;
                if scope == 1 {
                    o.enable_general_ranges_guarded(&observed(&o)?)?;
                }
                if scope == 2 {
                    o.enable_document_selection_guarded(&observed(&o)?)?;
                }
                if natural {
                    o.enable_typing_history_guarded(&observed(&o)?)?;
                }
                insert(&mut o)?;
                assert!(!o.placeholder_empty_guarded(&observed(&o)?)?);
                o.undo()?;
                o.set_read_only_guarded(&observed(&o)?, true)?;
                let source = observed(&o)?;
                let before = (saved(&o)?, o.causal_version(), source.view_json().to_owned());
                for _ in 0..3 {
                    assert!(o.placeholder_empty_guarded(&source)?);
                }
                assert_eq!(
                    (saved(&o)?, o.causal_version(), observed(&o)?.view_json().to_owned()),
                    before
                );
                o.set_read_only_guarded(&source, false)?;
                let bytes = saved(&o)?;
                let mut twin = if scope == 2 {
                    if natural {
                        p.restore_document_typing("room", &bytes)?
                    } else {
                        p.restore_document("room", &bytes)?
                    }
                } else if scope == 1 {
                    if natural {
                        p.restore_general_typing("room", &bytes)?
                    } else {
                        p.restore_general("room", &bytes)?
                    }
                } else if natural {
                    p.restore_typing("room", &bytes)?
                } else {
                    p.restore("room", &bytes)?
                };
                for undo in [false, true, false, true] {
                    if undo {
                        o.undo()?;
                        twin.undo()?;
                    } else {
                        o.redo()?;
                        twin.redo()?;
                    }
                    assert_eq!(saved(&o)?, saved(&twin)?);
                    assert_eq!(o.placeholder_empty_guarded(&observed(&o)?)?, undo);
                }
            }
        }
    }
    Ok(())
}

#[test]
fn foreign_and_stale_prompt_reads_fail_before_inspection_without_publication() -> Result {
    let (_, mut o) = setup(3)?;
    let (_, other) = setup(3)?;
    let source = observed(&o)?;
    let before = saved(&o)?;
    assert!(o.placeholder_empty_guarded(&observed(&other)?).is_err());
    assert_eq!(saved(&o)?, before);
    insert(&mut o)?;
    let after = saved(&o)?;
    assert!(o.placeholder_empty_guarded(&source).is_err());
    assert_eq!(saved(&o)?, after);
    Ok(())
}
