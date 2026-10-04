//! Runtime list-container laws, independent of a future durable list codec.
use super::*;
use crate::{
    block::TextBlockKind,
    codec::{
        OperationJsonCodec, OperationJsonCodecV2, OperationJsonCodecV3, OperationJsonCodecV4,
        OperationJsonCodecV5, SessionCheckpointJsonCodecV5,
        structural_codec_test_support::{
            TestResult, block, extensions, formats, heading, name, state,
        },
    },
    document::{ElementNode, FormatSet, NodeRef, PropertyInteger, PropertyMap, PropertyValue},
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState},
    transaction::Transaction,
};
use proptest::prelude::*;
use std::error::Error;

fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_flat_list_profile(
            SchemaId::new(name("example/flat-lists")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        limits,
    ))
}
fn list(blocks: Vec<NodeRef>, start: Option<i64>) -> Result<NodeRef, Box<dyn Error>> {
    let children = blocks
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
    let properties = start
        .map(|start| -> Result<PropertyMap, Box<dyn Error>> {
            Ok(PropertyMap::try_from_sorted(vec![(
                name("breditor/start")?,
                PropertyValue::from_integer(PropertyInteger::try_new(start)?),
            )])?)
        })
        .transpose()?
        .unwrap_or_default();
    Ok(NodeRef::element(ElementNode::try_new(
        name(if start.is_some() { "breditor/ordered-list" } else { "breditor/bullet-list" })?,
        None,
        properties,
        children,
    )?))
}
fn text(path: &[u32], offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(path.to_vec())?,
        utf16_offset: offset,
        affinity,
    })
}
fn children(path: &[u32], index: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children {
        parent_path: NodePath::try_from_indices(path.to_vec())?,
        child_index: index,
        affinity,
    })
}
fn exact(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}
fn sample() -> Result<Vec<NodeRef>, Box<dyn Error>> {
    Ok(vec![
        block(heading(3)?, "a🙂e\u{301}", formats()?)?,
        block(TextBlockKind::Paragraph, "", FormatSet::default())?,
        block(TextBlockKind::Paragraph, "tail", formats()?)?,
    ])
}

#[test]
fn wrap_preserves_backwards_selection_typed_formats_and_exact_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = sample()?;
    let selection = Selection::Range(RangeSelection::new(
        text(&[2, 0], 2, Affinity::Before)?,
        text(&[0, 0], 3, Affinity::After)?,
    ));
    let before = state(&context, blocks.clone(), selection, None)?;
    for start in [None, Some(9)] {
        let result = vec![list(blocks.clone(), start)?];
        let op = FlatListReframe::capture(&context, before.document(), 0, 3, result.clone())?;
        let mut session = EditorSession::new(before.clone());
        let commit = session
            .apply_transaction(&Transaction::new(&before, vec![Operation::FlatListReframe(op)]))?
            .into_commit()
            .ok_or("commit")?;
        let expected = state(
            &context,
            result,
            Selection::Range(RangeSelection::new(
                text(&[0, 2, 0, 0], 2, Affinity::Before)?,
                text(&[0, 0, 0, 0], 3, Affinity::After)?,
            )),
            None,
        )?;
        exact(session.state(), &expected);
        for affinity in [Affinity::Before, Affinity::After] {
            assert_eq!(
                commit.relocation().relocate_point(&before, &children(&[1], 0, affinity)?)?,
                PointRelocation::Exact(children(&[0, 1, 0], 0, affinity)?)
            );
            // Interior root gaps lose their wrapper representation, not their
            // spatial side or affinity. Outer span boundaries remain root gaps.
            for gap in 1..3 {
                let previous = affinity == Affinity::Before;
                let item = if previous { gap - 1 } else { gap };
                let boundary = u32::from(previous && item != 1);
                assert_eq!(
                    commit.relocation().relocate_point(&before, &children(&[], gap, affinity)?)?,
                    PointRelocation::Exact(children(&[0, item, 0], boundary, affinity)?)
                );
            }
            for (source, result) in [(0, 0), (3, 1)] {
                assert_eq!(
                    commit
                        .relocation()
                        .relocate_point(&before, &children(&[], source, affinity)?)?,
                    PointRelocation::Exact(children(&[], result, affinity)?)
                );
            }
        }
        session.undo()?.ok_or("undo")?;
        exact(session.state(), &before);
        session.redo()?.ok_or("redo")?;
        exact(session.state(), &expected);
    }
    Ok(())
}

