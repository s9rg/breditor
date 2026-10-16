//! Grouping prerequisites: selective history consumes actual owned keys, not fixed call counts.
//! These lock existing explicit-mode semantics; they do not enable shared typing groups.
use breditor_collaboration::rich_replica::{
    Command, RichReplica, SharedRichProfile,
    actions::{DeleteText, InsertText},
};
use serde_json::{Value, json};

type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn peers(version: u32) -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let config = json!({"format":"breditor/shared-rich-profile","formatVersion":version,
        "schema":{"name":"example/history-visibility","version":1},"extensions":[]})
    .to_string();
    let profile = if version == 1 {
        SharedRichProfile::from_configuration_json(&config)?
    } else {
        SharedRichProfile::from_configuration_json_v2(&config)?
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/history-visibility","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root})
    .to_string();
    let a = profile.create(&document, "101".into())?;
    let b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((profile, a, b))
}
fn insert(block: &str, offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset, text: text.into() })
}
fn delete(block: &str, offset: u32, length: u32) -> Command {
    Command::DeleteText(DeleteText { block: block.into(), offset, length })
}
fn journal(owner: &RichReplica) -> Result<Value> {
    Ok(serde_json::from_str(&owner.checkpoint()?)?)
}
fn keys(owner: &RichReplica) -> Result<Vec<Value>> {
    Ok(journal(owner)?["entries"]
        .as_array()
        .ok_or("entries")?
        .iter()
        .filter_map(|entry| entry.get("history_key").cloned())
        .collect())
}
fn latest_popped(owner: &RichReplica) -> Result<Value> {
    Ok(journal(owner)?["entries"].as_array().ok_or("entries")?
        .last().ok_or("history entry")?["popped"].clone())
}

#[test]
fn invisible_latest_contribution_can_pop_an_older_visible_key_in_one_engine_call() -> Result {
    for version in [1, 2] {
        let (profile, mut a, mut b) = peers(version)?;
        a.apply(vec![insert("p", 1, "A")])?;
        a.apply(vec![insert("caption", 0, "X")])?;
        let authored = keys(&a)?;
        b.receive(a.updates()?)?;
        b.apply(vec![delete("caption", 0, 1), insert("p", 0, "Peer ")])?;
        a.receive(b.updates()?)?;
        let mut restored = profile.restore("room", &a.checkpoint()?)?;
        assert_eq!(a.undo_count(), 2);
        assert!(a.undo()?);
        assert!(restored.undo()?);
        assert_eq!(latest_popped(&a)?, json!([authored[1], authored[0]]));
        assert_eq!((a.undo_count(), a.redo_count()), (0, 1));
        assert!(a.document_json().contains("Peer "));
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        assert!(a.redo()?);
        assert!(restored.redo()?);
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        assert_eq!(a.updates()?, restored.updates()?);
        assert_eq!((a.undo_count(), a.redo_count()), (1, 0));
    }
    Ok(())
}

#[test]
fn fully_invisible_history_changes_stacks_and_publication_even_when_undo_returns_false() -> Result {
    for version in [1, 2] {
        let (profile, mut a, mut b) = peers(version)?;
        a.apply(vec![insert("p", 1, "A")])?;
        a.apply(vec![insert("caption", 0, "X")])?;
        let authored = keys(&a)?;
        b.receive(a.updates()?)?;
        b.apply(vec![delete("p", 1, 1), delete("caption", 0, 1)])?;
        a.receive(b.updates()?)?;
        let observation = a.observe()?;
        let document = a.document_json().to_owned();
        let mut restored = profile.restore("room", &a.checkpoint()?)?;
        assert!(!a.undo_guarded(&observation)?);
        assert!(!restored.undo()?);
        assert!(a.check(&observation).is_err());
        assert_eq!(latest_popped(&a)?, json!([authored[1], authored[0]]));
        assert_eq!((a.undo_count(), a.redo_count()), (0, 0));
        assert_eq!(a.document_json(), document);
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        let checkpoint = a.checkpoint()?;
        let current = a.observe()?;
        assert!(!a.redo_guarded(&current)?);
        a.check(&current)?;
        assert_eq!(a.checkpoint()?, checkpoint);
    }
    Ok(())
}

#[test]
fn fixed_undo_call_counts_would_cross_a_typing_bursts_preceding_explicit_boundary() -> Result {
    for version in [1, 2] {
        let (profile, mut a, mut b) = peers(version)?;
        a.apply(vec![insert("caption", 0, "Older ")])?;
        for (offset, text) in [(1, "A"), (2, "B"), (3, "C")] {
            a.apply(vec![insert("p", offset, text)])?;
        }
        let authored = keys(&a)?;
        b.receive(a.updates()?)?;
        b.apply(vec![delete("p", 2, 1)])?;
        a.receive(b.updates()?)?;
        let mut restored = profile.restore("room", &a.checkpoint()?)?;
        assert!(a.undo()?);
        assert!(restored.undo()?);
        assert_eq!(latest_popped(&a)?, json!([authored[3]]));
        assert!(a.undo()?);
        assert!(restored.undo()?);
        assert_eq!(latest_popped(&a)?, json!([authored[2], authored[1]]));
        assert_eq!((a.undo_count(), a.redo_count()), (1, 2));
        assert!(a.document_json().contains("Older "));
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        // A naive third call for the three original input events would undo
        // this unrelated explicit edit. Grouping must instead use popped keys.
        assert!(a.undo()?);
        assert!(restored.undo()?);
        assert_eq!(latest_popped(&a)?, json!([authored[0]]));
        assert!(!a.document_json().contains("Older "));
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    }
    Ok(())
}
