use crate::{
    action::{
        Action, ActionActivation, ActionDecision, ActionId, ActionInvocation, ActionRegistration,
        ActionRegistry, builtins::SetTextBlockKindAction,
    },
    block::{HeadingLevel, TextBlockKind},
    codec::{
        CommitJsonCodecV3, DocumentJsonCodecV2, OperationJsonCodec, OperationJsonCodecV2,
        OperationJsonCodecV3, SessionCheckpointJsonCodecV3, TransactionJsonCodecV3,
    },
    document::{
        Document, ElementNode, Format, FormatSet, NodeRef, PropertyInteger, PropertyMap,
        PropertyValue, TextNode,
    },
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{Operation, PointRelocation, TextBlockKindChange, TextBlockKindChangeError},
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, Transaction},
};
use proptest::prelude::*;
use std::error::Error;

type TestResult = Result<(), Box<dyn Error>>;

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    Ok(QualifiedName::try_new(value)?)
}
fn heading(rank: u32) -> Result<TextBlockKind, Box<dyn Error>> {
    Ok(TextBlockKind::Heading(HeadingLevel::try_new(rank)?))
}
fn extensions() -> Result<ExtensionSet, Box<dyn Error>> {
    let kind = name("example/link")?;
    let contract = InlineFormatPropertyContractV1::try_new(
        kind.clone(),
        vec![InlineFormatPropertySpecV1::new(
            name("example/href")?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::try_string(1, 2048)?,
        )],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/links")?, ExtensionVersion::try_new(1)?),
        vec![],
        vec![],
        vec![InlineFormatSpecV1::new(kind, PersistedTypeRevision::one())],
        vec![contract],
    )?;
    Ok(ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?)
}
fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    let schema = CompiledSchema::try_compile_text_block_profile(
        SchemaId::new(name("example/headings")?, SchemaVersion::one()),
        &extensions()?,
    )?;
    Ok(EditorContext::new(schema, limits))
}
fn formats() -> Result<FormatSet, Box<dyn Error>> {
    Ok(FormatSet::try_from_formats(vec![
        Format::new(name("breditor/strong")?, PropertyMap::default()),
        Format::new(
            name("example/link")?,
            PropertyMap::try_from_sorted(vec![(
                name("example/href")?,
                PropertyValue::from_string("https://example.com/🙂"),
            )])?,
        ),
    ])?)
}
fn block(kind: TextBlockKind, text: &str, formats: FormatSet) -> Result<NodeRef, Box<dyn Error>> {
    let (kind, properties) = match kind {
        TextBlockKind::Paragraph => ("breditor/paragraph", PropertyMap::default()),
        TextBlockKind::Heading(level) => (
            "breditor/heading",
            PropertyMap::try_from_sorted(vec![(
                name("breditor/level")?,
                PropertyValue::from_integer(PropertyInteger::try_new(i64::from(level.get()))?),
            )])?,
        ),
    };
    let children = if text.is_empty() {
        vec![]
    } else {
        vec![NodeRef::text(TextNode::try_new(text.to_owned(), formats)?)]
    };
    Ok(NodeRef::element(ElementNode::try_new(name(kind)?, None, properties, children)?))
}
fn state(
    context: &EditorContext,
    blocks: Vec<NodeRef>,
    selection: impl Into<Option<Selection>>,
    pending: Option<FormatSet>,
) -> Result<EditorState, Box<dyn Error>> {
    let root = NodeRef::element(ElementNode::try_new(
        name("breditor/document")?,
        None,
        PropertyMap::default(),
        blocks,
    )?);
    let document = Document::try_new(context.schema(), root, context.limits())?;
    Ok(EditorState::try_new(
        context,
        LineageId::try_new("heading-tests")?,
        document,
        selection.into(),
        pending,
    )?)
}
fn point(block: u32, offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(vec![block, 0])?,
        utf16_offset: offset,
        affinity,
    })
}
fn empty_point(block: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children {
        parent_path: NodePath::try_from_indices(vec![block])?,
        child_index: 0,
        affinity,
    })
}
fn range(anchor: Point, focus: Point) -> Selection {
    Selection::Range(RangeSelection::new(anchor, focus))
}
fn apply(session: &mut EditorSession, target: TextBlockKind) -> Result<Commit, Box<dyn Error>> {
    let id = ActionId::try_new("example/set-heading")?;
    let registry = ActionRegistry::try_new(vec![ActionRegistration::new(
        id.clone(),
        SetTextBlockKindAction::new(target),
    )])?;
    let prepared = registry.prepare(session.state(), &ActionInvocation::without_input(id))?;
    Ok(session.execute_prepared_action(prepared)?)
}
fn kinds(state: &EditorState) -> Result<Vec<TextBlockKind>, Box<dyn Error>> {
    Ok(state
        .document()
        .root()
        .as_element()
        .ok_or("root")?
        .children()
        .iter()
        .map(super::block_kind)
        .collect::<Result<Vec<_>, _>>()?)
}

