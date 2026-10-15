#![cfg(feature = "experimental-rich-content")]
//! Compound formatting changes final runs, never a sequence of transient run states.
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    document::{Format, PropertyMap},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichLocalOutcome, RichLocalSession, RichSelection,
        RichSelectionKind, RichSelectionUpdate, RichTextPoint,
        actions::{RichAction, RichActionError, RichFormatChange, SetInlineFormat},
        standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn name(value: &str) -> Result<QualifiedName> {
    Ok(QualifiedName::try_new(value)?)
}
fn set(kind: &str) -> Result<RichFormatChange> {
    Ok(RichFormatChange::Set(Format::new(name(kind)?, PropertyMap::default())))
}
fn remove(kind: &str) -> Result<RichFormatChange> {
    Ok(RichFormatChange::Remove(name(kind)?))
}
fn setup(maximum: usize) -> Result<(EditorContext, RichDocument)> {
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(name("example/format-group")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?,
    )?;
    let context =
        EditorContext::new(schema, DocumentLimits::default().with_max_formats_per_text(maximum));
    let input = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/format-group","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),
        "root":serde_json::from_str::<Value>(include_str!("fixtures/rich-local-root.json"))?}).to_string();
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&input)?,
        context.limits(),
    )?;
    Ok((context, document))
}
fn capture(
    document: &RichDocument,
    block: &str,
    start: u64,
    end: u64,
    changes: &[RichFormatChange],
) -> Result<SetInlineFormat> {
    Ok(SetInlineFormat::capture_changes(
        document,
        &BlockId::try_new(block)?,
        TextOffset::try_new(start)?,
        TextOffset::try_new(end)?,
        changes,
    )?)
}
fn owner(context: EditorContext, document: RichDocument) -> Result<RichLocalSession> {
    let point = |offset| -> Result<_> {
        Ok(RichTextPoint::new(
            BlockId::try_new("p")?,
            TextOffset::try_new(offset)?,
            Affinity::After,
        ))
    };
    Ok(RichLocalSession::try_new(
        context,
        document,
        Some(RichSelectionKind::TextRange { anchor: point(0)?, focus: point(4)? }),
        HistoryCapacity::try_new(10)?,
    )?)
}

#[test]
fn simultaneous_replacement_is_order_independent_at_the_final_run_limit() -> Result {
    let (context, document) = setup(1)?;
    let context = context.with_max_operations_per_transaction(1);
    // Setting Italic first would temporarily require two formats. Only the final
    // one-format result is subject to admission, irrespective of changes order.
    let changes = [set("breditor-inline/italic")?, remove("breditor/strong")?];
    let first =
        capture(&document, "p", 0, 4, &changes)?.apply(&context, &document)?.ok_or("edit")?;
    let reverse = [changes[1].clone(), changes[0].clone()];
    let second =
        capture(&document, "p", 0, 4, &reverse)?.apply(&context, &document)?.ok_or("edit")?;
    assert_eq!(first.document().document(), second.document().document());
    let restored = first.inverse().apply(&context, first.document())?.ok_or("inverse")?;
    assert_eq!(restored.document().document(), document.document());
    let mut local = owner(context, document.clone())?;
    let action = capture(&document, "p", 0, 4, &changes)?;
    local.dispatch(
        &local.snapshot(),
        &[RichAction::SetInlineFormat(action)],
        RichSelectionUpdate::Map,
    )?;
    assert_eq!(local.undo_depth(), 1);
    Ok(())
}

#[test]
fn unicode_range_keeps_text_selection_and_one_exact_recovered_history_group() -> Result {
    let (context, document) = setup(32)?;
    let mut owner = owner(context.clone(), document.clone())?;
    let before_selection = owner.state().selection().map(|selection| selection.kind().clone());
    let action = capture(
        &document,
        "p",
        1,
        3,
        &[set("breditor-inline/italic")?, remove("breditor/strong")?],
    )?;
    assert_eq!(
        owner.dispatch(
            &owner.snapshot(),
            &[RichAction::SetInlineFormat(action)],
            RichSelectionUpdate::Map
        )?,
        RichLocalOutcome::ContentCommitted
    );
    assert_eq!(owner.undo_depth(), 1);
    assert_eq!(owner.state().selection().map(RichSelection::kind), before_selection.as_ref());
    let codec = RichSessionJsonCodec::new(context);
    let after = owner.state().document().document().clone();
    let active = owner.state().document();
    let node =
        active.document().node_at(active.block_path(&BlockId::try_new("p")?).ok_or("path")?)?;
    let runs = node.as_element().ok_or("paragraph")?.children();
    assert_eq!(
        runs.iter().map(|run| run.as_text().map_or("", |run| run.text())).collect::<Vec<_>>(),
        ["a", "🙂", "b"]
    );
    assert_eq!(
        runs.iter()
            .nth(1)
            .and_then(|run| run.as_text())
            .ok_or("middle")?
            .formats()
            .iter()
            .next()
            .ok_or("italic")?
            .kind()
            .as_str(),
        "breditor-inline/italic"
    );
    owner.undo(&owner.snapshot())?;
    assert_eq!(owner.state().document().document(), document.document());
    let mut restored = codec.decode(&codec.encode(&owner)?)?;
    restored.redo(&restored.snapshot())?;
    assert_eq!(restored.state().document().document(), &after);
    assert_eq!(restored.state().selection().map(RichSelection::kind), before_selection.as_ref());
    restored.undo(&restored.snapshot())?;
    assert_eq!(restored.state().document().document(), document.document());
    Ok(())
}

