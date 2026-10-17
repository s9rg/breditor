//! Durable review targets are pure, causal and stricter than ephemeral caret fallback.
use breditor_collaboration::{
    Error,
    anchor::Affinity,
    rich_replica::{
        Command, PresenceResolution, ReviewAnchorLoss as Loss,
        ReviewAnchorResolution as Resolution, ReviewAnchorTarget as Target, RichReplica,
        SharedRichProfile,
        actions::{
            DeleteBlock, DeleteColumn, DeleteText, InsertColumn, InsertText, SplitTextBlock,
        },
        selection::{CellTarget, Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn peers() -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let p = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/review-anchors","version":1},"extensions":[]}"#,
    )?;
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/review-anchors","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = p.create(&input, "9007199254740993".into())?;
    let b = p.join_frame("room".into(), "9007199254740995".into(), &a.update_frame()?)?;
    Ok((p, a, b))
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn range(a: u32, f: u32) -> Selection {
    Selection::TextRange { anchor: point("p", a), focus: point("p", f) }
}
fn target(a: u32, f: u32) -> Target {
    Target::Selection(range(a, f))
}
fn capture(a: &RichReplica, target: &Target) -> Result<String> {
    Ok(a.capture_review_anchor_guarded(&a.observe()?, target)?)
}
fn resolved(selection: Selection) -> Resolution {
    Resolution::Resolved { target: Target::Selection(selection) }
}
fn insert(text: &str) -> Command {
    Command::InsertText(InsertText { block: "p".into(), offset: 0, text: text.into() })
}
fn cell() -> CellTarget {
    CellTarget { table: "t".into(), row: "r".into(), column: "c".into() }
}

#[test]
fn durable_capture_is_explicit_pure_read_only_and_independent_of_current_selection() -> Result {
    let (_, mut a, b) = peers()?;
    a.set_selection(Some(&range(0, 0)))?;
    a.set_read_only_guarded(&a.observe()?, true)?;
    let observation = a.observe()?;
    let exact = (a.checkpoint()?, a.view_json()?, a.update_frame()?);
    let frame = a.capture_review_anchor_guarded(&observation, &target(4, 1))?;
    let json: Value = serde_json::from_str(&frame)?;
    assert_eq!(json["format"], "breditor/shared-review-anchor");
    assert!(json.get("writer").is_none());
    assert!(json.get("credential").is_none());
    assert!(json.get("selection").is_none());
    assert_eq!(a.resolve_review_anchor(&frame)?, resolved(range(4, 1)));
    assert_eq!(b.resolve_review_anchor(&frame)?, resolved(range(4, 1)));
    assert_eq!((a.checkpoint()?, a.view_json()?, a.update_frame()?), exact);
    a.check(&observation)?;
    let global = capture(&a, &Target::Document)?;
    assert_eq!(
        a.resolve_review_anchor(&global)?,
        Resolution::Resolved { target: Target::Document }
    );
    assert!(b.resolve_presence_frame(&frame).is_err());
    assert!(b.resolve_document_presence_frame(&frame).is_err());
    assert!(b.resolve_review_anchor(&b.presence_frame_guarded(&b.observe()?)?).is_err());
    Ok(())
}

#[test]
fn durable_ranges_keep_direction_unicode_and_both_insertion_affinities() -> Result {
    let (_, mut a, b) = peers()?;
    let frame = capture(&b, &target(4, 1))?;
    a.apply(vec![insert("X")])?;
    assert_eq!(a.resolve_review_anchor(&frame)?, resolved(range(5, 2)));
    for (affinity, expected) in [(Affinity::Before, 1), (Affinity::After, 2)] {
        let (_, mut a, b) = peers()?;
        let p = TextPoint { affinity, ..point("p", 1) };
        let frame =
            capture(&b, &Target::Selection(Selection::TextRange { anchor: p.clone(), focus: p }))?;
        a.apply(vec![Command::InsertText(InsertText {
            block: "p".into(),
            offset: 1,
            text: "R".into(),
        })])?;
        let p = TextPoint { affinity, ..point("p", expected) };
        assert_eq!(
            a.resolve_review_anchor(&frame)?,
            resolved(Selection::TextRange { anchor: p.clone(), focus: p })
        );
    }
    Ok(())
}

#[test]
fn pending_review_anchors_wait_for_document_operations_without_importing_them() -> Result {
    let (_, mut a, mut b) = peers()?;
    b.apply(vec![insert("PEER")])?;
    let frame = capture(&b, &target(8, 5))?;
    let before = a.checkpoint()?;
    assert_eq!(a.resolve_review_anchor(&frame)?, Resolution::Pending);
    assert_eq!(a.checkpoint()?, before);
    a.receive_frame(&b.update_frame()?)?;
    assert_eq!(a.resolve_review_anchor(&frame)?, resolved(range(8, 5)));
    Ok(())
}

#[test]
fn durable_targets_never_use_the_presence_carets_neighboring_cell_fallback() -> Result {
    let (_, mut a, _) = peers()?;
    a.apply(vec![Command::InsertColumn(InsertColumn {
        block: "table-block".into(),
        column: "neighbor".into(),
        width: 120,
        before: None,
    })])?;
    a.set_selection(Some(&range(1, 1)))?;
    let presence = a.presence_frame_guarded(&a.observe()?)?;
    let text = capture(&a, &target(1, 1))?;
    let grid = capture(&a, &Target::Selection(Selection::Grid { anchor: cell(), focus: cell() }))?;
    a.apply(vec![Command::DeleteColumn(DeleteColumn {
        block: "table-block".into(),
        column: "c".into(),
    })])?;
    assert!(matches!(
        a.resolve_presence_frame(&presence)?,
        PresenceResolution::Resolved { selection: Some(_), .. }
    ));
    for frame in [&text, &grid] {
        assert_eq!(
            a.resolve_review_anchor(frame)?,
            Resolution::Orphaned { reason: Loss::TargetDeleted }
        );
    }
    a.undo()?;
    assert_eq!(a.resolve_review_anchor(&text)?, resolved(range(1, 1)));
    assert_eq!(
        a.resolve_review_anchor(&grid)?,
        resolved(Selection::Grid { anchor: cell(), focus: cell() })
    );
    Ok(())
}

#[test]
fn removed_nodes_hidden_tables_and_collapsed_ranges_are_retained_as_orphans() -> Result {
    let (_, mut a, _) = peers()?;
    let node = capture(&a, &Target::Selection(Selection::Node { block: "image-block".into() }))?;
    let grid = capture(&a, &Target::Selection(Selection::Grid { anchor: cell(), focus: cell() }))?;
    let range = capture(&a, &target(1, 3))?;
    a.apply(vec![Command::DeleteText(DeleteText { block: "p".into(), offset: 1, length: 2 })])?;
    assert_eq!(
        a.resolve_review_anchor(&range)?,
        Resolution::Orphaned { reason: Loss::RangeCollapsed }
    );
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "image-block".into() })])?;
    assert_eq!(
        a.resolve_review_anchor(&node)?,
        Resolution::Orphaned { reason: Loss::TargetDeleted }
    );
    a.undo()?;
    assert_eq!(
        a.resolve_review_anchor(&node)?,
        resolved(Selection::Node { block: "image-block".into() })
    );
    a.apply(vec![Command::DeleteColumn(DeleteColumn {
        block: "table-block".into(),
        column: "c".into(),
    })])?;
    assert_eq!(a.resolve_review_anchor(&grid)?, Resolution::Orphaned { reason: Loss::HiddenTable });
    Ok(())
}

