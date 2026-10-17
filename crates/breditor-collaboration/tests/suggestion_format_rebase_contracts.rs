//! Explicit native formatting revisions preserve original characters and unrelated peer marks.
use breditor_collaboration::rich_replica::{
    AffineTextRangeConflict, Command, DocumentSuggestionDraft, DocumentSuggestionEdit,
    DocumentSuggestionFormatRebase as Rebase, DocumentSuggestionFormatRebaseConflict as Conflict,
    DocumentSuggestionPreparation, DocumentSuggestionRevisionSource, DocumentSuggestionScope,
    RichReplica, SharedRichProfile,
    actions::{DeleteText, InsertText, JoinTextBlocks, SetFormat, SplitTextBlock},
};
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup(text: &str) -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let profile = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/format-rebase","version":1},"extensions":[]}"#,
    )?;
    let mut root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    *root
        .pointer_mut("/children/0/children/0/children/0/children/0/children/0/text")
        .ok_or("fixture paragraph")? = json!(text);
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/format-rebase","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root});
    let a = profile.create(&document.to_string(), "101".into())?;
    let b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((profile, a, b))
}
fn format(block: &str, offset: u32, length: u32, kind: &str, enabled: bool) -> Command {
    Command::SetFormat(SetFormat {
        block: block.into(),
        offset,
        length,
        format: json!({"type":kind,"properties":{}}),
        enabled,
    })
}
fn insert(offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: "p".into(), offset, text: text.into() })
}
fn original(a: &RichReplica, commands: Vec<Command>) -> Result<String> {
    Ok(a.capture_document_suggestion_guarded(
        &a.observe()?,
        "Original",
        ReviewPrincipalId::try_new("alice")?,
        "0",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(commands),
        },
    )?)
}
fn capture(a: &RichReplica, previous: &str) -> Result<String> {
    let result =
        a.rebase_document_suggestion_format_guarded(&a.observe()?, previous, "Rebased", "1")?;
    let Rebase::Captured { revision_packet_json } = result else {
        return Err(format!("captured revision: {result:?}").into());
    };
    Ok(revision_packet_json)
}
fn child(a: &RichReplica, previous: &str) -> Result<String> {
    Ok(a.document_suggestion_revision_packet(previous, &capture(a, previous)?)?)
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
fn characters(input: &str, block: &str) -> Result<Vec<(char, Value)>> {
    fn find<'a>(value: &'a Value, block: &str) -> Option<&'a Value> {
        if value["properties"]["breditor/block-id"] == block {
            return Some(value);
        }
        value["children"].as_array()?.iter().find_map(|child| find(child, block))
    }
    let value: Value = serde_json::from_str(input)?;
    let runs = find(&value["root"], block).ok_or("block")?["children"].as_array().ok_or("runs")?;
    Ok(runs
        .iter()
        .flat_map(|run| {
            run["text"].as_str().unwrap_or_default().chars().map(|c| (c, run["formats"].clone()))
        })
        .collect())
}
#[test]
fn capture_is_a_pure_author_preserving_revision_under_all_six_readonly_policies() -> Result {
    for scope in 0..=2 {
        for natural in [false, true] {
            let (profile, mut a, mut b) = setup("a🙂b")?;
            if scope == 1 {
                a.enable_general_ranges_guarded(&a.observe()?)?;
            }
            if scope == 2 {
                a.enable_document_selection_guarded(&a.observe()?)?;
            }
            if natural {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            a.apply(vec![insert(0, "Retain Redo ")])?;
            a.undo()?;
            let previous = original(&a, vec![format("p", 1, 2, "breditor/strong", false)])?;
            b.apply(vec![insert(0, "Prefix ")])?;
            a.receive_frame(&b.update_frame()?)?;
            assert!(matches!(
                a.prepare_document_suggestion_guarded(&a.observe()?, &previous)?,
                DocumentSuggestionPreparation::Conflict { .. }
            ));
            a.set_read_only_guarded(&a.observe()?, true)?;
            let exact = (save(&a, scope, natural)?, a.update_frame()?, a.view_json()?);
            let revision = capture(&a, &previous)?;
            let info = a.read_document_suggestion_revision(&previous, &revision)?;
            assert_eq!(info.suggestion.author.as_str(), "alice");
            assert!(matches!(
                a.verify_document_suggestion_revision(&previous, &revision)?,
                DocumentSuggestionRevisionSource::Verified { .. }
            ));
            assert_eq!((save(&a, scope, natural)?, a.update_frame()?, a.view_json()?), exact);
            let reopened = restore(&profile, &exact.0, scope, natural)?;
            assert_eq!(capture(&reopened, &previous)?, revision);
            a.set_read_only_guarded(&a.observe()?, false)?;
            // Host read-only policy is runtime state. Restore the same writable publication
            // rather than comparing a real live transition with an already-writable no-op.
            let mut reopened = restore(&profile, &save(&a, scope, natural)?, scope, natural)?;
            assert!(a.redo()?);
            assert!(reopened.redo()?);
            assert_eq!(save(&a, scope, natural)?, save(&reopened, scope, natural)?);
        }
    }
    Ok(())
}
#[test]
fn accepted_native_child_excludes_intruders_preserves_unrelated_marks_and_undo_reopens_exactly()
-> Result {
    let (profile, mut a, mut b) = setup("a🙂b")?;
    let previous = original(&a, vec![format("p", 0, 4, "breditor/strong", false)])?;
    b.apply(vec![
        insert(0, "P"),
        insert(2, "X"),
        format("p", 3, 2, "breditor-inline/italic", true),
    ])?;
    a.receive_frame(&b.update_frame()?)?;
    let before = a.document_json().to_owned();
    let packet = child(&a, &previous)?;
    let DocumentSuggestionPreparation::Ready(preview) =
        a.prepare_document_suggestion_guarded(&a.observe()?, &packet)?
    else {
        return Err("ready child".into());
    };
    let proposed = characters(preview.document_json(), "p")?;
    let current = characters(&before, "p")?;
    assert_eq!(proposed.iter().map(|(c, _)| c).collect::<String>(), "PaX🙂b");
    for (c, formats) in &proposed {
        if matches!(c, 'P' | 'X') {
            assert_eq!(
                Some(formats),
                current.iter().find(|(value, _)| value == c).map(|(_, marks)| marks)
            );
        } else {
            assert!(
                !formats
                    .as_array()
                    .ok_or("formats")?
                    .iter()
                    .any(|mark| mark["type"] == "breditor/strong")
            );
        }
    }
    assert!(
        proposed
            .iter()
            .find(|(c, _)| *c == '🙂')
            .ok_or("emoji")?
            .1
            .as_array()
            .ok_or("emoji formats")?
            .iter()
            .any(|mark| mark["type"] == "breditor-inline/italic")
    );
    let prepared = a.prepare_document_suggestion_effect(&preview)?;
    assert_eq!(a.document_json(), before);
    a.commit_document_suggestion_effect(prepared)?;
    let accepted = a.document_json().to_owned();
    let mut reopened = profile.restore("room", &a.checkpoint()?)?;
    assert!(a.undo()?);
    assert!(reopened.undo()?);
    assert_eq!(a.document_json(), before);
    assert_eq!(a.checkpoint()?, reopened.checkpoint()?);
    assert!(a.redo()?);
    assert!(reopened.redo()?);
    assert_eq!(a.document_json(), accepted);
    assert_eq!(a.checkpoint()?, reopened.checkpoint()?);
    Ok(())
}
#[test]
fn only_changed_values_of_the_touched_kind_on_original_characters_conflict() -> Result {
    let (_, mut a, mut b) = setup("a🙂b")?;
    let previous = original(&a, vec![format("p", 1, 2, "breditor/strong", false)])?;
    b.apply(vec![format("p", 0, 1, "breditor/strong", false)])?;
    a.receive_frame(&b.update_frame()?)?;
    capture(&a, &previous)?;
    b.apply(vec![format("p", 1, 2, "breditor/strong", false)])?;
    a.receive_frame(&b.update_frame()?)?;
    let exact = a.checkpoint()?;
    assert_eq!(
        a.rebase_document_suggestion_format_guarded(&a.observe()?, &previous, "Conflict", "1")?,
        Rebase::Conflict { reason: Conflict::FormatChanged }
    );
    assert_eq!(a.checkpoint()?, exact);
    Ok(())
}
#[test]
fn equal_reinserted_characters_cannot_be_reformatted_as_the_original_set() -> Result {
    let (_, mut a, mut b) = setup("a🙂b")?;
    let previous = original(&a, vec![format("p", 1, 2, "breditor/strong", false)])?;
    b.apply(vec![
        Command::DeleteText(DeleteText { block: "p".into(), offset: 1, length: 2 }),
        insert(1, "🙂"),
        format("p", 1, 2, "breditor/strong", true),
    ])?;
    a.receive_frame(&b.update_frame()?)?;
    assert_eq!(
        a.rebase_document_suggestion_format_guarded(&a.observe()?, &previous, "Conflict", "1")?,
        Rebase::Conflict {
            reason: Conflict::Range { reason: AffineTextRangeConflict::CharactersDeleted }
        }
    );
    Ok(())
}
#[test]
fn original_characters_rebase_across_native_splits_and_joins() -> Result {
    let (_, mut a, mut b) = setup("a🙂b")?;
    let previous = original(&a, vec![format("p", 0, 4, "breditor/strong", false)])?;
    b.apply(vec![Command::SplitTextBlock(SplitTextBlock {
        block: "p".into(),
        offset: 1,
        right: "format-right".into(),
        right_heading: None,
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    let packet = child(&a, &previous)?;
    let DocumentSuggestionPreparation::Ready(preview) =
        a.prepare_document_suggestion_guarded(&a.observe()?, &packet)?
    else {
        return Err("split child".into());
    };
    for block in ["p", "format-right"] {
        assert!(
            characters(preview.document_json(), block)?
                .iter()
                .all(|(_, marks)| marks == &json!([]))
        );
    }
    b.apply(vec![Command::JoinTextBlocks(JoinTextBlocks {
        left: "p".into(),
        right: "format-right".into(),
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    let packet = child(&a, &previous)?;
    let DocumentSuggestionPreparation::Ready(preview) =
        a.prepare_document_suggestion_guarded(&a.observe()?, &packet)?
    else {
        return Err("joined child".into());
    };
    assert_eq!(
        characters(preview.document_json(), "p")?,
        vec![('a', json!([])), ('🙂', json!([])), ('b', json!([]))]
    );
    Ok(())
}
#[test]
fn missing_sources_unsupported_batches_and_observation_guards_never_create_a_partial_child()
-> Result {
    let (_, mut a, b) = setup("a🙂b")?;
    a.apply(vec![insert(0, "P")])?;
    let previous = original(&a, vec![format("p", 2, 2, "breditor/strong", false)])?;
    assert!(
        matches!(b.rebase_document_suggestion_format_guarded(&b.observe()?, &previous, "Pending", "1")?, Rebase::Pending { missing } if !missing.is_empty())
    );
    let batch =
        original(&a, vec![format("p", 2, 2, "breditor/strong", false), insert(0, "Also ")])?;
    let exact = a.checkpoint()?;
    assert_eq!(
        a.rebase_document_suggestion_format_guarded(&a.observe()?, &batch, "Unsupported", "1")?,
        Rebase::Unsupported
    );
    assert!(
        a.rebase_document_suggestion_format_guarded(&b.observe()?, &previous, "Foreign", "1")
            .is_err()
    );
    assert_eq!(a.checkpoint()?, exact);
    let old = a.observe()?;
    a.apply(vec![insert(0, "Q")])?;
    let after = a.checkpoint()?;
    assert!(a.rebase_document_suggestion_format_guarded(&old, &previous, "Stale", "1").is_err());
    assert_eq!(a.checkpoint()?, after);
    Ok(())
}
#[test]
fn excessive_fragmentation_refuses_instead_of_dropping_any_original_characters() -> Result {
    let (_, mut a, mut b) = setup(&"a".repeat(70))?;
    let previous = original(&a, vec![format("p", 0, 70, "breditor/strong", false)])?;
    let edits = (1..70).rev().map(|offset| insert(offset, "X")).collect::<Vec<_>>();
    for commands in edits.chunks(32) {
        b.apply(commands.to_vec())?;
    }
    a.receive_frame(&b.update_frame()?)?;
    let exact = a.checkpoint()?;
    assert!(matches!(
        a.rebase_document_suggestion_format_guarded(&a.observe()?, &previous, "Too many", "1"),
        Err(breditor_collaboration::Error::Limit("format rebase action steps"))
    ));
    assert_eq!(a.checkpoint()?, exact);
    Ok(())
}
