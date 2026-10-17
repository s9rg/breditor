//! Rehashed hostile packets exercise source validation beyond merely checking a digest.
use super::{
    DocumentSuggestionDraft, DocumentSuggestionScope,
    packet::{Packet, digest},
};
use crate::rich_replica::{
    Command, ReviewAnchorTarget, RichReplica, SharedRichProfile, actions::InsertText,
    selection::Selection,
};
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
#[path = "selective_effect_tests.rs"]
mod selective_effect_tests;
fn owner() -> Result<RichReplica> {
    let profile = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/suggestion-packets","version":1},"extensions":[]}"#,
    )?;
    let root: Value = serde_json::from_str(include_str!(
        "../../../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    Ok(profile.create(&json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/suggestion-packets","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string(), "101".into())?)
}
fn packet(owner: &RichReplica) -> Result<Packet> {
    Ok(serde_json::from_str(&owner.capture_document_suggestion_guarded(
        &owner.observe()?,
        "Review",
        ReviewPrincipalId::try_new("alice")?,
        "0",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: super::DocumentSuggestionEdit::Commands(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 0,
                text: "New ".into(),
            })]),
        },
    )?)?)
}
fn encode(mut packet: Packet) -> Result<String> {
    packet.id = digest(&packet.data)?;
    Ok(serde_json::to_string(&packet)?)
}
#[test]
fn valid_digest_cannot_authorize_invalid_original_coordinates() -> Result {
    let owner = owner()?;
    let exact = owner.checkpoint()?;
    let mut packet = packet(&owner)?;
    let super::DocumentSuggestionEdit::Commands(commands) = &mut packet.data.draft.edit else {
        return Err("expected commands".into());
    };
    let Command::InsertText(command) = &mut commands[0] else {
        return Err("expected insertion".into());
    };
    command.offset = 2;
    let input = encode(packet)?;
    owner.read_document_suggestion(&input)?; // Descriptive admission deliberately is not native proof.
    assert!(owner.verify_document_suggestion_source(&input).is_err());
    assert!(owner.prepare_document_suggestion_guarded(&owner.observe()?, &input).is_err());
    assert_eq!(owner.checkpoint()?, exact);
    Ok(())
}
#[test]
fn valid_digest_cannot_weaken_the_required_source_scope_or_binding() -> Result {
    let owner = owner()?;
    let exact = owner.checkpoint()?;
    let mut scoped = packet(&owner)?;
    scoped.data.source_anchor_json = owner.capture_review_anchor_guarded(
        &owner.observe()?,
        &ReviewAnchorTarget::Selection(Selection::Node { block: "image-block".into() }),
    )?;
    assert!(owner.read_document_suggestion(&encode(scoped)?).is_err());
    let mut foreign = packet(&owner)?;
    let mut source: Value = serde_json::from_str(&foreign.data.source_anchor_json)?;
    source["modelVersion"] = json!(999);
    foreign.data.source_anchor_json = source.to_string();
    assert!(owner.read_document_suggestion(&encode(foreign)?).is_err());
    assert_eq!(owner.checkpoint()?, exact);
    Ok(())
}
#[test]
fn closed_envelopes_reject_unknown_fields_even_when_the_known_payload_digest_is_valid() -> Result {
    let owner = owner()?;
    let packet = packet(&owner)?;
    let mut value = serde_json::to_value(&packet)?;
    value["data"]["accepted"] = json!(true);
    assert!(owner.read_document_suggestion(&value.to_string()).is_err());
    let mut value = serde_json::to_value(&packet)?;
    value["credential"] = json!("not authority");
    assert!(owner.read_document_suggestion(&value.to_string()).is_err());
    Ok(())
}
