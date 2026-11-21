//! Native restricted editing: a host policy names editable block subtrees and
//! every local command, mixed request, pending style and Undo/Redo is admitted
//! by its complete effect on protected content.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    document::{FormatSet, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichLocalOutcome, RichLocalSession, RichLocalSessionError,
        RichRestrictedPolicy, RichSelectionKind, RichSelectionUpdate, RichTextPoint,
        actions::{InsertText, JoinTextBlocks, MoveBlock, RichAction, SetHeading, SplitTextBlock},
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn paragraph(id: &str, text: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":id},"children":[{"kind":"text","text":text,"formats":[]}]})
}

fn setup() -> Result<(EditorContext, RichLocalSession)> {
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/restricted")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let table = json!({"kind":"element","type":"breditor/table","entityId":null,"properties":{"breditor/block-id":"table-block","breditor/table-id":"t","breditor/columns":[{"id":"c","width":120}],"breditor/merges":[],"breditor/retracted-merges":[]},"children":[
        {"kind":"element","type":"breditor/table-row","entityId":null,"properties":{"breditor/block-id":"row","breditor/row-id":"r"},"children":[
            {"kind":"element","type":"breditor/table-cell","entityId":null,"properties":{"breditor/block-id":"cell","breditor/column-id":"c","breditor/header":false},"children":[paragraph("cellp","Cell")]}
        ]}
    ]});
    let root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"doc"},"children":[
        paragraph("intro","Intro"), paragraph("field","Name"), paragraph("middle","Mid"), table, paragraph("tail","Tail")
    ]});
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/restricted","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":root}).to_string();
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&input)?,
        context.limits(),
    )?;
    let owner = RichLocalSession::try_new(
        context.clone(),
        document,
        Some(caret("field", 0)?),
        HistoryCapacity::try_new(10)?,
    )?;
    Ok((context, owner))
}

fn id(value: &str) -> Result<BlockId> {
    Ok(BlockId::try_new(value)?)
}
fn point(block: &str, offset: u64) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(id(block)?, TextOffset::try_new(offset)?, Affinity::After))
}
fn caret(block: &str, offset: u64) -> Result<RichSelectionKind> {
    range(block, offset, block, offset)
}
fn range(a: &str, start: u64, b: &str, end: u64) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::TextRange { anchor: point(a, start)?, focus: point(b, end)? })
}
fn policy() -> Result<RichRestrictedPolicy> {
    Ok(RichRestrictedPolicy::try_new([id("field")?, id("cell")?, id("tail")?, id("cellp")?])?)
}
fn restricted() -> Result<(EditorContext, RichLocalSession)> {
    let (context, mut owner) = setup()?;
    assert!(owner.set_restricted_editing(&owner.snapshot(), Some(policy()?))?);
    Ok((context, owner))
}
fn fragment(text: &str) -> Result<TextFragment> {
    Ok(TextRun::try_new(text, FormatSet::default())?.into())
}
fn text_of(owner: &RichLocalSession, block: &str) -> Result<String> {
    let document = owner.state().document();
    let path = document.block_path(&id(block)?).ok_or("block")?;
    let node = document.document().node_at(path)?.as_element().ok_or("element")?.clone();
    Ok(node
        .children()
        .iter()
        .filter_map(|child| child.as_text())
        .map(|t| t.text().to_owned())
        .collect())
}
fn assert_refused(
    owner: &RichLocalSession,
    result: &std::result::Result<RichLocalOutcome, RichLocalSessionError>,
    codec: &RichSessionJsonCodec,
    before: &str,
) -> Result {
    assert!(matches!(result, Err(RichLocalSessionError::Restricted)), "{result:?}");
    assert_eq!(codec.encode(owner)?, before);
    Ok(())
}

#[test]
fn typing_is_admitted_only_inside_editable_regions() -> Result {
    let (context, mut owner) = restricted()?;
    let codec = RichSessionJsonCodec::new(context);
    owner.insert_plain_text(&owner.snapshot(), "My ")?;
    assert_eq!(text_of(&owner, "field")?, "My Name");
    owner.set_selection(&owner.snapshot(), Some(caret("intro", 2)?))?;
    assert!(!owner.snapshot().selection_is_editable());
    let before = codec.encode(&owner)?;
    let observed = owner.snapshot();
    for result in [
        owner.insert_plain_text(&observed, "X"),
        owner.insert_hard_break(&observed),
        owner.replace_range_plain_text(&observed, &range("intro", 0, "intro", 2)?, ""),
    ] {
        assert_refused(&owner, &result, &codec, &before)?;
    }
    owner.validate_observation(&observed)?;
    assert_eq!(text_of(&owner, "intro")?, "Intro");
    Ok(())
}