#[test]
fn heading_schema_has_distinct_fingerprint_and_no_paragraph_operation_capability() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let base = CompiledSchema::try_compile_base_text_profile(
        context.schema().id().clone(),
        &extensions()?,
    )?;
    assert_ne!(base.fingerprint(), context.schema().fingerprint());
    assert!(context.schema().supports_text_block_kind_operations());
    assert!(!context.schema().supports_text_splice_operations());
    assert!(!context.schema().supports_paragraph_structure_operations());
    assert!(!base.supports_text_block_kind_operations());
    assert!(
        CompiledSchema::try_compile_text_block_profile(
            CompiledSchema::breditor_base().id().clone(),
            &extensions()?
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn all_heading_ranks_preserve_typed_text_selection_pending_and_exact_undo_redo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 1..=6 {
        let caret = point(0, 3, Affinity::Before)?;
        let before = state(
            &context,
            vec![block(TextBlockKind::Paragraph, "A🙂e\u{301}", formats()?)?],
            range(caret.clone(), caret),
            Some(formats()?),
        )?;
        let mut session = EditorSession::new(before.clone());
        let commit = apply(&mut session, heading(rank)?)?;
        assert_eq!(kinds(session.state())?, vec![heading(rank)?]);
        assert_eq!(session.state().selection(), before.selection());
        assert_eq!(session.state().pending_formats(), before.pending_formats());
        assert_eq!(
            session.state().document().node_at(&NodePath::try_from_indices(vec![0, 0])?)?,
            before.document().node_at(&NodePath::try_from_indices(vec![0, 0])?)?
        );
        assert_eq!(commit.forward_operations().len(), 1);
        assert_eq!(session.undo_depth(), 1);
        let after = session.state().clone();
        session.undo()?.ok_or("undo")?;
        assert_eq!(session.state().document(), before.document());
        assert_eq!(session.state().selection(), before.selection());
        assert_eq!(session.state().pending_formats(), before.pending_formats());
        session.redo()?.ok_or("redo")?;
        assert_eq!(session.state().document(), after.document());
        assert_eq!(session.state().selection(), after.selection());
        apply(&mut session, TextBlockKind::Paragraph)?;
        assert_eq!(session.state().document(), before.document());
    }
    Ok(())
}

#[test]
fn forward_and_backward_ranges_exclude_later_block_start_in_both_point_encodings() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for backward in [false, true] {
        for use_children in [false, true] {
            let start = point(0, 1, Affinity::Before)?;
            let end = if use_children {
                empty_point(2, Affinity::After)?
            } else {
                point(2, 0, Affinity::After)?
            };
            let selection = if backward { range(end, start) } else { range(start, end) };
            let before = state(
                &context,
                vec![
                    block(TextBlockKind::Paragraph, "ab", formats()?)?,
                    block(heading(2)?, "", FormatSet::default())?,
                    block(TextBlockKind::Paragraph, "cd", formats()?)?,
                ],
                selection,
                None,
            )?;
            let mut session = EditorSession::new(before.clone());
            apply(&mut session, heading(1)?)?;
            assert_eq!(
                kinds(session.state())?,
                vec![heading(1)?, heading(1)?, TextBlockKind::Paragraph]
            );
            assert_eq!(session.state().selection(), before.selection());
            session.undo()?.ok_or("undo")?;
            assert_eq!(session.state().document(), before.document());
        }
    }
    Ok(())
}