#[test]
fn partial_unwrap_preserves_numbered_suffix_empty_caret_and_pending_formats() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = sample()?;
    let caret = children(&[1, 1, 0], 0, Affinity::After)?;
    let sibling = block(TextBlockKind::Paragraph, "outside", formats()?)?;
    let before = state(
        &context,
        vec![sibling.clone(), list(blocks.clone(), Some(7))?, sibling.clone()],
        Selection::Range(RangeSelection::new(caret.clone(), caret)),
        Some(formats()?),
    )?;
    let replacement = vec![
        list(vec![blocks[0].clone()], Some(7))?,
        blocks[1].clone(),
        list(vec![blocks[2].clone()], Some(9))?,
    ];
    let operation =
        FlatListReframe::capture(&context, before.document(), 1, 1, replacement.clone())?;
    let mut session = EditorSession::new(before.clone());
    let commit = session
        .apply_transaction(&Transaction::new(&before, vec![Operation::FlatListReframe(operation)]))?
        .into_commit()
        .ok_or("commit")?;
    let caret = children(&[2], 0, Affinity::After)?;
    let expected = state(
        &context,
        vec![
            sibling.clone(),
            replacement[0].clone(),
            replacement[1].clone(),
            replacement[2].clone(),
            sibling,
        ],
        Selection::Range(RangeSelection::new(caret.clone(), caret)),
        Some(formats()?),
    )?;
    exact(session.state(), &expected);
    for affinity in [Affinity::Before, Affinity::After] {
        for (source, result) in [
            (text(&[0, 0], 3, affinity)?, text(&[0, 0], 3, affinity)?),
            (text(&[2, 0], 3, affinity)?, text(&[4, 0], 3, affinity)?),
            (text(&[1, 2, 0, 0], 2, affinity)?, text(&[3, 0, 0, 0], 2, affinity)?),
            (children(&[], 2, affinity)?, children(&[], 4, affinity)?),
        ] {
            assert_eq!(
                commit.relocation().relocate_point(&before, &source)?,
                PointRelocation::Exact(result)
            );
        }
    }
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &before);
    session.redo()?.ok_or("redo")?;
    exact(session.state(), &expected);
    Ok(())
}

#[test]
fn all_container_boundaries_map_to_the_same_affinity_owned_gap() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = sample()?;
    let before = state(&context, vec![list(blocks.clone(), Some(12))?], None, None)?;
    let operation = FlatListReframe::capture(&context, before.document(), 0, 1, blocks)?;
    let mut session = EditorSession::new(before.clone());
    let commit = session
        .apply_transaction(&Transaction::new(&before, vec![Operation::FlatListReframe(operation)]))?
        .into_commit()
        .ok_or("commit")?;
    for affinity in [Affinity::Before, Affinity::After] {
        for gap in 0_u32..=3 {
            let previous = gap > 0 && (affinity == Affinity::Before || gap == 3);
            let index = if previous { gap - 1 } else { gap };
            let end = u32::from(previous && index != 1);
            let expected = PointRelocation::Exact(children(&[index], end, affinity)?);
            assert_eq!(
                commit.relocation().relocate_point(&before, &children(&[0], gap, affinity)?)?,
                expected
            );
            if gap < 3 {
                assert_eq!(
                    commit
                        .relocation()
                        .relocate_point(&before, &children(&[0, gap], 0, affinity)?)?,
                    expected
                );
            }
            if gap > 0 {
                assert_eq!(
                    commit
                        .relocation()
                        .relocate_point(&before, &children(&[0, gap - 1], 1, affinity)?)?,
                    expected
                );
            }
        }
    }
    Ok(())
}

