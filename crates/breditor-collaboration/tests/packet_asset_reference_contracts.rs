//! Retained packet dependencies include invisible native intent, not just the accepted AST.
use breditor_collaboration::rich_replica::{
    Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope,
    DocumentVersionSource, PacketAssetIdentity, PacketAssetOutcome, PacketAssetReferences,
    RichReplica, SharedRichProfile,
    actions::{DeleteBlock, InsertBlocks, InsertText, ReplaceImage},
};
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn peers(language: u8) -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":language,"schema":{"name":"example/packet-assets","version":1},"extensions":[]}).to_string();
    let p = match language {
        1 => SharedRichProfile::from_standard_configuration_json_v1(&configuration)?,
        2 => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        _ => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/packet-assets","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = p.create(&input, "101".into())?;
    let b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((p, a, b))
}
fn draft(commands: Vec<Command>) -> DocumentSuggestionDraft {
    DocumentSuggestionDraft {
        scope: DocumentSuggestionScope::Commands,
        edit: DocumentSuggestionEdit::Commands(commands),
    }
}
fn replace(asset: &str) -> Command {
    Command::ReplaceImage(ReplaceImage {
        block: "image-block".into(),
        asset: asset.into(),
        generation: format!("{asset}-generation"),
    })
}
fn capture(a: &RichReplica, commands: Vec<Command>) -> Result<String> {
    Ok(a.capture_document_suggestion_guarded(
        &a.observe()?,
        "Packet images",
        ReviewPrincipalId::try_new("alice")?,
        "0",
        draft(commands),
    )?)
}
fn version(a: &RichReplica) -> Result<String> {
    Ok(a.capture_document_version_guarded(
        &a.observe()?,
        "Snapshot",
        ReviewPrincipalId::try_new("alice")?,
        "0",
    )?)
}
fn pairs(read: &PacketAssetReferences) -> Result<Vec<(String, String)>> {
    match &read.outcome {
        PacketAssetOutcome::Ready { references } => {
            Ok(references.iter().map(|r| (r.asset.clone(), r.generation.clone())).collect())
        }
        PacketAssetOutcome::Pending { .. } => Err("unexpected pending".into()),
    }
}
fn saved(a: &RichReplica, scope: u8, typing: bool) -> Result<String> {
    Ok(match (scope, typing) {
        (2, true) => a.document_typing_checkpoint()?,
        (2, false) => a.document_checkpoint()?,
        (1, true) => a.general_typing_checkpoint()?,
        (1, false) => a.general_checkpoint()?,
        (_, true) => a.typing_checkpoint()?,
        _ => a.checkpoint()?,
    })
}

#[test]
fn packet_intent_retains_intermediate_and_deleted_replacements_without_live_publication() -> Result
{
    let (_, mut a, _) = peers(3)?;
    let commands = vec![
        replace("intermediate"),
        replace("final"),
        Command::DeleteBlock(DeleteBlock { block: "image-block".into() }),
    ];
    let packet = capture(&a, commands.clone())?;
    let observed = a.observe()?;
    let exact = (a.checkpoint()?, a.update_frame()?, a.document_json().to_owned());
    let read = a.document_suggestion_asset_references_guarded(&observed, &packet)?;
    let expected = vec![
        ("asset".into(), "generation".into()),
        ("final".into(), "final-generation".into()),
        ("intermediate".into(), "intermediate-generation".into()),
    ];
    assert_eq!(pairs(&read)?, expected);
    assert_eq!(a.retained_asset_references_guarded(&observed)?.len(), 1);
    a.check(&observed)?;
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.document_json().to_owned()), exact);
    // Real native command application is an oracle, not proposal acceptance or server finality.
    a.apply(commands)?;
    assert!(a.document().image_ids().next().is_none());
    let retained = a.retained_asset_references_guarded(&a.observe()?)?;
    assert_eq!(
        retained
            .iter()
            .map(|r| (r.asset().as_str().into(), r.generation().as_str().into()))
            .collect::<Vec<_>>(),
        expected
    );
    Ok(())
}

