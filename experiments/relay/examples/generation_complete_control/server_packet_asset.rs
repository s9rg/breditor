//! A published proposal references a raster which never enters any client's document.
use super::Result;
use breditor_collab_feasibility::{
    review::ReviewPrincipalId,
    rich_replica::{
        Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope,
        SharedRichProfile, actions::ReplaceImage,
    },
};
use breditor_collab_relay::{DocumentSuggestionAdmission, Room};

pub fn publish(room: &mut Room, profile: &SharedRichProfile, asset: &str) -> Result {
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
                generation: "server-packet-only".into(),
            })]),
        },
    )?;
    if !matches!(
        room.publish_document_suggestion("owner", &packet)?,
        DocumentSuggestionAdmission::Durable(_)
    ) {
        return Err("server-only raster proposal was not retained".into());
    }
    Ok(())
}