#[test]
fn retype_restart_noop_and_invalid_numbered_tail() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = sample()?;
    let before = state(&context, vec![list(blocks.clone(), None)?], None, None)?;
    let mut session = EditorSession::new(before.clone());
    let no_op = FlatListReframe::capture(
        &context,
        before.document(),
        0,
        1,
        vec![list(blocks.clone(), None)?],
    )?;
    assert!(
        session
            .apply_transaction(&Transaction::new(&before, vec![Operation::FlatListReframe(no_op)]))?
            .into_commit()
            .is_none()
    );
    assert_eq!(session.state(), &before);
    let op = FlatListReframe::capture(
        &context,
        before.document(),
        0,
        1,
        vec![list(blocks.clone(), Some(2_147_483_645))?],
    )?;
    session.apply_transaction(&Transaction::new(&before, vec![Operation::FlatListReframe(op)]))?;
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &before);
    for start in [0, 2_147_483_646, 2_147_483_647] {
        assert!(matches!(
            FlatListReframe::capture(
                &context,
                before.document(),
                0,
                1,
                vec![list(blocks.clone(), Some(start))?]
            ),
            Err(FlatListReframeError::Validation(_))
        ));
    }
    Ok(())
}

#[test]
fn source_guards_batch_rollback_and_redo_survive_failure() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = sample()?;
    let before = state(&context, blocks.clone(), None, None)?;
    let operation = Operation::FlatListReframe(FlatListReframe::capture(
        &context,
        before.document(),
        0,
        3,
        vec![list(blocks, None)?],
    )?);
    let mut session = EditorSession::new(before.clone());
    session.apply_transaction(&Transaction::new(&before, vec![operation.clone()]))?;
    session.undo()?.ok_or("undo")?;
    let current = session.state().clone();
    let history = session.history_status();
    assert!(
        session
            .apply_transaction(&Transaction::new(&current, vec![operation.clone(), operation]))
            .is_err()
    );
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("redo")?;
    Ok(())
}

#[test]
fn numbering_guards_are_checked_even_for_noops_and_capture_is_bounded() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = sample()?;
    let before = state(&context, vec![list(blocks.clone(), Some(7))?], None, None)?;
    for target in [8, 9] {
        let operation = FlatListReframe::try_new(
            0,
            vec![list(blocks.clone(), Some(8))?],
            vec![list(blocks.clone(), Some(target))?],
        )?;
        assert!(matches!(
            operation.apply(&context, before.document()),
            Err(FlatListReframeError::ExpectedMismatch)
        ));
    }
    for (start, count) in [(0, 0), (0, 2), (1, 1), (u32::MAX, 1), (1, u32::MAX)] {
        assert!(matches!(
            FlatListReframe::capture(
                &context,
                before.document(),
                start,
                count,
                vec![list(blocks.clone(), None)?]
            ),
            Err(FlatListReframeError::InvalidTarget)
        ));
    }
    Ok(())
}

#[test]
fn retained_roots_count_toward_unwrap_child_limit() -> TestResult {
    let context = context(DocumentLimits::default().with_max_children_per_element(3))?;
    let blocks = sample()?;
    let before = state(&context, vec![list(blocks.clone(), None)?, blocks[0].clone()], None, None)?;
    let operation = FlatListReframe::capture(&context, before.document(), 0, 1, blocks)?;
    let mut session = EditorSession::new(before.clone());
    assert!(
        session
            .apply_transaction(&Transaction::new(
                &before,
                vec![Operation::FlatListReframe(operation)]
            ))
            .is_err()
    );
    assert_eq!(session.state(), &before);
    Ok(())
}