#[test]
fn empty_block_caret_keeps_both_affinities_and_round_trips() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(TextBlockKind::Paragraph, "", FormatSet::default())?],
        range(empty_point(0, Affinity::Before)?, empty_point(0, Affinity::After)?),
        Some(formats()?),
    )?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, heading(6)?)?;
    assert_eq!(session.state().selection(), before.selection());
    session.undo()?.ok_or("undo")?;
    assert_eq!(session.state().document(), before.document());
    assert_eq!(session.state().pending_formats(), before.pending_formats());
    Ok(())
}

#[test]
fn mixed_kinds_restore_individually_and_action_state_tracks_target() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![
            block(heading(1)?, "a", formats()?)?,
            block(heading(3)?, "b", formats()?)?,
            block(TextBlockKind::Paragraph, "c", formats()?)?,
        ],
        range(point(2, 1, Affinity::After)?, point(0, 0, Affinity::Before)?),
        None,
    )?;
    let action = SetTextBlockKindAction::new(heading(1)?);
    assert_eq!(action.evaluate(&before, &())?.indicator().activation(), ActionActivation::Mixed);
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, heading(1)?)?;
    let evaluation = action.evaluate(session.state(), &())?;
    assert_eq!(evaluation.indicator().activation(), ActionActivation::Active);
    assert!(
        matches!(evaluation.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/block-kind-unchanged")
    );
    session.undo()?.ok_or("undo")?;
    assert_eq!(session.state().document(), before.document());
    assert_eq!(session.state().selection(), before.selection());
    Ok(())
}

#[test]
fn exact_noop_operation_consumes_no_revision_or_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(&context, vec![block(heading(2)?, "a", formats()?)?], None, None)?;
    let operation = TextBlockKindChange::capture(&context, before.document(), 0..1, heading(2)?)?;
    let mut session = EditorSession::new(before.clone());
    assert!(
        session
            .apply_transaction(&Transaction::new(
                &before,
                vec![Operation::TextBlockKindChange(operation)]
            ))?
            .is_unchanged()
    );
    assert_eq!(session.state(), &before);
    assert_eq!(session.undo_depth(), 0);
    Ok(())
}

#[test]
fn identity_relocation_preserves_all_valid_root_text_and_child_points() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![
            block(TextBlockKind::Paragraph, "ab", formats()?)?,
            block(TextBlockKind::Paragraph, "", FormatSet::default())?,
        ],
        None,
        None,
    )?;
    let operation = TextBlockKindChange::capture(&context, before.document(), 0..2, heading(4)?)?;
    let commit = Transaction::new(&before, vec![Operation::TextBlockKindChange(operation)])
        .apply(&context, &before)?
        .into_commit()
        .ok_or("commit")?;
    for affinity in [Affinity::Before, Affinity::After] {
        let mut points = vec![empty_point(1, affinity)?, empty_point(0, affinity)?];
        for offset in 0..=2 {
            points.push(point(0, offset, affinity)?);
        }
        for child_index in 0..=2 {
            points.push(Point::Children { parent_path: NodePath::root(), child_index, affinity });
        }
        points.push(Point::Children {
            parent_path: NodePath::try_from_indices(vec![0])?,
            child_index: 1,
            affinity,
        });
        for point in points {
            assert_eq!(
                commit.relocation().relocate_point(&before, &point)?,
                PointRelocation::Exact(point)
            );
        }
    }
    Ok(())
}

#[test]
fn late_guard_failure_rolls_back_entire_transaction_and_preserves_redo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(TextBlockKind::Paragraph, "ab", formats()?)?],
        range(point(0, 0, Affinity::After)?, point(0, 1, Affinity::Before)?),
        None,
    )?;
    let mut session = EditorSession::new(before);
    apply(&mut session, heading(1)?)?;
    session.undo()?.ok_or("undo")?;
    let before = session.state().clone();
    let history = session.history_status();
    let operation = TextBlockKindChange::capture(&context, before.document(), 0..1, heading(2)?)?;
    // The second operation carries the old paragraph guard; the first changes it.
    let request = Transaction::new(
        &before,
        vec![
            Operation::TextBlockKindChange(operation.clone()),
            Operation::TextBlockKindChange(operation),
        ],
    );
    assert!(session.apply_transaction(&request).is_err());
    assert_eq!(session.state(), &before);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("retained redo")?;
    assert_eq!(kinds(session.state())?, vec![heading(1)?]);
    Ok(())
}