#[test]
fn cross_region_selections_are_refused_whole_not_clamped() -> Result {
    let (context, mut owner) = restricted()?;
    let codec = RichSessionJsonCodec::new(context);
    owner.set_selection(&owner.snapshot(), Some(range("field", 2, "tail", 2)?))?;
    assert!(!owner.snapshot().selection_is_editable());
    let before = codec.encode(&owner)?;
    let observed = owner.snapshot();
    let result = owner.replace_selection_plain_text(&observed, "Z");
    assert_refused(&owner, &result, &codec, &before)?;
    // Selection stays usable for reading/copy; a range inside one region is editable.
    owner.set_selection(&owner.snapshot(), Some(range("field", 0, "field", 4)?))?;
    assert!(owner.snapshot().selection_is_editable());
    owner.replace_selection_plain_text(&owner.snapshot(), "Ada")?;
    assert_eq!(text_of(&owner, "field")?, "Ada");
    Ok(())
}

#[test]
fn enter_backspace_and_moves_at_region_boundaries() -> Result {
    let (context, mut owner) = restricted()?;
    let codec = RichSessionJsonCodec::new(context);
    let before = codec.encode(&owner)?;
    let observed = owner.snapshot();
    let doc = owner.state().document().clone();
    // Enter inside a leaf field would create a sibling block outside the region.
    let split = RichAction::SplitTextBlock(SplitTextBlock::capture(
        &doc,
        &point("field", 2)?,
        &id("fresh")?,
        None,
    )?);
    // Backspace at the start of the field would merge into protected text.
    let join =
        RichAction::JoinTextBlocks(JoinTextBlocks::capture(&doc, &id("intro")?, &id("field")?)?);
    let move_field =
        RichAction::MoveBlock(MoveBlock::capture(&doc, &id("field")?, None, Some(&id("intro")?))?);
    let move_protected =
        RichAction::MoveBlock(MoveBlock::capture(&doc, &id("middle")?, None, Some(&id("intro")?))?);
    for action in [split, join, move_field, move_protected] {
        let result = owner.dispatch(&observed, &[action], RichSelectionUpdate::Map);
        assert_refused(&owner, &result, &codec, &before)?;
    }
    // Enter inside an editable container creates its new block inside the region.
    let split_cell = RichAction::SplitTextBlock(SplitTextBlock::capture(
        &doc,
        &point("cellp", 2)?,
        &id("fresh")?,
        None,
    )?);
    assert_eq!(
        owner.dispatch(&observed, &[split_cell], RichSelectionUpdate::Map)?,
        RichLocalOutcome::ContentCommitted
    );
    assert_eq!(text_of(&owner, "fresh")?, "ll");
    // The region root's own properties belong to the region.
    let heading = RichAction::SetHeading(SetHeading::capture(
        owner.state().document(),
        &id("field")?,
        Some(2),
    )?);
    owner.dispatch(&owner.snapshot(), &[heading], RichSelectionUpdate::Map)?;
    Ok(())
}

#[test]
fn mixed_requests_are_refused_atomically() -> Result {
    let (context, mut owner) = restricted()?;
    let codec = RichSessionJsonCodec::new(context);
    let before = codec.encode(&owner)?;
    let observed = owner.snapshot();
    let doc = owner.state().document().clone();
    let allowed =
        RichAction::InsertText(InsertText::capture(&doc, &point("field", 0)?, &fragment("A")?)?);
    let forbidden =
        RichAction::InsertText(InsertText::capture(&doc, &point("intro", 0)?, &fragment("B")?)?);
    let result = owner.dispatch(&observed, &[allowed.clone(), forbidden], RichSelectionUpdate::Map);
    assert_refused(&owner, &result, &codec, &before)?;
    assert_eq!(owner.undo_depth(), 0);
    owner.dispatch(&observed, &[allowed], RichSelectionUpdate::Map)?;
    assert_eq!(text_of(&owner, "field")?, "AName");
    Ok(())
}

#[test]
fn pending_styles_require_an_editable_caret() -> Result {
    let (context, mut owner) = restricted()?;
    let codec = RichSessionJsonCodec::new(context);
    assert_eq!(
        owner.set_pending_formats(&owner.snapshot(), Some(FormatSet::default()))?,
        RichLocalOutcome::TypingStateOnly
    );
    owner.set_selection(&owner.snapshot(), Some(caret("middle", 1)?))?;
    let before = codec.encode(&owner)?;
    let result = owner.set_pending_formats(&owner.snapshot(), Some(FormatSet::default()));
    assert_refused(&owner, &result, &codec, &before)?;
    Ok(())
}

