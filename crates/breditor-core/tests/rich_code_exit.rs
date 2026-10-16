//! Code exit keeps its flow, exact source and native history without a new durable action tag.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec, RichTypingSessionJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichLocalOutcome, RichLocalSession, RichSelectionKind, RichTextPoint,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const TARGETS: [&str; 6] =
    ["code-root", "code-cell", "code-quote", "code-list", "code-task", "code-last"];
fn id(value: &str) -> Result<BlockId> {
    Ok(BlockId::try_new(value)?)
}
fn caret(block: &str, offset: u64) -> Result<RichSelectionKind> {
    let point = RichTextPoint::new(id(block)?, TextOffset::try_new(offset)?, Affinity::After);
    Ok(RichSelectionKind::TextRange { anchor: point.clone(), focus: point })
}
fn setup(limits: DocumentLimits) -> Result<(EditorContext, RichLocalSession)> {
    let schema = CompiledSchema::try_compile_rich_content_profile_v2(
        SchemaId::new(QualifiedName::try_new("example/code-exit")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    let c = EditorContext::new(schema, limits);
    let root: Value = serde_json::from_str(include_str!("fixtures/rich-code-exit-root.json"))?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/code-exit","version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":root}).to_string();
    let doc = RichDocument::try_admit(
        c.schema(),
        DocumentJsonCodecV2::new(c.schema().clone())
            .with_limits(c.limits().clone())
            .decode(&input)?,
        c.limits(),
    )?;
    let owner = RichLocalSession::try_new(
        c.clone(),
        doc,
        Some(caret("code-root", 1)?),
        HistoryCapacity::default(),
    )?;
    Ok((c, owner))
}
fn saved(c: &EditorContext, a: &RichLocalSession) -> Result<String> {
    Ok(if a.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(c.clone()).encode(a)?
    } else {
        RichSessionJsonCodec::new(c.clone()).encode(a)?
    })
}
fn restore(c: &EditorContext, a: &RichLocalSession) -> Result<RichLocalSession> {
    let input = saved(c, a)?;
    Ok(if a.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(c.clone()).decode(&input)?
    } else {
        RichSessionJsonCodec::new(c.clone()).decode(&input)?
    })
}
fn value(c: &EditorContext, a: &RichLocalSession) -> Result<Value> {
    Ok(serde_json::from_str(
        &DocumentJsonCodecV2::new(c.schema().clone()).encode(a.state().document().document())?,
    )?)
}
fn find<'a>(node: &'a Value, block: &str) -> Option<&'a Value> {
    if node.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(block) {
        return Some(node);
    }
    node.get("children")?.as_array()?.iter().find_map(|n| find(n, block))
}

#[test]
fn every_code_flow_keeps_source_next_sibling_and_exact_recovered_future_history() -> Result {
    for typing in [false, true] {
        for target in TARGETS {
            let (c, mut a) = setup(DocumentLimits::default())?;
            if typing {
                a.enable_typing_history(&a.snapshot())?;
            }
            a.set_selection(&a.snapshot(), Some(caret(target, u64::from(target != "code-last"))?))?;
            let before = value(&c, &a)?;
            let source = find(&before["root"], target).ok_or("code")?.clone();
            let position = a.state().document().flow_position_after(&id(target)?).ok_or("flow")?;
            let fresh = id("exit-paragraph")?;
            assert_eq!(
                a.exit_code_block(&a.snapshot(), &fresh)?,
                RichLocalOutcome::ContentCommitted
            );
            assert_eq!(a.undo_depth(), 1);
            assert!(a.state().pending_formats().is_none());
            assert_eq!(
                a.state().selection().ok_or("selection")?.kind(),
                &caret("exit-paragraph", 0)?
            );
            let after = value(&c, &a)?;
            assert_eq!(find(&after["root"], target), Some(&source));
            assert_eq!(
                find(&after["root"], "exit-paragraph").ok_or("new paragraph")?["children"],
                json!([])
            );
            assert_eq!(
                a.state().document().flow_position_before(&fresh).ok_or("flow")?.parent(),
                position.parent()
            );
            assert_eq!(
                a.state().document().flow_position_after(&fresh).ok_or("flow")?.before(),
                position.before()
            );
            let mut b = restore(&c, &a)?;
            assert_eq!(saved(&c, &a)?, saved(&c, &b)?);
            for redo in [false, true, false, true] {
                assert_eq!(
                    if redo { a.redo(&a.snapshot())? } else { a.undo(&a.snapshot())? },
                    if redo { b.redo(&b.snapshot())? } else { b.undo(&b.snapshot())? }
                );
                assert_eq!(saved(&c, &a)?, saved(&c, &b)?);
                assert_eq!(value(&c, &a)?, if redo { after.clone() } else { before.clone() });
            }
        }
    }
    Ok(())
}