#[test]
fn saved_review_anchors_follow_split_and_future_history_after_exact_native_recovery() -> Result {
    for natural in [false, true] {
        let (p, mut a, _) = peers()?;
        a.enable_document_selection_guarded(&a.observe()?)?;
        if natural {
            a.enable_typing_history_guarded(&a.observe_document()?)?;
        }
        let frame = a.capture_review_anchor_guarded(&a.observe_document()?, &target(4, 3))?;
        a.apply(vec![Command::SplitTextBlock(SplitTextBlock {
            block: "p".into(),
            offset: 1,
            right: "right".into(),
            right_heading: None,
        })])?;
        let saved =
            if natural { a.document_typing_checkpoint()? } else { a.document_checkpoint()? };
        let mut b = if natural {
            p.restore_document_typing("room", &saved)?
        } else {
            p.restore_document("room", &saved)?
        };
        let expected = Selection::TextRange { anchor: point("right", 3), focus: point("right", 2) };
        assert_eq!(a.resolve_review_anchor(&frame)?, resolved(expected));
        for redo in [false, true, false, true] {
            assert_eq!(a.resolve_review_anchor(&frame)?, b.resolve_review_anchor(&frame)?);
            assert_eq!(
                if redo { a.redo()? } else { a.undo()? },
                if redo { b.redo()? } else { b.undo()? }
            );
            let exact_a =
                if natural { a.document_typing_checkpoint()? } else { a.document_checkpoint()? };
            let exact_b =
                if natural { b.document_typing_checkpoint()? } else { b.document_checkpoint()? };
            assert_eq!(exact_a, exact_b);
        }
    }
    Ok(())
}