#[test]
fn static_admission_rejects_text_rank_format_order_and_shape_changes() -> TestResult {
    let blocks = sample()?;
    for replacement in [
        vec![blocks[0].clone()],
        vec![blocks[2].clone(), blocks[1].clone(), blocks[0].clone()],
        vec![block(heading(4)?, "a🙂e\u{301}", formats()?)?, blocks[1].clone(), blocks[2].clone()],
        vec![
            block(heading(3)?, "a🙂e\u{301}", FormatSet::default())?,
            blocks[1].clone(),
            blocks[2].clone(),
        ],
        vec![
            blocks[0].clone(),
            blocks[1].clone(),
            block(TextBlockKind::Paragraph, "changed", formats()?)?,
        ],
    ] {
        assert_eq!(
            FlatListReframe::try_new(0, blocks.clone(), vec![list(replacement, None)?]),
            Err(FlatListReframeError::ContentChanged)
        );
    }
    assert!(FlatListReframe::try_new(0, vec![], blocks.clone()).is_err());
    assert!(FlatListReframe::try_new(u32::MAX, blocks.clone(), blocks.clone()).is_err());
    assert!(
        FlatListReframe::try_new(
            0,
            blocks.clone(),
            vec![list(vec![list(blocks.clone(), None)?], None)?]
        )
        .is_err()
    );
    let context = context(DocumentLimits::default())?;
    let op = Operation::FlatListReframe(FlatListReframe::try_new(
        0,
        blocks.clone(),
        vec![list(blocks.clone(), None)?],
    )?);
    assert!(op.validate(&context).is_ok());
    assert!(
        op.validate(&EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default()
        ))
        .is_err()
    );
    assert!(
        op.validate(&crate::codec::structural_codec_test_support::context(
            DocumentLimits::default()
        )?)
        .is_err()
    );
    let foreign = state(&self::context(DocumentLimits::default())?, blocks, None, None)?;
    assert!(matches!(
        FlatListReframe::capture(&context, foreign.document(), 0, 3, vec![list(sample()?, None)?]),
        Err(FlatListReframeError::DocumentProof(_))
    ));
    Ok(())
}

#[test]
fn full_result_limits_include_retained_siblings_and_new_wrappers() -> TestResult {
    // Source: root + 3*(paragraph+text) = 7. Fragment with wrapper: 5.
    // Full wrapped result: 9, so a limit of 8 rejects only the final document.
    let context = context(DocumentLimits::default().with_max_nodes(8))?;
    let p = block(TextBlockKind::Paragraph, "x", formats()?)?;
    let before = state(&context, vec![p.clone(), p.clone(), p.clone()], None, None)?;
    let op =
        FlatListReframe::capture(&context, before.document(), 1, 1, vec![list(vec![p], None)?])?;
    let mut session = EditorSession::new(before.clone());
    let history = session.history_status();
    assert!(
        session
            .apply_transaction(&Transaction::new(&before, vec![Operation::FlatListReframe(op)]))
            .is_err()
    );
    assert_eq!(session.state(), &before);
    assert_eq!(session.history_status(), history);
    Ok(())
}

