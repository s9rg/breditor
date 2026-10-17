//! Immutable versions contain semantic content, not executable recovery credentials or a shared root.
use breditor_collaboration::rich_replica::{
    Command, RichReplica, SharedRichProfile, VersionChangeAspect as Aspect,
    VersionNodeTarget as Target,
    actions::{InsertText, ResizeColumn, ResizeImage, SetFormat, SetHeading},
};
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde_json::{Value, json};
use std::collections::BTreeSet;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn peers() -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let p = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/document-versions","version":1},"extensions":[]}"#,
    )?;
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/document-versions","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = p.create(&input, "101".into())?;
    let b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((p, a, b))
}
fn capture(a: &RichReplica) -> Result<String> {
    Ok(a.capture_document_version_guarded(
        &a.observe()?,
        "Draft 日本 🙂",
        ReviewPrincipalId::try_new("alice")?,
        "1792200000000",
    )?)
}
fn insert(block: &str, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: text.into() })
}
fn blocks(node: &Value, result: &mut BTreeSet<String>) {
    if let Some(id) = node["properties"]["breditor/block-id"].as_str() {
        result.insert(id.into());
    }
    if let Some(children) = node["children"].as_array() {
        for child in children {
            blocks(child, result);
        }
    }
}
#[test]
fn capture_and_comparison_are_pure_even_in_read_only_mode() -> Result {
    let (_, mut a, b) = peers()?;
    a.set_read_only_guarded(&a.observe()?, true)?;
    let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
    let version = capture(&a)?;
    let info = a.read_document_version(&version)?;
    assert_eq!(info.name, "Draft 日本 🙂");
    assert_eq!(a.read_document_version(&version)?, b.read_document_version(&version)?);
    let diff = a.compare_document_version_guarded(&a.observe()?, &version)?;
    assert!(diff.identical);
    assert!(diff.changes.is_empty());
    assert_eq!(diff.version_assets.len(), 1);
    assert_eq!(diff.version_assets[0].asset, "asset");
    assert_eq!(diff.version_assets, diff.current_assets);
    let packet: Value = serde_json::from_str(&version)?;
    for key in ["credential", "writer", "journal", "undo", "review"] {
        assert!(packet.get(key).is_none());
    }
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    Ok(())
}
#[test]
fn semantic_comparison_classifies_text_format_kinds_image_and_table_properties() -> Result {
    let (_, mut a, _) = peers()?;
    let version = capture(&a)?;
    a.apply(vec![
        insert("p", "New "),
        Command::SetFormat(SetFormat {
            block: "caption".into(),
            offset: 0,
            length: 2,
            format: json!({"type":"breditor/strong","properties":{}}),
            enabled: true,
        }),
        Command::SetHeading(SetHeading { block: "p".into(), level: Some(2) }),
        Command::ResizeImage(ResizeImage { block: "image-block".into(), size: Some([320, 180]) }),
        Command::ResizeColumn(ResizeColumn {
            block: "table-block".into(),
            column: "c".into(),
            width: 200,
        }),
    ])?;
    let diff = a.compare_document_version_guarded(&a.observe()?, &version)?;
    assert!(!diff.identical);
    let p = diff
        .changes
        .iter()
        .find(|c| c.target == Target::Block("p".into()))
        .ok_or("paragraph change")?;
    assert!(p.aspects.contains(&Aspect::Text));
    assert_eq!(p.after_kind.as_deref(), Some("breditor/heading"));
    assert!(p.properties_changed.iter().any(|s| s == "breditor/level"));
    let caption = diff
        .changes
        .iter()
        .find(|c| c.target == Target::Block("caption".into()))
        .ok_or("caption change")?;
    assert_eq!(caption.aspects, vec![Aspect::InlineFormatting]);
    let image = diff
        .changes
        .iter()
        .find(|c| c.target == Target::Block("image-block".into()))
        .ok_or("image change")?;
    assert_eq!(image.properties_changed, vec!["breditor/height", "breditor/width"]);
    let table = diff
        .changes
        .iter()
        .find(|c| c.target == Target::Block("table-block".into()))
        .ok_or("table change")?;
    assert_eq!(table.properties_changed, vec!["breditor/columns"]);
    Ok(())
}
#[test]
fn restore_is_one_new_guarded_group_with_fresh_ids_and_exact_future_recovery() -> Result {
    let (profile, mut a, _) = peers()?;
    let version = capture(&a)?;
    a.apply(vec![insert("p", "Changed ")])?;
    let before = a.document_json().to_owned();
    let before_view: Value = serde_json::from_str(&a.view_json()?)?;
    let before_depth = before_view["undoDepth"].clone();
    let original: Value = serde_json::from_str(&before)?;
    let mut old_ids = BTreeSet::new();
    blocks(&original["root"], &mut old_ids);
    let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
    let plan = a.prepare_document_version_restore_guarded(&a.observe()?, &version, "restore-1")?;
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    let preview = plan.document_json().to_owned();
    let raw: Value = serde_json::from_str(&preview)?;
    let mut new_ids = BTreeSet::new();
    blocks(&raw["root"], &mut new_ids);
    assert!(new_ids.is_disjoint(&old_ids));
    assert!(!preview.contains("Changed "));
    assert!(preview.contains("a🙂b"));
    assert!(preview.contains("xy🙂"));
    assert_eq!(raw["root"]["children"].as_array().ok_or("children")?.len(), 1);
    a.apply_document_version_restore(&plan)?;
    assert_eq!(a.document_json(), preview);
    let after_view: Value = serde_json::from_str(&a.view_json()?)?;
    assert_eq!(after_view["undoDepth"].as_u64(), before_depth.as_u64().map(|v| v + 1));
    let mut b = profile.restore("room", &a.checkpoint()?)?;
    for redo in [false, true, false, true] {
        if redo {
            assert_eq!(a.redo()?, b.redo()?);
        } else {
            assert_eq!(a.undo()?, b.undo()?);
            assert_eq!(a.document_json(), before);
        }
        assert_eq!(a.checkpoint()?, b.checkpoint()?);
        assert_eq!(a.update_frame()?, b.update_frame()?);
    }
    Ok(())
}
#[test]
fn delayed_restore_cannot_overwrite_an_unobserved_peer_edit() -> Result {
    let (_, mut a, mut b) = peers()?;
    let version = capture(&a)?;
    let plan =
        a.prepare_document_version_restore_guarded(&a.observe()?, &version, "restore-stale")?;
    b.apply(vec![insert("caption", "Peer ")])?;
    a.receive_frame(&b.update_frame()?)?;
    let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
    assert!(a.apply_document_version_restore(&plan).is_err());
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    let plan =
        a.prepare_document_version_restore_guarded(&a.observe()?, &version, "restore-observed")?;
    a.apply_document_version_restore(&plan)?;
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    a.undo()?;
    assert!(a.document_json().contains("Peer xy🙂"));
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}
#[test]
fn foreign_repeated_read_only_and_reused_restore_attempts_do_not_publish() -> Result {
    let (_, mut a, mut b) = peers()?;
    let version = capture(&a)?;
    let plan =
        a.prepare_document_version_restore_guarded(&a.observe()?, &version, "restore-owned")?;
    assert!(b.apply_document_version_restore(&plan).is_err());
    a.apply_document_version_restore(&plan)?;
    let exact = a.checkpoint()?;
    assert!(a.apply_document_version_restore(&plan).is_err());
    assert_eq!(a.checkpoint()?, exact);
    assert!(
        a.prepare_document_version_restore_guarded(&a.observe()?, &version, "restore-owned")
            .is_err()
    );
    a.set_read_only_guarded(&a.observe()?, true)?;
    assert!(
        a.prepare_document_version_restore_guarded(&a.observe()?, &version, "restore-readonly")
            .is_err()
    );
    assert_eq!(a.read_document_version(&version)?.name, "Draft 日本 🙂");
    Ok(())
}
#[test]
fn malformed_version_names_bindings_content_and_digests_reject_purely() -> Result {
    let (_, a, _) = peers()?;
    let version = capture(&a)?;
    let exact = a.checkpoint()?;
    for (field, value) in [("id", json!("wrong")), ("extra", json!(1))] {
        let mut bad: Value = serde_json::from_str(&version)?;
        bad[field] = value;
        assert!(a.read_document_version(&bad.to_string()).is_err());
    }
    for (field, value) in [
        ("documentJson", json!("{}")),
        ("name", json!("Changed name")),
        ("formatVersion", json!(2)),
    ] {
        let mut bad: Value = serde_json::from_str(&version)?;
        bad["data"][field] = value;
        assert!(a.read_document_version(&bad.to_string()).is_err());
    }
    for (name, time) in [("", "0"), ("x\n", "0"), ("ok", "01"), ("ok", "-1")] {
        assert!(
            a.capture_document_version_guarded(
                &a.observe()?,
                name,
                ReviewPrincipalId::try_new("alice")?,
                time
            )
            .is_err()
        );
    }
    assert!(a.read_document_version(&" ".repeat(4 * 1024 * 1024 + 1)).is_err());
    assert_eq!(a.checkpoint()?, exact);
    Ok(())
}
