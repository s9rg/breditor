//! Flat-list text primitive and public typing-action laws.
use super::*;
use crate::{
    action::{
        Action, ActionDecision, ActionExecutionError, ActionId, ActionInput, ActionInvocation,
        ActionRegistration, ActionRegistry, ActionValue,
        builtins::{InsertFlatListTextAction, InsertTextInput, insert_text_input_contract},
    },
    block::TextBlockKind,
    codec::{
        OperationJsonCodec, OperationJsonCodecV2, OperationJsonCodecV3, OperationJsonCodecV4,
        OperationJsonCodecV5, SessionCheckpointJsonCodecV5,
        structural_codec_test_support::{
            TestResult, block, extensions, formats, heading, name, state,
        },
    },
    document::{
        ElementNode, FormatSet, NodeRef, PropertyInteger, PropertyMap, PropertyValue, TextFragment,
        TextRun,
    },
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState},
    transaction::{SelectionUpdate, Transaction},
};
use proptest::prelude::*;
use std::error::Error;
fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_flat_list_profile(
            SchemaId::new(name("example/list-text")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        limits,
    ))
}
fn list(blocks: Vec<NodeRef>, start: Option<i64>) -> Result<NodeRef, Box<dyn Error>> {
    let items = blocks
        .into_iter()
        .map(|block| {
            Ok(NodeRef::element(ElementNode::try_new(
                name("breditor/list-item")?,
                None,
                PropertyMap::default(),
                vec![block],
            )?))
        })
        .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
    let props = if let Some(start) = start {
        PropertyMap::try_from_sorted(vec![(
            name("breditor/start")?,
            PropertyValue::from_integer(PropertyInteger::try_new(start)?),
        )])?
    } else {
        PropertyMap::default()
    };
    Ok(NodeRef::element(ElementNode::try_new(
        name(if start.is_some() { "breditor/ordered-list" } else { "breditor/bullet-list" })?,
        None,
        props,
        items,
    )?))
}
fn range(path: &[u32], start: u64, end: u64) -> Result<TextRange, Box<dyn Error>> {
    Ok(TextRange::try_new(
        NodePath::try_from_indices(path.to_vec())?,
        TextOffset::try_new(start)?,
        TextOffset::try_new(end)?,
    )?)
}
fn text(value: &str, formats: FormatSet) -> Result<TextFragment, Box<dyn Error>> {
    Ok(if value.is_empty() {
        TextFragment::empty()
    } else {
        TextFragment::from(TextRun::try_new(value, formats)?)
    })
}
fn point(path: &[u32], offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(path.to_vec())?,
        utf16_offset: offset,
        affinity,
    })
}
fn caret(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}
fn exact(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}
fn history(session: &mut EditorSession, before: &EditorState) -> TestResult {
    let after = session.state().clone();
    session.undo()?.ok_or("undo")?;
    exact(session.state(), before);
    session.redo()?.ok_or("redo")?;
    exact(session.state(), &after);
    Ok(())
}
fn type_text(session: &mut EditorSession, value: &str) -> TestResult {
    let id = ActionId::try_new("test/type-list")?;
    let registry = ActionRegistry::try_new(vec![ActionRegistration::with_input(
        id.clone(),
        insert_text_input_contract(),
        InsertFlatListTextAction,
    )])?;
    let request = ActionInvocation::new(
        id,
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string(value)?),
    );
    session.execute_prepared_action(registry.prepare(session.state(), &request)?)?;
    Ok(())
}

#[test]
fn splice_all_ranks_in_bare_bullet_and_numbered_blocks_has_exact_inverse() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 0..=6 {
        for shape in 0..3 {
            let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
            let source = block(kind, "a🙂e\u{301}", formats()?)?;
            let target = block(kind, "aZe\u{301}", formats()?)?;
            let sibling = block(TextBlockKind::Paragraph, "untouched", formats()?)?;
            let (roots, result, path) = if shape == 0 {
                (vec![source, sibling.clone()], vec![target, sibling], vec![0])
            } else {
                (
                    vec![list(
                        vec![sibling.clone(), source],
                        if shape == 1 { None } else { Some(9) },
                    )?],
                    vec![list(vec![sibling, target], if shape == 1 { None } else { Some(9) })?],
                    vec![0, 1, 0],
                )
            };
            let mut leaf = path.clone();
            leaf.push(0);
            let before = state(
                &context,
                roots,
                caret(point(&leaf, 0, Affinity::Before)?),
                Some(formats()?),
            )?;
            let op = FlatListTextSplice::capture(
                &context,
                before.document(),
                range(&path, 1, 3)?,
                text("Z", formats()?)?,
            )?;
            let mut session = EditorSession::new(before.clone());
            session.apply_transaction(&Transaction::new(
                &before,
                vec![Operation::FlatListTextSplice(op)],
            ))?;
            exact(
                session.state(),
                &state(&context, result, before.selection().cloned(), Some(formats()?))?,
            );
            history(&mut session, &before)?;
        }
    }
    Ok(())
}