#[test]
fn old_operation_and_session_wire_languages_reject_list_recipes() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = sample()?;
    let before = state(&context, blocks.clone(), None, None)?;
    let op = Operation::FlatListReframe(FlatListReframe::capture(
        &context,
        before.document(),
        0,
        3,
        vec![list(blocks, None)?],
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
fn composed_reframes_preserve_mixed_run_leaf_identity_and_replay() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let plain = block(TextBlockKind::Paragraph, "🙂", FormatSet::default())?;
    let marked = block(TextBlockKind::Paragraph, "e\u{301}", formats()?)?;
    let mixed = NodeRef::element(
        plain.as_element().ok_or("paragraph")?.try_with_children(
            plain
                .as_element()
                .ok_or("plain")?
                .children()
                .iter()
                .cloned()
                .chain(marked.as_element().ok_or("marked")?.children().iter().cloned())
                .collect(),
        )?,
    );
    let selected = Selection::Range(RangeSelection::new(
        text(&[1, 1], 2, Affinity::Before)?,
        text(&[0, 0], 2, Affinity::After)?,
    ));
    let before = state(&context, vec![mixed.clone(), mixed.clone()], selected, None)?;
    let wrap = FlatListReframe::capture(
        &context,
        before.document(),
        0,
        2,
        vec![list(vec![mixed.clone(), mixed.clone()], None)?],
    )?;
    let restart = FlatListReframe::try_new(
        0,
        vec![list(vec![mixed.clone(), mixed.clone()], None)?],
        vec![list(vec![mixed.clone()], Some(4))?, list(vec![mixed.clone()], Some(99))?],
    )?;
    let mut session = EditorSession::new(before.clone());
    let commit = session
        .apply_transaction(&Transaction::new(
            &before,
            vec![Operation::FlatListReframe(wrap), Operation::FlatListReframe(restart)],
        ))?
        .into_commit()
        .ok_or("commit")?;
    let after = session.state().clone();
    assert_eq!(
        after.selection(),
        Some(&Selection::Range(RangeSelection::new(
            text(&[1, 0, 0, 1], 2, Affinity::Before)?,
            text(&[0, 0, 0, 0], 2, Affinity::After)?
        )))
    );
    for root in 0..2 {
        for run in 0..2 {
            for affinity in [Affinity::Before, Affinity::After] {
                let original = text(&[root, run], 2, affinity)?;
                assert_eq!(
                    commit.relocation().relocate_point(&before, &original)?,
                    PointRelocation::Exact(text(&[root, 0, 0, run], 2, affinity)?)
                );
            }
        }
    }
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &before);
    session.redo()?.ok_or("redo")?;
    exact(session.state(), &after);
    // Runtime forward replay is deterministic; durable codecs remain closed.
    let mut replay = EditorSession::new(before.clone());
    replay.apply_transaction(&Transaction::new(&before, commit.forward_operations().to_vec()))?;
    exact(replay.state(), &after);
    Ok(())
}

/// Construct random flat layouts while independently retaining each block path.
type TestLayout = (Vec<NodeRef>, Vec<Vec<u32>>);

fn layout(blocks: &[NodeRef], choices: &[u8]) -> Result<TestLayout, Box<dyn Error>> {
    let mut roots = Vec::new();
    let mut paths = Vec::new();
    let mut cursor = 0;
    while cursor < blocks.len() {
        let root = u32::try_from(roots.len())?;
        let choice = choices[cursor];
        if choice == 0 {
            paths.push(vec![root]);
            roots.push(blocks[cursor].clone());
            cursor += 1;
        } else {
            let count = usize::from(choice).min(blocks.len() - cursor);
            for index in 0..count {
                paths.push(vec![root, u32::try_from(index)?, 0]);
            }
            roots.push(list(
                blocks[cursor..cursor + count].to_vec(),
                if choice.is_multiple_of(2) { Some(37) } else { None },
            )?);
            cursor += count;
        }
    }
    Ok((roots, paths))
}

