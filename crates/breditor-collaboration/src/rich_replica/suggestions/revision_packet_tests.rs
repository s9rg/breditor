//! A valid revision digest cannot weaken source, predecessor, author or closed-family validation.
use super::*;
use crate::rich_replica::suggestions::revision_packet::{
    Data, Revision, digest as revision_digest,
};
fn revision(previous: &str, child: String) -> Result<String> {
    let data = Data {
        format: "breditor/document-suggestion-revision".into(),
        format_version: 1,
        previous_suggestion_id: previous.into(),
        suggestion_packet_json: child,
    };
    Ok(serde_json::to_string(&Revision { id: revision_digest(&data)?, data })?)
}
#[test]
fn rehashed_relations_cannot_change_predecessor_author_or_closed_fields() -> Result {
    let owner = owner()?;
    let parent = packet(&owner)?;
    let parent_id = parent.id.clone();
    let previous = serde_json::to_string(&parent)?;
    let exact = owner.checkpoint()?;
    let mut child = packet(&owner)?;
    child.data.title = "Child".into();
    let valid = revision(&parent_id, encode(child)?)?;
    owner.read_document_suggestion_revision(&previous, &valid)?;
    let mut value: Value = serde_json::from_str(&valid)?;
    value["accepted"] = json!(true);
    assert!(owner.read_document_suggestion_revision(&previous, &value.to_string()).is_err());
    let mut unknown: Revision = serde_json::from_str(&valid)?;
    unknown.data.format_version = 2;
    unknown.id = revision_digest(&unknown.data)?;
    assert!(
        owner
            .read_document_suggestion_revision(&previous, &serde_json::to_string(&unknown)?)
            .is_err()
    );
    let mut child = packet(&owner)?;
    child.data.author = ReviewPrincipalId::try_new("bob")?;
    child.data.title = "Child".into();
    assert!(
        owner
            .read_document_suggestion_revision(&previous, &revision(&parent_id, encode(child)?)?)
            .is_err()
    );
    assert!(
        owner
            .read_document_suggestion_revision(
                &previous,
                &revision(
                    &"sha256:0".repeat(9),
                    owner.document_suggestion_revision_packet(&previous, &valid)?
                )?
            )
            .is_err()
    );
    assert_eq!(owner.checkpoint()?, exact);
    Ok(())
}
#[test]
fn a_rehashed_invalid_child_is_descriptive_metadata_but_never_a_source_proof() -> Result {
    let owner = owner()?;
    let parent = packet(&owner)?;
    let parent_id = parent.id.clone();
    let previous = serde_json::to_string(&parent)?;
    let mut child = packet(&owner)?;
    child.data.title = "Child".into();
    let super::super::DocumentSuggestionEdit::Commands(commands) = &mut child.data.draft.edit
    else {
        return Err("commands".into());
    };
    let Command::InsertText(command) = &mut commands[0] else {
        return Err("insertion".into());
    };
    command.offset = 2;
    let input = revision(&parent_id, encode(child)?)?;
    let exact = (owner.checkpoint()?, owner.update_frame()?, owner.view_json()?);
    owner.read_document_suggestion_revision(&previous, &input)?;
    assert!(owner.verify_document_suggestion_revision(&previous, &input).is_err());
    assert_eq!((owner.checkpoint()?, owner.update_frame()?, owner.view_json()?), exact);
    Ok(())
}
#[test]
fn a_valid_child_at_an_older_source_cannot_claim_forward_revision_lineage() -> Result {
    let mut owner = owner()?;
    let mut child = packet(&owner)?;
    child.data.title = "Earlier child".into();
    let child = encode(child)?;
    owner.apply(vec![Command::InsertText(InsertText {
        block: "caption".into(),
        offset: 0,
        text: "Later source ".into(),
    })])?;
    let parent = packet(&owner)?;
    let parent_id = parent.id.clone();
    let previous = serde_json::to_string(&parent)?;
    let input = revision(&parent_id, child)?;
    let exact = owner.checkpoint()?;
    owner.read_document_suggestion_revision(&previous, &input)?;
    assert!(owner.verify_document_suggestion_revision(&previous, &input).is_err());
    assert_eq!(owner.checkpoint()?, exact);
    Ok(())
}