#[test]
fn splice_relocation_preserves_affinity_and_reports_deleted_interior() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![list(vec![block(heading(2)?, "abcdef", formats()?)?], Some(8))?],
        None,
        None,
    )?;
    let op = FlatListTextSplice::capture(
        &context,
        before.document(),
        range(&[0, 0, 0], 1, 4)?,
        text("XY", formats()?)?,
    )?;
    let mut session = EditorSession::new(before.clone());
    let commit = session
        .apply_transaction(&Transaction::new(&before, vec![Operation::FlatListTextSplice(op)]))?
        .into_commit()
        .ok_or("commit")?;
    for affinity in [Affinity::Before, Affinity::After] {
        for (source, result) in
            [(0, 0), (1, if affinity == Affinity::Before { 1 } else { 3 }), (4, 3), (6, 5)]
        {
            assert_eq!(
                commit
                    .relocation()
                    .relocate_point(&before, &point(&[0, 0, 0, 0], source, affinity)?)?,
                PointRelocation::Exact(point(&[0, 0, 0, 0], result, affinity)?)
            );
        }
        assert_eq!(
            commit.relocation().relocate_point(&before, &point(&[0, 0, 0, 0], 2, affinity)?)?,
            PointRelocation::Deleted {
                before: point(&[0, 0, 0, 0], 1, affinity)?,
                after: point(&[0, 0, 0, 0], 3, affinity)?
            }
        );
    }
    history(&mut session, &before)
}

#[test]
fn format_only_splice_retains_backward_selection() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let selection = Selection::Range(RangeSelection::new(
        point(&[0, 0, 0, 0], 4, Affinity::Before)?,
        point(&[0, 0, 0, 0], 1, Affinity::After)?,
    ));
    let before = state(
        &context,
        vec![list(vec![block(heading(4)?, "a🙂bc", formats()?)?], None)?],
        selection,
        None,
    )?;
    let op = FlatListTextSplice::capture(
        &context,
        before.document(),
        range(&[0, 0, 0], 0, 5)?,
        text("a🙂bc", FormatSet::default())?,
    )?;
    let mut session = EditorSession::new(before.clone());
    session
        .apply_transaction(&Transaction::new(&before, vec![Operation::FlatListTextSplice(op)]))?;
    exact(
        session.state(),
        &state(
            &context,
            vec![list(vec![block(heading(4)?, "a🙂bc", FormatSet::default())?], None)?],
            before.selection().cloned(),
            None,
        )?,
    );
    history(&mut session, &before)
}

#[test]
fn complete_list_guard_includes_numbering_and_other_items_but_not_other_roots() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let target = block(heading(2)?, "abc", formats()?)?;
    let other = block(TextBlockKind::Paragraph, "other", formats()?)?;
    let guarded = list(vec![target.clone(), other.clone()], Some(8))?;
    let before = state(&context, vec![guarded.clone(), other.clone()], None, None)?;
    let op = FlatListTextSplice::capture(
        &context,
        before.document(),
        range(&[0, 0, 0], 0, 0)?,
        text("Z", formats()?)?,
    )?;
    for changed in [
        list(vec![target.clone(), other.clone()], Some(9))?,
        list(vec![target.clone(), target.clone()], Some(8))?,
    ] {
        let current = state(&context, vec![changed, other.clone()], None, None)?;
        assert!(matches!(
            op.apply(&context, current.document()),
            Err(FlatListTextSpliceError::ExpectedMismatch)
        ));
    }
    let current = state(&context, vec![guarded, target], None, None)?;
    assert!(matches!(op.apply(&context, current.document()), Ok(AppliedOperation::Changed(_))));
    let mut session = EditorSession::new(before.clone());
    session.apply_transaction(&Transaction::new(
        &before,
        vec![Operation::FlatListTextSplice(op.clone())],
    ))?;
    session.undo()?.ok_or("undo")?;
    let current = session.state().clone();
    let history = session.history_status();
    assert!(
        session
            .apply_transaction(&Transaction::new(
                &current,
                vec![Operation::FlatListTextSplice(op.clone()), Operation::FlatListTextSplice(op)]
            ))
            .is_err()
    );
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    Ok(())
}

