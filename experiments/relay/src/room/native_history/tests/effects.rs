use super::*;
use crate::{
    DocumentSuggestionAdmission, DocumentSuggestionDecisionAdmission, RoomBackup,
    RoomRecoveryPolicy, SuggestionDecision, SuggestionDecisionRequest, SuggestionRole,
};
use breditor_collab_feasibility::rich_replica::{
    DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope,
};

fn accept(
    room: &mut Room,
    profile: &SharedRichProfile,
    ordinal: u32,
) -> TestResult<SuggestionDecisionRequest> {
    let source = profile.join_frame("room".into(), "900".into(), &room.catchup("alice")?)?;
    let packet = source.capture_document_suggestion_guarded(
        &source.observe()?,
        &format!("Proposal {ordinal}"),
        ReviewPrincipalId::try_new("alice")?,
        "0",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 0,
                text: format!("accepted-{ordinal} "),
            })]),
        },
    )?;
    let DocumentSuggestionAdmission::Durable(published) =
        room.publish_document_suggestion("alice", &packet)?
    else {
        return Err("expected native publication".into());
    };
    let request = SuggestionDecisionRequest {
        binding: room.document_suggestions_descriptor("owner")?.binding,
        suggestion_id: published.publication.suggestion.id,
        decision: SuggestionDecision::Accept,
    };
    assert!(matches!(
        room.decide_document_suggestion("owner", &request)?,
        DocumentSuggestionDecisionAdmission::Durable(_)
    ));
    Ok(request)
}

#[test]
fn all_ten_effect_lifecycles_keep_accepted_history_across_native_boundaries_and_cold_backup()
-> TestResult {
    let mut cases = 0;
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for enable_effect_first in [false, true] {
            let files = Files::new()?;
            let (profile, mut room) = start(&files, version, standard, true)?;
            room.grant("owner", "alice", Some(Role::Editor))?;
            if enable_effect_first {
                room.enable_document_suggestions("owner")?;
                room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Propose))?;
                accept(&mut room, &profile, 0)?;
            }
            let before = room
                .suggestions
                .as_ref()
                .map(|state| state.effect_owner.document_checkpoint())
                .transpose()?;
            enable(&mut room, Lane::Document)?;
            if !enable_effect_first {
                room.enable_document_suggestions("owner")?;
                room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Propose))?;
            }
            let owner = &room.suggestions.as_ref().ok_or("effects")?.effect_owner;
            assert!(owner.segmented_history_enabled());
            if let Some(before) = before {
                let saved: Value = serde_json::from_str(&owner.segmented_checkpoint()?)?;
                assert_eq!(saved["rootCheckpoint"], before);
                assert_eq!(owner.undo_count(), 1);
            }
            accept(&mut room, &profile, 1)?;
            seal(&mut room, Lane::Document, "second")?;
            let request = accept(&mut room, &profile, 2)?;
            seal(&mut room, Lane::Document, "third")?;
            let effect =
                room.suggestions.as_ref().ok_or("effects")?.effect_owner.segmented_checkpoint()?;
            let effect_undo = room.suggestions.as_ref().ok_or("effects")?.effect_owner.undo_count();
            let receiver = room.native_history_checkpoint("owner", Lane::Document)?;
            let native = room.replica.document_json().to_owned();
            let archive = room.export_backup()?;
            let identity = room.backup_identity()?;
            drop(room);
            let archive = RoomBackup::from_bytes(&archive.to_bytes())?;
            let mut room = Room::restore_backup(
                &files.path("restored.log"),
                &archive,
                &identity,
                RoomRecoveryPolicy::HostReacquired,
            )?;
            assert_eq!(
                room.suggestions.as_ref().ok_or("effects")?.effect_owner.segmented_checkpoint()?,
                effect
            );
            assert_eq!(
                room.suggestions.as_ref().ok_or("effects")?.effect_owner.undo_count(),
                effect_undo
            );
            assert_eq!(room.native_history_checkpoint("owner", Lane::Document)?, receiver);
            assert_eq!(room.replica.document_json(), native);
            let bytes = fs::read(files.path("restored.log"))?;
            let DocumentSuggestionDecisionAdmission::Durable(retry) =
                room.decide_document_suggestion("owner", &request)?
            else {
                return Err("expected duplicate decision".into());
            };
            assert!(retry.duplicate);
            assert_eq!(fs::read(files.path("restored.log"))?, bytes);
            assert_eq!(
                room.suggestions.as_ref().ok_or("effects")?.effect_owner.segmented_checkpoint()?,
                effect
            );
            accept(&mut room, &profile, 3)?;
            assert!(room.replica.document_json().contains("accepted-3 "));
            cases += 1;
        }
    }
    assert_eq!(cases, 10);
    Ok(())
}
