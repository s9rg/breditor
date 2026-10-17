//! Native reference-host revision workflows through the unchanged V1 child/effect contracts.
use super::*;
use breditor_collab_relay::{
    StoredSuggestionRevision, SuggestionRevisionAdmission, SuggestionRevisionRequest,
};
#[path = "suggestion_format_rebase.rs"]
mod format_rebase;
#[path = "suggestion_text_rebase.rs"]
mod text_rebase;
fn revision(source: &RichReplica, previous: &str, title: &str, text: &str) -> Result<String> {
    revision_commands(source, previous, title, vec![insert("p", text)])
}
fn revision_commands(
    source: &RichReplica,
    previous: &str,
    title: &str,
    commands: Vec<Command>,
) -> Result<String> {
    Ok(source.capture_document_suggestion_revision_guarded(
        &observer(source)?,
        previous,
        title,
        "1",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(commands),
        },
    )?)
}
fn revision_request(
    room: &Room,
    source: &RichReplica,
    previous: &str,
    packet: String,
) -> Result<SuggestionRevisionRequest> {
    Ok(SuggestionRevisionRequest {
        binding: room.document_suggestion_revisions_descriptor("alice")?.binding,
        previous_suggestion_id: source.read_document_suggestion(previous)?.id,
        revision_packet: packet,
    })
}
fn revised(
    room: &mut Room,
    request: &SuggestionRevisionRequest,
) -> Result<StoredSuggestionRevision> {
    let SuggestionRevisionAdmission::Durable(result) =
        room.revise_document_suggestion("alice", request)?
    else {
        return Err("durable revision".into());
    };
    assert!(!result.duplicate);
    Ok(result.revision)
}
#[test]
fn revision_discovery_is_bounded_frozen_bound_to_commits_and_exact_after_restart() -> Result {
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    room.enable_document_suggestions("owner")?;
    room.enable_document_suggestion_revisions("owner")?;
    let (_, source) = author(&profile, &mut room, "alice")?;
    let empty = room.document_suggestion_revisions_page("alice", None)?;
    assert!(empty.revisions.is_empty());
    let mut previous = proposal(&source, "alice", "Root", vec![insert("p", "Root ")])?;
    publish(&mut room, "alice", &previous)?;
    let mut expected = vec![];
    for index in 0..65 {
        let packet = revision(&source, &previous, &format!("Child {index}"), &format!("{index} "))?;
        let child = source.document_suggestion_revision_packet(&previous, &packet)?;
        let request = revision_request(&room, &source, &previous, packet)?;
        expected.push(revised(&mut room, &request)?);
        previous = child;
    }
    let first = room.document_suggestion_revisions_page("alice", None)?;
    assert_eq!(first.revisions, expected[..64]);
    assert!(first.more);
    let packet = revision(&source, &previous, "Later", "Later ")?;
    let request = revision_request(&room, &source, &previous, packet)?;
    let later = revised(&mut room, &request)?;
    let second = room.document_suggestion_revisions_page("alice", Some(&first.cursor))?;
    assert_eq!(second.revisions, expected[64..]);
    assert!(!second.more);
    assert_eq!(first.cursor.through, second.cursor.through);
    assert!(
        room.document_suggestion_revisions_page("alice", Some(&second.cursor))?
            .revisions
            .is_empty()
    );
    assert!(
        room.document_suggestion_revisions_page("alice", Some(&empty.cursor))?.revisions.is_empty()
    );
    for cursor in [
        breditor_collab_relay::SuggestionRevisionsCursor {
            binding: "0".repeat(64),
            ..first.cursor.clone()
        },
        breditor_collab_relay::SuggestionRevisionsCursor {
            after: expected[0].previous_decision.sequence.clone(),
            ..first.cursor.clone()
        },
        breditor_collab_relay::SuggestionRevisionsCursor {
            through: format!("0{}", first.cursor.through),
            ..first.cursor.clone()
        },
        breditor_collab_relay::SuggestionRevisionsCursor {
            after: later.publication.sequence.clone(),
            ..first.cursor.clone()
        },
    ] {
        assert!(room.document_suggestion_revisions_page("alice", Some(&cursor)).is_err());
    }
    drop(room);
    let (mut room, _) = Room::open(&files.path)?;
    assert_eq!(room.document_suggestion_revisions_page("alice", Some(&first.cursor))?, second);
    assert_eq!(
        room.document_suggestion_revisions_page("alice", None)?.cursor.through,
        later.publication.sequence
    );
    room.grant("owner", "alice", None)?;
    assert!(matches!(
        room.document_suggestion_revisions_page("alice", None),
        Err(Error::Permission)
    ));
    Ok(())
}
#[test]
fn revisions_are_separately_enabled_author_only_and_available_to_non_authoring_proposers() -> Result
{
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    assert!(room.enable_document_suggestion_revisions("owner").is_err());
    room.enable_document_suggestions("owner")?;
    room.grant("owner", "alice", Some(Role::Reader))?;
    room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Propose))?;
    let mut source = profile.join_frame("room".into(), "900".into(), &room.catchup("alice")?)?;
    source.set_read_only_guarded(&source.observe()?, true)?;
    let previous = proposal(&source, "alice", "Original", vec![insert("p", "Old ")])?;
    let published = publish(&mut room, "alice", &previous)?;
    let packet = revision(&source, &previous, "Revised", "New ")?;
    assert!(
        room.publish_document_suggestion("alice", &packet).is_err(),
        "ordinary publication must not reinterpret a revision envelope"
    );
    let disabled = fs::read(&files.path)?;
    assert!(room.document_suggestion_revisions_descriptor("alice").is_err());
    assert!(room.enable_document_suggestion_revisions("alice").is_err());
    assert_eq!(fs::read(&files.path)?, disabled);
    let descriptor = room.enable_document_suggestion_revisions("owner")?;
    assert_eq!(room.enable_document_suggestion_revisions("owner")?, descriptor);
    let input = revision_request(&room, &source, &previous, packet.clone())?;
    let exact = (room.catchup("alice")?, source.checkpoint()?);
    let denied = request(&room, &published.publication.suggestion.id, SuggestionDecision::Reject)?;
    assert!(matches!(room.decide_document_suggestion("alice", &denied), Err(Error::Permission)));
    assert!(matches!(room.revise_document_suggestion("owner", &input), Err(Error::Permission)));
    let stored = revised(&mut room, &input)?;
    assert_eq!(stored.previous_decision.decision, SuggestionDecision::Reject);
    assert_eq!(stored.previous_decision.principal, "alice");
    assert!(stored.previous_decision.effect.is_none());
    assert_eq!(
        stored.publication.sequence.parse::<u64>()?,
        stored.previous_decision.sequence.parse::<u64>()? + 1
    );
    assert_eq!((room.catchup("alice")?, source.checkpoint()?), exact);
    assert_eq!(
        room.document_suggestion_revision_packet("alice", &stored.revision.id)?.as_deref(),
        Some(packet.as_str())
    );
    let page = room.document_suggestions_page("alice", None)?;
    assert_eq!(page.updates.len(), 3);
    assert!(
        matches!(&page.updates[1],SuggestionUpdate::Decided(value) if value==&stored.previous_decision)
    );
    assert!(
        matches!(&page.updates[2],SuggestionUpdate::Published(value) if value==&stored.publication)
    );
    room.grant("owner", "alice", None)?;
    assert!(matches!(
        room.document_suggestion_revision("alice", &stored.revision.id),
        Err(Error::Permission)
    ));
    drop(room);
    let (room, _) = Room::open(&files.path)?;
    assert_eq!(room.document_suggestion_revision("owner", &stored.revision.id)?, Some(stored));
    Ok(())
}
#[test]
fn accept_or_reject_before_revision_refuses_the_child_and_revision_before_accept_retains_reject()
-> Result {
    for choice in [SuggestionDecision::Accept, SuggestionDecision::Reject] {
        let files = Files::new()?;
        let (profile, mut room) = start(&files, true)?;
        room.enable_document_suggestions("owner")?;
        room.enable_document_suggestion_revisions("owner")?;
        let (_, source) = author(&profile, &mut room, "alice")?;
        let previous = proposal(&source, "alice", "Original", vec![insert("p", "Old ")])?;
        let published = publish(&mut room, "alice", &previous)?;
        let input = revision_request(
            &room,
            &source,
            &previous,
            revision(&source, &previous, "Child", "New ")?,
        )?;
        let decision_request = request(&room, &published.publication.suggestion.id, choice)?;
        let decided = decide(&mut room, "owner", &decision_request)?;
        let exact = fs::read(&files.path)?;
        let SuggestionRevisionAdmission::Conflict { previous, successor } =
            room.revise_document_suggestion("alice", &input)?
        else {
            return Err("final conflict".into());
        };
        assert_eq!(previous.decision, Some(decided.decision));
        assert!(successor.is_none());
        assert_eq!(fs::read(&files.path)?, exact);
        assert_eq!(room.document_suggestions_page("alice", None)?.updates.len(), 2);
    }
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    room.enable_document_suggestions("owner")?;
    room.enable_document_suggestion_revisions("owner")?;
    let (_, source) = author(&profile, &mut room, "alice")?;
    let previous = proposal(&source, "alice", "Original", vec![insert("p", "Old ")])?;
    let published = publish(&mut room, "alice", &previous)?;
    let input = revision_request(
        &room,
        &source,
        &previous,
        revision(&source, &previous, "Child", "New ")?,
    )?;
    let stored = revised(&mut room, &input)?;
    let old_accept =
        request(&room, &published.publication.suggestion.id, SuggestionDecision::Accept)?;
    let result = decide(&mut room, "owner", &old_accept)?;
    assert!(result.duplicate);
    assert_eq!(result.decision, stored.previous_decision);
    assert_eq!(source.update_frame()?, room.catchup("alice")?);
    Ok(())
}
#[test]
fn racing_revisions_have_one_original_successor_and_lost_reply_retries_do_not_branch() -> Result {
    use std::sync::{Arc, Barrier, Mutex};
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    room.enable_document_suggestions("owner")?;
    room.enable_document_suggestion_revisions("owner")?;
    let (_, source) = author(&profile, &mut room, "alice")?;
    let previous = proposal(&source, "alice", "Original", vec![insert("p", "Old ")])?;
    publish(&mut room, "alice", &previous)?;
    let inputs = [
        revision_request(
            &room,
            &source,
            &previous,
            revision(&source, &previous, "First", "One ")?,
        )?,
        revision_request(
            &room,
            &source,
            &previous,
            revision(&source, &previous, "Second", "Two ")?,
        )?,
    ];
    let shared = Arc::new(Mutex::new(room));
    let barrier = Arc::new(Barrier::new(2));
    let mut handles = vec![];
    for input in inputs.clone() {
        let shared = Arc::clone(&shared);
        let barrier = Arc::clone(&barrier);
        handles.push(std::thread::spawn(
            move || -> std::result::Result<SuggestionRevisionAdmission, String> {
                barrier.wait();
                shared
                    .lock()
                    .map_err(|e| e.to_string())?
                    .revise_document_suggestion("alice", &input)
                    .map_err(|e| e.to_string())
            },
        ));
    }
    let outcomes = handles
        .into_iter()
        .map(|handle| handle.join().map_err(|_| "revision thread panicked")?)
        .collect::<std::result::Result<Vec<_>, _>>()?;
    assert_eq!(
        outcomes.iter().filter(|r| matches!(r, SuggestionRevisionAdmission::Durable(_))).count(),
        1
    );
    assert_eq!(
        outcomes
            .iter()
            .filter(|r| matches!(r, SuggestionRevisionAdmission::Conflict { .. }))
            .count(),
        1
    );
    let winner = outcomes
        .iter()
        .find_map(|r| {
            if let SuggestionRevisionAdmission::Durable(value) = r {
                Some(value.revision.clone())
            } else {
                None
            }
        })
        .ok_or("winner")?;
    let mut room = Arc::try_unwrap(shared)
        .map_err(|_| "shared room")?
        .into_inner()
        .map_err(|e| e.to_string())?;
    let exact = fs::read(&files.path)?;
    for input in &inputs {
        match room.revise_document_suggestion("alice", input)? {
            SuggestionRevisionAdmission::Durable(value) => {
                assert!(value.duplicate);
                assert_eq!(value.revision, winner);
            }
            SuggestionRevisionAdmission::Conflict { successor, .. } => {
                assert_eq!(successor.as_deref(), Some(&winner));
            }
            SuggestionRevisionAdmission::Pending { .. } => return Err("unexpected pending".into()),
        }
    }
    assert_eq!(fs::read(&files.path)?, exact);
    drop(room);
    let (room, _) = Room::open(&files.path)?;
    assert_eq!(room.document_suggestion_revision("alice", &winner.revision.id)?, Some(winner));
    Ok(())
}
#[test]
fn offline_revision_source_is_not_accepted_as_a_host_document_boundary_until_flushed() -> Result {
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    room.enable_document_suggestions("owner")?;
    room.enable_document_suggestion_revisions("owner")?;
    let (registration, mut source) = author(&profile, &mut room, "alice")?;
    let previous = proposal(&source, "alice", "Original", vec![insert("p", "Old ")])?;
    publish(&mut room, "alice", &previous)?;
    source.apply(vec![insert("caption", "Offline source ")])?;
    let input = revision_request(
        &room,
        &source,
        &previous,
        revision(&source, &previous, "Child", "New ")?,
    )?;
    let exact = fs::read(&files.path)?;
    assert!(
        matches!(room.revise_document_suggestion("alice",&input)?,SuggestionRevisionAdmission::Pending {missing} if missing.len()==1)
    );
    assert_eq!(fs::read(&files.path)?, exact);
    flush(&mut room, "alice", &registration, &source, "0")?;
    revised(&mut room, &input)?;
    Ok(())
}
fn adopt_child_once(
    source: &mut RichReplica,
    packet: &str,
    accepted: &DurableSuggestionDecision,
    binding: &str,
    writer: &str,
) -> Result {
    use breditor_collab_feasibility::rich_replica::{
        DocumentSuggestionEffect, DocumentSuggestionEffectVerification, OwnedSuggestionAcceptance,
    };
    assert_eq!(accepted.decision.accepting_writer.as_deref(), Some(writer));
    let effect = accepted.decision.effect.as_ref().ok_or("effect")?;
    let effect: DocumentSuggestionEffect = serde_json::from_value(
        json!({"suggestionId":accepted.decision.suggestion_id,"writerGroup":effect.writer_group,"semanticFrom":effect.semantic_from}),
    )?;
    let owned = OwnedSuggestionAcceptance {
        binding: binding.into(),
        sequence: accepted.decision.sequence.clone(),
        principal: ReviewPrincipalId::try_new(&accepted.decision.principal)?,
        accepting_writer: writer.into(),
        effect,
    };
    let DocumentSuggestionEffectVerification::Verified(proof) = source
        .verify_document_suggestion_effect_guarded(&observer(source)?, packet, &owned.effect)?
    else {
        return Err("effect proof".into());
    };
    assert!(source.adopt_suggestion_history_guarded(&proof, packet, owned.clone())?);
    let DocumentSuggestionEffectVerification::Verified(repeated) = source
        .verify_document_suggestion_effect_guarded(&observer(source)?, packet, &owned.effect)?
    else {
        return Err("repeated effect proof".into());
    };
    assert!(!source.adopt_suggestion_history_guarded(&repeated, packet, owned)?);
    Ok(())
}
fn configure_policy(source: &mut RichReplica, scope: u8, natural: bool) -> Result {
    if scope == 1 {
        source.enable_general_ranges_guarded(&observer(source)?)?;
    }
    if scope == 2 {
        source.enable_document_selection_guarded(&observer(source)?)?;
    }
    if natural {
        source.enable_typing_history_guarded(&observer(source)?)?;
    }
    Ok(())
}
#[test]
fn revised_child_accept_has_once_only_owned_history_under_all_six_recovered_policies() -> Result {
    use breditor_collab_feasibility::rich_replica::ReviewedHistoryIdentity;
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
                    binding: descriptor.binding.clone(),
                    principal: ReviewPrincipalId::try_new("alice")?,
                    effect_writer: descriptor.effect_writer,
                },
            )?;
            let previous = proposal(&source, "alice", "Original", vec![insert("p", "Old ")])?;
            let chain_origin = publish(&mut room, "alice", &previous)?.publication.suggestion.id;
            let input = revision_request(
                &room,
                &source,
                &previous,
                revision(&source, &previous, "Child", "Revised ")?,
            )?;
            let stored = revised(&mut room, &input)?;
            let child =
                source.document_suggestion_revision_packet(&previous, &input.revision_packet)?;
            let mut final_commands = rich_commands();
            final_commands.push(insert("p", "Final "));
            let second = revision_request(
                &room,
                &source,
                &child,
                revision_commands(&source, &child, "Third", final_commands)?,
            )?;
            let last = revised(&mut room, &second)?;
            assert_eq!(last.root_suggestion_id, chain_origin);
            assert_eq!(stored.root_suggestion_id, chain_origin);
            let leaf =
                source.document_suggestion_revision_packet(&child, &second.revision_packet)?;
            let before = source.document_json().to_owned();
            let breditor_collab_feasibility::rich_replica::DocumentSuggestionPreparation::Ready(
                preview,
            ) = source.prepare_document_suggestion_guarded(&observer(&source)?, &leaf)?
            else {
                return Err("rich child preview".into());
            };
            let expected = preview.document_json().to_owned();
            room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Review))?;
            let choice =
                request(&room, &last.publication.suggestion.id, SuggestionDecision::Accept)?;
            let DocumentSuggestionDecisionAdmission::Durable(accepted) =
                room.accept_document_suggestion_owned("alice", &registration.lease, &choice)?
            else {
                return Err("accepted child".into());
            };
            source.receive_frame(&room.catchup("alice")?)?;
            adopt_child_once(
                &mut source,
                &leaf,
                &accepted,
                &descriptor.binding,
                &registration.lease.writer,
            )?;
            assert_eq!(text(&source, "p")?, "Final a🙂b");
            assert_eq!(source.document_json(), expected);
            let mut restored = profile.restore_reviewed("room", &source.reviewed_checkpoint()?)?;
            for redo in [false, true] {
                if redo {
                    source.redo()?;
                    restored.redo()?;
                } else {
                    source.undo()?;
                    restored.undo()?;
                }
                assert_eq!(source.document_json(), if redo { &expected } else { &before });
                assert_eq!(source.reviewed_checkpoint()?, restored.reviewed_checkpoint()?);
            }
            let exact = fs::read(&files.path)?;
            let SuggestionRevisionAdmission::Durable(duplicate) =
                room.revise_document_suggestion("alice", &input)?
            else {
                return Err("original revision retry".into());
            };
            assert!(duplicate.duplicate);
            assert_eq!(duplicate.revision, stored);
            assert_eq!(fs::read(&files.path)?, exact);
            drop(room);
            let (room, _) = Room::open(&files.path)?;
            assert_eq!(room.document_suggestion_revision("alice", &last.revision.id)?, Some(last));
        }
    }
    Ok(())
}

