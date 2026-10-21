//! Tables, image captions and headings share one real owned Accept and selective client history.
use super::*;
use crate::{
    DocumentSuggestionAdmission, DocumentSuggestionDecisionAdmission, DurableSuggestionDecision,
    RoomBackup, RoomRecoveryPolicy, SuggestionDecision, SuggestionDecisionRequest,
};
use breditor_collab_feasibility::rich_replica::{
    DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionEffect,
    DocumentSuggestionEffectVerification, DocumentSuggestionScope, OwnedSuggestionAcceptance,
    ReviewedHistoryIdentity,
    actions::{InsertRow, SetHeading, SetImageCaption},
};

fn draft() -> DocumentSuggestionDraft {
    DocumentSuggestionDraft {
        scope: DocumentSuggestionScope::Commands,
        edit: DocumentSuggestionEdit::Commands(vec![
            Command::SetHeading(SetHeading { block: "p".into(), level: Some(3) }),
            Command::InsertRow(InsertRow {
                block: "table-block".into(),
                row_block: "accepted-row-block".into(),
                row: "accepted-row".into(),
                before: None,
            }),
            Command::SetImageCaption(SetImageCaption {
                block: "image-block".into(),
                caption: Some(
                    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"accepted-caption"},"children":[{"kind":"text","text":"Accepted caption 🙂","formats":[]}]}),
                ),
            }),
        ]),
    }
}

fn adopt(
    client: &mut RichReplica,
    packet: &str,
    accepted: &DurableSuggestionDecision,
) -> TestResult {
    let effect = accepted.decision.effect.as_ref().ok_or("native effect")?;
    let effect: DocumentSuggestionEffect = serde_json::from_value(
        json!({"suggestionId":accepted.decision.suggestion_id,"writerGroup":effect.writer_group,"semanticFrom":effect.semantic_from}),
    )?;
    let receipt = OwnedSuggestionAcceptance {
        binding: accepted.descriptor.binding.clone(),
        sequence: accepted.decision.sequence.clone(),
        principal: ReviewPrincipalId::try_new(&accepted.decision.principal)?,
        accepting_writer: client.writer().into(),
        effect,
    };
    let DocumentSuggestionEffectVerification::Verified(proof) = client
        .verify_document_suggestion_effect_guarded(&client.observe()?, packet, &receipt.effect)?
    else {
        return Err("native effect proof".into());
    };
    assert!(client.adopt_suggestion_history_guarded(&proof, packet, receipt.clone())?);
    let DocumentSuggestionEffectVerification::Verified(proof) = client
        .verify_document_suggestion_effect_guarded(&client.observe()?, packet, &receipt.effect)?
    else {
        return Err("repeated effect proof".into());
    };
    assert!(!client.adopt_suggestion_history_guarded(&proof, packet, receipt)?);
    Ok(())
}

fn reviewed_client(
    profile: &SharedRichProfile,
    room: &mut Room,
) -> TestResult<(RichReplica, crate::Registration)> {
    let descriptor = room.enable_document_suggestions("owner")?;
    let writer = room.register("owner")?;
    let mut client =
        profile.join_frame("room".into(), writer.lease.writer.clone(), &room.catchup("owner")?)?;
    client.enable_document_selection_guarded(&client.observe()?)?;
    client.enable_reviewed_history_guarded(
        &client.observe()?,
        ReviewedHistoryIdentity {
            binding: descriptor.binding,
            principal: ReviewPrincipalId::try_new("owner")?,
            effect_writer: descriptor.effect_writer,
        },
    )?;
    client.enable_segmented_history_guarded(
        &client.observe()?,
        "client-root".into(),
        "client-one".into(),
    )?;
    Ok((client, writer))
}

