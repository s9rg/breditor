#![cfg(feature = "experimental-rich-content")]
//! Normal rich restart workflows with replay-proved future undo and redo.

use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CellId, ColumnId, ImageId, ImageSize, RichBlockDraft, RichDocument,
        RichLocalSession, RichLocalSessionError, RichSelection, RichSelectionKind,
        RichSelectionUpdate, RichTextPoint, RowId, TableId,
        actions::{ResizeImage, RichAction, SetImageCaption, SetTableHeader, SplitTextBlock},
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type TestResult = Result<(), Box<dyn std::error::Error>>;

fn context() -> Result<EditorContext, Box<dyn std::error::Error>> {
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/rich-recovery")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}
fn caret(block: &str, offset: u64) -> Result<RichSelectionKind, Box<dyn std::error::Error>> {
    let point =
        RichTextPoint::new(BlockId::try_new(block)?, TextOffset::try_new(offset)?, Affinity::After);
    Ok(RichSelectionKind::TextRange { anchor: point.clone(), focus: point })
}
fn owner(capacity: u32) -> Result<RichLocalSession, Box<dyn std::error::Error>> {
    let context = context()?;
    let value = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":context.schema().id().name().as_str(),"version":1},
        "schemaFingerprint":context.schema().fingerprint().to_string(),
        "root":serde_json::from_str::<Value>(include_str!("fixtures/rich-local-root.json"))?});
    let document = DocumentJsonCodecV2::new(context.schema().clone()).decode(&value.to_string())?;
    let document = RichDocument::try_admit(context.schema(), document, context.limits())?;
    Ok(RichLocalSession::try_new(
        context,
        document,
        Some(caret("p", 3)?),
        HistoryCapacity::try_new(capacity)?,
    )?)
}
fn dispatch(owner: &mut RichLocalSession, action: RichAction) -> TestResult {
    owner.dispatch(&owner.snapshot(), &[action], RichSelectionUpdate::Map)?;
    Ok(())
}
fn populate(owner: &mut RichLocalSession) -> TestResult {
    owner.set_pending_formats(&owner.snapshot(), Some(FormatSet::default()))?;
    owner.insert_plain_text(&owner.snapshot(), "X")?;
    dispatch(
        owner,
        RichAction::ResizeImage(ResizeImage::capture(
            owner.state().document(),
            &ImageId::try_new("image")?,
            Some(ImageSize::try_new(640, 480)?),
        )?),
    )?;
    let caption: TextFragment = TextRun::try_new("Caption 🙂", FormatSet::default())?.into();
    dispatch(
        owner,
        RichAction::SetImageCaption(SetImageCaption::capture(
            owner.state().document(),
            &ImageId::try_new("image")?,
            Some(RichBlockDraft::paragraph(&BlockId::try_new("caption")?, &caption)?),
        )?),
    )?;
    let cell = CellId::new(TableId::try_new("t")?, RowId::try_new("r")?, ColumnId::try_new("c")?);
    let grid = RichSelection::try_new(
        owner.state().document(),
        RichSelectionKind::Grid { anchor: cell.clone(), focus: cell },
    )?;
    dispatch(
        owner,
        RichAction::SetTableHeader(SetTableHeader::capture(owner.state().document(), &grid, true)?),
    )?;
    let point =
        RichTextPoint::new(BlockId::try_new("p")?, TextOffset::try_new(1)?, Affinity::After);
    dispatch(
        owner,
        RichAction::SplitTextBlock(SplitTextBlock::capture(
            owner.state().document(),
            &point,
            &BlockId::try_new("right")?,
            Some(2),
        )?),
    )
}
fn same(left: &RichLocalSession, right: &RichLocalSession) {
    assert_eq!(left.state().document().document(), right.state().document().document());
    assert_eq!(left.state().selection(), right.state().selection());
    assert_eq!(left.state().pending_formats(), right.state().pending_formats());
    assert_eq!(left.state().revision(), right.state().revision());
    assert_eq!((left.undo_depth(), left.redo_depth()), (right.undo_depth(), right.redo_depth()));
}

