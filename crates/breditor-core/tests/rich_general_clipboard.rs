//! Native inline clipboard paste preserves partial structures, exact real before-UI and both histories.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::{
        DocumentJsonCodecV2, RichClipboardJsonCodec, RichSessionJsonCodec,
        RichTypingSessionJsonCodec,
    },
    document::{Format, FormatSet, PropertyMap, TextFragment},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichClipboardFragment, RichDocument, RichLocalOutcome, RichLocalSession,
        RichLocalSessionError, RichSelection, RichSelectionKind, RichTextPoint,
        actions::RichGeneralRangePlan, allocate_general_range_paragraphs,
        standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn range(a: &str, x: u64, b: &str, y: u64) -> Result<RichSelectionKind> {
    let p = |id: &str, n| -> Result<_> {
        Ok(RichTextPoint::new(BlockId::try_new(id)?, TextOffset::try_new(n)?, Affinity::After))
    };
    Ok(RichSelectionKind::TextRange { anchor: p(a, x)?, focus: p(b, y)? })
}
fn context(name: &str) -> Result<EditorContext> {
    let schema = CompiledSchema::try_compile_rich_content_profile_v3(
        SchemaId::new(QualifiedName::try_new(name)?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?,
    )?;
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}
fn setup() -> Result<(EditorContext, RichLocalSession)> {
    let c = context("example/general-clipboard")?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/general-clipboard","version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":fixture::root()}).to_string();
    let d = RichDocument::try_admit(
        c.schema(),
        DocumentJsonCodecV2::new(c.schema().clone()).decode(&input)?,
        c.limits(),
    )?;
    let a = RichLocalSession::try_new(
        c.clone(),
        d,
        Some(range("q2", 2, "q2", 2)?),
        HistoryCapacity::try_new(100)?,
    )?;
    Ok((c, a))
}
fn clipboard(c: &EditorContext, schema_name: &str) -> Result<RichClipboardFragment> {
    let input=json!({"format":"breditor/rich-clipboard","formatVersion":1,"kind":"text","document":{"format":"breditor/document","formatVersion":2,"schema":{"name":schema_name,"version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"breditor-clipboard"},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"clipboard-text"},"children":[{"kind":"text","text":"Q🙂","formats":[{"type":"breditor/strong","properties":{}}]},{"kind":"text","text":"R","formats":[]}]}]}}}).to_string();
    Ok(RichClipboardJsonCodec::new(c.clone()).decode(&input)?)
}
fn save(c: &EditorContext, a: &RichLocalSession) -> Result<String> {
    Ok(if a.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(c.clone()).encode(a)?
    } else {
        RichSessionJsonCodec::new(c.clone()).encode(a)?
    })
}
fn future(c: &EditorContext, a: &mut RichLocalSession) -> Result {
    let exact = save(c, a)?;
    let mut b = if a.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(c.clone()).decode(&exact)?
    } else {
        RichSessionJsonCodec::new(c.clone()).decode(&exact)?
    };
    assert_eq!(save(c, &b)?, exact);
    for redo in [false, true, false, true] {
        if redo {
            a.redo(&a.snapshot())?;
            b.redo(&b.snapshot())?;
        } else {
            a.undo(&a.snapshot())?;
            b.undo(&b.snapshot())?;
        }
        assert_eq!(save(c, a)?, save(c, &b)?);
    }
    Ok(())
}
#[test]
fn paste_retains_complete_clipboard_marks_actual_before_ui_and_one_exact_history_unit() -> Result {
    for natural in [false, true] {
        for backward in [false, true] {
            for (first, x, last, y) in [
                ("p-0-0", 1, "p-1-1", 3),
                ("caption", 1, "q1", 2),
                ("z-intro", 1, "code", 1),
                ("task-head", 1, "code", 4),
            ] {
                let (c, mut a) = setup()?;
                if natural {
                    a.enable_typing_history(&a.snapshot())?;
                }
                let pending = FormatSet::try_from_formats(vec![Format::new(
                    QualifiedName::try_new("breditor-inline/italic")?,
                    PropertyMap::default(),
                )])?;
                a.set_pending_formats(&a.snapshot(), Some(pending.clone()))?;
                let before = a.state().selection().ok_or("actual selection")?.kind().clone();
                let source = a.state().document().document().clone();
                let target =
                    if backward { range(last, y, first, x)? } else { range(first, x, last, y)? };
                let clip = clipboard(&c, "example/general-clipboard")?;
                let inserted = clip.text_fragment(&c)?;
                let plan = RichGeneralRangePlan::capture(
                    a.state().document(),
                    &RichSelection::try_new(a.state().document(), target.clone())?,
                    &inserted,
                )?;
                let empty = allocate_general_range_paragraphs(
                    "clipboard-floor",
                    plan.empty_blocks().len(),
                )?;
                let expected = plan
                    .action(&empty)?
                    .apply(&c, a.state().document())?
                    .ok_or("expected paste")?
                    .document()
                    .document()
                    .clone();
                assert_eq!(
                    a.paste_general_inline_clipboard(&a.snapshot(), &target, &clip, &empty)?,
                    RichLocalOutcome::ContentCommitted
                );
                assert_eq!(a.state().document().document(), &expected);
                assert_eq!(a.undo_depth(), 1);
                assert_eq!(a.state().pending_formats(), Some(&FormatSet::default()));
                a.undo(&a.snapshot())?;
                assert_eq!(a.state().document().document(), &source);
                assert_eq!(a.state().selection().ok_or("restored selection")?.kind(), &before);
                assert_eq!(a.state().pending_formats(), Some(&pending));
                a.redo(&a.snapshot())?;
                future(&c, &mut a)?;
            }
        }
    }
    Ok(())
}
#[test]
fn wrong_kind_schema_floor_ids_and_formatted_code_refuse_without_losing_redo_or_ui() -> Result {
    let (c, mut a) = setup()?;
    a.insert_plain_text(&a.snapshot(), "prior")?;
    a.undo(&a.snapshot())?;
    let target = range("p-0-0", 1, "p-1-1", 3)?;
    let clip = clipboard(&c, "example/general-clipboard")?;
    let node = RichSelection::try_new(
        a.state().document(),
        RichSelectionKind::Node(BlockId::try_new("quote")?),
    )?;
    let flow =
        RichClipboardFragment::copy_selection(&c, a.state().document(), &node)?.ok_or("flow")?;
    let other = context("example/foreign-clipboard")?;
    let foreign = clipboard(&other, "example/foreign-clipboard")?;
    let exact = save(&c, &a)?;
    for wrong in [&flow, &foreign] {
        assert!(a.paste_general_inline_clipboard(&a.snapshot(), &target, wrong, &[]).is_err());
        assert_eq!(save(&c, &a)?, exact);
    }
    assert!(a.paste_general_inline_clipboard(&a.snapshot(), &target, &clip, &[]).is_err());
    assert_eq!(save(&c, &a)?, exact);
    let plan = RichGeneralRangePlan::capture(
        a.state().document(),
        &RichSelection::try_new(a.state().document(), target.clone())?,
        &clip.text_fragment(&c)?,
    )?;
    let mut bad = allocate_general_range_paragraphs("bad-floor", plan.empty_blocks().len())?;
    assert!(!bad.is_empty());
    bad[0] = BlockId::try_new("q1")?;
    assert!(a.paste_general_inline_clipboard(&a.snapshot(), &target, &clip, &bad).is_err());
    assert_eq!(save(&c, &a)?, exact);
    assert!(
        a.paste_general_inline_clipboard(&a.snapshot(), &range("code", 1, "code", 2)?, &clip, &[])
            .is_err()
    );
    assert_eq!(save(&c, &a)?, exact);
    future(&c, &mut a)?;
    Ok(())
}
#[test]
fn stale_and_read_only_guards_precede_clipboard_and_target_admission() -> Result {
    let (c, mut a) = setup()?;
    let other = context("example/foreign-clipboard")?;
    let foreign = clipboard(&other, "example/foreign-clipboard")?;
    let invalid = range("missing", 0, "missing", 0)?;
    let stale = a.snapshot();
    a.insert_plain_text(&a.snapshot(), "earlier")?;
    let exact = save(&c, &a)?;
    assert!(matches!(
        a.paste_general_inline_clipboard(&stale, &invalid, &foreign, &[]),
        Err(RichLocalSessionError::StaleSnapshot)
    ));
    assert_eq!(save(&c, &a)?, exact);
    a.set_read_only(&a.snapshot(), true)?;
    let exact = save(&c, &a)?;
    assert!(matches!(
        a.paste_general_inline_clipboard(&a.snapshot(), &invalid, &foreign, &[]),
        Err(RichLocalSessionError::ReadOnly)
    ));
    assert_eq!(save(&c, &a)?, exact);
    Ok(())
}
#[test]
fn empty_caret_copy_remains_absent_and_the_original_copy_protocol_is_unchanged() -> Result {
    let (c, a) = setup()?;
    assert!(
        RichClipboardFragment::copy_selection(
            &c,
            a.state().document(),
            a.state().selection().ok_or("caret")?
        )?
        .is_none()
    );
    let clip = clipboard(&c, "example/general-clipboard")?;
    let encoded = RichClipboardJsonCodec::new(c.clone()).encode(&clip)?;
    let raw: Value = serde_json::from_str(&encoded)?;
    assert_eq!(raw["format"], "breditor/rich-clipboard");
    assert_eq!(raw["formatVersion"], 1);
    assert_eq!(clip.plain_text()?, "Q🙂R");
    assert_ne!(clip.text_fragment(&c)?, TextFragment::empty());
    Ok(())
}
