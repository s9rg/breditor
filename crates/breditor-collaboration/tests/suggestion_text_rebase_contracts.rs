//! Complete native text revisions keep original range semantics and reject intervening text explicitly.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        AffineTextRangeConflict, Command, DocumentSuggestionDraft, DocumentSuggestionEdit,
        DocumentSuggestionPreparation, DocumentSuggestionRevisionSource, DocumentSuggestionScope,
        DocumentSuggestionTextRebase as Rebase, DocumentSuggestionTextRebaseConflict as Conflict,
        DocumentSuggestionTextRebasePolicy as Policy, RichReplica, SharedRichProfile,
        actions::{
            DeleteText, InsertText, RangeTextRun, ReplaceTextRange, ResizeColumn, SetFormat,
        },
        selection::{Selection, TextPoint},
    },
};
use breditor_core::{
    document::{FormatSet, TextRun},
    rich_content::review::ReviewPrincipalId,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup(root: Option<Value>) -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let profile = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/text-rebase","version":1},"extensions":[]}"#,
    )?;
    let root = match root {
        Some(root) => root,
        None => serde_json::from_str(include_str!(
            "../../breditor-core/tests/fixtures/rich-local-root.json"
        ))?,
    };
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/text-rebase","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root});
    let a = profile.create(&document.to_string(), "101".into())?;
    let b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((profile, a, b))
}
fn point(block: &str, offset: u32, affinity: Affinity) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity }
}
fn range(block: &str, from: u32, to: u32, text: &str) -> ReplaceTextRange {
    ReplaceTextRange {
        anchor: point(block, from, Affinity::After),
        focus: point(block, to, Affinity::Before),
        runs: if text.is_empty() {
            vec![]
        } else {
            vec![RangeTextRun { text: text.into(), formats: vec![] }]
        },
    }
}
fn insert(block: &str, offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset, text: text.into() })
}
fn original(a: &RichReplica, edit: DocumentSuggestionEdit) -> Result<String> {
    Ok(a.capture_document_suggestion_guarded(
        &a.observe()?,
        "Original",
        ReviewPrincipalId::try_new("alice")?,
        "0",
        DocumentSuggestionDraft { scope: DocumentSuggestionScope::Commands, edit },
    )?)
}
fn result(a: &RichReplica, previous: &str, prefix: &str) -> Result<Rebase> {
    Ok(a.rebase_document_suggestion_text_guarded(
        &a.observe()?,
        previous,
        "Rebased",
        "1",
        prefix,
        Policy::RejectInterveningText,
    )?)
}
fn revision(a: &RichReplica, previous: &str, prefix: &str) -> Result<String> {
    match result(a, previous, prefix)? {
        Rebase::Captured { revision_packet_json } => Ok(revision_packet_json),
        other => Err(format!("capture: {other:?}").into()),
    }
}
fn child(a: &RichReplica, previous: &str, prefix: &str) -> Result<String> {
    Ok(a.document_suggestion_revision_packet(previous, &revision(a, previous, prefix)?)?)
}
fn proposed(a: &RichReplica, packet: &str) -> Result<String> {
    match a.prepare_document_suggestion_guarded(&a.observe()?, packet)? {
        DocumentSuggestionPreparation::Ready(preview) => Ok(preview.document_json().into()),
        _ => Err("native Ready preview required".into()),
    }
}
fn node<'a>(value: &'a Value, id: &str) -> Option<&'a Value> {
    if value["properties"]["breditor/block-id"] == id {
        Some(value)
    } else {
        value["children"].as_array()?.iter().find_map(|value| node(value, id))
    }
}
fn text(input: &str, id: &str) -> Result<String> {
    let value: Value = serde_json::from_str(input)?;
    Ok(node(&value["root"], id).ok_or("text block")?["children"]
        .as_array()
        .ok_or("runs")?
        .iter()
        .filter_map(|run| run["text"].as_str())
        .collect())
}
fn run_formats(input: &str, id: &str, text: &str) -> Result<Value> {
    let current: Value = serde_json::from_str(input)?;
    Ok(node(&current["root"], id).ok_or("current block")?["children"]
        .as_array()
        .ok_or("current runs")?
        .iter()
        .find(|run| run["text"] == text)
        .ok_or("current run")?["formats"]
        .clone())
}
fn save(a: &RichReplica, scope: u8, natural: bool) -> Result<String> {
    Ok(match (scope, natural) {
        (0, false) => a.checkpoint()?,
        (0, true) => a.typing_checkpoint()?,
        (1, false) => a.general_checkpoint()?,
        (1, true) => a.general_typing_checkpoint()?,
        (2, false) => a.document_checkpoint()?,
        (2, true) => a.document_typing_checkpoint()?,
        _ => return Err("policy".into()),
    })
}
fn restore(p: &SharedRichProfile, input: &str, scope: u8, natural: bool) -> Result<RichReplica> {
    Ok(match (scope, natural) {
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
fn pure_read_only_capture_reopens_exactly_with_redo_under_all_six_policies() -> Result {
    for scope in 0..=2 {
        for natural in [false, true] {
            let (profile, mut a, mut b) = setup(None)?;
            if scope >= 1 {
                a.enable_general_ranges_guarded(&a.observe()?)?;
            }
            if scope == 2 {
                a.enable_document_selection_guarded(&a.observe()?)?;
            }
            if natural {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            a.apply(vec![insert("p", 0, "Retain Redo ")])?;
            a.undo()?;
            let previous = original(
                &a,
                DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(range(
                    "p", 1, 3, "R🙂",
                ))]),
            )?;
            b.apply(vec![insert("p", 0, "P"), insert("p", 5, "Q")])?;
            a.receive_frame(&b.update_frame()?)?;
            assert!(matches!(
                a.prepare_document_suggestion_guarded(&a.observe()?, &previous)?,
                DocumentSuggestionPreparation::Conflict { .. }
            ));
            a.set_read_only_guarded(&a.observe()?, true)?;
            let before = (save(&a, scope, natural)?, a.update_frame()?, a.view_json()?);
            let captured = revision(&a, &previous, "native-text-revision")?;
            assert_eq!(
                a.read_document_suggestion_revision(&previous, &captured)?
                    .suggestion
                    .author
                    .as_str(),
                "alice"
            );
            assert!(matches!(
                a.verify_document_suggestion_revision(&previous, &captured)?,
                DocumentSuggestionRevisionSource::Verified { .. }
            ));
            assert_eq!((save(&a, scope, natural)?, a.update_frame()?, a.view_json()?), before);
            let reopened = restore(&profile, &before.0, scope, natural)?;
            assert_eq!(revision(&reopened, &previous, "native-text-revision")?, captured);
            let packet = a.document_suggestion_revision_packet(&previous, &captured)?;
            assert_eq!(text(&proposed(&a, &packet)?, "p")?, "PaR🙂bQ");
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
fn selected_peer_insertions_and_marks_refuse_without_partial_children() -> Result {
    for formatting in [false, true] {
        let (_, mut a, mut b) = setup(None)?;
        let previous = original(
            &a,
            DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(range(
                "p", 0, 4, "R",
            ))]),
        )?;
        b.apply(if formatting {
            vec![Command::SetFormat(SetFormat {
                block: "p".into(),
                offset: 1,
                length: 2,
                format: json!({"type":"breditor-inline/italic","properties":{}}),
                enabled: true,
            })]
        } else {
            vec![insert("p", 1, "X")]
        })?;
        a.receive_frame(&b.update_frame()?)?;
        let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
        assert_eq!(
            result(&a, &previous, "refused-text")?,
            Rebase::Conflict {
                reason: if formatting {
                    Conflict::FormattingChanged
                } else {
                    Conflict::InterveningText
                }
            }
        );
        assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    }
    Ok(())
}
#[test]
fn equal_reinsertion_is_original_character_loss_and_structural_witnesses_are_not_weakened() -> Result
{
    let (_, mut a, mut b) = setup(None)?;
    let previous = original(
        &a,
        DocumentSuggestionEdit::Commands(vec![Command::DeleteText(DeleteText {
            block: "p".into(),
            offset: 1,
            length: 2,
        })]),
    )?;
    b.apply(vec![
        Command::DeleteText(DeleteText { block: "p".into(), offset: 1, length: 2 }),
        insert("p", 1, "🙂"),
    ])?;
    a.receive_frame(&b.update_frame()?)?;
    assert_eq!(
        result(&a, &previous, "deleted-character")?,
        Rebase::Conflict {
            reason: Conflict::Range { reason: AffineTextRangeConflict::CharactersDeleted }
        }
    );
    let (_, mut a, mut b) = setup(None)?;
    let previous = original(
        &a,
        DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(range("p", 1, 3, "R"))]),
    )?;
    b.apply(vec![Command::ResizeColumn(ResizeColumn {
        block: "table-block".into(),
        column: "c".into(),
        width: 240,
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    assert!(matches!(
        result(&a, &previous, "table-witness")?,
        Rebase::Conflict { reason: Conflict::TargetsChanged { .. } }
    ));
    Ok(())
}
#[test]
fn collapsed_affinities_never_select_and_delete_peer_text_at_the_gap() -> Result {
    let (_, mut a, mut b) = setup(None)?;
    let mut request = range("p", 1, 1, "R");
    request.anchor.affinity = Affinity::Before;
    request.focus.affinity = Affinity::After;
    let previous =
        original(&a, DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(request)]))?;
    b.apply(vec![insert("p", 1, "X")])?;
    a.receive_frame(&b.update_frame()?)?;
    assert_eq!(text(&proposed(&a, &child(&a, &previous, "empty-range")?)?, "p")?, "aRX🙂b");
    Ok(())
}
#[test]
fn plain_insertions_keep_their_proved_source_inherited_formats_not_new_peer_marks() -> Result {
    let (_, mut a, mut b) = setup(None)?;
    let previous = original(&a, DocumentSuggestionEdit::Commands(vec![insert("p", 1, "R")]))?;
    b.apply(vec![Command::SetFormat(SetFormat {
        block: "p".into(),
        offset: 0,
        length: 4,
        format: json!({"type":"breditor/strong","properties":{}}),
        enabled: false,
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    let preview: Value =
        serde_json::from_str(&proposed(&a, &child(&a, &previous, "source-styles")?)?)?;
    let runs =
        node(&preview["root"], "p").ok_or("paragraph")?["children"].as_array().ok_or("runs")?;
    let inserted = runs
        .iter()
        .find(|run| run["text"].as_str().is_some_and(|text| text.contains('R')))
        .ok_or("inserted run")?;
    assert!(
        inserted["formats"]
            .as_array()
            .ok_or("formats")?
            .iter()
            .any(|value| value["type"] == "breditor/strong")
    );
    Ok(())
}
#[test]
fn missing_source_is_pending_and_mixed_steps_are_never_partially_dropped() -> Result {
    let (_, mut a, mut b) = setup(None)?;
    b.apply(vec![insert("p", 0, "B")])?;
    let previous = original(
        &b,
        DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(range("p", 2, 4, "R"))]),
    )?;
    assert!(matches!(result(&a, &previous, "source-pending")?, Rebase::Pending { .. }));
    a.receive_frame(&b.update_frame()?)?;
    revision(&a, &previous, "source-ready")?;
    let mixed = original(
        &a,
        DocumentSuggestionEdit::Commands(vec![insert("p", 0, "A"), insert("p", 0, "B")]),
    )?;
    assert_eq!(result(&a, &mixed, "mixed")?, Rebase::Unsupported);
    Ok(())
}
#[test]
fn protected_general_replacement_keeps_shapes_and_declares_new_floors_without_command_lowering()
-> Result {
    let (_, mut a, mut b) = setup(None)?;
    let target = Selection::TextRange {
        anchor: point("p", 1, Affinity::After),
        focus: point("caption", 1, Affinity::Before),
    };
    let draft = a.plan_suggestion_general_text_guarded(
        &a.observe()?,
        &target,
        &TextRun::try_new("R🙂", FormatSet::try_from_formats(vec![])?)?.into(),
        "old-protected",
    )?;
    let previous = original(&a, draft.edit)?;
    b.apply(vec![insert("p", 0, "P"), insert("caption", 4, "Q")])?;
    a.receive_frame(&b.update_frame()?)?;
    let packet = child(&a, &previous, "new-protected")?;
    let preview: Value = serde_json::from_str(&proposed(&a, &packet)?)?;
    assert_eq!(text(&preview.to_string(), "p")?, "PaR🙂");
    assert_eq!(text(&preview.to_string(), "caption")?, "y🙂Q");
    let before: Value = serde_json::from_str(a.document_json())?;
    for id in ["table-block", "image-block"] {
        assert_eq!(
            node(&preview["root"], id).ok_or("retained node")?["properties"],
            node(&before["root"], id).ok_or("original node")?["properties"]
        );
    }
    let encoded: Value = serde_json::from_str(&packet)?;
    assert_eq!(encoded["data"]["draft"]["edit"]["kind"], "general_text");
    Ok(())
}
#[test]
fn stale_guard_is_checked_before_untrusted_bytes_and_repeated_children_remain_declarative() -> Result
{
    let (_, mut a, mut b) = setup(None)?;
    let previous = original(
        &a,
        DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(range("p", 1, 3, "R"))]),
    )?;
    let stale = a.observe()?;
    a.apply(vec![insert("caption", 0, "Own ")])?;
    let before = a.checkpoint()?;
    assert!(
        a.rebase_document_suggestion_text_guarded(
            &stale,
            "not JSON",
            "Rebased",
            "1",
            "stale",
            Policy::RejectInterveningText
        )
        .is_err()
    );
    assert_eq!(a.checkpoint()?, before);
    let first = child(&a, &previous, "first-child")?;
    b.apply(vec![insert("p", 0, "P")])?;
    a.receive_frame(&b.update_frame()?)?;
    let second = child(&a, &first, "second-child")?;
    assert_eq!(text(&proposed(&a, &second)?, "p")?, "PaRb");
    Ok(())
}

fn paragraph(id: &str, text: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":id},"children":[{"kind":"text","text":text,"formats":[]}]})
}
#[test]
fn general_rebase_above_64_structural_steps_keeps_one_intent_and_exact_fresh_floors() -> Result {
    let root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[{"kind":"element","type":"breditor/table","entityId":null,"properties":{"breditor/block-id":"table-block","breditor/table-id":"t","breditor/columns":(0..20).map(|c|json!({"id":format!("c{c}"),"width":120})).collect::<Vec<_>>(),"breditor/merges":[],"breditor/retracted-merges":[]},"children":(0..2).map(|r|json!({"kind":"element","type":"breditor/table-row","entityId":null,"properties":{"breditor/block-id":format!("row{r}"),"breditor/row-id":format!("r{r}")},"children":(0..20).map(|c|json!({"kind":"element","type":"breditor/table-cell","entityId":null,"properties":{"breditor/block-id":format!("cell-{r}-{c}"),"breditor/column-id":format!("c{c}"),"breditor/header":false},"children":[paragraph(&format!("p{}",r*20+c),"abc")]})).collect::<Vec<_>>()})).collect::<Vec<_>>()}]});
    let (_, mut a, mut b) = setup(Some(root))?;
    let target = Selection::TextRange {
        anchor: point("p0", 1, Affinity::After),
        focus: point("p39", 2, Affinity::Before),
    };
    let draft = a.plan_suggestion_general_text_guarded(
        &a.observe()?,
        &target,
        &TextRun::try_new("R🙂", FormatSet::try_from_formats(vec![])?)?.into(),
        "original-many-floors",
    )?;
    let previous = original(&a, draft.edit)?;
    b.apply(vec![insert("p0", 0, "P"), insert("p39", 3, "Q")])?;
    a.receive_frame(&b.update_frame()?)?;
    let packet = child(&a, &previous, "rebased-many-floors")?;
    let encoded: Value = serde_json::from_str(&packet)?;
    assert_eq!(encoded["data"]["draft"]["edit"]["kind"], "general_text");
    let empty =
        encoded["data"]["draft"]["edit"]["data"]["empty"].as_array().ok_or("native floors")?;
    assert_eq!(empty.len(), 38);
    assert!(
        empty.iter().all(|id| id.as_str().is_some_and(|id| id.starts_with("rebased-many-floors")))
    );
    let after = proposed(&a, &packet)?;
    assert_eq!(text(&after, "p0")?, "PaR🙂");
    assert_eq!(text(&after, "p39")?, "cQ");
    let after: Value = serde_json::from_str(&after)?;
    let before: Value = serde_json::from_str(a.document_json())?;
    assert_eq!(
        node(&after["root"], "table-block").ok_or("table")?["properties"],
        node(&before["root"], "table-block").ok_or("source table")?["properties"]
    );
    Ok(())
}
#[test]
fn joined_rebase_removes_only_whole_original_atoms_and_undo_preserves_peer_text() -> Result {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let image = fixture["children"][0]["children"][0]["children"][0]["children"][1].clone();
    let root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[paragraph("p","abc"),image,paragraph("middle","m🙂"),paragraph("q","def")]});
    let (profile, mut a, mut b) = setup(Some(root))?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    let mut request = range("p", 1, 1, "R");
    request.focus = point("q", 2, Affinity::Before);
    let previous =
        original(&a, DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(request)]))?;
    b.apply(vec![insert("p", 0, "P"), insert("q", 3, "Q")])?;
    a.receive_frame(&b.update_frame()?)?;
    let before = a.document_json().to_owned();
    let packet = child(&a, &previous, "joined-child")?;
    let DocumentSuggestionPreparation::Ready(preview) =
        a.prepare_document_suggestion_guarded(&a.observe()?, &packet)?
    else {
        return Err("joined Ready".into());
    };
    let expected = preview.document_json().to_owned();
    assert_eq!(text(&expected, "p")?, "PaRfQ");
    let value: Value = serde_json::from_str(&expected)?;
    assert!(node(&value["root"], "image-block").is_none());
    assert!(node(&value["root"], "middle").is_none());
    let effect = a.prepare_document_suggestion_effect(&preview)?;
    a.commit_document_suggestion_effect(effect)?;
    assert_eq!(a.document_json(), expected);
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
fn explicit_document_scope_and_required_policy_are_not_silently_changed() -> Result {
    assert!(serde_json::from_str::<Policy>("null").is_err());
    assert_eq!(
        serde_json::from_str::<Policy>("\"preserve_intervening_text\"")?,
        Policy::PreserveInterveningText
    );
    assert!(serde_json::from_str::<Policy>("\"silently_delete_peer_text\"").is_err());
    let (_, a, _) = setup(None)?;
    let previous = a.capture_document_suggestion_guarded(
        &a.observe()?,
        "Whole-source scope",
        ReviewPrincipalId::try_new("alice")?,
        "0",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Document,
            edit: DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(range(
                "p", 1, 3, "R",
            ))]),
        },
    )?;
    let packet: Value = serde_json::from_str(&child(&a, &previous, "same-explicit-scope")?)?;
    assert_eq!(packet["data"]["draft"]["scope"], "document");
    Ok(())
}