#[test]
fn stale_foreign_half_surrogate_and_oversized_targets_reject_without_publication() -> Result {
    let (_, mut a, b) = peers()?;
    let stale = a.observe()?;
    a.set_selection(Some(&range(1, 1)))?;
    let exact = a.checkpoint()?;
    assert!(a.capture_review_anchor_guarded(&stale, &Target::Document).is_err());
    assert!(a.capture_review_anchor_guarded(&b.observe()?, &Target::Document).is_err());
    assert!(capture(&a, &target(2, 3)).is_err());
    assert!(matches!(
        a.resolve_review_anchor(&" ".repeat(256 * 1024 + 1)),
        Err(Error::Limit("review anchor bytes"))
    ));
    assert_eq!(a.checkpoint()?, exact);
    Ok(())
}

#[test]
fn closed_packets_reject_malformed_bindings_clocks_and_cursors_even_before_catchup() -> Result {
    let (_, a, mut b) = peers()?;
    b.apply(vec![insert("PEER")])?;
    let valid: Value = serde_json::from_str(&capture(&b, &target(8, 5))?)?;
    let before = a.checkpoint()?;
    for (key, value) in [
        ("format", json!("breditor/shared-rich-presence")),
        ("formatVersion", json!(2)),
        ("document", json!("wrong")),
        ("modelVersion", json!(11)),
        ("engine", json!("wrong")),
        ("schemaFingerprint", json!("wrong")),
        ("extra", json!(1)),
    ] {
        let mut packet = valid.clone();
        packet[key] = value;
        assert!(a.resolve_review_anchor(&packet.to_string()).is_err(), "accepted bad field {key}");
    }
    let mut malformed = valid.clone();
    malformed["anchors"]["anchor"]["anchor"]["cursor"] = json!([255, 255]);
    assert!(a.resolve_review_anchor(&malformed.to_string()).is_err());
    let mut duplicate = valid.clone();
    let first = duplicate["clocks"][0].clone();
    duplicate["clocks"].as_array_mut().ok_or("clocks")?.push(first);
    assert!(a.resolve_review_anchor(&duplicate.to_string()).is_err());
    let mut zero_padded = valid;
    zero_padded["clocks"][0]["counter"] = json!("01");
    assert!(a.resolve_review_anchor(&zero_padded.to_string()).is_err());
    assert_eq!(a.checkpoint()?, before);
    Ok(())
}