#[test]
fn invalid_paths_scalar_boundaries_foreign_proofs_and_legacy_schemas_reject() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = list(vec![block(heading(2)?, "a🙂b", formats()?)?], None)?;
    let before = state(&context, vec![source.clone()], None, None)?;
    for path in [vec![], vec![0], vec![0, 0], vec![0, 0, 1], vec![0, 2, 0], vec![0, 0, 0, 0]] {
        assert!(
            FlatListTextSplice::capture(
                &context,
                before.document(),
                range(&path, 0, 0)?,
                text("x", formats()?)?
            )
            .is_err()
        );
    }
    for (start, end) in [(2, 2), (0, 2), (0, 5)] {
        assert!(
            FlatListTextSplice::capture(
                &context,
                before.document(),
                range(&[0, 0, 0], start, end)?,
                text("x", formats()?)?
            )
            .is_err()
        );
    }
    let foreign = self::context(DocumentLimits::default())?;
    assert!(matches!(
        FlatListTextSplice::capture(
            &foreign,
            before.document(),
            range(&[0, 0, 0], 0, 0)?,
            text("x", formats()?)?
        ),
        Err(FlatListTextSpliceError::DocumentProof(_))
    ));
    let op = Operation::FlatListTextSplice(FlatListTextSplice::try_new(
        range(&[0, 0, 0], 0, 0)?,
        source,
        text("x", formats()?)?,
    )?);
    assert!(
        op.validate(&crate::codec::structural_codec_test_support::context(
            DocumentLimits::default()
        )?)
        .is_err()
    );
    assert!(
        op.validate(&EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default()
        ))
        .is_err()
    );
    Ok(())
}

#[test]
fn full_document_text_budget_includes_untouched_roots() -> TestResult {
    let context = context(DocumentLimits::default().with_max_total_text_bytes(6))?;
    let before = state(
        &context,
        vec![
            list(vec![block(heading(1)?, "ab", formats()?)?], None)?,
            block(TextBlockKind::Paragraph, "cdef", formats()?)?,
        ],
        caret(point(&[0, 0, 0, 0], 1, Affinity::Before)?),
        None,
    )?;
    let op = FlatListTextSplice::capture(
        &context,
        before.document(),
        range(&[0, 0, 0], 1, 1)?,
        text("x", formats()?)?,
    )?;
    let mut session = EditorSession::new(before.clone());
    assert!(
        session
            .apply_transaction(&Transaction::new(&before, vec![Operation::FlatListTextSplice(op)]))
            .is_err()
    );
    assert_eq!(session.state(), &before);
    assert!(
        matches!(InsertFlatListTextAction.evaluate(&before,&InsertTextInput::try_new("x")?)?.decision(),ActionDecision::Disabled(reason) if reason.code().as_str()=="breditor/result-limit-exceeded")
    );
    Ok(())
}

#[test]
fn old_operation_and_session_formats_reject_the_new_splice() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before =
        state(&context, vec![list(vec![block(heading(1)?, "a", formats()?)?], None)?], None, None)?;
    let op = Operation::FlatListTextSplice(FlatListTextSplice::capture(
        &context,
        before.document(),
        range(&[0, 0, 0], 1, 1)?,
        text("x", formats()?)?,
    )?);
    assert!(OperationJsonCodec::new(context.clone()).encode(&op).is_err());
    assert!(OperationJsonCodecV2::new(context.clone()).encode(&op).is_err());
    assert!(OperationJsonCodecV3::new(context.clone()).encode(&op).is_err());
    assert!(OperationJsonCodecV4::new(context.clone()).encode(&op).is_err());
    assert!(OperationJsonCodecV5::new(context.clone()).encode(&op).is_err());
    let mut session = EditorSession::new(before.clone());
    session.apply_transaction(&Transaction::new(&before, vec![op]))?;
    assert!(SessionCheckpointJsonCodecV5::new(context).encode(&session).is_err());
    Ok(())
}

#[test]
fn typing_in_empty_item_consumes_pending_formats_and_groups_adjacent_input() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![list(vec![block(heading(6)?, "", FormatSet::default())?], Some(20))?],
        caret(Point::Children {
            parent_path: NodePath::try_from_indices(vec![0, 0, 0])?,
            child_index: 0,
            affinity: Affinity::After,
        }),
        Some(formats()?),
    )?;
    let mut session = EditorSession::new(before.clone());
    type_text(&mut session, "🙂")?;
    type_text(&mut session, "e\u{301}")?;
    exact(
        session.state(),
        &state(
            &context,
            vec![list(vec![block(heading(6)?, "🙂e\u{301}", formats()?)?], Some(20))?],
            caret(point(&[0, 0, 0, 0], 4, Affinity::Before)?),
            None,
        )?,
    );
    assert_eq!(session.undo_depth(), 1);
    history(&mut session, &before)
}

