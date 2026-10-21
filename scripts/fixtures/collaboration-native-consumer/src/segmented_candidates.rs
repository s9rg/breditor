//! Bare public Rust imports: exact unpublished candidates, family refusals and future native history.
use breditor_collaboration::rich_replica::{
    Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionPreparation,
    DocumentSuggestionScope, RichReplica, SharedRichProfile, WriterGroupPreparation,
    actions::InsertText,
};

pub fn verify(
    profile: &SharedRichProfile,
    mut owner: RichReplica,
) -> Result<(), Box<dyn std::error::Error>> {
    let packet = owner.capture_document_suggestion_guarded(
        &owner.observe()?,
        "Native generation acceptance",
        serde_json::from_str("\"alice\"")?,
        "0",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 0,
                text: "Accepted ".into(),
            })]),
        },
    )?;
    owner.enable_segmented_history_guarded(&owner.observe()?, "root".into(), "one".into())?;
    let before = owner.segmented_checkpoint()?;
    let DocumentSuggestionPreparation::Ready(preview) =
        owner.prepare_document_suggestion_guarded(&owner.observe()?, &packet)?
    else {
        return Err("native preview".into());
    };
    let prepared = owner.prepare_document_suggestion_effect(&preview)?;
    assert!(prepared.checkpoint().is_err());
    let saved = prepared.segmented_checkpoint()?;
    assert_eq!(profile.restore_segmented("native-room", &saved)?.segmented_checkpoint()?, saved);
    assert_eq!(owner.segmented_checkpoint()?, before);
    owner.commit_document_suggestion_effect(prepared)?;
    assert_eq!(owner.segmented_checkpoint()?, saved);
    owner.seal_history_segment_guarded(&owner.observe()?, "two".into())?;
    let mut peer =
        profile.join_frame("native-room".into(), "303".into(), &owner.update_frame()?)?;
    peer.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Other author ".into(),
    })])?;
    let frames: serde_json::Value =
        serde_json::from_str(&peer.writer_groups_v2_guarded(&peer.observe()?, "0")?)?;
    let frame = frames["groups"][0].as_str().ok_or("native group")?;
    let before = owner.segmented_checkpoint()?;
    let WriterGroupPreparation::Prepared(prepared) = owner.prepare_writer_group_v2("303", frame)?
    else {
        return Err("native writer preparation".into());
    };
    assert!(prepared.checkpoint().is_err());
    let saved = prepared.segmented_checkpoint()?;
    assert_eq!(owner.segmented_checkpoint()?, before);
    let expected = prepared.receipt().clone();
    assert_eq!(owner.commit_writer_group(*prepared)?, expected);
    assert_eq!(owner.segmented_checkpoint()?, saved);
    let mut restored = profile.restore_segmented("native-room", &saved)?;
    for redo in [false, true] {
        assert!(if redo { owner.redo()? } else { owner.undo()? });
        assert!(if redo { restored.redo()? } else { restored.undo()? });
        assert_eq!(owner.segmented_checkpoint()?, restored.segmented_checkpoint()?);
        assert!(owner.document_json().contains("Other author "));
    }
    println!("Independent native staged-generation candidate contracts passed");
    Ok(())
}
