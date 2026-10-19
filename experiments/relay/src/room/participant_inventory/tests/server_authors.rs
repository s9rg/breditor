//! Accepted host-owned effects are native prefixes, never invented client registrations.
use super::*;
use crate::{
    DocumentSuggestionAdmission, DocumentSuggestionDecisionAdmission, SuggestionDecision,
    SuggestionDecisionRequest,
};
use breditor_collab_feasibility::{
    review::ReviewPrincipalId,
    rich_replica::{
        Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope,
        actions::InsertText,
    },
};

#[test]
fn accepted_suggestion_effect_is_a_server_prefix_not_a_missing_client_resume_record() -> TestResult
{
    let directory = Directory::new()?;
    let mut room = source(&directory, 3, true, true)?;
    let descriptor = room.enable_document_suggestions("owner")?;
    let client = room.profile.join_frame("room".into(), "900".into(), &room.catchup("owner")?)?;
    let packet = client.capture_document_suggestion_guarded(
        &client.observe()?,
        "Native accepted suggestion",
        ReviewPrincipalId::try_new("owner")?,
        "0",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 0,
                text: "Accepted effect ".into(),
            })]),
        },
    )?;
    let DocumentSuggestionAdmission::Durable(published) =
        room.publish_document_suggestion("owner", &packet)?
    else {
        return Err("native publication".into());
    };
    let request = SuggestionDecisionRequest {
        binding: descriptor.binding,
        suggestion_id: published.publication.suggestion.id,
        decision: SuggestionDecision::Accept,
    };
    assert!(matches!(
        room.decide_document_suggestion("owner", &request)?,
        DocumentSuggestionDecisionAdmission::Durable(_)
    ));
    let inventory = room.participant_inventory("owner")?;
    assert!(inventory.metadata.writers.is_empty());
    let effect = inventory
        .metadata
        .server_authors
        .iter()
        .find(|row| row.kind == RecoveryServerAuthorKind::SuggestionEffect)
        .ok_or("server effect")?;
    let actual = room.replica.writer_clock_v2(crate::room::suggestions::EFFECT_WRITER)?;
    assert_eq!(effect.clock.writer, actual.writer);
    assert_eq!(effect.clock.through, actual.through);
    assert_eq!(effect.clock.prefix_digest, actual.prefix_digest);
    assert_ne!(effect.clock.through, "0");
    assert!(matches!(
        inventory.verify_registrations(
            &mut room,
            "owner",
            &RecoveryRegistrationCredentials::default()
        )?,
        RecoveryRegistrationCoverage::Verified(_)
    ));
    Ok(())
}
