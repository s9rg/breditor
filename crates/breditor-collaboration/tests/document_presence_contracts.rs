//! Separate document presence keeps full scope and original anchor laws without publishing state.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, DocumentPresenceResolution, DocumentPresenceSelection, RichReplica,
        SharedRichProfile,
        actions::{DeleteBlock, InsertText},
        selection::{CellTarget, Selection, SelectionLoss, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn peers(hidden: bool) -> Result<(RichReplica, RichReplica)> {
    let profile = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/document-presence","version":1},"extensions":[]}"#,
    )?;
    let mut root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    if hidden {
        let children = root["children"].as_array_mut().ok_or("children")?;
        children.retain(|n| n["type"] == "breditor/table");
        children[0]["children"] = json!([]);
    }
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/document-presence","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root});
    let a = profile.create(&input.to_string(), "101".into())?;
    let b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((a, b))
}
fn enable(a: &mut RichReplica) -> Result {
    a.enable_document_selection_guarded(&a.observe()?)?;
    Ok(())
}
fn packet(a: &RichReplica) -> Result<String> {
    Ok(a.document_presence_frame_guarded(&a.observe_document()?)?)
}
fn point(offset: u32) -> TextPoint {
    TextPoint { block: "p".into(), offset, affinity: Affinity::After }
}
fn range() -> Selection {
    Selection::TextRange { anchor: point(4), focus: point(1) }
}
#[test]
fn document_presence_is_explicit_pure_read_only_and_preserves_hidden_root_scope() -> Result {
    for hidden in [false, true] {
        let (mut a, b) = peers(hidden)?;
        let original = a.presence_frame_guarded(&a.observe()?)?;
        assert!(a.document_presence_frame_guarded(&a.observe()?).is_err());
        enable(&mut a)?;
        assert_eq!(a.presence_frame_guarded(&a.observe_document()?)?, original);
        let stale = a.observe_document()?;
        a.select_document_guarded(&stale)?;
        a.set_read_only_guarded(&a.observe_document()?, true)?;
        let before = (a.document_checkpoint()?, a.document_view_json()?, a.update_frame()?);
        assert!(a.document_presence_frame_guarded(&stale).is_err());
        assert!(a.document_presence_frame_guarded(&b.observe()?).is_err());
        assert!(a.presence_frame_guarded(&a.observe_document()?).is_err());
        let frame = packet(&a)?;
        let value: Value = serde_json::from_str(&frame)?;
        assert_eq!(value["format"], "breditor/shared-document-presence");
        assert_eq!(value["selection"], json!({"kind":"document","version":1}));
        assert!(b.resolve_presence_frame(&frame).is_err());
        let old = b.checkpoint()?;
        assert_eq!(
            b.resolve_document_presence_frame(&frame)?,
            DocumentPresenceResolution::Resolved {
                writer: "101".into(),
                selection: Some(DocumentPresenceSelection::Document)
            }
        );
        assert_eq!(b.checkpoint()?, old);
        assert_eq!((a.document_checkpoint()?, a.document_view_json()?, a.update_frame()?), before);
    }
    Ok(())
}
#[test]
fn whole_scope_waits_for_captured_content_but_genuine_absence_clears_immediately() -> Result {
    let (mut a, mut b) = peers(false)?;
    enable(&mut a)?;
    a.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "PEER".into(),
    })])?;
    a.select_document_guarded(&a.observe_document()?)?;
    let selected = packet(&a)?;
    let exact = b.checkpoint()?;
    assert_eq!(
        b.resolve_document_presence_frame(&selected)?,
        DocumentPresenceResolution::Pending { writer: "101".into() }
    );
    assert_eq!(b.checkpoint()?, exact);
    a.set_selection_guarded(&a.observe_document()?, None)?;
    assert_eq!(
        b.resolve_document_presence_frame(&packet(&a)?)?,
        DocumentPresenceResolution::Resolved { writer: "101".into(), selection: None }
    );
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(
        b.resolve_document_presence_frame(&selected)?,
        DocumentPresenceResolution::Resolved {
            writer: "101".into(),
            selection: Some(DocumentPresenceSelection::Document)
        }
    );
    Ok(())
}
#[test]
fn document_channel_keeps_directional_text_node_grid_and_structural_loss_laws() -> Result {
    let (mut a, mut b) = peers(false)?;
    enable(&mut a)?;
    let cell = CellTarget { table: "t".into(), row: "r".into(), column: "c".into() };
    for selection in [
        range(),
        Selection::TextRange {
            anchor: TextPoint { block: "caption".into(), offset: 1, affinity: Affinity::After },
            focus: point(1),
        },
        Selection::Node { block: "image-block".into() },
        Selection::Grid { anchor: cell.clone(), focus: cell },
    ] {
        a.set_selection_guarded(&a.observe_document()?, Some(&selection))?;
        let frame = packet(&a)?;
        assert_eq!(
            b.resolve_document_presence_frame(&frame)?,
            DocumentPresenceResolution::Resolved {
                writer: "101".into(),
                selection: Some(DocumentPresenceSelection::Original(selection))
            }
        );
    }
    a.set_selection_guarded(
        &a.observe_document()?,
        Some(&Selection::Node { block: "image-block".into() }),
    )?;
    let frame = packet(&a)?;
    b.apply(vec![Command::DeleteBlock(DeleteBlock { block: "image-block".into() })])?;
    assert_eq!(
        b.resolve_document_presence_frame(&frame)?,
        DocumentPresenceResolution::Cleared {
            writer: "101".into(),
            reason: SelectionLoss::TargetDeleted
        }
    );
    b.undo()?;
    assert!(matches!(
        b.resolve_document_presence_frame(&frame)?,
        DocumentPresenceResolution::Resolved { .. }
    ));
    Ok(())
}
#[test]
fn document_presence_rejects_original_packets_unknown_scope_and_malformed_bindings_without_mutation()
-> Result {
    let (mut a, b) = peers(false)?;
    let original = a.presence_frame_guarded(&a.observe()?)?;
    assert!(b.resolve_document_presence_frame(&original).is_err());
    enable(&mut a)?;
    a.select_document_guarded(&a.observe_document()?)?;
    let frame: Value = serde_json::from_str(&packet(&a)?)?;
    let before = b.checkpoint()?;
    for (field, value) in [
        ("format", json!("breditor/shared-rich-presence")),
        ("formatVersion", json!(2)),
        ("document", json!("wrong")),
        ("writer", json!("01")),
        ("modelVersion", json!(11)),
        ("engine", json!("other")),
        ("schemaFingerprint", json!("other")),
        ("extra", json!(true)),
        ("selection", json!({"kind":"document","version":2})),
        ("selection", json!({"kind":"document","version":1,"extra":true})),
        ("clocks", json!([{"writer":"101","counter":"01"}])),
    ] {
        let mut changed = frame.clone();
        changed[field] = value;
        assert!(b.resolve_document_presence_frame(&changed.to_string()).is_err());
        assert_eq!(b.checkpoint()?, before);
    }
    let mut missing = frame;
    missing.as_object_mut().ok_or("packet")?.remove("selection");
    assert!(b.resolve_document_presence_frame(&missing.to_string()).is_err());
    assert!(b.resolve_document_presence_frame(&"x".repeat(256 * 1024 + 1)).is_err());
    assert_eq!(b.checkpoint()?, before);
    Ok(())
}
