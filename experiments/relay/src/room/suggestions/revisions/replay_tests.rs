//! Real log records, OS write errors, torn tails and hostile-but-checksummed replay.
use super::*;
use crate::SuggestionRevisionRequest;
fn input(
    room: &mut Room,
    choice: &SuggestionDecisionRequest,
) -> TestResult<SuggestionRevisionRequest> {
    let descriptor = room.enable_document_suggestion_revisions("owner")?;
    let previous =
        room.document_suggestion_packet("alice", &choice.suggestion_id)?.ok_or("parent")?;
    let source = room.profile.join_frame("room".into(), "901".into(), &room.catchup("alice")?)?;
    let packet = source.capture_document_suggestion_revision_guarded(
        &source.observe()?,
        &previous,
        "Replacement",
        "1",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 0,
                text: "New intent ".into(),
            })]),
        },
    )?;
    Ok(SuggestionRevisionRequest {
        binding: descriptor.binding,
        previous_suggestion_id: choice.suggestion_id.clone(),
        revision_packet: packet,
    })
}
fn revision_id(room: &Room, request: &SuggestionRevisionRequest) -> TestResult<String> {
    let previous = room
        .document_suggestion_packet("alice", &request.previous_suggestion_id)?
        .ok_or("parent")?;
    Ok(room.replica.read_document_suggestion_revision(&previous, &request.revision_packet)?.id)
}
fn prepare_event(request: &SuggestionRevisionRequest) -> Event {
    Event::PrepareDocumentSuggestionRevisionV1 {
        principal: "alice".into(),
        request: request.clone(),
    }
}
fn parent_pending(room: &Room, request: &SuggestionRevisionRequest) -> TestResult {
    assert!(
        room.document_suggestion("alice", &request.previous_suggestion_id)?
            .ok_or("parent")?
            .decision
            .is_none()
    );
    assert_eq!(room.document_suggestions_page("alice", None)?.updates.len(), 1);
    assert!(
        room.document_suggestion_successor("alice", &request.previous_suggestion_id)?.is_none()
    );
    Ok(())
}
#[test]
fn revision_capacity_refusal_leaves_last_original_record_available() -> TestResult {
    let files = Files::new()?;
    let (mut room, choice) = start(&files)?;
    let request = input(&mut room, &choice)?;
    let (first, _) = room.log.snapshot_cut()?;
    fill_with_grants(&mut room, first..4095)?;
    let before = fs::read(&files.path)?;

    assert!(matches!(
        room.revise_document_suggestion("alice", &request),
        Err(Error::Contract("log record budget"))
    ));
    assert!(fs::read(&files.path)? == before, "Capacity refusal changed the original log");
    parent_pending(&room, &request)?;
    room.grant("owner", "last-reader", Some(Role::Reader))?;
    assert_eq!(room.log.snapshot_cut()?.0, 4096);
    drop(room);
    let (room, _) = Room::open(&files.path)?;
    parent_pending(&room, &request)?;
    Ok(())
}

#[test]
fn revision_capacity_refusal_leaves_last_generation_record_available() -> TestResult {
    let files = Files::new()?;
    let options = ServerLogGenerationOptions { root: "root".into(), active: "first".into() };
    let (mut room, choice) = start_with_storage(&files, Some(&options))?;
    let request = input(&mut room, &choice)?;
    for index in 0..62 {
        room.grant("owner", "rotation-reader", Some(Role::Reader))?;
        room.rotate_log_generation("owner", &format!("revision-{index}"))?;
    }
    fill_with_grants(&mut room, 0..4095)?;
    let before = room.export_log_generation_backup("owner")?.info();

    assert!(matches!(
        room.revise_document_suggestion("alice", &request),
        Err(Error::Contract("physical rotation generation or capacity"))
    ));
    assert_eq!(room.export_log_generation_backup("owner")?.info(), before);
    parent_pending(&room, &request)?;
    room.grant("owner", "last-reader", Some(Role::Reader))?;
    let after = room.log_generation_descriptor("owner")?;
    assert_eq!(after.sealed, 62);
    assert_eq!(after.active, "revision-61");
    drop(room);
    let (room, _) = Room::open_log_generations(&files.path)?;
    assert_eq!(room.log_generation_descriptor("owner")?, after);
    parent_pending(&room, &request)?;
    Ok(())
}

fn fill_with_grants(room: &mut Room, slots: std::ops::Range<u64>) -> TestResult {
    for index in slots {
        room.grant(
            "owner",
            "reader",
            Some(if index % 2 == 0 { Role::Reader } else { Role::Editor }),
        )?;
    }
    Ok(())
}

