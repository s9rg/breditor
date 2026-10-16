//! Explicit browser targets preserve actual before-UI, native style and exact natural recovery.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec, RichTypingSessionJsonCodec},
    document::{Format, FormatSet, PropertyMap},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichLocalOutcome, RichLocalSession, RichSelectionKind,
        RichTextPoint, allocate_general_range_paragraphs, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::json;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn target(a: &str, x: u64, b: &str, y: u64) -> Result<RichSelectionKind> {
    let point = |id: &str, n| -> Result<RichTextPoint> {
        Ok(RichTextPoint::new(BlockId::try_new(id)?, TextOffset::try_new(n)?, Affinity::After))
    };
    Ok(RichSelectionKind::TextRange { anchor: point(a, x)?, focus: point(b, y)? })
}
fn setup(caret: &RichSelectionKind) -> Result<(EditorContext, RichLocalSession)> {
    let schema = CompiledSchema::try_compile_rich_content_profile_v3(
        SchemaId::new(QualifiedName::try_new("example/general-input")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?,
    )?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let raw=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/general-input","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":fixture::root()}).to_string();
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&raw)?,
        context.limits(),
    )?;
    let owner = RichLocalSession::try_new(
        context.clone(),
        document,
        Some(caret.clone()),
        HistoryCapacity::try_new(100)?,
    )?;
    Ok((context, owner))
}
fn strong() -> Result<FormatSet> {
    Ok(FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::default(),
    )])?)
}
fn save(c: &EditorContext, a: &RichLocalSession) -> Result<String> {
    Ok(if a.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(c.clone()).encode(a)?
    } else {
        RichSessionJsonCodec::new(c.clone()).encode(a)?
    })
}
fn future(c: &EditorContext, a: &mut RichLocalSession) -> Result {
    let saved = save(c, a)?;
    let mut b = if a.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(c.clone()).decode(&saved)?
    } else {
        RichSessionJsonCodec::new(c.clone()).decode(&saved)?
    };
    assert_eq!(save(c, &b)?, saved);
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
fn explicit_target_outside_the_caret_ignores_unrelated_pending_style_and_undo_restores_it() -> Result
{
    for backwards in [false, true] {
        let before = target("q2", 2, "q2", 2)?;
        let (c, mut a) = setup(&before)?;
        let marks = strong()?;
        a.set_pending_formats(&a.snapshot(), Some(marks.clone()))?;
        let source = a.state().document().document().clone();
        let selection = if backwards {
            target("p-1-1", 3, "p-0-0", 1)?
        } else {
            target("p-0-0", 1, "p-1-1", 3)?
        };
        let plan = a.plan_general_range_plain_text(&a.snapshot(), &selection, "Q🙂")?;
        assert!(plan.formats().is_empty());
        let empty = allocate_general_range_paragraphs("input", plan.range().empty_blocks().len())?;
        assert_eq!(
            a.replace_general_range_plain_text(&a.snapshot(), &selection, "Q🙂", &empty)?,
            RichLocalOutcome::ContentCommitted
        );
        assert!(a.state().pending_formats().ok_or("pending")?.is_empty());
        a.undo(&a.snapshot())?;
        assert_eq!(a.state().document().document(), &source);
        assert_eq!(a.state().selection().ok_or("selection")?.kind(), &before);
        assert_eq!(a.state().pending_formats(), Some(&marks));
        a.redo(&a.snapshot())?;
        future(&c, &mut a)?;
    }
    Ok(())
}
#[test]
fn explicit_first_key_uses_the_actual_boundary_caret_style_and_joins_following_input() -> Result {
    let before = target("p-0-0", 1, "p-0-0", 1)?;
    let (c, mut a) = setup(&before)?;
    let marks = strong()?;
    a.set_pending_formats(&a.snapshot(), Some(marks.clone()))?;
    a.enable_typing_history(&a.snapshot())?;
    let source = a.state().document().document().clone();
    let selection = target("p-0-0", 1, "p-1-1", 3)?;
    let plan = a.plan_general_range_plain_text(&a.snapshot(), &selection, "Q")?;
    assert_eq!(plan.formats(), &marks);
    let empty = allocate_general_range_paragraphs("typed", plan.range().empty_blocks().len())?;
    a.replace_general_range_typing_text(&a.snapshot(), &selection, "Q", &empty, 1000)?;
    a.insert_typing_text(&a.snapshot(), "Y🙂", 1050)?;
    assert_eq!((a.undo_depth(), a.history_step_count()), (1, 2));
    a.undo(&a.snapshot())?;
    assert_eq!(a.state().document().document(), &source);
    assert_eq!(a.state().selection().ok_or("selection")?.kind(), &before);
    a.redo(&a.snapshot())?;
    future(&c, &mut a)?;
    Ok(())
}
#[test]
fn explicit_target_never_joins_a_prior_burst_and_empty_typing_is_a_noop() -> Result {
    let caret = target("q2", 2, "q2", 2)?;
    let (c, mut a) = setup(&caret)?;
    a.enable_typing_history(&a.snapshot())?;
    a.insert_typing_text(&a.snapshot(), "A", 1000)?;
    let prior = a.state().document().document().clone();
    let selection = target("p-0-0", 1, "p-1-1", 3)?;
    let saved = save(&c, &a)?;
    let snap = a.snapshot();
    assert_eq!(
        a.replace_general_range_typing_text(&snap, &selection, "", &[], 1020)?,
        RichLocalOutcome::Unchanged
    );
    assert_eq!(save(&c, &a)?, saved);
    let plan = a.plan_general_range_plain_text(&snap, &selection, "Q")?;
    let empty = allocate_general_range_paragraphs("after", plan.range().empty_blocks().len())?;
    a.replace_general_range_typing_text(&snap, &selection, "Q", &empty, 1050)?;
    a.insert_typing_text(&a.snapshot(), "Y", 1100)?;
    assert_eq!((a.undo_depth(), a.history_step_count()), (2, 3));
    a.undo(&a.snapshot())?;
    assert_eq!(a.state().document().document(), &prior);
    a.redo(&a.snapshot())?;
    future(&c, &mut a)?;
    Ok(())
}
#[test]
fn namespace_and_target_failures_preserve_every_field_and_original_commands_stay_strict() -> Result
{
    let before = target("q2", 2, "q2", 2)?;
    let (c, mut a) = setup(&before)?;
    let selection = target("p-0-0", 1, "p-1-1", 3)?;
    let saved = save(&c, &a)?;
    let snap = a.snapshot();
    assert!(a.replace_range_plain_text(&snap, &selection, "Q").is_err());
    let empty = allocate_general_range_paragraphs("fresh", 4)?;
    assert!(
        a.replace_general_range_plain_text(&snap, &target("p-0-0", 2, "p-1-1", 3)?, "Q", &empty)
            .is_err()
    );
    assert!(a.replace_general_range_plain_text(&snap, &selection, "Q", &[]).is_err());
    assert!(a.replace_general_range_typing_text(&snap, &selection, "Q", &empty, 1).is_err());
    assert!(allocate_general_range_paragraphs(&"x".repeat(91), 0).is_err());
    assert_eq!(save(&c, &a)?, saved);
    a.set_read_only(&snap, true)?;
    let saved = save(&c, &a)?;
    assert!(a.replace_general_range_plain_text(&a.snapshot(), &selection, "Q", &empty).is_err());
    assert_eq!(save(&c, &a)?, saved);
    assert!(a.replace_general_range_plain_text(&snap, &selection, "Q", &empty).is_err());
    Ok(())
}
