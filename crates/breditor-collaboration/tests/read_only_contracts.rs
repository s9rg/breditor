//! Read-only is live host policy, not a replicated ACL or a retired writer.
use breditor_collaboration::anchor::Affinity;
use breditor_collaboration::{
    Error,
    rich_replica::{
        Command, PendingFormatsUpdate, SelectionUpdate, SharedRichProfile, WriterGroupPreparation,
        actions::InsertText,
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup(version: u32) -> Result<(SharedRichProfile, String)> {
    let input=json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/read-only","version":1},"extensions":[]}).to_string();
    let profile = if version == 1 {
        SharedRichProfile::from_configuration_json(&input)?
    } else {
        SharedRichProfile::from_configuration_json_v2(&input)?
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/read-only","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    Ok((profile, document))
}
fn insert(block: &str, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: text.into() })
}
fn range(start: u32, end: u32) -> Selection {
    Selection::TextRange {
        anchor: TextPoint { block: "p".into(), offset: start, affinity: Affinity::After },
        focus: TextPoint { block: "p".into(), offset: end, affinity: Affinity::After },
    }
}
fn without_publication(input: &str) -> Result<Value> {
    let mut value: Value = serde_json::from_str(input)?;
    value.as_object_mut().ok_or("journal")?.remove("publication");
    Ok(value)
}
#[test]
fn both_models_reject_authoring_pending_and_history_without_changing_causal_content() -> Result {
    for version in [1, 2] {
        let (profile, document) = setup(version)?;
        let mut a = profile.create(&document, "101".into())?;
        a.apply(vec![insert("p", "X")])?;
        a.undo()?;
        let before = a.checkpoint()?;
        let causal = a.causal_version();
        let counts = (a.undo_count(), a.redo_count());
        let old = a.observe()?;
        assert!(a.set_read_only_guarded(&old, true)?);
        assert!(a.is_read_only());
        assert_eq!(a.causal_version(), causal);
        assert_eq!(without_publication(&a.checkpoint()?)?, without_publication(&before)?);
        assert!(a.check(&old).is_err());
        let locked = a.observe()?;
        let exact = a.checkpoint()?;
        for result in [
            a.apply(vec![insert("p", "Y")]),
            a.insert_plain_text(""),
            a.insert_plain_text("Y"),
            a.undo(),
            a.redo(),
            a.set_pending_formats_json("not JSON"),
            a.patch_inline_format_properties_json_guarded(&locked, "not JSON"),
            a.replace_plain_text_guarded(&locked, &range(0, 1), "Z"),
        ] {
            assert!(matches!(result, Err(Error::ReadOnly)));
        }
        assert_eq!(a.checkpoint()?, exact);
        assert_eq!((a.undo_count(), a.redo_count()), counts);
        a.check(&locked)?;
        assert!(!a.set_read_only_guarded(&locked, true)?);
        a.check(&locked)?;
        a.set_selection(Some(&range(0, 4)))?;
        assert!(a.is_read_only());
        assert_eq!(a.copy_clipboard_guarded(&a.observe()?)?.ok_or("copy")?.plain_text, "a🙂b");
        let checkpoint = a.checkpoint()?;
        let restored = profile.restore("room", &checkpoint)?;
        assert!(!restored.is_read_only());
        assert_eq!(restored.checkpoint()?, checkpoint);
    }
    Ok(())
}
#[test]
fn selection_and_incoming_writer_groups_cannot_unlock_a_view_or_reuse_a_prepared_guard() -> Result {
    for version in [1, 2] {
        let (profile, seed) = setup(version)?;
        let mut a = profile.create(&seed, "101".into())?;
        let mut b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
        a.set_read_only_guarded(&a.observe()?, true)?;
        let policy: Value = serde_json::from_str(&a.view_json()?)?;
        b.apply(vec![insert("caption", "Peer ")])?;
        let batch: Value = serde_json::from_str(&b.writer_groups_guarded(&b.observe()?, "0")?)?;
        let group = batch["groups"][0].as_str().ok_or("group")?;
        let WriterGroupPreparation::Prepared(stale) = a.prepare_writer_group("202", group)? else {
            return Err("prepared".into());
        };
        a.set_selection(Some(&range(0, 1)))?;
        let before = a.checkpoint()?;
        assert!(a.commit_writer_group(*stale).is_err());
        assert_eq!(a.checkpoint()?, before);
        assert!(a.is_read_only());
        let WriterGroupPreparation::Prepared(prepared) = a.prepare_writer_group("202", group)?
        else {
            return Err("prepared".into());
        };
        a.commit_writer_group(*prepared)?;
        assert!(a.document_json().contains("Peer "));
        assert!(a.is_read_only());
        let after: Value = serde_json::from_str(&a.view_json()?)?;
        assert_eq!(after["readOnly"], true);
        assert_eq!(after["readOnlyRevision"], policy["readOnlyRevision"]);
        assert!(a.apply(vec![insert("p", "blocked")]).is_err());
    }
    Ok(())
}
#[test]
fn lock_unlock_preserves_old_journals_and_exact_future_selective_history() -> Result {
    for version in [1, 2] {
        let (profile, seed) = setup(version)?;
        let mut a = profile.create(&seed, "101".into())?;
        let mut b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
        a.apply(vec![insert("p", "Local ")])?;
        let old = a.observe()?;
        a.set_read_only_guarded(&old, true)?;
        let frozen = a.observe()?;
        b.apply(vec![insert("caption", "Peer ")])?;
        a.receive_frame(&b.update_frame()?)?;
        assert!(a.is_read_only());
        a.set_read_only_guarded(&a.observe()?, false)?;
        assert!(!a.is_read_only());
        assert!(
            a.apply_guarded(
                &old,
                vec![insert("p", "stale")],
                SelectionUpdate::default(),
                PendingFormatsUpdate::default()
            )
            .is_err()
        );
        assert_eq!(serde_json::from_str::<Value>(frozen.view_json())?["readOnly"], true);
        let mut restored = profile.restore("room", &a.checkpoint()?)?;
        for undo in [true, false, true, false] {
            if undo {
                a.undo()?;
                restored.undo()?;
            } else {
                a.redo()?;
                restored.redo()?;
            }
            assert_eq!(a.checkpoint()?, restored.checkpoint()?);
            assert!(a.document_json().contains("Peer "));
        }
    }
    Ok(())
}