#[test]
fn a_revision_pair_can_cross_an_old_v1_page_boundary_without_leaking_future_decisions() -> Result {
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    room.enable_document_suggestions("owner")?;
    room.enable_document_suggestion_revisions("owner")?;
    let (_, source) = author(&profile, &mut room, "alice")?;
    let previous = proposal(&source, "alice", "Original", vec![insert("p", "Old ")])?;
    publish(&mut room, "alice", &previous)?;
    for n in 0..62 {
        publish(
            &mut room,
            "alice",
            &proposal(&source, "alice", &format!("Unrelated {n}"), vec![insert("p", "Other ")])?,
        )?;
    }
    let input = revision_request(
        &room,
        &source,
        &previous,
        revision(&source, &previous, "Child", "New ")?,
    )?;
    let stored = revised(&mut room, &input)?;
    let page = room.document_suggestions_page("alice", None)?;
    assert_eq!(page.updates.len(), 64);
    assert!(page.more);
    assert!(
        matches!(page.updates.last(),Some(SuggestionUpdate::Decided(decision)) if decision==&stored.previous_decision)
    );
    let child_reject =
        request(&room, &stored.publication.suggestion.id, SuggestionDecision::Reject)?;
    decide(&mut room, "owner", &child_reject)?;
    let tail = room.document_suggestions_page("alice", Some(&page.cursor))?;
    assert_eq!(tail.cursor.through, page.cursor.through);
    assert!(!tail.more);
    assert_eq!(tail.updates.len(), 1);
    assert!(
        matches!(&tail.updates[0],SuggestionUpdate::Published(publication) if publication==&stored.publication)
    );
    let exact = fs::read(&files.path)?;
    room.grant_document_suggestions("owner", "alice", None)?;
    assert!(matches!(room.revise_document_suggestion("alice", &input), Err(Error::Permission)));
    assert!(room.document_suggestion_revision("alice", &stored.revision.id)?.is_some());
    assert_ne!(fs::read(&files.path)?, exact);
    Ok(())
}
