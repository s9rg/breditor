//! A complete but uncommitted prepare remains inert across archival replay and exact retry.
use super::*;
use crate::{
    Role, SuggestionRevisionAdmission, SuggestionRevisionRequest, SuggestionRole, log::Event,
};
use breditor_collab_feasibility::{
    review::ReviewPrincipalId,
    rich_replica::{
        Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope,
        actions::InsertText,
    },
};

fn draft(text: &str) -> DocumentSuggestionDraft {
    DocumentSuggestionDraft {
        scope: DocumentSuggestionScope::Commands,
        edit: DocumentSuggestionEdit::Commands(vec![Command::InsertText(InsertText {
            block: "p".into(),
            offset: 0,
            text: text.into(),
        })]),
    }
}

#[test]
fn an_orphan_prepare_is_preserved_but_never_promoted_to_a_final_revision_by_restore() -> TestResult
{
    let directory = Directory::new()?;
    let (profile, mut source) = start(&directory, 3, true, true)?;
    source.enable_document_suggestions("owner")?;
    source.enable_document_suggestion_revisions("owner")?;
    source.grant("owner", "alice", Some(Role::Editor))?;
    source.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Propose))?;
    let registration = source.register("alice")?;
    let client =
        profile.join_frame("room".into(), registration.lease.writer, &source.catchup("alice")?)?;
    let previous = client.capture_document_suggestion_guarded(
        &client.observe()?,
        "Original",
        ReviewPrincipalId::try_new("alice")?,
        "1",
        draft("Before "),
    )?;
    source.publish_document_suggestion("alice", &previous)?;
    let packet = client.capture_document_suggestion_revision_guarded(
        &client.observe()?,
        &previous,
        "After",
        "2",
        draft("After "),
    )?;
    let request = SuggestionRevisionRequest {
        binding: source.document_suggestion_revisions_descriptor("alice")?.binding,
        previous_suggestion_id: client.read_document_suggestion(&previous)?.id,
        revision_packet: packet,
    };
    source.log.append(Event::PrepareDocumentSuggestionRevisionV1 {
        principal: "alice".into(),
        request: request.clone(),
    })?;
    let original = fs::read(directory.path("source.log"))?;
    let identity = source.backup_identity()?;
    drop(source);
    let (mut source, recovery) = Room::open(&directory.path("source.log"))?;
    assert_eq!(recovery.truncated_bytes, 0);
    let before = source.document_suggestions_page("alice", None)?;
    let archive = source.export_backup()?;
    let count = archive.info().records;
    drop(source);
    let mut restored = Room::restore_backup(
        &directory.path("target.log"),
        &archive,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert_eq!(fs::read(directory.path("target.log"))?, original);
    assert_eq!(restored.document_suggestions_page("alice", None)?, before);
    assert!(restored.document_suggestion_revisions_page("alice", None)?.revisions.is_empty());
    assert!(
        restored
            .document_suggestion("alice", &request.previous_suggestion_id)?
            .ok_or("previous")?
            .decision
            .is_none()
    );
    let SuggestionRevisionAdmission::Durable(receipt) =
        restored.revise_document_suggestion("alice", &request)?
    else {
        return Err("retry".into());
    };
    assert!(!receipt.duplicate);
    assert_eq!(restored.export_backup()?.info().records, count + 2);
    let after = restored.document_suggestions_page("alice", None)?;
    drop(restored);
    let (room, recovery) = Room::open(&directory.path("target.log"))?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(room.document_suggestions_page("alice", None)?, after);
    Ok(())
}
