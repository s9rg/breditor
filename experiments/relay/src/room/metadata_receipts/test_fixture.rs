//! Test-only genuine native publication/revision factories, never receipt DTOs.
use crate::{
    DocumentSuggestionAdmission, DocumentVersionAdmission, Error, Result, Room,
    SuggestionRevisionAdmission, SuggestionRevisionRequest,
};
use breditor_collab_feasibility::{
    review::ReviewPrincipalId,
    rich_replica::{
        Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope,
        actions::InsertText,
    },
};

pub(crate) fn publish_version(room: &mut Room, name: &str) -> Result<()> {
    let source = room.profile.join_frame("room".into(), "901".into(), &room.catchup("owner")?)?;
    let packet = source.capture_document_version_guarded(
        &source.observe()?,
        name,
        ReviewPrincipalId::try_new("owner")?,
        "0",
    )?;
    if !matches!(
        room.publish_document_version("owner", &packet)?,
        DocumentVersionAdmission::Durable(_)
    ) {
        return Err(Error::Contract("expected native version publication"));
    }
    Ok(())
}

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

pub(crate) fn seed(room: &mut Room, versions: usize, commit_revision: bool) -> Result<()> {
    seed_with_request(room, versions, commit_revision)?;
    Ok(())
}

pub(crate) fn seed_with_request(
    room: &mut Room,
    versions: usize,
    commit_revision: bool,
) -> Result<Option<SuggestionRevisionRequest>> {
    room.enable_document_versions("owner")?;
    for index in 0..versions {
        publish_version(room, &format!("Version {index} 🙂 日本"))?;
    }
    if !room.atomic_transport_v2 {
        return Ok(None);
    }
    room.enable_document_suggestions("owner")?;
    let revisions = room.enable_document_suggestion_revisions("owner")?;
    let source = room.profile.join_frame("room".into(), "901".into(), &room.catchup("owner")?)?;
    let parent = source.capture_document_suggestion_guarded(
        &source.observe()?,
        "Original proposal",
        ReviewPrincipalId::try_new("owner")?,
        "0",
        draft("Proposed "),
    )?;
    let DocumentSuggestionAdmission::Durable(publication) =
        room.publish_document_suggestion("owner", &parent)?
    else {
        return Err(Error::Contract("expected native proposal"));
    };
    let packet = source.capture_document_suggestion_revision_guarded(
        &source.observe()?,
        &parent,
        "Replacement proposal",
        "1",
        draft("Revised "),
    )?;
    let request = SuggestionRevisionRequest {
        binding: revisions.binding,
        previous_suggestion_id: publication.publication.suggestion.id,
        revision_packet: packet,
    };
    if commit_revision {
        if !matches!(
            room.revise_document_suggestion("owner", &request)?,
            SuggestionRevisionAdmission::Durable(_)
        ) {
            return Err(Error::Contract("expected committed native revision"));
        }
    } else {
        room.log.append(crate::log::Event::PrepareDocumentSuggestionRevisionV1 {
            principal: "owner".into(),
            request: request.clone(),
        })?;
    }
    Ok(Some(request))
}