#[test]
fn complete_guards_detect_text_format_and_kind_changes() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before =
        state(&context, vec![block(TextBlockKind::Paragraph, "a", formats()?)?], None, None)?;
    for different in [
        block(TextBlockKind::Paragraph, "b", formats()?)?,
        block(TextBlockKind::Paragraph, "a", FormatSet::default())?,
        block(heading(1)?, "a", formats()?)?,
    ] {
        let operation = TextBlockKindChange::try_new(0, vec![different], vec![heading(2)?])?;
        assert!(matches!(
            operation.apply(&context, before.document()),
            Err(TextBlockKindChangeError::ExpectedMismatch)
        ));
    }
    Ok(())
}

#[test]
fn empty_mismatched_overflowing_and_out_of_bounds_spans_are_rejected() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let node = block(TextBlockKind::Paragraph, "a", FormatSet::default())?;
    assert!(TextBlockKindChange::try_new(0, vec![], vec![]).is_err());
    assert!(TextBlockKindChange::try_new(0, vec![node.clone()], vec![]).is_err());
    assert!(TextBlockKindChange::try_new(u32::MAX, vec![node.clone()], vec![heading(1)?]).is_err());
    let state = state(&context, vec![node], None, None)?;
    for span in [0..0, 1..2, 0..2] {
        assert!(
            TextBlockKindChange::capture(&context, state.document(), span, heading(1)?).is_err()
        );
    }
    Ok(())
}

#[test]
fn foreign_equal_schema_proof_cannot_authorize_capture() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before =
        state(&context, vec![block(TextBlockKind::Paragraph, "a", formats()?)?], None, None)?;
    let other = self::context(DocumentLimits::default())?;
    assert_eq!(context.schema(), other.schema());
    assert!(matches!(
        TextBlockKindChange::capture(&other, before.document(), 0..1, heading(1)?),
        Err(TextBlockKindChangeError::DocumentProof(_))
    ));
    Ok(())
}

#[test]
fn operation_and_property_budgets_disable_action_without_mutation() -> TestResult {
    for limits in
        [DocumentLimits::default().with_max_properties_per_owner(0), DocumentLimits::default()]
    {
        let mut context = context(limits)?;
        if context.limits().max_properties_per_owner() != 0 {
            context = context.with_max_operations_per_transaction(0);
        }
        let before = state(
            &context,
            vec![block(TextBlockKind::Paragraph, "a", FormatSet::default())?],
            range(point(0, 0, Affinity::After)?, point(0, 0, Affinity::After)?),
            None,
        )?;
        let action = SetTextBlockKindAction::new(heading(1)?);
        let evaluation = action.evaluate(&before, &())?;
        assert!(matches!(evaluation.decision(), ActionDecision::Disabled(_)));
        let mut session = EditorSession::new(before.clone());
        assert!(apply(&mut session, heading(1)?).is_err());
        assert_eq!(session.state(), &before);
        assert_eq!(session.undo_depth(), 0);
    }
    Ok(())
}

#[test]
fn legacy_codecs_reject_heading_operation_and_both_history_branches() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(TextBlockKind::Paragraph, "ab", formats()?)?],
        range(point(0, 0, Affinity::After)?, point(0, 1, Affinity::Before)?),
        None,
    )?;
    let operation = Operation::TextBlockKindChange(TextBlockKindChange::capture(
        &context,
        before.document(),
        0..1,
        heading(1)?,
    )?);
    assert!(OperationJsonCodec::new(context.clone()).encode(&operation).is_err());
    assert!(OperationJsonCodecV2::new(context.clone()).encode(&operation).is_err());
    assert!(OperationJsonCodecV3::new(context.clone()).encode(&operation).is_err());
    let transaction = Transaction::new(&before, vec![operation]);
    assert!(TransactionJsonCodecV3::new(context.clone()).encode(&transaction).is_err());
    let mut session = EditorSession::new(before);
    let commit = session.apply_transaction(&transaction)?.into_commit().ok_or("commit")?;
    assert!(CommitJsonCodecV3::new(context.clone()).encode(&commit).is_err());
    let codec = SessionCheckpointJsonCodecV3::new(context.clone());
    assert!(codec.encode(&session).is_err());
    // Document V2 already supports validated element properties independently.
    let document_codec = DocumentJsonCodecV2::new(context.schema().clone());
    assert_eq!(
        document_codec.decode(&document_codec.encode(session.state().document())?)?,
        *session.state().document()
    );
    session.undo()?.ok_or("undo")?;
    assert!(codec.encode(&session).is_err());
    Ok(())
}