#[test]
fn code_typing_exit_and_plain_typing_are_three_separate_native_units() -> Result {
    let (c, mut a) = setup(DocumentLimits::default())?;
    a.enable_typing_history(&a.snapshot())?;
    a.insert_typing_text(&a.snapshot(), "X", 1)?;
    a.insert_typing_text(&a.snapshot(), "Y", 2)?;
    let code = value(&c, &a)?;
    a.exit_code_block(&a.snapshot(), &id("exit-paragraph")?)?;
    a.insert_typing_text(&a.snapshot(), "A", 3)?;
    a.insert_typing_text(&a.snapshot(), "B", 4)?;
    assert_eq!(a.undo_depth(), 3);
    let text = find(&value(&c, &a)?["root"], "exit-paragraph").ok_or("paragraph")?.clone();
    assert_eq!(text["children"][0]["text"], "AB");
    assert_eq!(text["children"][0]["formats"], json!([]));
    a.undo(&a.snapshot())?;
    a.undo(&a.snapshot())?;
    assert_eq!(value(&c, &a)?, code);
    Ok(())
}

#[test]
fn wrong_target_range_read_only_stale_and_duplicate_identity_reject_atomically() -> Result {
    let (c, mut a) = setup(DocumentLimits::default())?;
    for selection in [caret("p", 0)?, RichSelectionKind::Node(id("code-root")?), {
        let RichSelectionKind::TextRange { anchor, .. } = caret("code-root", 0)? else {
            unreachable!()
        };
        let RichSelectionKind::TextRange { focus, .. } = caret("code-root", 1)? else {
            unreachable!()
        };
        RichSelectionKind::TextRange { anchor, focus }
    }] {
        a.set_selection(&a.snapshot(), Some(selection))?;
        let before = saved(&c, &a)?;
        assert!(a.exit_code_block(&a.snapshot(), &id("fresh")?).is_err());
        assert_eq!(saved(&c, &a)?, before);
    }
    a.set_selection(&a.snapshot(), Some(caret("code-root", 1)?))?;
    let stale = a.snapshot();
    a.set_read_only(&a.snapshot(), true)?;
    let before = saved(&c, &a)?;
    assert!(a.exit_code_block(&stale, &id("fresh")?).is_err());
    assert!(a.exit_code_block(&a.snapshot(), &id("fresh")?).is_err());
    assert_eq!(saved(&c, &a)?, before);
    a.set_read_only(&a.snapshot(), false)?;
    let before = saved(&c, &a)?;
    assert!(a.exit_code_block(&a.snapshot(), &id("p")?).is_err());
    assert_eq!(saved(&c, &a)?, before);
    Ok(())
}

#[test]
fn a_late_node_budget_failure_keeps_document_caret_and_history_exact() -> Result {
    fn nodes(v: &Value) -> usize {
        1 + v
            .get("children")
            .and_then(Value::as_array)
            .map_or(0, |a| a.iter().map(nodes).sum::<usize>())
    }
    let root: Value = serde_json::from_str(include_str!("fixtures/rich-code-exit-root.json"))?;
    let (c, mut a) = setup(DocumentLimits::default().with_max_nodes(nodes(&root)))?;
    let before = saved(&c, &a)?;
    assert!(a.exit_code_block(&a.snapshot(), &id("fresh")?).is_err());
    assert_eq!(saved(&c, &a)?, before);
    Ok(())
}

#[test]
fn after_gap_reads_reject_structural_items_cells_rows_and_captions() -> Result {
    let (c, a) = setup(DocumentLimits::default())?;
    for target in ["row", "cell", "item", "task", "missing"] {
        assert!(a.state().document().flow_position_after(&id(target)?).is_none());
    }
    let root: Value = serde_json::from_str(include_str!("fixtures/rich-local-root.json"))?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/code-exit","version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":root}).to_string();
    let doc = RichDocument::try_admit(
        c.schema(),
        DocumentJsonCodecV2::new(c.schema().clone()).decode(&input)?,
        c.limits(),
    )?;
    assert!(doc.flow_position_after(&id("caption")?).is_none());
    Ok(())
}