#[test]
fn type_over_uses_first_spatial_format_and_preserves_direction_on_undo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let left = block(heading(3)?, "ab", formats()?)?;
    let right = block(heading(3)?, "CD", FormatSet::default())?;
    let mixed = NodeRef::element(
        left.as_element().ok_or("left")?.try_with_children(
            left.as_element()
                .ok_or("left")?
                .children()
                .iter()
                .cloned()
                .chain(right.as_element().ok_or("right")?.children().iter().cloned())
                .collect(),
        )?,
    );
    for backward in [false, true] {
        let a = point(&[0, 0, 0, 0], 1, Affinity::After)?;
        let b = point(&[0, 0, 0, 1], 1, Affinity::Before)?;
        let selection =
            if backward { RangeSelection::new(b, a) } else { RangeSelection::new(a, b) };
        let before = state(
            &context,
            vec![list(vec![mixed.clone()], None)?],
            Selection::Range(selection),
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        type_text(&mut session, "🙂")?;
        let left = block(heading(3)?, "a🙂", formats()?)?;
        let right = block(heading(3)?, "D", FormatSet::default())?;
        let result = NodeRef::element(
            left.as_element().ok_or("left")?.try_with_children(
                left.as_element()
                    .ok_or("left")?
                    .children()
                    .iter()
                    .cloned()
                    .chain(right.as_element().ok_or("right")?.children().iter().cloned())
                    .collect(),
            )?,
        );
        exact(
            session.state(),
            &state(
                &context,
                vec![list(vec![result], None)?],
                caret(point(&[0, 0, 0, 1], 0, Affinity::Before)?),
                None,
            )?,
        );
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn cross_block_typing_replaces_the_whole_selection_in_one_history_event() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![list(
            vec![block(heading(1)?, "a", formats()?)?, block(heading(2)?, "b", formats()?)?],
            None,
        )?],
        Selection::Range(RangeSelection::new(
            point(&[0, 0, 0, 0], 0, Affinity::Before)?,
            point(&[0, 1, 0, 0], 1, Affinity::After)?,
        )),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    type_text(&mut session, "x")?;
    exact(
        session.state(),
        &state(
            &context,
            vec![list(vec![block(heading(1)?, "x", formats()?)?], None)?],
            caret(point(&[0, 0, 0, 0], 1, Affinity::Before)?),
            None,
        )?,
    );
    assert_eq!(session.undo_depth(), 1);
    history(&mut session, &before)
}

#[test]
fn typing_action_accepts_bare_blocks_and_every_list_item_rank() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 0..=6 {
        for nested in [false, true] {
            let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
            let source = block(kind, "ab", formats()?)?;
            let result = block(kind, "a🙂b", formats()?)?;
            let path = if nested { vec![0, 0, 0, 0] } else { vec![0, 0] };
            let before = state(
                &context,
                vec![if nested { list(vec![source], None)? } else { source }],
                caret(point(&path, 1, Affinity::Before)?),
                None,
            )?;
            let mut session = EditorSession::new(before.clone());
            type_text(&mut session, "🙂")?;
            exact(
                session.state(),
                &state(
                    &context,
                    vec![if nested { list(vec![result], None)? } else { result }],
                    caret(point(&path, 3, Affinity::Before)?),
                    None,
                )?,
            );
            history(&mut session, &before)?;
        }
    }
    Ok(())
}

#[test]
fn typing_action_reports_schema_selection_and_operation_budget_limits() -> TestResult {
    let flat = context(DocumentLimits::default())?;
    let zero = flat.clone().with_max_operations_per_transaction(0);
    let base = EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default());
    for (context, selection, code) in [
        (&flat, None, "breditor/no-selection"),
        (
            &zero,
            Some(caret(point(&[0, 0], 0, Affinity::Before)?)),
            "breditor/operation-budget-exceeded",
        ),
        (&base, Some(caret(point(&[0, 0], 0, Affinity::Before)?)), "breditor/unsupported-schema"),
    ] {
        let before = state(
            context,
            vec![block(TextBlockKind::Paragraph, "a", FormatSet::default())?],
            selection,
            None,
        )?;
        assert!(
            matches!(InsertFlatListTextAction.evaluate(&before,&InsertTextInput::try_new("x")?)?.decision(),ActionDecision::Disabled(reason) if reason.code().as_str()==code)
        );
    }
    Ok(())
}