#[test]
fn introduced_rich_image_drafts_are_read_through_native_lowering_not_json_text_scans() -> Result {
    let (_, a, _) = peers(3)?;
    let image = json!({"kind":"element","type":"breditor/image","entityId":null,"properties":{"breditor/block-id":"new-image-block","breditor/image-id":"new-image","breditor/asset-id":"draft-only","breditor/asset-generation":"draft-generation","breditor/decorative":true,"breditor/alt-text":""},"children":[]});
    let packet=capture(&a,vec![Command::InsertBlocks(InsertBlocks{parent:None,before:None,nodes:vec![image]}),Command::InsertText(InsertText{block:"p".into(),offset:0,text:r#"{"breditor/asset-id":"not-an-asset","breditor/asset-generation":"not-a-generation"}"#.into()})])?;
    let read = a.document_suggestion_asset_references_guarded(&a.observe()?, &packet)?;
    assert!(pairs(&read)?.contains(&("draft-only".into(), "draft-generation".into())));
    assert!(!pairs(&read)?.iter().any(|r| r.0 == "not-an-asset"));
    assert!(!a.document_json().contains("draft-only"));
    Ok(())
}

#[test]
fn admitted_version_content_is_inventoried_without_endorsing_its_missing_source() -> Result {
    let (p, a, _) = peers(3)?;
    let mut seed: Value = serde_json::from_str(a.document_json())?;
    seed["root"]["children"][0]["children"][0]["children"][0]["children"][1]["properties"]["breditor/asset-id"] =
        json!("version-only");
    let other = p.create(&seed.to_string(), "303".into())?;
    let packet = version(&other)?;
    assert!(matches!(
        a.verify_document_version_source(&packet)?,
        DocumentVersionSource::Pending { .. }
    ));
    let read = a.document_version_asset_references_guarded(&a.observe()?, &packet)?;
    assert_eq!(pairs(&read)?, vec![("version-only".into(), "generation".into())]);
    assert!(!a.document_json().contains("version-only"));
    assert!(matches!(read.packet, PacketAssetIdentity::Version { .. }));
    Ok(())
}

#[test]
fn missing_proposal_and_revision_sources_stay_pending_until_native_dependencies_arrive() -> Result {
    let (_, mut a, mut b) = peers(3)?;
    a.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "source ".into(),
    })])?;
    let parent = capture(&a, vec![replace("parent-only")])?;
    a.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "later ".into(),
    })])?;
    let revision = a.capture_document_suggestion_revision_guarded(
        &a.observe()?,
        &parent,
        "Replacement",
        "1",
        draft(vec![replace("child-only")]),
    )?;
    let exact = (b.checkpoint()?, b.update_frame()?);
    for read in [
        b.document_suggestion_asset_references_guarded(&b.observe()?, &parent)?,
        b.document_suggestion_revision_asset_references_guarded(&b.observe()?, &parent, &revision)?,
    ] {
        assert!(
            matches!(read.outcome,PacketAssetOutcome::Pending{ref missing} if !missing.is_empty())
        );
        let encoded = serde_json::to_value(&read)?;
        assert!(encoded["outcome"].get("references").is_none());
    }
    assert_eq!((b.checkpoint()?, b.update_frame()?), exact);
    b.receive_frame(&a.update_frame()?)?;
    let read =
        b.document_suggestion_revision_asset_references_guarded(&b.observe()?, &parent, &revision)?;
    let references = pairs(&read)?;
    assert!(references.contains(&("parent-only".into(), "parent-only-generation".into())));
    assert!(references.contains(&("child-only".into(), "child-only-generation".into())));
    assert!(references.contains(&("asset".into(), "generation".into())));
    assert!(!b.document_json().contains("child-only"));
    Ok(())
}