#[test]
fn in_memory_checkpoint_restores_history_cursor_and_replays_exactly() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(TextBlockKind::Paragraph, "ab", formats()?)?],
        range(point(0, 0, Affinity::After)?, point(0, 1, Affinity::Before)?),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, heading(1)?)?;
    apply(&mut session, heading(3)?)?;
    session.undo()?.ok_or("undo")?;
    let parts = session.checkpoint_parts();
    let mut restored = EditorSession::try_from_checkpoint_parts(
        parts.state.clone(),
        parts.history.capacity,
        parts.history.entries.cloned().collect(),
        parts.history.cursor,
        parts.history.open_merge_group.cloned(),
    )
    .map_err(|_| "checkpoint topology")?;
    assert_eq!(restored.undo_depth(), 1);
    assert_eq!(restored.redo_depth(), 1);
    restored.redo()?.ok_or("restored redo")?;
    assert_eq!(kinds(restored.state())?, vec![heading(3)?]);
    restored.undo()?.ok_or("undo rank")?;
    restored.undo()?.ok_or("undo paragraph")?;
    assert_eq!(restored.state().document(), before.document());
    assert_eq!(restored.state().selection(), before.selection());
    Ok(())
}

#[test]
fn retained_blocks_participate_in_property_budget_and_disabled_state_stays_mixed() -> TestResult {
    let context = context(DocumentLimits::default().with_max_property_values(1))?;
    let blocks = vec![
        block(heading(1)?, "a", FormatSet::default())?,
        block(TextBlockKind::Paragraph, "b", FormatSet::default())?,
    ];
    let selected = state(
        &context,
        blocks.clone(),
        range(point(1, 0, Affinity::After)?, point(1, 1, Affinity::Before)?),
        None,
    )?;
    let operation = TextBlockKindChange::capture(&context, selected.document(), 1..2, heading(1)?)?;
    assert!(matches!(
        operation.apply(&context, selected.document()),
        Err(TextBlockKindChangeError::Validation(_))
    ));
    let mut session = EditorSession::new(selected.clone());
    assert!(apply(&mut session, heading(1)?).is_err());
    assert_eq!(session.state(), &selected);
    assert_eq!(session.undo_depth(), 0);
    let both = state(
        &context,
        blocks,
        range(point(0, 0, Affinity::After)?, point(1, 1, Affinity::Before)?),
        None,
    )?;
    let evaluation = SetTextBlockKindAction::new(heading(1)?).evaluate(&both, &())?;
    assert!(
        matches!(evaluation.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/result-limit-exceeded")
    );
    assert_eq!(evaluation.indicator().activation(), ActionActivation::Mixed);
    Ok(())
}

#[test]
fn missing_selection_and_base_schema_disable_cleanly() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(TextBlockKind::Paragraph, "a", FormatSet::default())?],
        None,
        None,
    )?;
    let action = SetTextBlockKindAction::new(heading(1)?);
    assert!(
        matches!(action.evaluate(&before, &())?.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/no-selection")
    );
    let base = EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default());
    let before = state(
        &base,
        vec![block(TextBlockKind::Paragraph, "a", FormatSet::default())?],
        range(point(0, 0, Affinity::After)?, point(0, 1, Affinity::Before)?),
        None,
    )?;
    assert!(
        matches!(action.evaluate(&before, &())?.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/unsupported-schema")
    );
    assert!(matches!(
        TextBlockKindChange::capture(&base, before.document(), 0..1, heading(1)?),
        Err(TextBlockKindChangeError::UnsupportedSchema)
    ));
    Ok(())
}

