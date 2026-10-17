//! Pure identity ranges: exact originals survive disjoint edits without weakening suggestion V1.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        AffineTextDomain, AffineTextRangeConflict as Conflict,
        AffineTextRangeResolution as Resolution, AffineTextSegment, Command,
        DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionPreparation,
        DocumentSuggestionScope, RichReplica, SharedRichProfile,
        actions::{
            DeleteBlock, DeleteText, InsertColumn, InsertText, JoinTextBlocks, MoveBlock,
            SetFormat, SetHeading, SplitTextBlock,
        },
        selection::{Selection, TextPoint},
    },
};
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup() -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let profile = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/affine-range","version":1},"extensions":[]}"#,
    )?;
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/affine-range","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root});
    let a = profile.create(&document.to_string(), "101".into())?;
    let b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((profile, a, b))
}
fn point(block: &str, offset: u32, affinity: Affinity) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity }
}
fn range(block: &str, from: u32, to: u32) -> Selection {
    Selection::TextRange {
        anchor: point(block, from, Affinity::After),
        focus: point(block, to, Affinity::Before),
    }
}
fn insert(block: &str, offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset, text: text.into() })
}
fn capture(a: &RichReplica, selection: &Selection) -> Result<String> {
    Ok(a.capture_affine_text_range_guarded(&a.observe()?, selection)?)
}
fn segments(a: &RichReplica, packet: &str) -> Result<Vec<AffineTextSegment>> {
    let resolved = a.resolve_affine_text_range(packet)?;
    let Resolution::Resolved { segments, .. } = resolved else {
        return Err(format!("resolved range: {resolved:?}").into());
    };
    Ok(segments)
}
fn save(a: &RichReplica, scope: u8, typing: bool) -> Result<String> {
    Ok(match (scope, typing) {
        (0, false) => a.checkpoint()?,
        (0, true) => a.typing_checkpoint()?,
        (1, false) => a.general_checkpoint()?,
        (1, true) => a.general_typing_checkpoint()?,
        (2, false) => a.document_checkpoint()?,
        (2, true) => a.document_typing_checkpoint()?,
        _ => return Err("policy".into()),
    })
}
fn restore(p: &SharedRichProfile, input: &str, scope: u8, typing: bool) -> Result<RichReplica> {
    Ok(match (scope, typing) {
        (0, false) => p.restore("room", input)?,
        (0, true) => p.restore_typing("room", input)?,
        (1, false) => p.restore_general("room", input)?,
        (1, true) => p.restore_general_typing("room", input)?,
        (2, false) => p.restore_document("room", input)?,
        (2, true) => p.restore_document_typing("room", input)?,
        _ => return Err("policy".into()),
    })
}
#[test]
fn capture_read_resolve_and_reopen_are_pure_under_all_six_readonly_policies() -> Result {
    for scope in 0..=2 {
        for typing in [false, true] {
            let (p, mut a, _) = setup()?;
            if scope == 1 {
                a.enable_general_ranges_guarded(&a.observe()?)?;
            }
            if scope == 2 {
                a.enable_document_selection_guarded(&a.observe()?)?;
            }
            if typing {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            a.apply(vec![insert("p", 0, "Retain Redo ")])?;
            a.undo()?;
            a.set_read_only_guarded(&a.observe()?, true)?;
            let before = (save(&a, scope, typing)?, a.update_frame()?, a.view_json()?);
            let selection = range("p", 3, 1);
            let packet = capture(&a, &selection)?;
            assert_eq!(a.read_affine_text_range(&packet)?.selection, selection);
            let Resolution::Resolved { anchor, focus, segments, .. } =
                a.resolve_affine_text_range(&packet)?
            else {
                return Err("resolved".into());
            };
            assert_eq!((anchor.offset, focus.offset), (3, 1));
            assert_eq!(segments.iter().map(|s| s.text.as_str()).collect::<String>(), "🙂");
            assert_eq!(segments[0].length, 2);
            assert!(a.read_document_suggestion(&packet).is_err());
            assert!(a.read_document_version(&packet).is_err());
            assert_eq!((save(&a, scope, typing)?, a.update_frame()?, a.view_json()?), before);
            let restored = restore(&p, &before.0, scope, typing)?;
            assert_eq!(
                restored.resolve_affine_text_range(&packet)?,
                a.resolve_affine_text_range(&packet)?
            );
        }
    }
    Ok(())
}
#[test]
fn disjoint_same_paragraph_edits_resolve_while_original_v1_keeps_its_conservative_meaning() -> Result
{
    let (_, mut a, mut b) = setup()?;
    let packet = capture(&a, &range("p", 1, 3))?;
    let original = a.capture_document_suggestion_guarded(
        &a.observe()?,
        "Original V1",
        ReviewPrincipalId::try_new("alice")?,
        "0",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(vec![insert("p", 1, "Proposal")]),
        },
    )?;
    b.apply(vec![insert("p", 0, "Q"), insert("p", 5, "!")])?;
    a.receive_frame(&b.update_frame()?)?;
    let runs = segments(&a, &packet)?;
    assert_eq!(runs.len(), 1);
    assert_eq!((runs[0].current.offset, runs[0].length, runs[0].text.as_str()), (2, 2, "🙂"));
    assert!(matches!(
        a.prepare_document_suggestion_guarded(&a.observe()?, &original)?,
        DocumentSuggestionPreparation::Conflict { .. }
    ));
    Ok(())
}
#[test]
fn intervening_insertions_are_excluded_without_normalizing_surrogate_pairs() -> Result {
    let (_, mut a, mut b) = setup()?;
    let packet = capture(&a, &range("p", 0, 4))?;
    b.apply(vec![insert("p", 1, "X🙂")])?;
    a.receive_frame(&b.update_frame()?)?;
    let runs = segments(&a, &packet)?;
    assert_eq!(runs.len(), 2);
    assert_eq!(runs.iter().map(|s| s.text.as_str()).collect::<String>(), "a🙂b");
    assert_eq!(runs[0].current.offset, 0);
    assert_eq!(runs[1].current.offset, 4);
    assert_eq!(runs[1].length, 3);
    Ok(())
}
#[test]
fn deleted_originals_cannot_be_replaced_by_equal_reinserted_text() -> Result {
    let (_, mut a, mut b) = setup()?;
    let packet = capture(&a, &range("p", 1, 3))?;
    b.apply(vec![
        Command::DeleteText(DeleteText { block: "p".into(), offset: 1, length: 2 }),
        insert("p", 1, "🙂"),
        Command::SetFormat(SetFormat {
            block: "p".into(),
            offset: 1,
            length: 2,
            format: json!({"type":"breditor/strong","properties":{}}),
            enabled: true,
        }),
    ])?;
    a.receive_frame(&b.update_frame()?)?;
    assert!(matches!(
        a.resolve_affine_text_range(&packet)?,
        Resolution::Conflict { reason: Conflict::CharactersDeleted }
    ));
    Ok(())
}
#[test]
fn changed_marks_are_reported_separately_without_rewriting_original_identity() -> Result {
    let (_, mut a, mut b) = setup()?;
    let packet = capture(&a, &range("p", 1, 3))?;
    b.apply(vec![Command::SetFormat(SetFormat {
        block: "p".into(),
        offset: 1,
        length: 2,
        format: json!({"type":"breditor/strong","properties":{}}),
        enabled: false,
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    let runs = segments(&a, &packet)?;
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].text, "🙂");
    assert_ne!(runs[0].source_formats, runs[0].current_formats);
    Ok(())
}
#[test]
fn missing_source_is_explicit_and_invalid_boundaries_or_foreign_guards_are_never_captured() -> Result
{
    let (_, mut a, mut b) = setup()?;
    let observed = a.observe()?;
    a.apply(vec![insert("p", 0, "Source ")])?;
    assert!(a.capture_affine_text_range_guarded(&observed, &range("p", 0, 1)).is_err());
    assert!(a.capture_affine_text_range_guarded(&b.observe()?, &range("p", 0, 1)).is_err());
    assert!(capture(&b, &range("p", 1, 2)).is_err());
    assert!(capture(&b, &Selection::Node { block: "table-block".into() }).is_err());
    let packet = capture(&a, &range("p", 8, 10))?;
    assert!(matches!(b.resolve_affine_text_range(&packet)?, Resolution::Pending { .. }));
    b.receive_frame(&a.update_frame()?)?;
    assert!(matches!(b.resolve_affine_text_range(&packet)?, Resolution::Resolved { .. }));
    Ok(())
}
#[test]
fn protected_cell_and_caption_domains_remain_distinct_after_disjoint_edits() -> Result {
    let (_, mut a, mut b) = setup()?;
    let packet = capture(
        &a,
        &Selection::TextRange {
            anchor: point("p", 1, Affinity::After),
            focus: point("caption", 2, Affinity::Before),
        },
    )?;
    b.apply(vec![insert("p", 0, "Q"), insert("caption", 0, "W")])?;
    a.receive_frame(&b.update_frame()?)?;
    let runs = segments(&a, &packet)?;
    assert_eq!(runs.iter().map(|s| s.text.as_str()).collect::<String>(), "🙂bxy");
    assert!(matches!(runs[0].domain, AffineTextDomain::Cell { .. }));
    assert!(matches!(runs.last().ok_or("caption run")?.domain, AffineTextDomain::Caption { .. }));
    Ok(())
}
#[test]
fn deleted_targets_return_no_nearest_surviving_text_or_partial_subset() -> Result {
    let (_, mut a, mut b) = setup()?;
    let packet = capture(&a, &range("p", 1, 3))?;
    let caret = capture(&a, &range("p", 0, 0))?;
    b.apply(vec![Command::DeleteBlock(DeleteBlock { block: "table-block".into() })])?;
    a.receive_frame(&b.update_frame()?)?;
    assert!(matches!(
        a.resolve_affine_text_range(&packet)?,
        Resolution::Conflict { reason: Conflict::CharactersDeleted }
    ));
    assert!(matches!(
        a.resolve_affine_text_range(&caret)?,
        Resolution::Conflict { reason: Conflict::BoundaryDeleted }
    ));
    Ok(())
}
#[test]
fn source_characters_follow_split_and_join_without_recreation() -> Result {
    let (_, mut a, mut b) = setup()?;
    let original = capture(&a, &range("p", 0, 4))?;
    b.apply(vec![Command::SplitTextBlock(SplitTextBlock {
        block: "p".into(),
        offset: 1,
        right: "affine-right".into(),
        right_heading: None,
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    let split = segments(&a, &original)?;
    assert_eq!(split.len(), 2);
    assert_eq!(
        (split[0].current.block.as_str(), split[1].current.block.as_str()),
        ("p", "affine-right")
    );
    assert_eq!(split.iter().map(|s| s.text.as_str()).collect::<String>(), "a🙂b");
    let right = capture(&a, &range("affine-right", 0, 2))?;
    b.apply(vec![Command::JoinTextBlocks(JoinTextBlocks {
        left: "p".into(),
        right: "affine-right".into(),
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    let joined = segments(&a, &right)?;
    assert_eq!(joined.len(), 1);
    assert_eq!((joined[0].current.block.as_str(), joined[0].current.offset), ("p", 1));
    assert_eq!(joined[0].text, "🙂");
    Ok(())
}
#[test]
fn original_character_order_and_protected_domains_are_not_guessed_after_moves() -> Result {
    let (_, mut a, mut b) = setup()?;
    b.apply(vec![Command::SplitTextBlock(SplitTextBlock {
        block: "p".into(),
        offset: 1,
        right: "affine-right".into(),
        right_heading: None,
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    let whole = capture(
        &a,
        &Selection::TextRange {
            anchor: point("p", 0, Affinity::After),
            focus: point("affine-right", 3, Affinity::Before),
        },
    )?;
    let right = capture(&a, &range("affine-right", 0, 2))?;
    b.apply(vec![Command::MoveBlock(MoveBlock {
        block: "affine-right".into(),
        parent: Some("cell".into()),
        before: Some("p".into()),
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    assert!(matches!(
        a.resolve_affine_text_range(&whole)?,
        Resolution::Conflict { reason: Conflict::CharactersReordered }
    ));
    b.apply(vec![Command::MoveBlock(MoveBlock {
        block: "affine-right".into(),
        parent: None,
        before: None,
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    assert!(matches!(
        a.resolve_affine_text_range(&right)?,
        Resolution::Conflict { reason: Conflict::DomainChanged }
    ));
    Ok(())
}
#[test]
fn insertion_affinity_and_kind_changes_remain_explicit() -> Result {
    let (_, mut a, mut b) = setup()?;
    let before = capture(
        &a,
        &Selection::TextRange {
            anchor: point("p", 1, Affinity::Before),
            focus: point("p", 1, Affinity::Before),
        },
    )?;
    let after = capture(
        &a,
        &Selection::TextRange {
            anchor: point("p", 1, Affinity::After),
            focus: point("p", 1, Affinity::After),
        },
    )?;
    b.apply(vec![insert("p", 1, "X")])?;
    a.receive_frame(&b.update_frame()?)?;
    for (packet, expected) in [(&before, 1), (&after, 2)] {
        let Resolution::Resolved { anchor, focus, segments, .. } =
            a.resolve_affine_text_range(packet)?
        else {
            return Err("resolved insertion boundary".into());
        };
        assert_eq!((anchor.offset, focus.offset), (expected, expected));
        assert!(segments.is_empty());
    }
    let selected = capture(&a, &range("p", 2, 4))?;
    b.apply(vec![Command::SetHeading(SetHeading { block: "p".into(), level: Some(3) })])?;
    a.receive_frame(&b.update_frame()?)?;
    assert!(matches!(
        a.resolve_affine_text_range(&selected)?,
        Resolution::Conflict { reason: Conflict::KindChanged }
    ));
    Ok(())
}
#[test]
fn empty_derived_floors_remain_pure_and_later_typing_is_not_selected() -> Result {
    let (_, mut a, mut b) = setup()?;
    a.apply(vec![Command::InsertColumn(InsertColumn {
        block: "table-block".into(),
        column: "affine-empty".into(),
        width: 120,
        before: None,
    })])?;
    b.receive_frame(&a.update_frame()?)?;
    let tree: Value = serde_json::from_str(a.document_json())?;
    let cells = tree["root"]["children"][0]["children"][0]["children"].as_array().ok_or("cells")?;
    let cell = cells
        .iter()
        .find(|value| value["properties"]["breditor/column-id"] == "affine-empty")
        .ok_or("empty cell")?;
    let block =
        cell["children"][0]["properties"]["breditor/block-id"].as_str().ok_or("floor")?.to_owned();
    assert!(block.starts_with("breditor-virtual:"));
    let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
    let packet = capture(
        &a,
        &Selection::TextRange {
            anchor: point(&block, 0, Affinity::Before),
            focus: point(&block, 0, Affinity::After),
        },
    )?;
    assert!(segments(&a, &packet)?.is_empty());
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    b.apply(vec![insert(&block, 0, "🙂")])?;
    a.receive_frame(&b.update_frame()?)?;
    let Resolution::Resolved { anchor, focus, segments, .. } =
        a.resolve_affine_text_range(&packet)?
    else {
        return Err("resolved empty birth".into());
    };
    assert_eq!((anchor.offset, focus.offset), (0, 2));
    assert!(
        segments.is_empty(),
        "affine endpoints never authorize selecting newly inserted characters"
    );
    Ok(())
}
#[test]
fn terminal_boundaries_keep_their_declared_affinity() -> Result {
    let (_, mut a, mut b) = setup()?;
    let before = capture(
        &a,
        &Selection::TextRange {
            anchor: point("p", 4, Affinity::Before),
            focus: point("p", 4, Affinity::Before),
        },
    )?;
    let after = capture(
        &a,
        &Selection::TextRange {
            anchor: point("p", 4, Affinity::After),
            focus: point("p", 4, Affinity::After),
        },
    )?;
    b.apply(vec![insert("p", 4, "X")])?;
    a.receive_frame(&b.update_frame()?)?;
    for (packet, expected) in [(&before, 4), (&after, 5)] {
        let Resolution::Resolved { anchor, focus, segments, .. } =
            a.resolve_affine_text_range(packet)?
        else {
            return Err("resolved end".into());
        };
        assert_eq!((anchor.offset, focus.offset), (expected, expected));
        assert!(segments.is_empty());
    }
    Ok(())
}
#[test]
fn a_fresh_empty_text_document_has_pure_ranges_before_any_characters_exist() -> Result {
    let (profile, _, _) = setup()?;
    let root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"fresh-empty"},"children":[]}]});
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/affine-range","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root});
    let a = profile.create(&document.to_string(), "303".into())?;
    let tree: Value = serde_json::from_str(a.document_json())?;
    let block = tree["root"]["children"][0]["properties"]["breditor/block-id"]
        .as_str()
        .ok_or("empty document floor")?;
    let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
    let packet = capture(&a, &range(block, 0, 0))?;
    assert!(segments(&a, &packet)?.is_empty());
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    Ok(())
}