#[test]
fn explicit_preserving_capture_retains_peer_runs_and_exact_read_only_recovery_all_policies()
-> Result {
    for scope in 0..=2 {
        for natural in [false, true] {
            let (profile, mut a, mut b) = setup(None)?;
            if scope >= 1 {
                a.enable_general_ranges_guarded(&a.observe()?)?;
            }
            if scope == 2 {
                a.enable_document_selection_guarded(&a.observe()?)?;
            }
            if natural {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            let previous = original(
                &a,
                DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(range(
                    "p", 0, 4, "R",
                ))]),
            )?;
            let italic = json!({"type":"breditor-inline/italic","properties":{}});
            b.apply(vec![
                insert("p", 1, "X"),
                Command::SetFormat(SetFormat {
                    block: "p".into(),
                    offset: 1,
                    length: 1,
                    format: italic.clone(),
                    enabled: true,
                }),
            ])?;
            a.receive_frame(&b.update_frame()?)?;
            let peer_formats = run_formats(a.document_json(), "p", "X")?;
            assert!(peer_formats.as_array().ok_or("peer marks")?.contains(&italic));
            assert_eq!(
                result(&a, &previous, "conflict-policy")?,
                Rebase::Conflict { reason: Conflict::InterveningText }
            );
            a.set_read_only_guarded(&a.observe()?, true)?;
            let exact = (save(&a, scope, natural)?, a.update_frame()?, a.view_json()?);
            let capture = |owner: &RichReplica| -> Result<String> {
                match owner.rebase_document_suggestion_text_guarded(
                    &owner.observe()?,
                    &previous,
                    "Preserving revision",
                    "2",
                    "preserving-child",
                    Policy::PreserveInterveningText,
                )? {
                    Rebase::Captured { revision_packet_json } => Ok(revision_packet_json),
                    other => Err(format!("preserving capture: {other:?}").into()),
                }
            };
            let revision = capture(&a)?;
            assert_eq!((save(&a, scope, natural)?, a.update_frame()?, a.view_json()?), exact);
            let reopened = restore(&profile, &exact.0, scope, natural)?;
            assert_eq!(capture(&reopened)?, revision);
            let child = a.document_suggestion_revision_packet(&previous, &revision)?;
            let raw: Value = serde_json::from_str(&child)?;
            assert_eq!(
                raw["data"]["draft"]["edit"]["data"].as_array().ok_or("one compound")?.len(),
                1
            );
            assert_eq!(
                raw["data"]["draft"]["edit"]["data"][0]["kind"],
                "replace_masked_general_text_range_v1"
            );
            assert_eq!(
                a.read_document_suggestion_revision(&previous, &revision)?
                    .suggestion
                    .author
                    .as_str(),
                "alice"
            );
            let proposal = proposed(&a, &child)?;
            assert_eq!(text(&proposal, "p")?, "RX");
            let proposal: Value = serde_json::from_str(&proposal)?;
            assert!(
                node(&proposal["root"], "p").ok_or("proposed p")?["children"]
                    .as_array()
                    .ok_or("runs")?
                    .iter()
                    .any(|run| run["text"] == "X" && run["formats"] == peer_formats)
            );
            // The current masked child is exact-source only; never reinterpret its holes as a
            // contiguous original range. A fresh rebase can still start from the original packet.
            assert_eq!(
                a.rebase_document_suggestion_text_guarded(
                    &a.observe()?,
                    &child,
                    "No broadening",
                    "3",
                    "not-reused",
                    Policy::PreserveInterveningText
                )?,
                Rebase::Unsupported
            );
            assert_eq!((save(&a, scope, natural)?, a.update_frame()?, a.view_json()?), exact);
        }
    }
    Ok(())
}

