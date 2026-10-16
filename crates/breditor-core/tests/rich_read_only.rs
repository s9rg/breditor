//! Native host policy fences all local mutation while retaining selection/copy/history.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichClipboardFragment, RichDocument, RichLocalSession, RichLocalSessionError,
        RichSelectionKind, RichSelectionUpdate, RichTextPoint,
        actions::{RichAction, SetHeading},
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup() -> Result<(EditorContext, RichLocalSession)> {
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/read-only")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/read-only","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":serde_json::from_str::<Value>(include_str!("fixtures/rich-local-root.json"))?}).to_string();
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&input)?,
        context.limits(),
    )?;
    let owner = RichLocalSession::try_new(
        context.clone(),
        document,
        Some(range(1, 1)?),
        HistoryCapacity::try_new(10)?,
    )?;
    Ok((context, owner))
}
fn point(offset: u64) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(BlockId::try_new("p")?, TextOffset::try_new(offset)?, Affinity::After))
}
fn range(start: u64, end: u64) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::TextRange { anchor: point(start)?, focus: point(end)? })
}
#[test]
fn native_lock_rejects_content_pending_history_and_empty_intents_atomically() -> Result {
    let (context, mut owner) = setup()?;
    owner.insert_plain_text(&owner.snapshot(), "X")?;
    owner.undo(&owner.snapshot())?;
    let document = owner.state().document().document().clone();
    let counts = (owner.undo_depth(), owner.redo_depth());
    let old = owner.snapshot();
    assert!(owner.set_read_only(&old, true)?);
    assert!(!old.is_read_only());
    assert!(owner.snapshot().is_read_only());
    assert!(matches!(owner.undo(&old), Err(RichLocalSessionError::StaleSnapshot)));
    let codec = RichSessionJsonCodec::new(context);
    let before = codec.encode(&owner)?;
    let observed = owner.snapshot();
    let action = RichAction::SetHeading(SetHeading::capture(
        owner.state().document(),
        &BlockId::try_new("p")?,
        Some(2),
    )?);
    assert!(matches!(
        owner.dispatch(&observed, &[action], RichSelectionUpdate::Map),
        Err(RichLocalSessionError::ReadOnly)
    ));
    for result in [
        owner.insert_plain_text(&observed, ""),
        owner.insert_plain_text(&observed, "Y"),
        owner.insert_hard_break(&observed),
        owner.set_pending_formats(&observed, None),
        owner.undo(&observed),
        owner.redo(&observed),
        owner.replace_range_plain_text(&observed, &range(0, 1)?, "Z"),
        owner.replace_selection_plain_text(&observed, "Z"),
    ] {
        assert!(matches!(result, Err(RichLocalSessionError::ReadOnly)));
    }
    assert_eq!(codec.encode(&owner)?, before);
    assert_eq!(owner.state().document().document(), &document);
    assert_eq!((owner.undo_depth(), owner.redo_depth()), counts);
    assert!(!owner.set_read_only(&observed, true)?);
    owner.validate_observation(&observed)?;
    assert_eq!(codec.encode(&owner)?, before);
    Ok(())
}
#[test]
fn selection_and_copy_work_while_locked_and_policy_is_not_restored_as_permission() -> Result {
    let (context, mut owner) = setup()?;
    owner.set_read_only(&owner.snapshot(), true)?;
    owner.set_selection(&owner.snapshot(), Some(range(0, 4)?))?;
    let fragment = RichClipboardFragment::copy_selection(
        &context,
        owner.state().document(),
        owner.state().selection().ok_or("selection")?,
    )?
    .ok_or("copy")?;
    assert_eq!(fragment.plain_text()?, "a🙂b");
    let codec = RichSessionJsonCodec::new(context);
    let checkpoint = codec.encode(&owner)?;
    let restored = codec.decode(&checkpoint)?;
    assert!(!restored.is_read_only());
    assert_eq!(codec.encode(&restored)?, checkpoint);
    assert_eq!(owner.undo_depth(), 0);
    assert!(owner.is_read_only());
    Ok(())
}
#[test]
fn lock_unlock_invalidates_queued_work_and_retains_exact_future_history() -> Result {
    let (context, mut owner) = setup()?;
    owner.insert_plain_text(&owner.snapshot(), "X")?;
    let old = owner.snapshot();
    owner.set_read_only(&owner.snapshot(), true)?;
    let locked = owner.snapshot();
    owner.set_read_only(&locked, false)?;
    assert!(locked.is_read_only());
    assert_eq!(locked.read_only_revision(), Some(locked.state().revision()));
    assert!(!owner.is_read_only());
    assert!(matches!(
        owner.insert_plain_text(&old, "stale"),
        Err(RichLocalSessionError::StaleSnapshot)
    ));
    assert!(matches!(
        owner.set_read_only(&locked, true),
        Err(RichLocalSessionError::StaleSnapshot)
    ));
    let codec = RichSessionJsonCodec::new(context);
    let mut restored = codec.decode(&codec.encode(&owner)?)?;
    for undo in [true, false, true, false] {
        if undo {
            owner.undo(&owner.snapshot())?;
            restored.undo(&restored.snapshot())?;
        } else {
            owner.redo(&owner.snapshot())?;
            restored.redo(&restored.snapshot())?;
        }
        assert_eq!(codec.encode(&owner)?, codec.encode(&restored)?);
    }
    Ok(())
}
