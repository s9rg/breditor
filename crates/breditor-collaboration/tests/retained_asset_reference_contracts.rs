//! Image dependencies must include losing, undone and deleted causal metadata, not only the AST.
use breditor_collaboration::rich_replica::{
    Command, RichReplica, SharedRichProfile,
    actions::{DeleteBlock, InsertBlocks, InsertText, ReplaceImage},
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

#[test]
fn encoded_retained_history_is_guarded_pure_and_not_a_new_checkpoint_family() -> Result {
    let (_, mut a, b) = peers()?;
    replace(&mut a, "redo-asset", "redo-generation")?;
    a.undo()?;
    a.set_read_only_guarded(&a.observe()?, true)?;
    let observed = a.observe()?;
    let exact = (saved(&a)?, a.update_frame()?);
    let input = a.retained_asset_references_json_guarded(&observed)?;
    let read: Value = serde_json::from_str(&input)?;
    assert_eq!(read["format"], "breditor/rich-retained-asset-references");
    assert_eq!(read["retention"], "shared-causal");
    assert_eq!(read["document"], "room");
    assert_eq!(read["references"].as_array().map(Vec::len), Some(2));
    assert!(
        read["references"]
            .as_array()
            .ok_or("missing references")?
            .contains(&json!({"asset":"redo-asset","generation":"redo-generation"}))
    );
    assert_eq!((saved(&a)?, a.update_frame()?), exact);
    a.check(&observed)?;
    assert!(a.retained_asset_references_json_guarded(&b.observe()?).is_err());
    a.set_read_only_guarded(&a.observe()?, false)?;
    assert!(a.retained_asset_references_json_guarded(&observed).is_err());
    a.redo()?;
    assert!(a.document_json().contains("redo-generation"));
    Ok(())
}
fn peers() -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    peers_for(3)
}
fn peers_for(language: u8) -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":language,"schema":{"name":"example/retained-assets","version":1},"extensions":[]}).to_string();
    let p = match language {
        1 => SharedRichProfile::from_standard_configuration_json_v1(&configuration)?,
        2 => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        _ => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/retained-assets","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = p.create(&input, "202".into())?;
    let b = p.join_frame("room".into(), "101".into(), &a.update_frame()?)?;
    Ok((p, a, b))
}
fn references(a: &RichReplica) -> Result<Vec<(String, String)>> {
    let observed =
        if a.document_selection_enabled() { a.observe_document()? } else { a.observe()? };
    Ok(a.retained_asset_references_guarded(&observed)?
        .iter()
        .map(|r| (r.asset().as_str().into(), r.generation().as_str().into()))
        .collect())
}

#[test]
fn undone_authored_births_keep_their_immutable_definition_assets() -> Result {
    let (_, mut a, _) = peers()?;
    a.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent:None, before:None,
        nodes:vec![json!({"kind":"element","type":"breditor/image","entityId":null,"properties":{"breditor/block-id":"new-image","breditor/image-id":"new-image-id","breditor/asset-id":"born-asset","breditor/asset-generation":"born-generation","breditor/decorative":true,"breditor/alt-text":""},"children":[]})],
    })])?;
    a.undo()?;
    assert!(!a.document_json().contains("born-asset"));
    assert!(references(&a)?.contains(&("born-asset".into(), "born-generation".into())));
    a.redo()?;
    assert!(a.document_json().contains("born-asset"));
    Ok(())
}