#[test]
fn reload_at_every_mixed_cursor_keeps_exact_future_undo_redo() -> TestResult {
    for cursor in 0..=5 {
        let mut source = owner(100)?;
        populate(&mut source)?;
        for _ in cursor..5 {
            source.undo(&source.snapshot())?;
        }
        let codec = RichSessionJsonCodec::new(context()?);
        let checkpoint = codec.encode(&source)?;
        let mut restored = codec.decode(&checkpoint)?;
        same(&source, &restored);
        assert_eq!(codec.encode(&restored)?, checkpoint);
        while source.can_undo() {
            source.undo(&source.snapshot())?;
            restored.undo(&restored.snapshot())?;
            same(&source, &restored);
        }
        while source.can_redo() {
            source.redo(&source.snapshot())?;
            restored.redo(&restored.snapshot())?;
            same(&source, &restored);
        }
    }
    Ok(())
}

#[test]
fn reload_preserves_current_metadata_and_plain_pending_override() -> TestResult {
    let mut source = owner(100)?;
    populate(&mut source)?;
    source.undo(&source.snapshot())?;
    source.set_selection(&source.snapshot(), Some(caret("caption", 2)?))?;
    source.set_pending_formats(&source.snapshot(), Some(FormatSet::default()))?;
    let codec = RichSessionJsonCodec::new(context()?);
    let mut restored = codec.decode(&codec.encode(&source)?)?;
    same(&source, &restored);
    assert_eq!(restored.state().pending_formats(), Some(&FormatSet::default()));
    restored.insert_plain_text(&restored.snapshot(), "plain")?;
    assert_eq!(restored.redo_depth(), 0);
    restored.undo(&restored.snapshot())?;
    assert_eq!(
        restored.state().selection().map(RichSelection::kind),
        source.state().selection().map(RichSelection::kind)
    );
    assert_eq!(restored.state().pending_formats(), source.state().pending_formats());
    Ok(())
}

#[test]
fn restored_owner_has_fresh_observation_tokens() -> TestResult {
    let mut source = owner(100)?;
    populate(&mut source)?;
    let old = source.snapshot();
    let codec = RichSessionJsonCodec::new(context()?);
    let mut restored = codec.decode(&codec.encode(&source)?)?;
    assert!(matches!(restored.undo(&old), Err(RichLocalSessionError::StaleSnapshot)));
    same(&source, &restored);
    Ok(())
}

#[test]
fn truncated_and_disabled_history_reload_without_fabricating_older_entries() -> TestResult {
    for capacity in [0, 2] {
        let mut source = owner(capacity)?;
        populate(&mut source)?;
        let codec = RichSessionJsonCodec::new(context()?);
        let mut restored = codec.decode(&codec.encode(&source)?)?;
        same(&source, &restored);
        assert_eq!(restored.undo_depth(), capacity);
        while source.can_undo() {
            source.undo(&source.snapshot())?;
            restored.undo(&restored.snapshot())?;
            same(&source, &restored);
        }
    }
    Ok(())
}

#[test]
fn new_branch_after_reload_and_repeated_reload_replays_exactly() -> TestResult {
    let mut source = owner(100)?;
    populate(&mut source)?;
    source.undo(&source.snapshot())?;
    source.undo(&source.snapshot())?;
    let codec = RichSessionJsonCodec::new(context()?);
    let mut restored = codec.decode(&codec.encode(&source)?)?;
    source.insert_plain_text(&source.snapshot(), "branch")?;
    restored.insert_plain_text(&restored.snapshot(), "branch")?;
    same(&source, &restored);
    restored = codec.decode(&codec.encode(&restored)?)?;
    while source.can_undo() {
        source.undo(&source.snapshot())?;
        restored.undo(&restored.snapshot())?;
        same(&source, &restored);
    }
    while source.can_redo() {
        source.redo(&source.snapshot())?;
        restored.redo(&restored.snapshot())?;
        same(&source, &restored);
    }
    Ok(())
}

#[test]
fn bad_recipe_or_history_boundary_cannot_create_a_partial_owner() -> TestResult {
    let mut source = owner(100)?;
    populate(&mut source)?;
    let codec = RichSessionJsonCodec::new(context()?);
    let original_bytes = codec.encode(&source)?;
    let original: Value = serde_json::from_str(&original_bytes)?;
    let mut variants = Vec::new();
    let mut guard = original.clone();
    guard["entries"][0]["expected"]["properties"]["breditor/block-id"] = json!("wrong");
    variants.push(guard);
    let mut revision = original.clone();
    revision["entries"][1]["after"]["revision"] = json!("0");
    variants.push(revision);
    let mut cursor = original.clone();
    cursor["cursor"] = json!(20);
    variants.push(cursor);
    let mut selection = original.clone();
    selection["currentState"]["selection"]["anchor"]["block"] = json!("missing");
    variants.push(selection);
    let mut no_op = original.clone();
    no_op["entries"][0]["replacement"] = no_op["entries"][0]["expected"].clone();
    variants.push(no_op);
    for value in variants {
        assert!(codec.decode(&value.to_string()).is_err());
    }
    assert_eq!(codec.encode(&source)?, original_bytes);
    Ok(())
}

