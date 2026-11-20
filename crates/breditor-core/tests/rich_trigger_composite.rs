//! Native slash-command composite: trigger removal + one follow-up step as ONE exact history unit.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec, RichTypingSessionJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichFlowParent, RichFlowPosition, RichLocalOutcome,
        RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichSelectionKind,
        RichSelectionUpdate, RichTextPoint, RichTriggerStepError,
        actions::{InsertHorizontalRule, RichAction, SetHeading},
        standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
type Step = std::result::Result<RichLocalOutcome, RichLocalSessionError>;

fn context(revision: u32) -> Result<EditorContext> {
    let id = SchemaId::new(QualifiedName::try_new("example/layout")?, SchemaVersion::try_new(1)?);
    let extensions =
        ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?;
    let schema = match revision {
        1 => CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
        2 => CompiledSchema::try_compile_rich_content_profile_v2(id, &extensions)?,
        4 => CompiledSchema::try_compile_rich_content_profile_v4(id, &extensions)?,
        _ => return Err("revision".into()),
    };
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}
fn admit(c: &EditorContext, root: &Value) -> Result<RichDocument> {
    let mut input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/layout","version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":null});
    input["root"] = root.clone();
    Ok(RichDocument::try_admit(
        c.schema(),
        DocumentJsonCodecV2::new(c.schema().clone()).decode(&input.to_string())?,
        c.limits(),
    )?)
}
fn encode(c: &EditorContext, a: &RichLocalSession) -> Result<Value> {
    Ok(serde_json::from_str::<Value>(
        &DocumentJsonCodecV2::new(c.schema().clone()).encode(a.state().document().document())?,
    )?["root"]
        .clone())
}
/// `p`: the given text, `q`: "Other" and (V2+ only) `code`: a code block.
fn root(structural: bool, text: &str) -> Value {
    let mut children = vec![fixture::paragraph("p", text), fixture::paragraph("q", "Other")];
    if structural {
        children.push(fixture::element(
            "code-block",
            "code",
            vec![json!({"kind":"text","text":"/x","formats":[]})],
        ));
    }
    let mut root = fixture::element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn point(block: &str, offset: u64) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(BlockId::try_new(block)?, TextOffset::try_new(offset)?, Affinity::After))
}
fn range(block: &str, start: u64, end: u64) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::TextRange { anchor: point(block, start)?, focus: point(block, end)? })
}
fn owner(c: &EditorContext, text: &str, caret: u64) -> Result<RichLocalSession> {
    Ok(RichLocalSession::try_new(
        c.clone(),
        admit(c, &root(true, text)).or_else(|_| admit(c, &root(false, text)))?,
        Some(range("p", caret, caret)?),
        HistoryCapacity::default(),
    )?)
}
fn caret(a: &RichLocalSession) -> Result<(String, u64, u64)> {
    let RichSelectionKind::TextRange { anchor, focus } =
        a.state().selection().ok_or("selection")?.kind()
    else {
        return Err("text selection".into());
    };
    Ok((anchor.block().as_str().to_owned(), anchor.offset().get(), focus.offset().get()))
}
fn heading(level: Option<u8>) -> impl FnOnce(&mut RichLocalSession, &RichLocalSnapshot) -> Step {
    move |scratch, observed| {
        let block = BlockId::try_new("p").map_err(|_| RichLocalSessionError::TriggerStep)?;
        let action = SetHeading::capture(scratch.state().document(), &block, level)?;
        scratch.dispatch(observed, &[RichAction::SetHeading(action)], RichSelectionUpdate::Map)
    }
}

#[test]
fn heading_after_trigger_is_one_exact_undo_redo_and_checkpoint_unit() -> Result {
    for revision in [1, 2, 4] {
        let c = context(revision)?;
        let mut a = owner(&c, "Intro /hea", 10)?;
        let original = encode(&c, &a)?;
        let revision_before = a.state().revision();
        let outcome =
            a.replace_trigger_then(&a.snapshot(), &range("p", 6, 10)?, heading(Some(2)))?;
        assert_eq!(outcome, RichLocalOutcome::ContentCommitted);
        let after = encode(&c, &a)?;
        let block = &after["children"][0];
        assert_eq!(block["type"], "breditor/heading");
        assert_eq!(block["properties"]["breditor/level"], 2);
        assert_eq!(block["children"], json!([{"kind":"text","text":"Intro ","formats":[]}]));
        // The follow-up mapped the post-removal caret (the trigger start).
        assert_eq!(caret(&a)?, ("p".into(), 6, 6));
        assert_eq!(a.state().revision(), revision_before.successor()?);
        assert_eq!((a.undo_depth(), a.history_step_count()), (1, 1));
        // One Undo restores the typed `/hea` and the actual pre-command caret.
        assert_eq!(a.undo(&a.snapshot())?, RichLocalOutcome::UndoApplied);
        assert_eq!(encode(&c, &a)?, original);
        assert_eq!(caret(&a)?, ("p".into(), 10, 10));
        assert!(!a.can_undo());
        assert_eq!(a.redo(&a.snapshot())?, RichLocalOutcome::RedoApplied);
        assert_eq!(encode(&c, &a)?, after);
        assert_eq!(caret(&a)?, ("p".into(), 6, 6));
        // Checkpoint/restore keeps the single unit exact in both directions.
        let codec = RichSessionJsonCodec::new(c.clone());
        let mut b = codec.decode(&codec.encode(&a)?)?;
        assert_eq!(encode(&c, &b)?, after);
        assert_eq!(b.undo_depth(), 1);
        b.undo(&b.snapshot())?;
        assert_eq!(encode(&c, &b)?, original);
        assert_eq!(caret(&b)?, ("p".into(), 10, 10));
        let mut d = codec.decode(&codec.encode(&b)?)?;
        d.redo(&d.snapshot())?;
        assert_eq!(encode(&c, &d)?, after);
        assert_eq!(caret(&d)?, ("p".into(), 6, 6));
    }
    Ok(())
}

