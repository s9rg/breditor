//! Sparse children retain only original removal intent; ordinary Accept remains exact-source.
use super::*;
use breditor_collaboration::rich_replica::actions::{
    MaskedTextSpanV1, ReplaceMaskedGeneralTextRangeV1,
};

fn preserving_revision(a: &RichReplica, previous: &str, prefix: &str) -> Result<String> {
    match a.rebase_document_suggestion_text_guarded(
        &a.observe()?,
        previous,
        "Sparse revision",
        "3",
        prefix,
        Policy::PreserveInterveningText,
    )? {
        Rebase::Captured { revision_packet_json } => Ok(revision_packet_json),
        other => Err(format!("sparse capture: {other:?}").into()),
    }
}
fn preserving_child(a: &RichReplica, previous: &str, prefix: &str) -> Result<String> {
    Ok(a.document_suggestion_revision_packet(previous, &preserving_revision(a, previous, prefix)?)?)
}
pub(super) fn assert_same_source_repeat(a: &RichReplica, child: &str) -> Result {
    let repeated = preserving_child(a, child, "same-source-sparse-child")?;
    assert_eq!(text(&proposed(a, &repeated)?, "p")?, "RX");
    Ok(())
}
fn first_child(a: &mut RichReplica, b: &mut RichReplica) -> Result<String> {
    let previous = original(
        a,
        DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(range("p", 0, 4, "R"))]),
    )?;
    b.apply(vec![insert("p", 1, "X")])?;
    a.receive_frame(&b.update_frame()?)?;
    preserving_child(a, &previous, "first-sparse-child")
}
fn configure(a: &mut RichReplica, scope: u8, natural: bool) -> Result {
    if scope >= 1 {
        a.enable_general_ranges_guarded(&a.observe()?)?;
    }
    if scope == 2 {
        a.enable_document_selection_guarded(&a.observe()?)?;
    }
    if natural {
        a.enable_typing_history_guarded(&a.observe()?)?;
    }
    Ok(())
}
fn spans(packet: &str) -> Result<Vec<MaskedTextSpanV1>> {
    let value: Value = serde_json::from_str(packet)?;
    Ok(serde_json::from_value(value["data"]["draft"]["edit"]["data"][0]["data"]["spans"].clone())?)
}
#[test]
fn repeated_sparse_revisions_keep_peer_holes_and_exact_read_only_recovery_all_six_policies()
-> Result {
    for scope in 0..=2 {
        for natural in [false, true] {
            let (profile, mut a, mut b) = setup(None)?;
            configure(&mut a, scope, natural)?;
            a.apply(vec![insert("caption", 0, "Retain Redo ")])?;
            a.undo()?;
            let first = first_child(&mut a, &mut b)?;
            b.apply(vec![insert("p", 2, "Y")])?;
            a.receive_frame(&b.update_frame()?)?;
            assert!(matches!(
                a.prepare_document_suggestion_guarded(&a.observe()?, &first)?,
                DocumentSuggestionPreparation::Conflict { .. }
            ));
            a.set_read_only_guarded(&a.observe()?, true)?;
            let exact = (save(&a, scope, natural)?, a.update_frame()?, a.view_json()?);
            let revision = preserving_revision(&a, &first, "second-sparse-child")?;
            assert_eq!((save(&a, scope, natural)?, a.update_frame()?, a.view_json()?), exact);
            let reopened = restore(&profile, &exact.0, scope, natural)?;
            assert_eq!(preserving_revision(&reopened, &first, "second-sparse-child")?, revision);
            let second = a.document_suggestion_revision_packet(&first, &revision)?;
            assert_eq!(text(&proposed(&a, &second)?, "p")?, "RXY");
            assert_eq!(spans(&second)?.iter().map(|span| span.end - span.start).sum::<u32>(), 4);
            assert_eq!(
                a.read_document_suggestion_revision(&first, &revision)?.suggestion.author.as_str(),
                "alice"
            );
            // Deleting an old peer hole or changing its formats is not loss/change of an original.
            b.apply(vec![
                Command::DeleteText(DeleteText { block: "p".into(), offset: 2, length: 1 }),
                Command::SetFormat(SetFormat {
                    block: "p".into(),
                    offset: 1,
                    length: 1,
                    format: json!({"type":"breditor-inline/italic","properties":{}}),
                    enabled: true,
                }),
            ])?;
            a.receive_frame(&b.update_frame()?)?;
            let third = preserving_child(&a, &second, "third-sparse-child")?;
            let proposal = proposed(&a, &third)?;
            assert_eq!(text(&proposal, "p")?, "RX");
            assert_eq!(
                run_formats(&proposal, "p", "X")?,
                run_formats(a.document_json(), "p", "X")?
            );
            assert_eq!(
                result(&a, &third, "reject-existing-hole")?,
                Rebase::Conflict { reason: Conflict::InterveningText }
            );
            let raw: Value = serde_json::from_str(&third)?;
            assert_eq!(
                raw["data"]["draft"]["edit"]["data"][0]["data"]["range"]["runs"][0]["text"],
                "R"
            );
            a.set_read_only_guarded(&a.observe()?, false)?;
            let mut reopened = restore(&profile, &save(&a, scope, natural)?, scope, natural)?;
            assert!(a.redo()?);
            assert!(reopened.redo()?);
            assert_eq!(save(&a, scope, natural)?, save(&reopened, scope, natural)?);
        }
    }
    Ok(())
}
#[test]
fn sparse_selected_originals_still_refuse_changed_marks_and_equal_reinsertion() -> Result {
    for marks in [false, true] {
        let (_, mut a, mut b) = setup(None)?;
        let first = first_child(&mut a, &mut b)?;
        a.apply(if marks {
            vec![Command::SetFormat(SetFormat {
                block: "p".into(),
                offset: 2,
                length: 2,
                format: json!({"type":"breditor-inline/italic","properties":{}}),
                enabled: true,
            })]
        } else {
            vec![
                Command::DeleteText(DeleteText { block: "p".into(), offset: 2, length: 2 }),
                insert("p", 2, "🙂"),
            ]
        })?;
        let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
        let actual = a.rebase_document_suggestion_text_guarded(
            &a.observe()?,
            &first,
            "No subset",
            "4",
            "refused-sparse",
            Policy::PreserveInterveningText,
        )?;
        assert_eq!(
            actual,
            Rebase::Conflict {
                reason: if marks {
                    Conflict::FormattingChanged
                } else {
                    Conflict::Range { reason: AffineTextRangeConflict::CharactersDeleted }
                }
            }
        );
        assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    }
    Ok(())
}
#[test]
fn sparse_rebase_keeps_structural_headers_and_explicit_document_scope_witnesses() -> Result {
    for document_scope in [false, true] {
        let (_, mut a, mut b) = setup(None)?;
        let mut previous = first_child(&mut a, &mut b)?;
        if document_scope {
            let raw: Value = serde_json::from_str(&previous)?;
            let mut draft: DocumentSuggestionDraft =
                serde_json::from_value(raw["data"]["draft"].clone())?;
            draft.scope = DocumentSuggestionScope::Document;
            previous = a.capture_document_suggestion_guarded(
                &a.observe()?,
                "Explicit complete scope",
                ReviewPrincipalId::try_new("alice")?,
                "4",
                draft,
            )?;
            a.apply(vec![insert("caption", 0, "Unrelated but in explicit scope ")])?;
        } else {
            a.apply(vec![Command::ResizeColumn(ResizeColumn {
                block: "table-block".into(),
                column: "c".into(),
                width: 121,
            })])?;
        }
        let actual = a.rebase_document_suggestion_text_guarded(
            &a.observe()?,
            &previous,
            "No structural weakening",
            "5",
            "refused-sparse-header",
            Policy::PreserveInterveningText,
        )?;
        let Rebase::Conflict { reason: Conflict::TargetsChanged { targets } } = actual else {
            return Err("structural/scope conflict required".into());
        };
        if document_scope {
            assert!(targets.contains(
                &breditor_collaboration::rich_replica::SuggestionConflictTarget::Document
            ));
        } else {
            assert!(!targets.is_empty());
        }
    }
    Ok(())
}
#[test]
fn sparse_joined_flow_keeps_all_holes_and_exact_effect_undo_redo_recovery() -> Result {
    let root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[paragraph("p","abc"),paragraph("mid","m🙂"),paragraph("q","def")]});
    let (profile, mut a, mut b) = setup(Some(root))?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    let mut request = range("p", 1, 1, "R");
    request.focus = point("q", 2, Affinity::Before);
    let original =
        original(&a, DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(request)]))?;
    b.apply(vec![insert("p", 2, "X"), insert("mid", 1, "Y")])?;
    a.receive_frame(&b.update_frame()?)?;
    let first = preserving_child(&a, &original, "joined-first")?;
    b.apply(vec![insert("q", 1, "Z")])?;
    a.receive_frame(&b.update_frame()?)?;
    let second = preserving_child(&a, &first, "joined-second")?;
    let before = a.document_json().to_owned();
    let DocumentSuggestionPreparation::Ready(preview) =
        a.prepare_document_suggestion_guarded(&a.observe()?, &second)?
    else {
        return Err("joined Ready".into());
    };
    assert_eq!(text(preview.document_json(), "p")?, "aRXYZf");
    let effect = a.prepare_document_suggestion_effect(&preview)?;
    a.commit_document_suggestion_effect(effect)?;
    let expected = a.document_json().to_owned();
    let mut recovered = profile.restore_general("room", &a.general_checkpoint()?)?;
    assert!(a.undo()?);
    assert!(recovered.undo()?);
    assert_eq!(a.document_json(), before);
    assert_eq!(a.general_checkpoint()?, recovered.general_checkpoint()?);
    assert!(a.redo()?);
    assert!(recovered.redo()?);
    assert_eq!(a.document_json(), expected);
    assert_eq!(a.general_checkpoint()?, recovered.general_checkpoint()?);
    Ok(())
}
#[test]
fn repeated_sparse_insertions_stay_collapsed_and_do_not_select_peer_gaps() -> Result {
    let (_, mut a, mut b) = setup(None)?;
    let original = original(&a, DocumentSuggestionEdit::Commands(vec![insert("p", 1, "R")]))?;
    b.apply(vec![insert("p", 1, "X")])?;
    a.receive_frame(&b.update_frame()?)?;
    let first = preserving_child(&a, &original, "collapsed-first")?;
    b.apply(vec![insert("p", 2, "Y")])?;
    a.receive_frame(&b.update_frame()?)?;
    let second = preserving_child(&a, &first, "collapsed-second")?;
    assert!(spans(&second)?.is_empty());
    assert_eq!(text(&proposed(&a, &second)?, "p")?, "aXYR🙂b");
    Ok(())
}
#[test]
fn sparse_budget_counts_removed_originals_not_large_retained_peer_holes() -> Result {
    let peers = "X".repeat(65537);
    let root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[paragraph("p",&format!("a{peers}bc"))]});
    let (_, a, _) = setup(Some(root))?;
    let full = Selection::TextRange {
        anchor: point("p", 0, Affinity::After),
        focus: point("p", 65540, Affinity::Before),
    };
    let Err(breditor_collaboration::Error::Limit(reason)) =
        a.capture_affine_text_range_guarded(&a.observe()?, &full)
    else {
        return Err("the original full-range scalar budget must still refuse".into());
    };
    assert_eq!(reason, "affine selected scalars");
    let previous = original(
        &a,
        DocumentSuggestionEdit::Commands(vec![Command::ReplaceMaskedGeneralTextRangeV1(
            ReplaceMaskedGeneralTextRangeV1 {
                range: range("p", 0, 65540, "R"),
                spans: vec![
                    MaskedTextSpanV1 { block: "p".into(), start: 0, end: 1 },
                    MaskedTextSpanV1 { block: "p".into(), start: 65538, end: 65540 },
                ],
                empty: vec![],
            },
        )]),
    )?;
    let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
    let child = preserving_child(&a, &previous, "large-hole-child")?;
    assert_eq!(spans(&child)?.iter().map(|span| span.end - span.start).sum::<u32>(), 3);
    assert_eq!(text(&proposed(&a, &child)?, "p")?, format!("R{peers}"));
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    Ok(())
}

