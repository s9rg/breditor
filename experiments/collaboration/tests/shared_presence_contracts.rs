//! Presence anchors follow content without importing updates or entering UI/history state.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, PresenceResolution, RichReplica, SharedRichProfile,
        actions::{DeleteBlock, DeleteColumn, InsertText, SplitTextBlock},
        selection::{CellTarget, Selection, SelectionLoss, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn peers() -> Result<(RichReplica, RichReplica)> {
    let profile = SharedRichProfile::from_configuration_json(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":1,"schema":{"name":"example/presence","version":1},"extensions":[]}"#,
    )?;
    let root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/presence","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root});
    let a = profile.create(&input.to_string(), "9007199254740993".into())?;
    let b = profile.join_frame("room".into(), "9007199254740995".into(), &a.update_frame()?)?;
    Ok((a, b))
}
fn point(offset: u32, affinity: Affinity) -> TextPoint {
    TextPoint { block: "p".into(), offset, affinity }
}
fn range(a: u32, f: u32) -> Selection {
    Selection::TextRange { anchor: point(a, Affinity::After), focus: point(f, Affinity::After) }
}
fn frame(a: &RichReplica) -> Result<String> {
    Ok(a.presence_frame_guarded(&a.observe()?)?)
}
fn insert(offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: "p".into(), offset, text: text.into() })
}