#[test]
fn rule_insertion_after_trigger_is_one_unit_and_removes_an_only_trigger() -> Result {
    let c = context(2)?;
    let mut a = owner(&c, "/hr", 3)?;
    let original = encode(&c, &a)?;
    a.replace_trigger_then(
        &a.snapshot(),
        &range("p", 0, 3)?,
        |scratch: &mut RichLocalSession,
         observed: &RichLocalSnapshot|
         -> Result<RichLocalOutcome> {
            let position =
                RichFlowPosition::new(RichFlowParent::Document, Some(BlockId::try_new("q")?));
            let action = InsertHorizontalRule::capture(
                scratch.state().document(),
                &position,
                &BlockId::try_new("rule")?,
            )?;
            scratch
                .dispatch(
                    observed,
                    &[RichAction::InsertHorizontalRule(action)],
                    RichSelectionUpdate::Map,
                )
                .map_err(Into::into)
        },
    )
    .map_err(|error| match error {
        RichTriggerStepError::Session(error) => Box::new(error) as Box<dyn std::error::Error>,
        RichTriggerStepError::Step(error) => error,
    })?;
    let after = encode(&c, &a)?;
    assert_eq!(after["children"][0]["children"], json!([]));
    assert_eq!(after["children"][1]["type"], "breditor/horizontal-rule");
    assert_eq!(caret(&a)?, ("p".into(), 0, 0));
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, &a)?, original);
    assert_eq!(caret(&a)?, ("p".into(), 3, 3));
    a.redo(&a.snapshot())?;
    assert_eq!(encode(&c, &a)?, after);
    Ok(())
}

/// Every refusal leaves the live owner exactly as observed, including its observation token.
fn unchanged(c: &EditorContext, a: &RichLocalSession, before: &Value, depth: u32) -> Result {
    assert_eq!(&encode(c, a)?, before);
    assert_eq!(a.undo_depth(), depth);
    assert_eq!(caret(a)?, ("p".into(), 10, 10));
    Ok(())
}

#[test]
fn a_failing_or_noncontent_follow_up_publishes_nothing() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, "Intro /hea", 10)?;
    // One earlier undoable edit and a redo branch must both survive a refusal.
    a.set_selection(&a.snapshot(), Some(range("q", 5, 5)?))?;
    a.insert_plain_text(&a.snapshot(), "!")?;
    a.undo(&a.snapshot())?;
    a.set_selection(&a.snapshot(), Some(range("p", 10, 10)?))?;
    let before = encode(&c, &a)?;
    let observed = a.snapshot();
    let revision = a.state().revision();
    // The follow-up's own failure (an unknown block) is returned unchanged.
    let missing = a.replace_trigger_then(&observed, &range("p", 6, 10)?, |scratch, observed| {
        let block = BlockId::try_new("missing").map_err(|_| RichLocalSessionError::TriggerStep)?;
        let action = SetHeading::capture(scratch.state().document(), &block, Some(1))?;
        scratch.dispatch(observed, &[RichAction::SetHeading(action)], RichSelectionUpdate::Map)
    });
    assert!(matches!(missing, Err(RichTriggerStepError::Step(RichLocalSessionError::Action(_)))));
    // A follow-up that publishes no content, only a selection, or undoes, is refused.
    let none: std::result::Result<_, RichTriggerStepError<RichLocalSessionError>> = a
        .replace_trigger_then(&observed, &range("p", 6, 10)?, |scratch, observed| {
            scratch.dispatch(observed, &[], RichSelectionUpdate::Map)
        });
    assert!(matches!(none, Err(RichTriggerStepError::Session(RichLocalSessionError::TriggerStep))));
    let selection: std::result::Result<_, RichTriggerStepError<RichLocalSessionError>> = a
        .replace_trigger_then(&observed, &range("p", 6, 10)?, |scratch, observed| {
            scratch.set_selection(
                observed,
                Some(range("q", 0, 0).map_err(|_| RichLocalSessionError::TriggerStep)?),
            )
        });
    assert!(matches!(
        selection,
        Err(RichTriggerStepError::Session(RichLocalSessionError::TriggerStep))
    ));
    let undo: std::result::Result<_, RichTriggerStepError<RichLocalSessionError>> = a
        .replace_trigger_then(&observed, &range("p", 6, 10)?, |scratch, observed| {
            scratch.undo(observed)
        });
    assert!(matches!(undo, Err(RichTriggerStepError::Session(RichLocalSessionError::TriggerStep))));
    // Two follow-up content units are not one bounded step.
    let twice = a.replace_trigger_then(&observed, &range("p", 6, 10)?, |scratch, observed| {
        heading(Some(1))(scratch, observed)?;
        heading(Some(2))(scratch, &scratch.snapshot())
    });
    assert!(matches!(
        twice,
        Err(RichTriggerStepError::Session(RichLocalSessionError::TriggerStep))
    ));
    // A follow-up may not use the observation of the live owner.
    let foreign = a.snapshot();
    let stale = a.replace_trigger_then(&observed, &range("p", 6, 10)?, |scratch, _| {
        heading(Some(1))(scratch, &foreign)
    });
    assert!(matches!(stale, Err(RichTriggerStepError::Step(RichLocalSessionError::StaleSnapshot))));
    unchanged(&c, &a, &before, 0)?;
    assert_eq!(a.state().revision(), revision);
    assert_eq!(a.redo_depth(), 1);
    // The original observation is still current: nothing was published.
    a.replace_trigger_then(&observed, &range("p", 6, 10)?, heading(Some(1)))?;
    assert_eq!(a.redo_depth(), 0);
    assert_eq!(a.undo_depth(), 1);
    Ok(())
}