#[test]
fn byte_entry_and_active_document_limits_apply_on_both_sides() -> TestResult {
    let mut source = owner(100)?;
    populate(&mut source)?;
    let codec = RichSessionJsonCodec::new(context()?);
    let valid = codec.encode(&source)?;
    let tiny = codec.clone().with_max_json_bytes(valid.len() - 1);
    assert!(tiny.encode(&source).is_err());
    assert!(tiny.decode(&valid).is_err());
    let short = codec.with_max_history_entries(HistoryCapacity::try_new(4)?);
    assert!(short.encode(&source).is_err());
    assert!(short.decode(&valid).is_err());
    let limited = EditorContext::new(
        context()?.schema().clone(),
        DocumentLimits::default().with_max_nodes(1),
    );
    let limited = RichSessionJsonCodec::new(limited);
    assert!(limited.encode(&source).is_err());
    assert!(limited.decode(&valid).is_err());
    let json_limited = EditorContext::new(
        context()?.schema().clone(),
        DocumentLimits::default().with_max_json_bytes(1),
    );
    let json_limited = RichSessionJsonCodec::new(json_limited);
    assert!(json_limited.encode(&source).is_err());
    assert!(json_limited.decode(&valid).is_err());
    Ok(())
}

#[test]
fn stable_node_and_grid_selection_records_reload_without_paths() -> TestResult {
    let mut source = owner(100)?;
    populate(&mut source)?;
    let cell = CellId::new(TableId::try_new("t")?, RowId::try_new("r")?, ColumnId::try_new("c")?);
    let codec = RichSessionJsonCodec::new(context()?);
    for kind in [
        RichSelectionKind::Node(BlockId::try_new("image-block")?),
        RichSelectionKind::Grid { anchor: cell.clone(), focus: cell },
    ] {
        source.set_selection(&source.snapshot(), Some(kind))?;
        same(&source, &codec.decode(&codec.encode(&source)?)?);
    }
    Ok(())
}

#[test]
fn pending_semantic_formats_and_large_exact_revisions_survive_restart() -> TestResult {
    let mut source = owner(100)?;
    let formats = FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::default(),
    )])?;
    source.set_pending_formats(&source.snapshot(), Some(formats.clone()))?;
    let codec = RichSessionJsonCodec::new(context()?);
    let mut record: Value = serde_json::from_str(&codec.encode(&source)?)?;
    record["currentState"]["revision"] = json!("9007199254740993");
    let mut restored = codec.decode(&record.to_string())?;
    assert_eq!(restored.state().pending_formats(), Some(&formats));
    assert_eq!(restored.state().revision().get(), 9_007_199_254_740_993);
    restored.insert_plain_text(&restored.snapshot(), "bold")?;
    let encoded: Value = serde_json::from_str(&codec.encode(&restored)?)?;
    assert_eq!(encoded["currentState"]["revision"], "9007199254740994");
    assert_eq!(encoded["currentState"]["selection"]["focus"]["offset"], "7");
    restored.undo(&restored.snapshot())?;
    assert_eq!(restored.state().pending_formats(), Some(&formats));
    Ok(())
}

#[test]
fn separate_checkpoint_envelope_rejects_wrong_versions_and_missing_fields() -> TestResult {
    let source = owner(100)?;
    let codec = RichSessionJsonCodec::new(context()?);
    let valid: Value = serde_json::from_str(&codec.encode(&source)?)?;
    let mut unknown = valid.clone();
    unknown["sharedUpdate"] = json!(true);
    let mut version = valid.clone();
    version["formatVersion"] = json!(7);
    let mut absent = valid.clone();
    absent["currentState"].as_object_mut().ok_or("state")?.remove("selection");
    let mut numeric = valid;
    numeric["currentState"]["revision"] = json!(1);
    for value in [unknown, version, absent, numeric] {
        assert!(codec.decode(&value.to_string()).is_err());
    }
    Ok(())
}
