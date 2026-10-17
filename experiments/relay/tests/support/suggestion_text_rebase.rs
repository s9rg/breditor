//! Explicit text revisions use unchanged authenticated supersession, native effects and owned history.
use super::*;
use breditor_collab_feasibility::anchor::Affinity;
use breditor_collab_feasibility::rich_replica::{
    DocumentSuggestionPreparation, DocumentSuggestionTextRebase,
    DocumentSuggestionTextRebasePolicy, ReviewedHistoryIdentity,
    actions::{RangeTextRun, ReplaceTextRange},
    selection::TextPoint,
};

fn accept_text_revision(
    room: &mut Room,
    source: &mut RichReplica,
    registration: &Registration,
    previous: &str,
) -> Result<(String, DurableSuggestionDecision)> {
    let exact = source.reviewed_checkpoint()?;
    let DocumentSuggestionTextRebase::Captured { revision_packet_json } = source
        .rebase_document_suggestion_text_guarded(
            &observer(source)?,
            previous,
            "Rebased text",
            "1",
            "host-text-rebase",
            DocumentSuggestionTextRebasePolicy::RejectInterveningText,
        )?
    else {
        return Err("text revision capture".into());
    };
    assert_eq!(source.reviewed_checkpoint()?, exact, "Capture cannot mutate source or history");
    let child = source.document_suggestion_revision_packet(previous, &revision_packet_json)?;
    let input = revision_request(room, source, previous, revision_packet_json)?;
    let frame = room.catchup("alice")?;
    let stored = revised(room, &input)?;
    assert_eq!(room.catchup("alice")?, frame, "Supersession is not Accept");
    let DocumentSuggestionPreparation::Ready(preview) =
        source.prepare_document_suggestion_guarded(&observer(source)?, &child)?
    else {
        return Err("child Ready".into());
    };
    let expected = preview.document_json().to_owned();
    room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Review))?;
    let choice = request(room, &stored.publication.suggestion.id, SuggestionDecision::Accept)?;
    let DocumentSuggestionDecisionAdmission::Durable(accepted) =
        room.accept_document_suggestion_owned("alice", &registration.lease, &choice)?
    else {
        return Err("text Accept".into());
    };
    let binding = room.document_suggestions_descriptor("alice")?.binding;
    source.receive_frame(&room.catchup("alice")?)?;
    adopt_child_once(source, &child, &accepted, &binding, &registration.lease.writer)?;
    assert_eq!(source.document_json(), expected);
    Ok((expected, *accepted))
}

#[test]
fn rebased_text_accept_owned_history_and_original_receipt_recover_under_all_six_policies() -> Result
{
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
            let point = |offset, affinity| TextPoint { block: "p".into(), offset, affinity };
            let previous = proposal(
                &source,
                "alice",
                "Replace original emoji",
                vec![Command::ReplaceTextRange(ReplaceTextRange {
                    anchor: point(1, Affinity::After),
                    focus: point(3, Affinity::Before),
                    runs: vec![RangeTextRun { text: "R🙂".into(), formats: vec![] }],
                })],
            )?;
            publish(&mut room, "alice", &previous)?;
            let (peer_registration, mut peer) = author(&profile, &mut room, "bob")?;
            peer.apply(vec![
                insert("p", "P"),
                Command::InsertText(InsertText { block: "p".into(), offset: 5, text: "Q".into() }),
                Command::SetFormat(SetFormat {
                    block: "p".into(),
                    offset: 0,
                    length: 1,
                    format: json!({"type":"breditor-inline/italic","properties":{}}),
                    enabled: true,
                }),
            ])?;
            flush(&mut room, "bob", &peer_registration, &peer, "0")?;
            source.receive_frame(&room.catchup("alice")?)?;
            assert!(matches!(
                source.prepare_document_suggestion_guarded(&observer(&source)?, &previous)?,
                DocumentSuggestionPreparation::Conflict { .. }
            ));
            let before = source.document_json().to_owned();
            let (expected, accepted) =
                accept_text_revision(&mut room, &mut source, &registration, &previous)?;
            assert_eq!(text(&source, "p")?, "PaR🙂bQ");
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
            drop(room);
            let (mut room, _) = Room::open(&files.path)?;
            let renewed =
                room.resume("alice", &registration.lease.writer, &registration.credential)?;
            let durable = fs::read(&files.path)?;
            let choice =
                request(&room, &accepted.decision.suggestion_id, SuggestionDecision::Accept)?;
            let DocumentSuggestionDecisionAdmission::Durable(repeated) =
                room.accept_document_suggestion_owned("alice", &renewed, &choice)?
            else {
                return Err("original text decision".into());
            };
            assert!(repeated.duplicate);
            assert_eq!(repeated.decision, accepted.decision);
            assert_eq!(fs::read(&files.path)?, durable);
        }
    }
    Ok(())
}