#[test]
fn stale_read_only_and_invalid_targets_are_refused_atomically() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, "Intro /hea", 10)?;
    let before = encode(&c, &a)?;
    let stale = a.snapshot();
    a.set_selection(&a.snapshot(), Some(range("p", 10, 10)?))?;
    a.set_selection(&a.snapshot(), Some(range("p", 9, 9)?))?;
    a.set_selection(&a.snapshot(), Some(range("p", 10, 10)?))?;
    let result = a.replace_trigger_then(&stale, &range("p", 6, 10)?, heading(Some(1)));
    assert!(matches!(
        result,
        Err(RichTriggerStepError::Session(RichLocalSessionError::StaleSnapshot))
    ));
    unchanged(&c, &a, &before, 0)?;
    for target in [
        range("p", 6, 6)?,
        RichSelectionKind::TextRange { anchor: point("p", 6)?, focus: point("q", 1)? },
        range("code", 0, 2)?,
        RichSelectionKind::Node(BlockId::try_new("q")?),
    ] {
        let result = a.replace_trigger_then(&a.snapshot(), &target, heading(Some(1)));
        assert!(
            matches!(
                result,
                Err(RichTriggerStepError::Session(RichLocalSessionError::TriggerStep))
            ),
            "{target:?}"
        );
        unchanged(&c, &a, &before, 0)?;
    }
    a.set_read_only(&a.snapshot(), true)?;
    let result = a.replace_trigger_then(&a.snapshot(), &range("p", 6, 10)?, heading(Some(1)));
    assert!(matches!(result, Err(RichTriggerStepError::Session(RichLocalSessionError::ReadOnly))));
    unchanged(&c, &a, &before, 0)?;
    Ok(())
}

#[test]
fn the_typed_trigger_burst_stays_its_own_undo_step_under_typing_history() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, "Intro ", 6)?;
    a.enable_typing_history(&a.snapshot())?;
    for (index, key) in ["/", "h", "e", "a"].into_iter().enumerate() {
        a.insert_typing_text(&a.snapshot(), key, 10 + u64::try_from(index)?)?;
    }
    let typed = encode(&c, &a)?;
    assert_eq!(typed["children"][0]["children"][0]["text"], "Intro /hea");
    assert_eq!((a.undo_depth(), a.history_step_count()), (1, 4));
    a.replace_trigger_then(&a.snapshot(), &range("p", 6, 10)?, heading(Some(3)))?;
    let after = encode(&c, &a)?;
    assert_eq!((a.undo_depth(), a.history_step_count()), (2, 5));
    // Further typing after the command starts a fresh burst rather than joining the composite.
    a.insert_typing_text(&a.snapshot(), "x", 15)?;
    assert_eq!(a.undo_depth(), 3);
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, &a)?, after);
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, &a)?, typed);
    assert_eq!(caret(&a)?, ("p".into(), 10, 10));
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, &a)?["children"][0]["children"][0]["text"], "Intro ");
    a.redo(&a.snapshot())?;
    a.redo(&a.snapshot())?;
    assert_eq!(encode(&c, &a)?, after);
    // The typing-history checkpoint keeps the partition: burst, composite, burst.
    let codec = RichTypingSessionJsonCodec::new(c.clone());
    let mut b = codec.decode(&codec.encode(&a)?)?;
    assert_eq!((b.undo_depth(), b.redo_depth()), (2, 1));
    b.undo(&b.snapshot())?;
    assert_eq!(encode(&c, &b)?, typed);
    Ok(())
}
