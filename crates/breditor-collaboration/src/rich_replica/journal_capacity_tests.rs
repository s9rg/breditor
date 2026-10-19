//! Real native journal exhaustion, independent of a future segmented history format.
use super::{Command, RichReplica, SharedRichProfile, actions::InsertText};
use crate::Error;
use serde_json::json;

type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn owner() -> Result<(SharedRichProfile, RichReplica)> {
    let profile = SharedRichProfile::from_configuration_json(
        &json!({"format":"breditor/shared-rich-profile","formatVersion":1,
            "schema":{"name":"example/journal-capacity","version":1},"extensions":[]})
        .to_string(),
    )?;
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/journal-capacity","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),
        "root":{"kind":"element","type":"breditor/document","entityId":null,
            "properties":{"breditor/document-id":"room"},"children":[{
                "kind":"element","type":"breditor/paragraph","entityId":null,
                "properties":{"breditor/block-id":"p"},"children":[{
                    "kind":"text","text":"seed","formats":[]}]}]}})
    .to_string();
    let live = profile.create(&document, "101".into())?;
    Ok((profile, live))
}

#[test]
fn real_legacy_journal_refuses_entry_1001_without_losing_saved_redo() -> Result {
    let (profile, mut live) = owner()?;
    live.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "X".into(),
    })])?;
    assert!(live.undo()?);
    for _ in 0..499 {
        assert!(live.redo()?);
        assert!(live.undo()?);
    }
    assert_eq!(live.journal.entries.len(), 1000);
    assert_eq!(live.undo_count(), 0);
    assert_eq!(live.redo_count(), 1);
    let before = live.checkpoint()?;
    let document = live.document_json().to_owned();
    assert!(matches!(live.redo(), Err(Error::Limit("rich journal entries"))));
    assert_eq!(live.checkpoint()?, before);
    assert_eq!(live.document_json(), document);
    let restored = profile.restore("room", &before)?;
    assert_eq!(restored.checkpoint()?, before);
    assert_eq!(restored.undo_count(), 0);
    assert_eq!(restored.redo_count(), 1);
    Ok(())
}