#[test]
fn complete_uncommitted_preparation_is_inert_and_a_later_retry_can_commit() -> TestResult {
    let files = Files::new()?;
    let (mut room, choice) = start(&files)?;
    let request = input(&mut room, &choice)?;
    let frame = room.replica.update_frame()?;
    room.log.append(prepare_event(&request))?;
    parent_pending(&room, &request)?;
    drop(room);
    let (mut room, recovery) = Room::open(&files.path)?;
    assert_eq!(recovery.truncated_bytes, 0);
    parent_pending(&room, &request)?;
    assert_eq!(room.replica.update_frame()?, frame);
    // A different following record abandons the inert preparation rather than publishing it.
    room.grant("owner", "reader", Some(Role::Reader))?;
    assert!(matches!(
        room.revise_document_suggestion("alice", &request)?,
        SuggestionRevisionAdmission::Durable(_)
    ));
    drop(room);
    Room::open(&files.path)?;
    Ok(())
}
#[test]
fn a_real_second_record_write_error_fences_without_exposing_half_a_revision() -> TestResult {
    let files = Files::new()?;
    let (mut room, choice) = start(&files)?;
    let request = input(&mut room, &choice)?;
    let frame = room.replica.update_frame()?;
    room.log.use_read_only_after_next_append_for_test(&files.path);
    assert!(matches!(room.revise_document_suggestion("alice", &request), Err(Error::Io(_))));
    assert!(matches!(
        room.document_suggestion("alice", &request.previous_suggestion_id),
        Err(Error::NeedsRecovery)
    ));
    assert_eq!(room.replica.update_frame()?, frame);
    assert!(
        room.suggestions.as_ref().ok_or("state")?.proposals[&request.previous_suggestion_id]
            .decision
            .is_none()
    );
    drop(room);
    let (mut room, recovery) = Room::open(&files.path)?;
    assert_eq!(recovery.truncated_bytes, 0);
    parent_pending(&room, &request)?;
    assert!(matches!(
        room.revise_document_suggestion("alice", &request)?,
        SuggestionRevisionAdmission::Durable(_)
    ));
    Ok(())
}
#[test]
fn fully_synced_commit_recovers_both_outcomes_even_if_the_process_never_published_memory()
-> TestResult {
    let files = Files::new()?;
    let (mut room, choice) = start(&files)?;
    let request = input(&mut room, &choice)?;
    let id = revision_id(&room, &request)?;
    let frame = room.replica.update_frame()?;
    let first = room.log.append(prepare_event(&request))?;
    room.log.append(Event::CommitDocumentSuggestionRevisionV1 {
        prepared_at: first.to_string(),
        revision_id: id.clone(),
    })?;
    parent_pending(&room, &request)?;
    drop(room);
    let (mut room, _) = Room::open(&files.path)?;
    let receipt = room.document_suggestion_revision("alice", &id)?.ok_or("committed revision")?;
    assert_eq!(receipt.previous_decision.decision, SuggestionDecision::Reject);
    assert_eq!(receipt.previous_decision.sequence, first.to_string());
    assert_eq!(receipt.publication.sequence, (first + 1).to_string());
    assert_eq!(room.replica.update_frame()?, frame);
    let before = fs::read(&files.path)?;
    let SuggestionRevisionAdmission::Durable(retry) =
        room.revise_document_suggestion("alice", &request)?
    else {
        return Err("duplicate".into());
    };
    assert!(retry.duplicate);
    assert_eq!(retry.revision, receipt);
    assert_eq!(fs::read(&files.path)?, before);
    Ok(())
}
#[test]
fn torn_commit_headers_and_payloads_leave_the_old_proposal_pending_after_validated_recovery()
-> TestResult {
    for partial_header in [true, false] {
        let files = Files::new()?;
        let (mut room, choice) = start(&files)?;
        let request = input(&mut room, &choice)?;
        let frame = room.replica.update_frame()?;
        room.revise_document_suggestion("alice", &request)?;
        drop(room);
        let bytes = fs::read(&files.path)?;
        let mut offset = 0_usize;
        let mut last = 0_usize;
        while offset < bytes.len() {
            last = offset;
            let size = usize::try_from(u64::from_be_bytes(bytes[offset..offset + 8].try_into()?))?;
            offset += 72 + size;
        }
        let cut = if partial_header { last + 31 } else { bytes.len() - 1 };
        fs::OpenOptions::new().write(true).open(&files.path)?.set_len(u64::try_from(cut)?)?;
        let (mut room, recovery) = Room::open(&files.path)?;
        assert!(recovery.truncated_bytes > 0);
        parent_pending(&room, &request)?;
        assert_eq!(room.replica.update_frame()?, frame);
        assert!(matches!(
            room.revise_document_suggestion("alice", &request)?,
            SuggestionRevisionAdmission::Durable(_)
        ));
    }
    Ok(())
}
#[test]
fn wrong_commit_identity_order_or_original_author_rejects_before_any_tail_repair() -> TestResult {
    for variant in 0..5 {
        let files = Files::new()?;
        let (mut room, choice) = start(&files)?;
        let request = input(&mut room, &choice)?;
        let id = revision_id(&room, &request)?;
        if variant == 4 {
            room.log.append(Event::PrepareDocumentSuggestionRevisionV1 {
                principal: "bob".into(),
                request: request.clone(),
            })?;
        } else {
            let first = if variant == 3 { 0 } else { room.log.append(prepare_event(&request))? };
            if variant == 2 {
                room.log.append(Event::Grant {
                    actor: "owner".into(),
                    principal: "reader".into(),
                    role: Some(Role::Reader),
                })?;
            }
            room.log.append(Event::CommitDocumentSuggestionRevisionV1 {
                prepared_at: if variant == 0 { "01".into() } else { first.to_string() },
                revision_id: if variant == 1 { format!("sha256:{}", "f".repeat(64)) } else { id },
            })?;
        }
        drop(room);
        fs::OpenOptions::new().append(true).open(&files.path)?.write_all(&[1, 2, 3])?;
        let exact = fs::read(&files.path)?;
        assert!(Room::open(&files.path).is_err());
        assert_eq!(fs::read(&files.path)?, exact);
    }
    Ok(())
}