#[test]
fn typing_at_run_seams_uses_affinity_unless_pending_formats_override() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let left = block(heading(2)?, "a", formats()?)?;
    let right = block(heading(2)?, "b", FormatSet::default())?;
    let source = NodeRef::element(
        left.as_element().ok_or("left")?.try_with_children(
            left.as_element()
                .ok_or("left")?
                .children()
                .iter()
                .cloned()
                .chain(right.as_element().ok_or("right")?.children().iter().cloned())
                .collect(),
        )?,
    );
    for affinity in [Affinity::Before, Affinity::After] {
        for pending in [None, Some(FormatSet::default())] {
            let before = state(
                &context,
                vec![list(vec![source.clone()], Some(50))?],
                caret(point(&[0, 0, 0, 1], 0, affinity)?),
                pending.clone(),
            )?;
            let marked = pending.is_none() && affinity == Affinity::Before;
            let first = block(heading(2)?, if marked { "aX" } else { "a" }, formats()?)?;
            let last = block(heading(2)?, if marked { "b" } else { "Xb" }, FormatSet::default())?;
            let result = NodeRef::element(
                first.as_element().ok_or("first")?.try_with_children(
                    first
                        .as_element()
                        .ok_or("first")?
                        .children()
                        .iter()
                        .cloned()
                        .chain(last.as_element().ok_or("last")?.children().iter().cloned())
                        .collect(),
                )?,
            );
            let mut session = EditorSession::new(before.clone());
            type_text(&mut session, "X")?;
            exact(
                session.state(),
                &state(
                    &context,
                    vec![list(vec![result], Some(50))?],
                    caret(point(&[0, 0, 0, 1], u32::from(!marked), Affinity::Before)?),
                    None,
                )?,
            );
            history(&mut session, &before)?;
        }
    }
    Ok(())
}

#[test]
fn wrap_then_splice_in_one_transaction_replays_and_undoes_exactly() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = block(heading(2)?, "abc", formats()?)?;
    let before = state(
        &context,
        vec![source.clone()],
        caret(point(&[0, 0], 0, Affinity::Before)?),
        Some(formats()?),
    )?;
    let wrapped = list(vec![source], Some(11))?;
    let wrap = FlatListReframe::capture(&context, before.document(), 0, 1, vec![wrapped.clone()])?;
    let splice =
        FlatListTextSplice::try_new(range(&[0, 0, 0], 1, 2)?, wrapped, text("🙂", formats()?)?)?;
    let operations = vec![Operation::FlatListReframe(wrap), Operation::FlatListTextSplice(splice)];
    let mut session = EditorSession::new(before.clone());
    session.apply_transaction(&Transaction::new(&before, operations.clone()))?;
    let expected = state(
        &context,
        vec![list(vec![block(heading(2)?, "a🙂c", formats()?)?], Some(11))?],
        caret(point(&[0, 0, 0, 0], 0, Affinity::Before)?),
        Some(formats()?),
    )?;
    exact(session.state(), &expected);
    history(&mut session, &before)?;
    let mut replay = EditorSession::new(before.clone());
    replay.apply_transaction(&Transaction::new(&before, operations))?;
    exact(replay.state(), &expected);
    Ok(())
}

fn marked(value: &str) -> Result<NodeRef, Box<dyn Error>> {
    block(TextBlockKind::Paragraph, value, formats()?)
}
fn mixed_block(kind: TextBlockKind, parts: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    let template = block(kind, "", FormatSet::default())?;
    let mut children = Vec::new();
    for part in parts {
        children.extend(part.as_element().ok_or("part")?.children().iter().cloned());
    }
    Ok(NodeRef::element(template.as_element().ok_or("template")?.try_with_children(children)?))
}

#[test]
fn cross_container_typing_preserves_start_kind_and_unselected_suffix_numbering() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for left_family in 0..3 {
        for right_family in 0..3 {
            for backward in [false, true] {
                let left = block(heading(2)?, "ab", formats()?)?;
                let right = block(heading(5)?, "cd", formats()?)?;
                let (left, path) = if left_family == 0 {
                    (left, vec![1, 0])
                } else {
                    (
                        list(
                            vec![marked("prefix")?, left, marked("deleted")?],
                            (left_family == 2).then_some(8),
                        )?,
                        vec![1, 1, 0, 0],
                    )
                };
                let (right, endpath) = if right_family == 0 {
                    (right, vec![3, 0])
                } else {
                    (
                        list(
                            vec![marked("deleted")?, right, marked("suffix")?],
                            (right_family == 2).then_some(40),
                        )?,
                        vec![3, 1, 0, 0],
                    )
                };
                let a = point(&path, 1, Affinity::After)?;
                let b = point(&endpath, 1, Affinity::Before)?;
                let selection =
                    if backward { RangeSelection::new(b, a) } else { RangeSelection::new(a, b) };
                let before = state(
                    &context,
                    vec![marked("outside")?, left, marked("removed root")?, right, marked("tail")?],
                    Selection::Range(selection),
                    None,
                )?;
                let joined = block(heading(2)?, "aX🙂d", formats()?)?;
                let left = if left_family == 0 {
                    joined
                } else {
                    list(vec![marked("prefix")?, joined], (left_family == 2).then_some(8))?
                };
                let mut roots = vec![marked("outside")?, left];
                if right_family != 0 {
                    roots.push(list(vec![marked("suffix")?], (right_family == 2).then_some(42))?);
                }
                roots.push(marked("tail")?);
                let mut session = EditorSession::new(before.clone());
                type_text(&mut session, "X🙂")?;
                exact(
                    session.state(),
                    &state(&context, roots, caret(point(&path, 4, Affinity::Before)?), None)?,
                );
                assert_eq!(session.undo_depth(), 1);
                history(&mut session, &before)?;
            }
        }
    }
    Ok(())
}