#[test]
fn stale_prepared_heading_cannot_overwrite_a_later_commit() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(TextBlockKind::Paragraph, "a", formats()?)?],
        range(point(0, 0, Affinity::After)?, point(0, 1, Affinity::Before)?),
        None,
    )?;
    let id = ActionId::try_new("example/heading-two")?;
    let registry = ActionRegistry::try_new(vec![ActionRegistration::new(
        id.clone(),
        SetTextBlockKindAction::new(heading(2)?),
    )])?;
    let prepared = registry.prepare(&before, &ActionInvocation::without_input(id))?;
    let mut session = EditorSession::new(before);
    apply(&mut session, heading(1)?)?;
    let current = session.state().clone();
    let history = session.history_status();
    assert!(session.execute_prepared_action(prepared).is_err());
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    Ok(())
}

#[test]
fn malformed_source_metadata_is_rejected_before_rebuilding() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for properties in [
        PropertyMap::default(),
        PropertyMap::try_from_sorted(vec![(
            name("breditor/level")?,
            PropertyValue::from_string("2"),
        )])?,
        PropertyMap::try_from_sorted(vec![(
            name("breditor/level")?,
            PropertyValue::from_integer(PropertyInteger::try_new(7)?),
        )])?,
    ] {
        let invalid = NodeRef::element(ElementNode::try_new(
            name("breditor/heading")?,
            None,
            properties,
            vec![],
        )?);
        let operation = Operation::TextBlockKindChange(TextBlockKindChange::try_new(
            0,
            vec![invalid],
            vec![TextBlockKind::Paragraph],
        )?);
        assert!(operation.validate(&context).is_err());
    }
    Ok(())
}

#[test]
fn new_kind_edit_after_undo_replaces_redo_branch() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(TextBlockKind::Paragraph, "a", formats()?)?],
        range(point(0, 0, Affinity::After)?, point(0, 1, Affinity::Before)?),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, heading(1)?)?;
    session.undo()?.ok_or("undo")?;
    apply(&mut session, heading(2)?)?;
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(session.redo_depth(), 0);
    assert!(session.redo()?.is_none());
    session.undo()?.ok_or("undo replacement")?;
    assert_eq!(session.state().document(), before.document());
    Ok(())
}

proptest! {
    #[test]
    fn randomized_block_kind_history_restores_exact_tree_and_selection(ranks in prop::collection::vec(0_u32..=6, 1..16), target in 0_u32..=6, backward in any::<bool>()) {
        let result = (|| -> TestResult {
            let context = context(DocumentLimits::default())?;
            let kind = |rank| if rank == 0 { Ok(TextBlockKind::Paragraph) } else { heading(rank) };
            let blocks = ranks.iter().map(|rank| block(kind(*rank)?, "a🙂e\u{301}", formats()?)).collect::<Result<Vec<_>, Box<dyn Error>>>()?;
            let first = point(0, 0, Affinity::Before)?;
            let last = point(u32::try_from(ranks.len() - 1)?, 5, Affinity::After)?;
            let selection = if backward { range(last, first) } else { range(first, last) };
            let before = state(&context, blocks, selection, None)?;
            let target = kind(target)?;
            let operation = TextBlockKindChange::capture(&context, before.document(), 0..u32::try_from(ranks.len())?, target)?;
            let mut session = EditorSession::new(before.clone());
            let outcome = session.apply_transaction(&Transaction::new(&before, vec![Operation::TextBlockKindChange(operation)]))?;
            assert_eq!(kinds(session.state())?, vec![target; ranks.len()]);
            assert_eq!(session.state().selection(), before.selection());
            if !outcome.is_unchanged() {
                session.undo()?.ok_or("undo")?;
                assert_eq!(session.state().document(), before.document());
                session.redo()?.ok_or("redo")?;
                assert_eq!(kinds(session.state())?, vec![target; ranks.len()]);
            }
            Ok(())
        })();
        result.map_err(|error| TestCaseError::fail(error.to_string()))?;
    }
}
