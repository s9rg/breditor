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
    policy: DocumentSuggestionTextRebasePolicy,
) -> Result<(String, DurableSuggestionDecision)> {
    let (child, _) = supersede_text_revision(room, source, previous, policy, "host-text-rebase")?;
    accept_ready_text_child(room, source, registration, &child)
}
fn supersede_text_revision(
    room: &mut Room,
    source: &RichReplica,
    previous: &str,
    policy: DocumentSuggestionTextRebasePolicy,
    prefix: &str,
) -> Result<(String, StoredSuggestionRevision)> {
    let exact = source.reviewed_checkpoint()?;
    let DocumentSuggestionTextRebase::Captured { revision_packet_json } = source
        .rebase_document_suggestion_text_guarded(
            &observer(source)?,
            previous,
            "Rebased text",
            "1",
            prefix,
            policy,
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
    Ok((child, stored))
}
fn accept_ready_text_child(
    room: &mut Room,
    source: &mut RichReplica,
    registration: &Registration,
    child: &str,
) -> Result<(String, DurableSuggestionDecision)> {
    let DocumentSuggestionPreparation::Ready(preview) =
        source.prepare_document_suggestion_guarded(&observer(source)?, child)?
    else {
        return Err("child Ready".into());
    };
    let expected = preview.document_json().to_owned();
    room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Review))?;
    let choice =
        request(room, &source.read_document_suggestion(child)?.id, SuggestionDecision::Accept)?;
    let DocumentSuggestionDecisionAdmission::Durable(accepted) =
        room.accept_document_suggestion_owned("alice", &registration.lease, &choice)?
    else {
        return Err("text Accept".into());
    };
    let binding = room.document_suggestions_descriptor("alice")?.binding;
    source.receive_frame(&room.catchup("alice")?)?;
    adopt_child_once(source, child, &accepted, &binding, &registration.lease.writer)?;
    assert_eq!(source.document_json(), expected);
    Ok((expected, *accepted))
}

#[test]
fn rebased_text_accept_owned_history_and_original_receipt_recover_under_all_six_policies() -> Result
{
    exercise_text_revision(false)
}
#[test]
fn preserving_text_accept_is_once_only_and_keeps_peer_runs_with_owned_history_all_six_policies()
-> Result {
    exercise_text_revision(true)
}
fn exercise_text_revision(preserve: bool) -> Result {
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
                    anchor: point(u32::from(!preserve), Affinity::After),
                    focus: point(if preserve { 4 } else { 3 }, Affinity::Before),
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
            if preserve {
                peer.apply(vec![
                    Command::InsertText(InsertText {
                        block: "p".into(),
                        offset: 2,
                        text: "X".into(),
                    }),
                    Command::SetFormat(SetFormat {
                        block: "p".into(),
                        offset: 2,
                        length: 1,
                        format: json!({"type":"breditor-inline/italic","properties":{}}),
                        enabled: true,
                    }),
                ])?;
            }
            flush(&mut room, "bob", &peer_registration, &peer, "0")?;
            source.receive_frame(&room.catchup("alice")?)?;
            assert!(matches!(
                source.prepare_document_suggestion_guarded(&observer(&source)?, &previous)?,
                DocumentSuggestionPreparation::Conflict { .. }
            ));
            let before = source.document_json().to_owned();
            let (expected, accepted) = accept_text_revision(
                &mut room,
                &mut source,
                &registration,
                &previous,
                if preserve {
                    DocumentSuggestionTextRebasePolicy::PreserveInterveningText
                } else {
                    DocumentSuggestionTextRebasePolicy::RejectInterveningText
                },
            )?;
            assert_eq!(text(&source, "p")?, if preserve { "PR🙂XQ" } else { "PaR🙂bQ" });
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
            restart_retains_original_text_decision(&files, &registration, &accepted)?;
        }
    }
    Ok(())
}
fn restart_retains_original_text_decision(
    files: &Files,
    registration: &Registration,
    accepted: &DurableSuggestionDecision,
) -> Result {
    let (mut room, _) = Room::open(&files.path)?;
    let renewed = room.resume("alice", &registration.lease.writer, &registration.credential)?;
    let durable = fs::read(&files.path)?;
    let choice = request(&room, &accepted.decision.suggestion_id, SuggestionDecision::Accept)?;
    let DocumentSuggestionDecisionAdmission::Durable(repeated) =
        room.accept_document_suggestion_owned("alice", &renewed, &choice)?
    else {
        return Err("original text decision".into());
    };
    assert!(repeated.duplicate);
    assert_eq!(repeated.decision, accepted.decision);
    assert_eq!(fs::read(&files.path)?, durable);
    Ok(())
}