#[test]
fn typing_across_items_keeps_one_list_and_start_rank_then_groups_following_input() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 0..=6 {
        let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
        let before = state(
            &context,
            vec![list(
                vec![
                    marked("prefix")?,
                    block(kind, "ab", formats()?)?,
                    marked("deleted")?,
                    block(heading(6)?, "cd", formats()?)?,
                    marked("suffix")?,
                ],
                Some(9),
            )?],
            Selection::Range(RangeSelection::new(
                point(&[0, 3, 0, 0], 1, Affinity::Before)?,
                point(&[0, 1, 0, 0], 1, Affinity::After)?,
            )),
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        type_text(&mut session, "🙂")?;
        type_text(&mut session, "X")?;
        exact(
            session.state(),
            &state(
                &context,
                vec![list(
                    vec![marked("prefix")?, block(kind, "a🙂Xd", formats()?)?, marked("suffix")?],
                    Some(9),
                )?],
                caret(point(&[0, 1, 0, 0], 4, Affinity::Before)?),
                None,
            )?,
        );
        assert_eq!(session.undo_depth(), 1);
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn first_selected_middle_run_beats_endpoint_seams_across_items_and_roots() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for middle_family in 0..3 {
        let first = block(heading(2)?, "a", formats()?)?;
        let last = marked("b")?;
        let middle = block(TextBlockKind::Paragraph, "M", FormatSet::default())?;
        let (roots, start, end) = match middle_family {
            0 => (
                vec![list(
                    vec![marked("outside")?, first, marked("")?, middle, last, marked("tail")?],
                    Some(5),
                )?],
                vec![0, 1, 0, 0],
                vec![0, 4, 0, 0],
            ),
            1 => (
                vec![list(vec![first], Some(5))?, middle, list(vec![last], None)?],
                vec![0, 0, 0, 0],
                vec![2, 0, 0, 0],
            ),
            _ => {
                (vec![first, list(vec![marked("")?, middle], None)?, last], vec![0, 0], vec![2, 0])
            }
        };
        let before = state(
            &context,
            roots,
            Selection::Range(RangeSelection::new(
                point(&end, 0, Affinity::Before)?,
                point(&start, 1, Affinity::After)?,
            )),
            None,
        )?;
        let joined = mixed_block(
            heading(2)?,
            vec![
                marked("a")?,
                block(TextBlockKind::Paragraph, "X", FormatSet::default())?,
                marked("b")?,
            ],
        )?;
        let roots = match middle_family {
            0 => vec![list(vec![marked("outside")?, joined, marked("tail")?], Some(5))?],
            1 => vec![list(vec![joined], Some(5))?],
            _ => vec![joined],
        };
        let mut caret_path = start[..start.len() - 1].to_vec();
        caret_path.push(2);
        let mut session = EditorSession::new(before.clone());
        type_text(&mut session, "X")?;
        exact(
            session.state(),
            &state(&context, roots, caret(point(&caret_path, 0, Affinity::Before)?), None)?,
        );
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn text_empty_structural_selection_uses_left_then_right_then_plain_formats() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for scenario in 0..3 {
        let left = if scenario == 0 {
            block(heading(3)?, "a", FormatSet::default())?
        } else {
            block(heading(3)?, "", FormatSet::default())?
        };
        let right = marked(if scenario == 2 { "" } else { "b" })?;
        let start = if scenario == 0 {
            point(&[0, 0, 0, 0], 1, Affinity::After)?
        } else {
            Point::Children {
                parent_path: NodePath::try_from_indices(vec![0, 0, 0])?,
                child_index: 0,
                affinity: Affinity::After,
            }
        };
        let end = if scenario == 2 {
            Point::Children {
                parent_path: NodePath::try_from_indices(vec![0, 1, 0])?,
                child_index: 0,
                affinity: Affinity::Before,
            }
        } else {
            point(&[0, 1, 0, 0], 0, Affinity::Before)?
        };
        let before = state(
            &context,
            vec![list(vec![left, right], None)?],
            Selection::Range(RangeSelection::new(start, end)),
            None,
        )?;
        let (joined, caret_leaf, offset) = match scenario {
            0 => (
                mixed_block(
                    heading(3)?,
                    vec![
                        block(TextBlockKind::Paragraph, "aX", FormatSet::default())?,
                        marked("b")?,
                    ],
                )?,
                1,
                0,
            ),
            1 => (block(heading(3)?, "Xb", formats()?)?, 0, 1),
            _ => (block(heading(3)?, "X", FormatSet::default())?, 0, 1),
        };
        let mut session = EditorSession::new(before.clone());
        type_text(&mut session, "X")?;
        exact(
            session.state(),
            &state(
                &context,
                vec![list(vec![joined], None)?],
                caret(point(&[0, 0, 0, caret_leaf], offset, Affinity::Before)?),
                None,
            )?,
        );
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn cross_block_typing_limits_disable_without_partial_edit_and_exact_budget_can_succeed()
-> TestResult {
    for limits in [
        DocumentLimits::default().with_max_text_bytes(3),
        DocumentLimits::default().with_max_total_text_bytes(6),
    ] {
        let context = context(limits)?;
        let before = state(
            &context,
            vec![list(vec![marked("abc")?, marked("def")?], None)?],
            Selection::Range(RangeSelection::new(
                point(&[0, 0, 0, 0], 3, Affinity::After)?,
                point(&[0, 1, 0, 0], 0, Affinity::Before)?,
            )),
            None,
        )?;
        assert!(
            matches!(InsertFlatListTextAction.evaluate(&before,&InsertTextInput::try_new("X")?)?.decision(),ActionDecision::Disabled(reason) if reason.code().as_str()=="breditor/result-limit-exceeded")
        );
        let mut session = EditorSession::new(before.clone());
        let history = session.history_status();
        assert!(type_text(&mut session, "X").is_err());
        assert_eq!(session.state(), &before);
        assert_eq!(session.history_status(), history);
    }
    let context = context(
        DocumentLimits::default()
            .with_max_children_per_element(2)
            .with_max_nodes(8)
            .with_max_total_text_bytes(4),
    )?;
    let before = state(
        &context,
        vec![list(vec![marked("ab")?, marked("cd")?], None)?],
        Selection::Range(RangeSelection::new(
            point(&[0, 0, 0, 0], 1, Affinity::After)?,
            point(&[0, 1, 0, 0], 1, Affinity::Before)?,
        )),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    type_text(&mut session, "XY")?;
    exact(
        session.state(),
        &state(
            &context,
            vec![list(vec![marked("aXYd")?], None)?],
            caret(point(&[0, 0, 0, 0], 3, Affinity::Before)?),
            None,
        )?,
    );
    history(&mut session, &before)
}

#[test]
fn rejected_cross_block_typing_preserves_existing_redo_after_selection_change() -> TestResult {
    let context = context(DocumentLimits::default().with_max_text_bytes(3))?;
    let before = state(
        &context,
        vec![list(vec![marked("ab")?, marked("cd")?], None)?],
        caret(point(&[0, 0, 0, 0], 0, Affinity::Before)?),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    type_text(&mut session, "x")?;
    let typed = session.state().clone();
    session.undo()?.ok_or("undo")?;
    let range = Selection::Range(RangeSelection::new(
        point(&[0, 0, 0, 0], 2, Affinity::After)?,
        point(&[0, 1, 0, 0], 0, Affinity::Before)?,
    ));
    session.apply_transaction(
        &Transaction::new(session.state(), vec![])
            .with_selection_update(SelectionUpdate::Set(Some(range))),
    )?;
    let current = session.state().clone();
    let history = session.history_status();
    assert_eq!(session.redo_depth(), 1);
    assert!(type_text(&mut session, "X").is_err());
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("redo")?;
    exact(session.state(), &typed);
    Ok(())
}

#[test]
fn stale_cross_block_preparation_cannot_overwrite_later_typing() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![list(vec![marked("ab")?, marked("cd")?], None)?],
        Selection::Range(RangeSelection::new(
            point(&[0, 0, 0, 0], 1, Affinity::After)?,
            point(&[0, 1, 0, 0], 1, Affinity::Before)?,
        )),
        None,
    )?;
    let id = ActionId::try_new("test/type-list")?;
    let registry = ActionRegistry::try_new(vec![ActionRegistration::with_input(
        id.clone(),
        insert_text_input_contract(),
        InsertFlatListTextAction,
    )])?;
    let request = ActionInvocation::new(
        id,
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string("stale")?),
    );
    let stale = registry.prepare(&before, &request)?;
    let mut session = EditorSession::new(before.clone());
    type_text(&mut session, "current")?;
    let current = session.state().clone();
    let history = session.history_status();
    assert!(matches!(
        session.execute_prepared_action(stale),
        Err(ActionExecutionError::Prepared(_))
    ));
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    Ok(())
}

#[test]
fn cross_block_typing_checks_operation_budget_before_planning() -> TestResult {
    let context = context(DocumentLimits::default())?.with_max_operations_per_transaction(0);
    let before = state(
        &context,
        vec![list(vec![marked("a")?, marked("b")?], None)?],
        Selection::Range(RangeSelection::new(
            point(&[0, 0, 0, 0], 1, Affinity::After)?,
            point(&[0, 1, 0, 0], 0, Affinity::Before)?,
        )),
        None,
    )?;
    assert!(
        matches!(InsertFlatListTextAction.evaluate(&before,&InsertTextInput::try_new("X")?)?.decision(),ActionDecision::Disabled(reason) if reason.code().as_str()=="breditor/operation-budget-exceeded")
    );
    let mut session = EditorSession::new(before.clone());
    assert!(type_text(&mut session, "X").is_err());
    assert_eq!(session.state(), &before);
    Ok(())
}

proptest! {
    #[test]
    fn cross_item_typing_matches_independent_unicode_string_and_history(left in "[a-z🙂אב]{0,20}",right in "[a-z🙂]{0,20}",insert in "[a-z🙂]{1,8}",a in any::<usize>(),b in any::<usize>(),rank in 0_u32..7,backward in any::<bool>()) {
        let check=||->TestResult {
            let context=context(DocumentLimits::default())?;let kind=if rank==0{TextBlockKind::Paragraph}else{heading(rank)?};
            let lb:Vec<usize>=left.char_indices().map(|(i,_)|i).chain(std::iter::once(left.len())).collect();let rb:Vec<usize>=right.char_indices().map(|(i,_)|i).chain(std::iter::once(right.len())).collect();
            let first=lb[a%lb.len()];let last=rb[b%rb.len()];let first_offset=u32::try_from(left[..first].encode_utf16().count())?;let last_offset=u32::try_from(right[..last].encode_utf16().count())?;
            let endpoint=|path:Vec<u32>,value:&str,offset:u32|->Result<Point,Box<dyn Error>> {if value.is_empty(){Ok(Point::Children{parent_path:NodePath::try_from_indices(path)?,child_index:0,affinity:Affinity::After})}else{let mut path=path;path.push(0);point(&path,offset,Affinity::Before)}};
            let start=endpoint(vec![0,1,0],&left,first_offset)?;let end=endpoint(vec![0,2,0],&right,last_offset)?;
            let selection=if backward{RangeSelection::new(end,start)}else{RangeSelection::new(start,end)};
            let before=state(&context,vec![list(vec![marked("prefix")?,block(kind,&left,formats()?)?,marked(&right)?,marked("suffix")?],Some(7))?],Selection::Range(selection),None)?;
            let mut session=EditorSession::new(before.clone());type_text(&mut session,&insert)?;
            let result=format!("{}{}{}",&left[..first],insert,&right[last..]);
            let format=if left.is_empty()&&right.is_empty(){FormatSet::default()}else{formats()?};
            exact(session.state(),&state(&context,vec![list(vec![marked("prefix")?,block(kind,&result,format)?,marked("suffix")?],Some(7))?],caret(point(&[0,1,0,0],first_offset+u32::try_from(insert.encode_utf16().count())?,Affinity::Before)?),None)?);
            history(&mut session,&before)
        };let result=check();prop_assert!(result.is_ok(),"{result:?}");
    }
    #[test]
    fn scalar_aligned_list_splice_matches_independent_string_and_inverse(source in "[a-z🙂אב]{0,20}",insert in "[a-z🙂]{0,8}",a in any::<usize>(),b in any::<usize>(),rank in 1_u32..7) {
        let check=||->TestResult {
            let context=context(DocumentLimits::default())?;
            let boundaries:Vec<usize>=source.char_indices().map(|(index,_)|index).chain(std::iter::once(source.len())).collect();
            let left=(a%boundaries.len()).min(b%boundaries.len());let right=(a%boundaries.len()).max(b%boundaries.len());
            let first=boundaries[left];let last=boundaries[right];
            let result=format!("{}{}{}",&source[..first],insert,&source[last..]);
            let before=state(&context,vec![list(vec![block(heading(rank)?,&source,formats()?)?],Some(99))?],None,None)?;
            let op=FlatListTextSplice::capture(&context,before.document(),range(&[0,0,0],u64::try_from(source[..first].encode_utf16().count())?,u64::try_from(source[..last].encode_utf16().count())?)?,text(&insert,formats()?)?)?;
            let mut session=EditorSession::new(before.clone());let outcome=session.apply_transaction(&Transaction::new(&before,vec![Operation::FlatListTextSplice(op)]))?;
            exact(session.state(),&state(&context,vec![list(vec![block(heading(rank)?,&result,formats()?)?],Some(99))?],None,None)?);
            if source==result {assert!(outcome.into_commit().is_none());}else{history(&mut session,&before)?;}
            Ok(())
        };
        let result=check();prop_assert!(result.is_ok(),"{result:?}");
    }
}