#[test]
fn owned_mixed_structure_accept_keeps_client_undo_peer_text_and_idle_effect_files_across_cold_seals()
-> TestResult {
    let files = Files::new()?;
    let (profile, mut room) = start(&files, 3, true, true)?;
    let (mut client, writer) = reviewed_client(&profile, &mut room)?;
    insert(&mut client, "Owner retained ")?;
    let (mut through, _, _) = send_document(&mut room, "owner", &client, &writer.lease, "0", true)?;
    enable(&mut room, Lane::Document)?;
    let packet = client.capture_document_suggestion_guarded(
        &client.observe()?,
        "Mixed structure",
        ReviewPrincipalId::try_new("owner")?,
        "0",
        draft(),
    )?;
    let DocumentSuggestionAdmission::Durable(proposed) =
        room.publish_document_suggestion("owner", &packet)?
    else {
        return Err("proposal publication".into());
    };
    let request = SuggestionDecisionRequest {
        binding: room.document_suggestions_descriptor("owner")?.binding,
        suggestion_id: proposed.publication.suggestion.id,
        decision: SuggestionDecision::Accept,
    };
    let DocumentSuggestionDecisionAdmission::Durable(accepted) =
        room.accept_document_suggestion_owned("owner", &writer.lease, &request)?
    else {
        return Err("owned Accept".into());
    };
    assert_eq!(accepted.decision.accepting_writer.as_deref(), Some(client.writer()));
    client.receive_frame(&room.catchup("owner")?)?;
    adopt(&mut client, &packet, &accepted)?;
    assert_eq!(client.undo_count(), 2);
    seal(&mut room, Lane::Document, "second")?;
    client.seal_history_segment_guarded(&client.observe()?, "client-two".into())?;
    let idle_effect =
        room.suggestions.as_ref().ok_or("effects")?.effect_owner.segmented_checkpoint()?;
    room.grant("owner", "bob", Some(Role::Editor))?;
    let peer = room.register("bob")?;
    let mut other =
        profile.join_frame("room".into(), peer.lease.writer.clone(), &room.catchup("bob")?)?;
    insert(&mut other, "Bob retained ")?;
    send_document(&mut room, "bob", &other, &peer.lease, "0", true)?;
    client.receive_frame(&room.catchup("owner")?)?;
    seal(&mut room, Lane::Document, "third")?;
    assert_eq!(
        room.suggestions.as_ref().ok_or("effects")?.effect_owner.segmented_checkpoint()?,
        idle_effect
    );
    let local = client.segmented_checkpoint()?;
    let cut = room.native_history_checkpoint("owner", Lane::Document)?;
    let archive = RoomBackup::from_bytes(&room.export_backup()?.to_bytes())?;
    let identity = room.backup_identity()?;
    drop(room);
    let mut room = Room::restore_backup(
        &files.path("restored.log"),
        &archive,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert_eq!(room.native_history_checkpoint("owner", Lane::Document)?, cut);
    assert_eq!(
        room.suggestions.as_ref().ok_or("effects")?.effect_owner.segmented_checkpoint()?,
        idle_effect
    );
    client = profile.restore_segmented("room", &local)?;
    let lease = room.resume("owner", &writer.lease.writer, &writer.credential)?;
    for redo in [false, true] {
        assert!(if redo { client.redo()? } else { client.undo()? });
        through = send_document(&mut room, "owner", &client, &lease, &through, true)?.0;
        assert_eq!(room.replica.document_json(), client.document_json());
        assert!(client.document_json().contains("Bob retained "));
        assert_eq!(client.document_json().contains("accepted-row-block"), redo);
        assert_eq!(client.document_json().contains("Accepted caption 🙂"), redo);
    }
    let exact = fs::read(files.path("restored.log"))?;
    let DocumentSuggestionDecisionAdmission::Durable(retry) =
        room.accept_document_suggestion_owned("owner", &lease, &request)?
    else {
        return Err("owned retry".into());
    };
    assert!(retry.duplicate);
    assert_eq!(retry.decision, accepted.decision);
    assert_eq!(fs::read(files.path("restored.log"))?, exact);
    Ok(())
}