#[test]
fn repeated_sparse_children_supersede_only_pending_head_and_accept_once_all_six_policies() -> Result
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
            let original = proposal(
                &source,
                "alice",
                "Whole original replacement",
                vec![Command::ReplaceTextRange(ReplaceTextRange {
                    anchor: point(0, Affinity::After),
                    focus: point(4, Affinity::Before),
                    runs: vec![RangeTextRun { text: "R🙂".into(), formats: vec![] }],
                })],
            )?;
            publish(&mut room, "alice", &original)?;
            let (peer_registration, mut peer) = author(&profile, &mut room, "bob")?;
            peer.apply(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 1,
                text: "X".into(),
            })])?;
            let through = flush(&mut room, "bob", &peer_registration, &peer, "0")?;
            source.receive_frame(&room.catchup("alice")?)?;
            let (first, first_receipt) = supersede_text_revision(
                &mut room,
                &source,
                &original,
                DocumentSuggestionTextRebasePolicy::PreserveInterveningText,
                "first-host-sparse",
            )?;
            assert_eq!(source.undo_count(), 0);
            peer.apply(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 2,
                text: "Y".into(),
            })])?;
            flush(&mut room, "bob", &peer_registration, &peer, &through)?;
            source.receive_frame(&room.catchup("alice")?)?;
            assert!(matches!(
                source.prepare_document_suggestion_guarded(&observer(&source)?, &first)?,
                DocumentSuggestionPreparation::Conflict { .. }
            ));
            let before = source.document_json().to_owned();
            refuse_finalized_text_root(&mut room, &source, &original, &first_receipt, &files)?;
            let (expected, accepted) = accept_text_revision(
                &mut room,
                &mut source,
                &registration,
                &first,
                DocumentSuggestionTextRebasePolicy::PreserveInterveningText,
            )?;
            assert_eq!(text(&source, "p")?, "R🙂XY");
            assert_eq!(
                room.document_suggestion_revisions_page("alice", None)?.revisions[0],
                first_receipt
            );
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
            restart_retains_original_text_decision(&files, &registration, &accepted)?;
        }
    }
    Ok(())
}
fn refuse_finalized_text_root(
    room: &mut Room,
    source: &RichReplica,
    original: &str,
    first: &StoredSuggestionRevision,
    files: &Files,
) -> Result {
    let DocumentSuggestionTextRebase::Captured { revision_packet_json } = source
        .rebase_document_suggestion_text_guarded(
            &observer(source)?,
            original,
            "Cannot supersede final root",
            "5",
            "final-root-refusal",
            DocumentSuggestionTextRebasePolicy::PreserveInterveningText,
        )?
    else {
        return Err("root remains natively rebaseable before acceptance".into());
    };
    let input = revision_request(room, source, original, revision_packet_json)?;
    let exact = fs::read(&files.path)?;
    let SuggestionRevisionAdmission::Conflict { successor: Some(successor), .. } =
        room.revise_document_suggestion("alice", &input)?
    else {
        return Err("final root must keep its original winning successor".into());
    };
    assert_eq!(successor.as_ref(), first);
    assert_eq!(fs::read(&files.path)?, exact);
    Ok(())
}