#[test]
fn packet_reads_are_pure_in_all_grammars_selection_scopes_and_history_policies() -> Result {
    for language in 1..=3 {
        for scope in 0..3 {
            for typing in [false, true] {
                let (p, mut a, _) = peers(language)?;
                if scope == 1 {
                    a.enable_general_ranges_guarded(&a.observe()?)?;
                }
                if scope == 2 {
                    a.enable_document_selection_guarded(&a.observe()?)?;
                }
                let observe =
                    |a: &RichReplica| if scope == 2 { a.observe_document() } else { a.observe() };
                if typing {
                    a.enable_typing_history_guarded(&observe(&a)?)?;
                }
                a.apply(vec![replace("retained-redo")])?;
                a.undo()?;
                let snapshot = a.capture_document_version_guarded(
                    &observe(&a)?,
                    "Snapshot",
                    ReviewPrincipalId::try_new("alice")?,
                    "0",
                )?;
                let proposal = a.capture_document_suggestion_guarded(
                    &observe(&a)?,
                    "Proposal",
                    ReviewPrincipalId::try_new("alice")?,
                    "0",
                    draft(vec![replace("proposal-only")]),
                )?;
                let revision = a.capture_document_suggestion_revision_guarded(
                    &observe(&a)?,
                    &proposal,
                    "Revision",
                    "1",
                    draft(vec![replace("revision-only")]),
                )?;
                a.set_read_only_guarded(&observe(&a)?, true)?;
                let observed = observe(&a)?;
                let exact = (saved(&a, scope, typing)?, a.update_frame()?);
                for text in [
                    a.document_version_asset_references_json_guarded(&observed, &snapshot)?,
                    a.document_suggestion_asset_references_json_guarded(&observed, &proposal)?,
                    a.document_suggestion_revision_asset_references_json_guarded(
                        &observed, &proposal, &revision,
                    )?,
                ] {
                    let value: Value = serde_json::from_str(&text)?;
                    assert_eq!(value["format"], "breditor/shared-packet-asset-references");
                    assert_eq!(value["formatVersion"], 1);
                    assert_eq!(value["document"], "room");
                    assert_eq!(value["outcome"]["kind"], "ready");
                }
                a.check(&observed)?;
                assert_eq!((saved(&a, scope, typing)?, a.update_frame()?), exact);
                a.set_read_only_guarded(&observe(&a)?, false)?;
                let checkpoint = saved(&a, scope, typing)?;
                let mut twin = match (scope, typing) {
                    (2, true) => p.restore_document_typing("room", &checkpoint)?,
                    (2, false) => p.restore_document("room", &checkpoint)?,
                    (1, true) => p.restore_general_typing("room", &checkpoint)?,
                    (1, false) => p.restore_general("room", &checkpoint)?,
                    (_, true) => p.restore_typing("room", &checkpoint)?,
                    _ => p.restore("room", &checkpoint)?,
                };
                for redo in [true, false, true, false] {
                    if redo {
                        a.redo()?;
                        twin.redo()?;
                    } else {
                        a.undo()?;
                        twin.undo()?;
                    }
                    assert_eq!(saved(&a, scope, typing)?, saved(&twin, scope, typing)?);
                }
            }
        }
    }
    Ok(())
}

#[test]
fn stale_foreign_and_malformed_packet_reads_reject_without_echoing_payloads_or_erasing_redo()
-> Result {
    let (_, mut a, b) = peers(3)?;
    let packet = version(&a)?;
    let observed = a.observe()?;
    a.apply(vec![replace("redo")])?;
    a.undo()?;
    let exact = (a.checkpoint()?, a.update_frame()?);
    assert!(a.document_version_asset_references_guarded(&observed, &packet).is_err());
    assert!(
        a.document_suggestion_asset_references_guarded(&b.observe()?, "PRIVATE_PAYLOAD").is_err()
    );
    for input in ["PRIVATE_PAYLOAD".to_owned(), { "unused".to_owned() }] {
        let error = a
            .document_version_asset_references_guarded(&a.observe()?, &input)
            .expect_err("bad packet");
        assert!(!error.to_string().contains("PRIVATE_PAYLOAD"));
    }
    assert_eq!((a.checkpoint()?, a.update_frame()?), exact);
    a.redo()?;
    assert!(a.document_json().contains("redo-generation"));
    Ok(())
}
