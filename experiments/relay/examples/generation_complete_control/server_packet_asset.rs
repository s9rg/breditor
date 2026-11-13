//! Publish a retained raster proposal or accept it after clients go offline.
use super::Result;
use breditor_collab_feasibility::{
    review::ReviewPrincipalId,
    rich_replica::{
        Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope,
        SharedRichProfile, actions::ReplaceImage,
    },
};
use breditor_collab_relay::{
    DocumentSuggestionAdmission, DocumentSuggestionDecisionAdmission, Room, SuggestionDecision,
    SuggestionDecisionRequest,
};

pub fn publish(
    room: &mut Room,
    profile: &SharedRichProfile,
    asset: &str,
    generation: &str,
) -> Result<String> {
    // The proposal reader does not author document operations. A distinct
    // replica identity avoids colliding with authors in the catch-up frame.
    let replica = profile.join_frame("room".into(), "901".into(), &room.catchup("owner")?)?;
    let packet = replica.capture_document_suggestion_guarded(
        &replica.observe()?,
        "Server-only raster",
        ReviewPrincipalId::try_new("owner")?,
        "1",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(vec![Command::ReplaceImage(ReplaceImage {
                block: "image-block".into(),
                asset: asset.into(),
                generation: generation.into(),
            })]),
        },
    )?;
    let DocumentSuggestionAdmission::Durable(published) =
        room.publish_document_suggestion("owner", &packet)?
    else {
        return Err("server-only raster proposal was not retained".into());
    };
    Ok(published.publication.suggestion.id)
}

pub fn accept(room: &mut Room, id: String) -> Result {
    let request = SuggestionDecisionRequest {
        binding: room.document_suggestions_descriptor("owner")?.binding,
        suggestion_id: id,
        decision: SuggestionDecision::Accept,
    };
    if !matches!(
        room.decide_document_suggestion("owner", &request)?,
        DocumentSuggestionDecisionAdmission::Durable(_)
    ) {
        return Err("server-only raster replacement was not accepted".into());
    }
    Ok(())
}
