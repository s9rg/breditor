//! Restricted editing in the shared owner: the native local policy admits local work by its
//! effect, while incoming peer updates are never filtered by this host's policy.
use breditor_collaboration::anchor::Affinity;
use breditor_collaboration::{
    Error,
    rich_replica::{
        Command, SharedRichProfile,
        actions::InsertText,
        selection::{Selection, TextPoint},
    },
};
use breditor_core::rich_content::{BlockId, RichRestrictedPolicy};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup(version: u32) -> Result<(SharedRichProfile, String)> {
    let input=json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/restricted","version":1},"extensions":[]}).to_string();
    let profile = if version == 1 {
        SharedRichProfile::from_configuration_json(&input)?
    } else {
        SharedRichProfile::from_configuration_json_v2(&input)?
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/restricted","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    Ok((profile, document))
}
fn insert(block: &str, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: text.into() })
}
fn caret(block: &str, offset: u32) -> Selection {
    let point = TextPoint { block: block.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: point.clone(), focus: point }
}
fn policy() -> Result<RichRestrictedPolicy> {
    Ok(RichRestrictedPolicy::try_new([BlockId::try_new("p")?])?)
}
fn without_publication(input: &str) -> Result<Value> {
    let mut value: Value = serde_json::from_str(input)?;
    value.as_object_mut().ok_or("journal")?.remove("publication");
    Ok(value)
}

#[test]
fn local_commands_mixed_groups_pending_styles_and_history_are_admitted_by_effect() -> Result {
    for version in [1, 2] {
        let (profile, document) = setup(version)?;
        let mut a = profile.create(&document, "101".into())?;
        // Authored before the policy: a protected caption change in own history.
        a.apply(vec![insert("caption", "Old ")])?;
        let before = a.checkpoint()?;
        assert!(a.set_restricted_editing_guarded(&a.observe()?, Some(policy()?))?);
        assert!(!a.set_restricted_editing_guarded(&a.observe()?, Some(policy()?))?);
        assert_eq!(without_publication(&a.checkpoint()?)?, without_publication(&before)?);
        a.apply(vec![insert("p", "Ok ")])?;
        assert!(a.document_json().contains("Ok "));
        let exact = a.checkpoint()?;
        for result in [
            a.apply(vec![insert("caption", "No ")]),
            a.apply(vec![insert("p", "Mixed "), insert("caption", "Mixed ")]),
        ] {
            assert!(matches!(result, Err(Error::Restricted)), "{result:?}");
        }
        assert_eq!(a.checkpoint()?, exact);
        // Undo of the allowed edit works; undo of the protected one is refused whole.
        assert!(a.undo()?);
        let exact = a.checkpoint()?;
        assert!(matches!(a.undo(), Err(Error::Restricted)));
        assert_eq!(a.checkpoint()?, exact);
        // Pending styles follow the caret's region.
        a.set_selection(Some(&caret("p", 1)))?;
        assert!(a.restricted_selection_editable()?);
        a.set_pending_formats(Some(&[]))?;
        a.set_selection(Some(&caret("caption", 1)))?;
        assert!(!a.restricted_selection_editable()?);
        let exact = a.checkpoint()?;
        assert!(matches!(a.set_pending_formats(Some(&[])), Err(Error::Restricted)));
        assert_eq!(a.checkpoint()?, exact);
        // The policy is host state: never in a checkpoint, cleared explicitly.
        let restored = profile.restore("room", &a.checkpoint()?)?;
        assert!(restored.restricted_policy().is_none());
        assert!(a.set_restricted_editing_guarded(&a.observe()?, None)?);
        assert!(a.undo()?);
        assert!(!a.document_json().contains("Old "));
    }
    Ok(())
}

#[test]
fn incoming_peer_changes_to_protected_content_are_not_filtered_locally() -> Result {
    for version in [1, 2] {
        let (profile, seed) = setup(version)?;
        let mut a = profile.create(&seed, "101".into())?;
        let mut b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
        a.set_restricted_editing_guarded(&a.observe()?, Some(policy()?))?;
        b.apply(vec![insert("caption", "Peer ")])?;
        a.receive_frame(&b.update_frame()?)?;
        assert!(a.document_json().contains("Peer "));
        assert!(a.restricted_policy().is_some());
        // Local authoring stays restricted after the remote change.
        assert!(matches!(a.apply(vec![insert("caption", "Me ")]), Err(Error::Restricted)));
        a.apply(vec![insert("p", "Me ")])?;
        b.receive_frame(&a.update_frame()?)?;
        assert!(b.document_json().contains("Me "));
    }
    Ok(())
}

#[test]
fn json_policy_and_view_field_are_additive() -> Result {
    let (profile, document) = setup(2)?;
    let mut a = profile.create(&document, "101".into())?;
    let plain: Value = serde_json::from_str(&a.view_json()?)?;
    assert!(plain.get("restricted").is_none());
    for bad in ["{}", "[]", r#"{"format":"x","formatVersion":1,"editable":[]}"#] {
        assert!(a.set_restricted_editing_json_guarded(&a.observe()?, bad).is_err(), "{bad}");
    }
    let input = json!({"format":"breditor/rich-restricted-policy","formatVersion":1,"editable":["p","missing"]}).to_string();
    assert!(a.set_restricted_editing_json_guarded(&a.observe()?, &input)?);
    a.set_selection(Some(&caret("p", 1)))?;
    let view: Value = serde_json::from_str(&a.view_json()?)?;
    assert_eq!(view["restricted"], json!({"editable":["p"],"selectionEditable":true}));
    assert!(view["readOnlyRevision"].is_string());
    assert!(a.set_restricted_editing_json_guarded(&a.observe()?, "null")?);
    let cleared: Value = serde_json::from_str(&a.view_json()?)?;
    assert!(cleared.get("restricted").is_none());
    Ok(())
}