#[test]
fn preserving_policy_does_not_weaken_selected_marks_or_character_loss_or_child_witnesses() -> Result
{
    for changed_mark in [false, true] {
        let (_, mut a, mut b) = setup(None)?;
        let previous = original(
            &a,
            DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(range(
                "p", 0, 4, "R",
            ))]),
        )?;
        b.apply(if changed_mark {
            vec![Command::SetFormat(SetFormat {
                block: "p".into(),
                offset: 1,
                length: 2,
                format: json!({"type":"breditor-inline/italic","properties":{}}),
                enabled: true,
            })]
        } else {
            vec![
                Command::DeleteText(DeleteText { block: "p".into(), offset: 1, length: 2 }),
                insert("p", 1, "🙂"),
            ]
        })?;
        a.receive_frame(&b.update_frame()?)?;
        let before = a.checkpoint()?;
        let result = a.rebase_document_suggestion_text_guarded(
            &a.observe()?,
            &previous,
            "Refused preserving",
            "1",
            "refused-preserving",
            Policy::PreserveInterveningText,
        )?;
        assert_eq!(
            result,
            Rebase::Conflict {
                reason: if changed_mark {
                    Conflict::FormattingChanged
                } else {
                    Conflict::Range { reason: AffineTextRangeConflict::CharactersDeleted }
                }
            }
        );
        assert_eq!(a.checkpoint()?, before);
    }
    let (_, mut a, mut b) = setup(None)?;
    let previous = original(
        &a,
        DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(range("p", 0, 4, "R"))]),
    )?;
    b.apply(vec![insert("p", 1, "X")])?;
    a.receive_frame(&b.update_frame()?)?;
    let revision = match a.rebase_document_suggestion_text_guarded(
        &a.observe()?,
        &previous,
        "Exact child",
        "1",
        "exact-masked-child",
        Policy::PreserveInterveningText,
    )? {
        Rebase::Captured { revision_packet_json } => revision_packet_json,
        other => return Err(format!("capture {other:?}").into()),
    };
    let child = a.document_suggestion_revision_packet(&previous, &revision)?;
    assert_eq!(text(&proposed(&a, &child)?, "p")?, "RX");
    // Equal text is not equal identity: replacing the retained peer character must invalidate
    // even an otherwise identical whole-document semantic projection.
    a.apply(vec![
        Command::DeleteText(DeleteText { block: "p".into(), offset: 1, length: 1 }),
        insert("p", 1, "X"),
    ])?;
    assert!(matches!(
        a.prepare_document_suggestion_guarded(&a.observe()?, &child)?,
        DocumentSuggestionPreparation::Conflict { .. }
    ));
    Ok(())
}