#[test]
fn empty_duplicate_and_non_scalar_requests_do_not_capture_a_partial_patch() -> Result {
    let (_, document) = setup(32)?;
    let block = BlockId::try_new("p")?;
    let start = TextOffset::try_new(0)?;
    let end = TextOffset::try_new(4)?;
    for changes in [
        vec![],
        vec![set("breditor-inline/italic")?, remove("breditor-inline/italic")?],
        vec![remove("breditor/strong")?, remove("breditor/strong")?],
    ] {
        assert!(matches!(
            SetInlineFormat::capture_changes(&document, &block, start, end, &changes),
            Err(RichActionError::FormatChanges)
        ));
    }
    assert!(capture(&document, "p", 0, 2, &[remove("breditor/strong")?]).is_err());
    assert!(capture(&document, "p", 3, 1, &[remove("breditor/strong")?]).is_err());
    assert!(capture(&document, "absent", 0, 1, &[remove("breditor/strong")?]).is_err());
    Ok(())
}

#[test]
fn late_schema_failure_cannot_publish_other_blocks_or_history() -> Result {
    let (context, document) = setup(32)?;
    let mut owner = owner(context.clone(), document.clone())?;
    let codec = RichSessionJsonCodec::new(context);
    let before = codec.encode(&owner)?;
    let actions = [
        RichAction::SetInlineFormat(capture(
            &document,
            "p",
            0,
            1,
            &[set("breditor-inline/italic")?],
        )?),
        // TextSize requires pixels; the complete candidate is invalid.
        RichAction::SetInlineFormat(capture(
            &document,
            "caption",
            0,
            1,
            &[set("breditor-inline/italic")?, set("breditor-inline/text-size")?],
        )?),
    ];
    assert!(owner.dispatch(&owner.snapshot(), &actions, RichSelectionUpdate::Map).is_err());
    assert_eq!(codec.encode(&owner)?, before);
    assert_eq!(owner.undo_depth(), 0);
    Ok(())
}

#[test]
fn single_format_capture_is_identical_and_compound_noops_keep_the_observation_live() -> Result {
    let (context, document) = setup(32)?;
    let strong = set("breditor/strong")?;
    let single = SetInlineFormat::capture(
        &document,
        &BlockId::try_new("p")?,
        TextOffset::try_new(0)?,
        TextOffset::try_new(4)?,
        &strong,
    )?;
    assert_eq!(single, capture(&document, "p", 0, 4, std::slice::from_ref(&strong))?);
    let mut owner = owner(context.clone(), document.clone())?;
    let observation = owner.snapshot();
    let codec = RichSessionJsonCodec::new(context);
    let before = codec.encode(&owner)?;
    let action = RichAction::SetInlineFormat(capture(
        &document,
        "p",
        0,
        4,
        &[strong, remove("breditor-inline/italic")?],
    )?);
    for _ in 0..2 {
        assert_eq!(
            owner.dispatch(
                &observation,
                std::slice::from_ref(&action),
                RichSelectionUpdate::Map
            )?,
            RichLocalOutcome::Unchanged
        );
        assert_eq!(codec.encode(&owner)?, before);
    }
    Ok(())
}

#[test]
fn observation_preflight_is_read_only_and_cannot_authorize_foreign_or_later_work() -> Result {
    let (context, document) = setup(32)?;
    let mut local = owner(context.clone(), document.clone())?;
    let foreign = owner(context.clone(), document)?;
    let codec = RichSessionJsonCodec::new(context);
    let observation = local.snapshot();
    let before = codec.encode(&local)?;
    local.validate_observation(&observation)?;
    local.validate_observation(&observation)?;
    assert!(local.validate_observation(&foreign.snapshot()).is_err());
    assert_eq!(codec.encode(&local)?, before);
    local.set_selection(&observation, None)?;
    let after = codec.encode(&local)?;
    assert!(local.validate_observation(&observation).is_err());
    local.validate_observation(&local.snapshot())?;
    assert_eq!(codec.encode(&local)?, after);
    Ok(())
}