proptest! {
    #[test]
    fn arbitrary_flat_reparenting_has_exact_inverse_block_paths(
        count in 1_usize..30,
        source_choices in prop::collection::vec(0_u8..8,30),
        result_choices in prop::collection::vec(0_u8..8,30),
    ) {
        let check = || -> TestResult {
            let context = context(DocumentLimits::default())?;
            let blocks = (0..count).map(|index| block(heading(2)?,&format!("{index}🙂"),formats()?)).collect::<Result<Vec<_>,_>>()?;
            let (source,source_paths) = layout(&blocks,&source_choices)?;
            let (result,result_paths) = layout(&blocks,&result_choices)?;
            let before = state(&context,source.clone(),None,None)?;
            let operation = FlatListReframe::capture(&context,before.document(),0,u32::try_from(source.len())?,result.clone())?;
            let mut session = EditorSession::new(before.clone());
            let outcome = session.apply_transaction(&Transaction::new(&before,vec![Operation::FlatListReframe(operation)]))?;
            if source == result { assert!(outcome.into_commit().is_none()); return Ok(()); }
            let commit = outcome.into_commit().ok_or("commit")?;
            let after = session.state().clone();
            let undo = session.undo()?.ok_or("undo")?;
            exact(session.state(),&before);
            for (source,result) in source_paths.iter().zip(result_paths) {
                let mut source = source.clone(); source.push(0);
                let mut result = result; result.push(0);
                for affinity in [Affinity::Before,Affinity::After] {
                    let source = text(&source,1,affinity)?;
                    let result = text(&result,1,affinity)?;
                    assert_eq!(commit.relocation().relocate_point(&before,&source)?,PointRelocation::Exact(result.clone()));
                    assert_eq!(undo.relocation().relocate_point(&after,&result)?,PointRelocation::Exact(source));
                }
            }
            session.redo()?.ok_or("redo")?;
            exact(session.state(),&after);
            Ok(())
        };
        let result = check();
        prop_assert!(result.is_ok(), "{result:?}");
    }
}

proptest! {
    #[test]
    fn randomized_wrap_unwrap_preserves_every_text_point_and_inverse(
        values in prop::collection::vec("[a-z🙂אב]{0,8}",1..20),
        prefix in 0_usize..5, suffix in 0_usize..5, start in 1_i64..10000,
    ) {
        let check = || -> TestResult {
            let context = context(DocumentLimits::default())?;
            let blocks = values.iter().enumerate().map(|(i,value)| block(if i%2==0 {heading(6)?} else {TextBlockKind::Paragraph},value,formats()?)).collect::<Result<Vec<_>,_>>()?;
            let outer = block(TextBlockKind::Paragraph,"outside",formats()?)?;
            let mut roots = vec![outer.clone();prefix];
            roots.extend(blocks.clone());
            roots.extend(vec![outer;suffix]);
            let before = state(&context,roots,None,None)?;
            let operation = FlatListReframe::capture(&context,before.document(),u32::try_from(prefix)?,u32::try_from(blocks.len())?,vec![list(blocks,Some(start))?])?;
            let mut session = EditorSession::new(before.clone());
            let commit = session.apply_transaction(&Transaction::new(&before,vec![Operation::FlatListReframe(operation)]))?.into_commit().ok_or("commit")?;
            let after = session.state().clone();
            let undo = session.undo()?.ok_or("undo")?;
            exact(session.state(),&before);
            for (index,value) in values.iter().enumerate() {
                for affinity in [Affinity::Before,Affinity::After] {
                    let mut offset = 0;
                    for next in value.chars().map(Some).chain(std::iter::once(None)) {
                        let old = if value.is_empty() { children(&[u32::try_from(prefix+index)?],0,affinity)? } else { text(&[u32::try_from(prefix+index)?,0],offset,affinity)? };
                        let new = if value.is_empty() { children(&[u32::try_from(prefix)?,u32::try_from(index)?,0],0,affinity)? } else { text(&[u32::try_from(prefix)?,u32::try_from(index)?,0,0],offset,affinity)? };
                        assert_eq!(commit.relocation().relocate_point(&before,&old)?,PointRelocation::Exact(new.clone()));
                        assert_eq!(undo.relocation().relocate_point(&after,&new)?,PointRelocation::Exact(old));
                        if let Some(ch)=next {offset += u32::try_from(ch.len_utf16())?;}
                    }
                }
            }
            session.redo()?.ok_or("redo")?;
            exact(session.state(),&after);
            Ok(())
        };
        prop_assert!(check().is_ok());
    }
}