fn saved(a: &RichReplica) -> Result<String> {
    Ok(
        match (
            a.document_selection_enabled(),
            a.general_ranges_enabled(),
            a.typing_history_enabled(),
        ) {
            (true, _, true) => a.document_typing_checkpoint()?,
            (true, _, false) => a.document_checkpoint()?,
            (_, true, true) => a.general_typing_checkpoint()?,
            (_, true, false) => a.general_checkpoint()?,
            (_, _, true) => a.typing_checkpoint()?,
            _ => a.checkpoint()?,
        },
    )
}
#[test]
fn all_three_grammars_and_selection_scopes_preserve_both_history_policies() -> Result {
    for language in 1..=3 {
        for scope in 0..3 {
            for natural in [false, true] {
                let (p, mut a, _) = peers_for(language)?;
                if scope == 1 {
                    a.enable_general_ranges_guarded(&a.observe()?)?;
                }
                if scope == 2 {
                    a.enable_document_selection_guarded(&a.observe()?)?;
                }
                if natural {
                    let observed = if scope == 2 { a.observe_document()? } else { a.observe()? };
                    a.enable_typing_history_guarded(&observed)?;
                }
                replace(&mut a, "future-image", "future-generation")?;
                a.undo()?;
                let source = if scope == 2 { a.observe_document()? } else { a.observe()? };
                let exact = saved(&a)?;
                let expected = references(&a)?;
                assert_eq!(expected.len(), 2);
                a.check(&source)?;
                assert_eq!(saved(&a)?, exact);
                let mut twin = match (scope, natural) {
                    (2, true) => p.restore_document_typing("room", &exact)?,
                    (2, false) => p.restore_document("room", &exact)?,
                    (1, true) => p.restore_general_typing("room", &exact)?,
                    (1, false) => p.restore_general("room", &exact)?,
                    (_, true) => p.restore_typing("room", &exact)?,
                    _ => p.restore("room", &exact)?,
                };
                assert_eq!(references(&twin)?, expected);
                for redo in [true, false, true, false] {
                    if redo {
                        a.redo()?;
                        twin.redo()?;
                    } else {
                        a.undo()?;
                        twin.undo()?;
                    }
                    assert_eq!(references(&a)?, expected);
                    assert_eq!(references(&twin)?, expected);
                    assert_eq!(saved(&a)?, saved(&twin)?);
                }
            }
        }
    }
    Ok(())
}
fn replace(a: &mut RichReplica, asset: &str, generation: &str) -> Result {
    a.apply(vec![Command::ReplaceImage(ReplaceImage {
        block: "image-block".into(),
        asset: asset.into(),
        generation: generation.into(),
    })])?;
    Ok(())
}
#[test]
fn invisible_redo_and_deleted_image_bindings_survive_pure_reads_and_exact_recovery() -> Result {
    let (p, mut a, _) = peers()?;
    replace(&mut a, "asset-b", "generation-b")?;
    let expected =
        vec![("asset".into(), "generation".into()), ("asset-b".into(), "generation-b".into())];
    a.undo()?;
    assert!(!a.document_json().contains("asset-b"));
    assert_eq!(references(&a)?, expected);
    let observation = a.observe()?;
    let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
    for _ in 0..3 {
        assert_eq!(references(&a)?, expected);
    }
    a.check(&observation)?;
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    let mut restored = p.restore("room", &a.checkpoint()?)?;
    for redo in [true, false, true] {
        if redo {
            a.redo()?;
            restored.redo()?;
        } else {
            a.undo()?;
            restored.undo()?;
        }
        assert_eq!(references(&a)?, expected);
        assert_eq!(references(&restored)?, expected);
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    }
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "image-block".into() })])?;
    assert!(a.document().image_ids().next().is_none());
    assert_eq!(references(&a)?, expected);
    Ok(())
}
#[test]
fn losing_remote_replacement_is_retained_before_it_can_become_visible_after_undo() -> Result {
    let (_, mut a, mut b) = peers()?;
    replace(&mut a, "winner", "winner-generation")?;
    replace(&mut b, "loser", "loser-generation")?;
    a.receive_frame(&b.update_frame()?)?;
    assert!(a.document_json().contains("winner-generation"));
    assert!(!a.document_json().contains("loser-generation"));
    let references_before = references(&a)?;
    assert_eq!(
        references_before,
        vec![
            ("asset".into(), "generation".into()),
            ("loser".into(), "loser-generation".into()),
            ("winner".into(), "winner-generation".into())
        ]
    );
    a.undo()?;
    assert!(a.document_json().contains("loser-generation"));
    assert_eq!(references(&a)?, references_before);
    Ok(())
}
#[test]
fn causal_chunks_do_not_scan_text_literals_as_bindings_and_retain_exact_generations() -> Result {
    let (_, mut a, _) = peers()?;
    a.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: format!(
            "{}{}",
            "🙂".repeat(2100),
            r#"{"breditor/asset-id":"not-an-asset","breditor/asset-generation":"not-a-generation"}"#
        ),
    })])?;
    replace(&mut a, "asset", "another-generation")?;
    assert_eq!(
        references(&a)?,
        vec![("asset".into(), "another-generation".into()), ("asset".into(), "generation".into())]
    );
    Ok(())
}
#[test]
fn stale_foreign_and_read_only_observations_do_not_publish_or_erase_redo() -> Result {
    let (_, mut a, b) = peers()?;
    let stale = a.observe()?;
    replace(&mut a, "replacement", "new-generation")?;
    a.undo()?;
    a.set_read_only_guarded(&a.observe()?, true)?;
    let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
    assert!(a.retained_asset_references_guarded(&stale).is_err());
    assert!(a.retained_asset_references_guarded(&b.observe()?).is_err());
    assert_eq!(references(&a)?.len(), 2);
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    Ok(())
}