#[test]
fn explicit_reject_policy_can_resume_when_all_old_peer_holes_are_gone() -> Result {
    let (_, mut a, mut b) = setup(None)?;
    let first = first_child(&mut a, &mut b)?;
    b.apply(vec![Command::DeleteText(DeleteText { block: "p".into(), offset: 1, length: 1 })])?;
    a.receive_frame(&b.update_frame()?)?;
    let next = child(&a, &first, "reject-after-removed-hole")?;
    let raw: Value = serde_json::from_str(&next)?;
    assert_eq!(raw["data"]["draft"]["edit"]["kind"], "general_text");
    assert_eq!(text(&proposed(&a, &next)?, "p")?, "R");
    Ok(())
}

#[test]
fn repeated_sparse_protected_ranges_recompute_floors_without_a_command_ceiling() -> Result {
    let (profile, mut a, mut b) = setup(Some(wide_table_root()))?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    let target = Selection::TextRange {
        anchor: point("p0", 1, Affinity::After),
        focus: point("p39", 2, Affinity::Before),
    };
    let draft = a.plan_suggestion_general_text_guarded(
        &a.observe()?,
        &target,
        &TextRun::try_new("R", FormatSet::try_from_formats(vec![])?)?.into(),
        "wide-original",
    )?;
    let original = original(&a, draft.edit)?;
    let first = preserving_child(&a, &original, "wide-first")?;
    let first_raw: Value = serde_json::from_str(&first)?;
    assert_eq!(
        first_raw["data"]["draft"]["edit"]["data"][0]["data"]["empty"]
            .as_array()
            .ok_or("first floors")?
            .len(),
        38
    );
    b.apply(vec![insert("p1", 1, "X"), insert("p20", 1, "Y")])?;
    a.receive_frame(&b.update_frame()?)?;
    let before = a.document_json().to_owned();
    assert_retained_cell_header_guard(&profile, &a, &first)?;
    let second = preserving_child(&a, &first, "wide-second")?;
    let raw: Value = serde_json::from_str(&second)?;
    assert_eq!(raw["data"]["draft"]["edit"]["data"].as_array().ok_or("one compound")?.len(), 1);
    let empty =
        raw["data"]["draft"]["edit"]["data"][0]["data"]["empty"].as_array().ok_or("new floors")?;
    assert_eq!(empty.len(), 36);
    assert!(empty.iter().all(|id| id.as_str().is_some_and(|id| id.starts_with("wide-second"))));
    let DocumentSuggestionPreparation::Ready(preview) =
        a.prepare_document_suggestion_guarded(&a.observe()?, &second)?
    else {
        return Err("wide sparse Ready".into());
    };
    assert_eq!(text(preview.document_json(), "p1")?, "X");
    assert_eq!(text(preview.document_json(), "p20")?, "Y");
    assert_eq!(text(preview.document_json(), "p0")?, "aR");
    assert_eq!(text(preview.document_json(), "p39")?, "c");
    let effect = a.prepare_document_suggestion_effect(&preview)?;
    a.commit_document_suggestion_effect(effect)?;
    let expected = a.document_json().to_owned();
    let mut recovered = profile.restore_general("room", &a.general_checkpoint()?)?;
    assert!(a.undo()?);
    assert!(recovered.undo()?);
    assert_eq!(a.document_json(), before);
    assert_eq!(a.general_checkpoint()?, recovered.general_checkpoint()?);
    assert!(a.redo()?);
    assert!(recovered.redo()?);
    assert_eq!(a.document_json(), expected);
    assert_eq!(a.general_checkpoint()?, recovered.general_checkpoint()?);
    Ok(())
}
fn assert_retained_cell_header_guard(
    profile: &SharedRichProfile,
    a: &RichReplica,
    first: &str,
) -> Result {
    let mut probe = profile.join_frame("room".into(), "303".into(), &a.update_frame()?)?;
    probe.apply(vec![Command::SetHeader(
        breditor_collaboration::rich_replica::actions::SetHeader {
            cells: vec!["cell-0-1".into()],
            header: true,
        },
    )])?;
    let actual = probe.rebase_document_suggestion_text_guarded(
        &probe.observe()?,
        first,
        "Changed cell header",
        "4",
        "cell-header-refusal",
        Policy::PreserveInterveningText,
    )?;
    let Rebase::Conflict { reason: Conflict::TargetsChanged { targets } } = actual else {
        return Err("retained cell metadata must conflict".into());
    };
    assert!(targets.iter().any(|target|matches!(target,breditor_collaboration::rich_replica::SuggestionConflictTarget::Header {block} if block=="cell-0-1")));
    Ok(())
}

#[test]
fn sparse_whole_table_atom_keeps_its_complete_body_witness() -> Result {
    let table = wide_table_root()["children"][0].clone();
    let root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[paragraph("before","a"),table,paragraph("after","z")]});
    let (_, mut a, mut b) = setup(Some(root))?;
    let mut request = range("before", 0, 0, "R");
    request.focus = point("after", 1, Affinity::Before);
    let original =
        original(&a, DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(request)]))?;
    let first = preserving_child(&a, &original, "whole-table-first")?;
    b.apply(vec![insert("p1", 1, "X")])?;
    a.receive_frame(&b.update_frame()?)?;
    let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
    let actual = a.rebase_document_suggestion_text_guarded(
        &a.observe()?,
        &first,
        "Cannot discard peer atom text",
        "4",
        "whole-table-refusal",
        Policy::PreserveInterveningText,
    )?;
    let Rebase::Conflict { reason: Conflict::TargetsChanged { targets } } = actual else {
        return Err("whole table body witness must conflict".into());
    };
    assert!(targets.iter().any(|target|matches!(target,breditor_collaboration::rich_replica::SuggestionConflictTarget::Block {block} if block=="table-block")));
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    Ok(())
}
