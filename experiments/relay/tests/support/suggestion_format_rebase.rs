//! Explicit rebased formatting children use unchanged authenticated revision and owned history.
use super::*;
use breditor_collab_feasibility::rich_replica::{
    DocumentSuggestionFormatRebase, DocumentSuggestionPreparation, ReviewedHistoryIdentity,
};
fn propose_format(source: &RichReplica) -> Result<String> {
    proposal(
        source,
        "alice",
        "Remove original bold",
        vec![Command::SetFormat(SetFormat {
            block: "p".into(),
            offset: 0,
            length: 4,
            format: json!({"type":"breditor/strong","properties":{}}),
            enabled: false,
        })],
    )
}
fn peer_edits(source: &mut RichReplica) -> Result {
    source.apply(vec![
        insert("p", "P"),
        Command::InsertText(InsertText { block: "p".into(), offset: 2, text: "X".into() }),
        Command::SetFormat(SetFormat {
            block: "p".into(),
            offset: 3,
            length: 2,
            format: json!({"type":"breditor-inline/italic","properties":{}}),
            enabled: true,
        }),
    ])?;
    Ok(())
}
fn accept_rebased(
    room: &mut Room,
    source: &mut RichReplica,
    registration: &Registration,
    previous: &str,
) -> Result<(String, DurableSuggestionDecision)> {
    let DocumentSuggestionFormatRebase::Captured { revision_packet_json } = source
        .rebase_document_suggestion_format_guarded(
            &observer(source)?,
            previous,
            "Rebased format",
            "1",
        )?
    else {
        return Err("rebased capture".into());
    };
    let child = source.document_suggestion_revision_packet(previous, &revision_packet_json)?;
    let input = revision_request(room, source, previous, revision_packet_json)?;
    let exact = room.catchup("alice")?;
    let stored = revised(room, &input)?;
    assert_eq!(room.catchup("alice")?, exact, "Revision is not Accept");
    assert_eq!(stored.previous_decision.decision, SuggestionDecision::Reject);
    let DocumentSuggestionPreparation::Ready(preview) =
        source.prepare_document_suggestion_guarded(&observer(source)?, &child)?
    else {
        return Err("child preview".into());
    };
    let expected = preview.document_json().to_owned();
    room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Review))?;
    let choice = request(room, &stored.publication.suggestion.id, SuggestionDecision::Accept)?;
    let DocumentSuggestionDecisionAdmission::Durable(accepted) =
        room.accept_document_suggestion_owned("alice", &registration.lease, &choice)?
    else {
        return Err("child accepted".into());
    };
    let binding = room.document_suggestions_descriptor("alice")?.binding;
    source.receive_frame(&room.catchup("alice")?)?;
    adopt_child_once(source, &child, &accepted, &binding, &registration.lease.writer)?;
    assert_eq!(source.document_json(), expected);
    Ok((expected, *accepted))
}
#[test]
fn original_character_format_revision_accept_and_owned_undo_recover_under_all_six_policies()
-> Result {
    for scope in 0..=2 {
        for natural in [false, true] {
            let files = Files::new()?;
            let (profile, mut room) = start(&files, true)?;
            room.enable_document_suggestions("owner")?;
            room.enable_document_suggestion_revisions("owner")?;
            let (registration, mut source) = author(&profile, &mut room, "alice")?;
            configure_policy(&mut source, scope, natural)?;
            let descriptor = room.document_suggestions_descriptor("alice")?;
            source.enable_reviewed_history_guarded(
                &observer(&source)?,
                ReviewedHistoryIdentity {
                    binding: descriptor.binding,
                    principal: ReviewPrincipalId::try_new("alice")?,
                    effect_writer: descriptor.effect_writer,
                },
            )?;
            let previous = propose_format(&source)?;
            publish(&mut room, "alice", &previous)?;
            let (peer_registration, mut peer) = author(&profile, &mut room, "bob")?;
            peer_edits(&mut peer)?;
            flush(&mut room, "bob", &peer_registration, &peer, "0")?;
            source.receive_frame(&room.catchup("alice")?)?;
            let before = source.document_json().to_owned();
            assert!(matches!(
                source.prepare_document_suggestion_guarded(&observer(&source)?, &previous)?,
                DocumentSuggestionPreparation::Conflict { .. }
            ));
            let (expected, accepted) =
                accept_rebased(&mut room, &mut source, &registration, &previous)?;
            assert_eq!(text(&source, "p")?, "PaX🙂b");
            assert!(source.document_json().contains("breditor-inline/italic"));
            let mut reopened = profile.restore_reviewed("room", &source.reviewed_checkpoint()?)?;
            assert!(source.undo()?);
            assert!(reopened.undo()?);
            assert_eq!(source.document_json(), before);
            assert_eq!(source.reviewed_checkpoint()?, reopened.reviewed_checkpoint()?);
            let through = flush(&mut room, "alice", &registration, &source, "0")?;
            assert!(source.redo()?);
            assert!(reopened.redo()?);
            assert_eq!(source.document_json(), expected);
            assert_eq!(source.reviewed_checkpoint()?, reopened.reviewed_checkpoint()?);
            flush(&mut room, "alice", &registration, &source, &through)?;
            let log = fs::read(&files.path)?;
            drop(room);
            let (mut room, _) = Room::open(&files.path)?;
            let choice =
                request(&room, &accepted.decision.suggestion_id, SuggestionDecision::Accept)?;
            assert!(matches!(
                room.accept_document_suggestion_owned("alice", &registration.lease, &choice),
                Err(Error::Lease)
            ));
            assert_eq!(fs::read(&files.path)?, log);
            let renewed =
                room.resume("alice", &registration.lease.writer, &registration.credential)?;
            let after_resume = fs::read(&files.path)?;
            let DocumentSuggestionDecisionAdmission::Durable(repeated) =
                room.accept_document_suggestion_owned("alice", &renewed, &choice)?
            else {
                return Err("original Accept receipt".into());
            };
            assert!(repeated.duplicate);
            assert_eq!(repeated.decision, accepted.decision);
            assert_eq!(fs::read(&files.path)?, after_resume);
        }
    }
    Ok(())
}