#[test]
fn undo_and_redo_are_authorized_by_their_effect() -> Result {
    let (context, mut owner) = setup()?;
    let codec = RichSessionJsonCodec::new(context);
    // Authored before the policy: protected content changed in history.
    owner.set_selection(&owner.snapshot(), Some(caret("intro", 0)?))?;
    owner.insert_plain_text(&owner.snapshot(), "X")?;
    owner.set_restricted_editing(&owner.snapshot(), Some(policy()?))?;
    let before = codec.encode(&owner)?;
    let result = owner.undo(&owner.snapshot());
    assert_refused(&owner, &result, &codec, &before)?;
    assert_eq!((owner.undo_depth(), owner.redo_depth()), (1, 0));
    // An allowed edit undoes and redoes normally.
    owner.set_selection(&owner.snapshot(), Some(caret("tail", 0)?))?;
    owner.insert_plain_text(&owner.snapshot(), "T")?;
    assert_eq!(owner.undo(&owner.snapshot())?, RichLocalOutcome::UndoApplied);
    assert_eq!(owner.redo(&owner.snapshot())?, RichLocalOutcome::RedoApplied);
    owner.undo(&owner.snapshot())?;
    // Clearing the policy restores ordinary history.
    owner.set_restricted_editing(&owner.snapshot(), None)?;
    owner.undo(&owner.snapshot())?;
    assert_eq!(text_of(&owner, "intro")?, "Intro");
    // Redo of the protected change is refused again under a reinstalled policy.
    owner.set_restricted_editing(&owner.snapshot(), Some(policy()?))?;
    let before = codec.encode(&owner)?;
    let result = owner.redo(&owner.snapshot());
    assert_refused(&owner, &result, &codec, &before)?;
    Ok(())
}

#[test]
fn tab_navigation_visits_outermost_regions_in_document_order() -> Result {
    let (_, mut owner) = restricted()?;
    owner.set_selection(&owner.snapshot(), None)?;
    let expected =
        [range("field", 0, "field", 4)?, caret("cellp", 0)?, range("tail", 0, "tail", 4)?];
    for kind in &expected {
        let outcome = owner.navigate_restricted_region(&owner.snapshot(), true)?;
        assert_eq!(outcome, RichLocalOutcome::SelectionOnly);
        assert_eq!(owner.state().selection().ok_or("selection")?.kind(), kind);
        assert!(owner.snapshot().selection_is_editable());
    }
    assert_eq!(
        owner.navigate_restricted_region(&owner.snapshot(), true)?,
        RichLocalOutcome::Unchanged
    );
    owner.navigate_restricted_region(&owner.snapshot(), false)?;
    assert_eq!(owner.state().selection().ok_or("selection")?.kind(), &expected[1]);
    // From protected content, Tab moves to the following region.
    owner.set_selection(&owner.snapshot(), Some(caret("middle", 1)?))?;
    owner.navigate_restricted_region(&owner.snapshot(), true)?;
    assert_eq!(owner.state().selection().ok_or("selection")?.kind(), &expected[1]);
    owner.set_selection(&owner.snapshot(), Some(caret("middle", 1)?))?;
    owner.navigate_restricted_region(&owner.snapshot(), false)?;
    assert_eq!(owner.state().selection().ok_or("selection")?.kind(), &expected[0]);
    let regions = owner.restricted_policy().ok_or("policy")?.regions(owner.state().document());
    let names: Vec<_> = regions.iter().map(|region| region.block.as_str()).collect();
    assert_eq!(names, ["field", "cell", "tail"]);
    Ok(())
}

#[test]
fn policy_is_a_live_publication_never_restored_as_permission() -> Result {
    let (context, mut owner) = setup()?;
    let old = owner.snapshot();
    assert!(owner.set_restricted_editing(&old, Some(policy()?))?);
    assert!(old.restricted_policy().is_none());
    assert!(matches!(
        owner.insert_plain_text(&old, "stale"),
        Err(RichLocalSessionError::StaleSnapshot)
    ));
    let observed = owner.snapshot();
    assert_eq!(observed.read_only_revision(), Some(observed.state().revision()));
    assert!(!owner.set_restricted_editing(&observed, Some(policy()?))?);
    owner.validate_observation(&observed)?;
    let codec = RichSessionJsonCodec::new(context);
    let restored = codec.decode(&codec.encode(&owner)?)?;
    assert!(restored.restricted_policy().is_none());
    // Without policy, navigation is refused rather than guessed.
    let mut plain = restored;
    assert!(matches!(
        plain.navigate_restricted_region(&plain.snapshot(), true),
        Err(RichLocalSessionError::Restricted)
    ));
    // Read-only still takes precedence over an editable region.
    owner.set_read_only(&owner.snapshot(), true)?;
    assert!(matches!(
        owner.insert_plain_text(&owner.snapshot(), "A"),
        Err(RichLocalSessionError::ReadOnly)
    ));
    Ok(())
}

#[test]
fn region_bound_is_enforced() -> Result {
    let ids = (0..=breditor_core::rich_content::RICH_RESTRICTED_MAX_REGIONS)
        .map(|index| BlockId::try_new(format!("b{index}")))
        .collect::<std::result::Result<Vec<_>, _>>()?;
    assert!(RichRestrictedPolicy::try_new(ids).is_err());
    Ok(())
}