#[test]
fn presence_resolves_directional_unicode_ranges_without_any_content_ui_or_history_publication()
-> Result {
    let (mut a, mut b) = peers()?;
    b.set_selection(Some(&range(4, 1)))?;
    let packet = frame(&b)?;
    a.apply(vec![insert(0, "X")])?;
    let observation = a.observe()?;
    let before = (a.checkpoint()?, a.view_json()?, a.update_frame()?);
    assert_eq!(
        a.resolve_presence_frame(&packet)?,
        PresenceResolution::Resolved { writer: b.writer().into(), selection: Some(range(5, 2)) }
    );
    assert_eq!((a.checkpoint()?, a.view_json()?, a.update_frame()?), before);
    a.check(&observation)?;
    assert_eq!(frame(&b)?, packet);
    Ok(())
}
#[test]
fn collapsed_presence_keeps_both_sides_of_a_concurrent_insertion() -> Result {
    for (affinity, expected) in [(Affinity::Before, 1), (Affinity::After, 2)] {
        let (mut a, mut b) = peers()?;
        let p = point(1, affinity);
        b.set_selection(Some(&Selection::TextRange { anchor: p.clone(), focus: p }))?;
        let packet = frame(&b)?;
        a.apply(vec![insert(1, "R")])?;
        let p = point(expected, affinity);
        assert_eq!(
            a.resolve_presence_frame(&packet)?,
            PresenceResolution::Resolved {
                writer: b.writer().into(),
                selection: Some(Selection::TextRange { anchor: p.clone(), focus: p })
            }
        );
    }
    Ok(())
}
#[test]
fn presence_follows_original_source_through_split_and_exact_structural_undo() -> Result {
    let (mut a, mut b) = peers()?;
    b.set_selection(Some(&range(3, 3)))?;
    let packet = frame(&b)?;
    a.apply(vec![Command::SplitTextBlock(SplitTextBlock {
        block: "p".into(),
        offset: 1,
        right: "right".into(),
        right_heading: None,
    })])?;
    let p = TextPoint { block: "right".into(), offset: 2, affinity: Affinity::After };
    assert_eq!(
        a.resolve_presence_frame(&packet)?,
        PresenceResolution::Resolved {
            writer: b.writer().into(),
            selection: Some(Selection::TextRange { anchor: p.clone(), focus: p })
        }
    );
    a.undo()?;
    assert_eq!(
        a.resolve_presence_frame(&packet)?,
        PresenceResolution::Resolved { writer: b.writer().into(), selection: Some(range(3, 3)) }
    );
    Ok(())
}
#[test]
fn unseen_causal_state_is_pending_until_content_arrives_without_guessing_offsets() -> Result {
    let (mut a, mut b) = peers()?;
    b.apply(vec![insert(0, "Remote ")])?;
    b.set_selection(Some(&range(7, 7)))?;
    let packet = frame(&b)?;
    let before = a.checkpoint()?;
    assert_eq!(
        a.resolve_presence_frame(&packet)?,
        PresenceResolution::Pending { writer: b.writer().into() }
    );
    assert_eq!(a.checkpoint()?, before);
    a.receive_frame(&b.update_frame()?)?;
    assert_eq!(
        a.resolve_presence_frame(&packet)?,
        PresenceResolution::Resolved { writer: b.writer().into(), selection: Some(range(7, 7)) }
    );
    Ok(())
}
#[test]
fn explicit_absence_clears_before_unseen_content_catchup() -> Result {
    let (a, mut b) = peers()?;
    b.apply(vec![insert(0, "Remote ")])?;
    assert_eq!(
        a.resolve_presence_frame(&frame(&b)?)?,
        PresenceResolution::Resolved { writer: b.writer().into(), selection: None }
    );
    Ok(())
}
#[test]
fn deleted_node_and_hidden_grid_presence_clear_with_explicit_structural_reasons() -> Result {
    let (mut a, mut b) = peers()?;
    b.set_selection(Some(&Selection::Node { block: "image-block".into() }))?;
    let node = frame(&b)?;
    let cell = CellTarget { table: "t".into(), row: "r".into(), column: "c".into() };
    b.set_selection(Some(&Selection::Grid { anchor: cell.clone(), focus: cell }))?;
    let grid = frame(&b)?;
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "image-block".into() })])?;
    assert_eq!(
        a.resolve_presence_frame(&node)?,
        PresenceResolution::Cleared {
            writer: b.writer().into(),
            reason: SelectionLoss::TargetDeleted
        }
    );
    a.apply(vec![Command::DeleteColumn(DeleteColumn {
        block: "table-block".into(),
        column: "c".into(),
    })])?;
    assert_eq!(
        a.resolve_presence_frame(&grid)?,
        PresenceResolution::Cleared {
            writer: b.writer().into(),
            reason: SelectionLoss::HiddenTable
        }
    );
    Ok(())
}
#[test]
fn capture_rejects_foreign_and_stale_observations_without_replacing_local_state() -> Result {
    let (mut a, b) = peers()?;
    assert!(a.presence_frame_guarded(&b.observe()?).is_err());
    let before = a.observe()?;
    a.set_selection(Some(&range(1, 1)))?;
    let checkpoint = a.checkpoint()?;
    assert!(a.presence_frame_guarded(&before).is_err());
    assert_eq!(a.checkpoint()?, checkpoint);
    Ok(())
}
#[test]
fn presence_binding_clocks_required_absence_and_byte_budgets_are_strict_and_read_only() -> Result {
    let (a, b) = peers()?;
    let original: Value = serde_json::from_str(&frame(&b)?)?;
    let before = a.checkpoint()?;
    for (field, value) in [
        ("document", json!("other")),
        ("modelVersion", json!(999)),
        ("schemaFingerprint", json!("wrong")),
        ("engine", json!("other")),
        ("writer", json!("01")),
        ("extra", json!(true)),
    ] {
        let mut packet = original.clone();
        packet[field] = value;
        assert!(a.resolve_presence_frame(&packet.to_string()).is_err());
    }
    let mut packet = original.clone();
    packet.as_object_mut().ok_or("packet")?.remove("selection");
    assert!(a.resolve_presence_frame(&packet.to_string()).is_err());
    let mut packet = original.clone();
    packet["clocks"] = json!([{"writer":"1","counter":"01"}]);
    assert!(a.resolve_presence_frame(&packet.to_string()).is_err());
    let mut packet = original;
    packet["clocks"] = json!([{"writer":"1","counter":"0"},{"writer":"1","counter":"0"}]);
    assert!(a.resolve_presence_frame(&packet.to_string()).is_err());
    assert!(a.resolve_presence_frame(&"x".repeat(256 * 1024 + 1)).is_err());
    assert_eq!(a.checkpoint()?, before);
    Ok(())
}
