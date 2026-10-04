//! Independent text/layout, relocation, admission and exact-history laws.
use super::*;
use crate::{
    block::{ListKind, OrderedListStart, TextBlockKind},
    codec::{
        OperationJsonCodec, OperationJsonCodecV2, OperationJsonCodecV3, OperationJsonCodecV4,
        OperationJsonCodecV5, SessionCheckpointJsonCodecV5,
        structural_codec_test_support::{
            TestResult, block, extensions, formats, heading, name, state,
        },
    },
    document::{ElementNode, FormatSet, NodeRef, PropertyInteger, PropertyMap, PropertyValue},
    position::{Affinity, NodePath, Point, TextOffset},
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
            SchemaId::new(name("example/list-replace")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        limits,
    ))
}
fn list(blocks: Vec<NodeRef>, start: Option<u32>) -> Result<NodeRef, Box<dyn Error>> {
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
    let properties = if let Some(start) = start {
        PropertyMap::try_from_sorted(vec![(
            name("breditor/start")?,
            PropertyValue::from_integer(PropertyInteger::try_new(i64::from(start))?),
        )])?
    } else {
        PropertyMap::default()
    };
    Ok(NodeRef::element(ElementNode::try_new(
        name(if start.is_some() { "breditor/ordered-list" } else { "breditor/bullet-list" })?,
        None,
        properties,
        items,
    )?))
}
fn ordered(start: u32, items: u32) -> Result<FlatListRootShape, Box<dyn Error>> {
    Ok(FlatListRootShape::List {
        kind: ListKind::Ordered(OrderedListStart::try_new(start)?),
        items,
    })
}
fn bullet(items: u32) -> FlatListRootShape {
    FlatListRootShape::List { kind: ListKind::Bullet, items }
}
fn range(a: &[u32], x: u64, b: &[u32], y: u64) -> Result<FlatListTextRange, Box<dyn Error>> {
    Ok(FlatListTextRange::try_new(
        NodePath::try_from_indices(a.to_vec())?,
        TextOffset::try_new(x)?,
        NodePath::try_from_indices(b.to_vec())?,
        TextOffset::try_new(y)?,
    )?)
}
fn point(path: &[u32], offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(path.to_vec())?,
        utf16_offset: offset,
        affinity,
    })
}
fn p(text: &str) -> Result<NodeRef, Box<dyn Error>> {
    block(TextBlockKind::Paragraph, text, formats()?)
}
fn empty() -> Result<NodeRef, Box<dyn Error>> {
    p("")
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

#[test]
fn splitting_middle_item_preserves_ranks_formats_selection_and_exact_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 0..=6 {
        let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
        let selection = RangeSelection::new(
            point(&[1, 1, 0, 0], 3, Affinity::After)?,
            point(&[1, 1, 0, 0], 3, Affinity::After)?,
        );
        let before = state(
            &context,
            vec![
                p("outside")?,
                list(vec![p("first")?, block(kind, "a🙂b", formats()?)?, p("last")?], Some(10))?,
                p("tail")?,
            ],
            Selection::Range(selection),
            Some(formats()?),
        )?;
        let op = FlatListTextReplace::capture(
            &context,
            before.document(),
            range(&[1, 1, 0], 3, &[1, 1, 0], 3)?,
            vec![block(kind, "", FormatSet::default())?, empty()?],
            vec![ordered(10, 4)?],
        )?;
        let mut session = EditorSession::new(before.clone());
        let commit = session
            .apply_transaction(&Transaction::new(
                &before,
                vec![Operation::FlatListTextReplace(op)],
            ))?
            .into_commit()
            .ok_or("commit")?;
        let expected = state(
            &context,
            vec![
                p("outside")?,
                list(
                    vec![p("first")?, block(kind, "a🙂", formats()?)?, p("b")?, p("last")?],
                    Some(10),
                )?,
                p("tail")?,
            ],
            Selection::Range(RangeSelection::new(
                point(&[1, 2, 0, 0], 0, Affinity::After)?,
                point(&[1, 2, 0, 0], 0, Affinity::After)?,
            )),
            Some(formats()?),
        )?;
        exact(session.state(), &expected);
        for affinity in [Affinity::Before, Affinity::After] {
            let expected = if affinity == Affinity::Before {
                point(&[1, 1, 0, 0], 3, affinity)?
            } else {
                point(&[1, 2, 0, 0], 0, affinity)?
            };
            assert_eq!(
                commit.relocation().relocate_point(&before, &point(&[1, 1, 0, 0], 3, affinity)?)?,
                PointRelocation::Exact(expected)
            );
            assert_eq!(
                commit.relocation().relocate_point(&before, &point(&[1, 2, 0, 0], 2, affinity)?)?,
                PointRelocation::Exact(point(&[1, 3, 0, 0], 2, affinity)?)
            );
        }
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn empty_item_exit_inverse_guards_both_lists_beyond_edited_text_range() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![p("outside")?, list(vec![p("first")?, empty()?, p("last")?], Some(8))?, p("tail")?],
        None,
        None,
    )?;
    let op = FlatListTextReplace::capture(
        &context,
        before.document(),
        range(&[1, 1, 0], 0, &[1, 1, 0], 0)?,
        vec![empty()?],
        vec![ordered(8, 1)?, FlatListRootShape::TextBlock, ordered(10, 1)?],
    )?;
    let AppliedOperation::Changed(change) = op.apply(&context, before.document())? else {
        return Err("changed".into());
    };
    let Operation::FlatListTextReplace(inverse) = &change.inverse else {
        return Err("inverse".into());
    };
    assert_eq!(inverse.guard_start(), 1);
    assert_eq!(inverse.range().start_path().as_slice(), &[2]);
    assert_eq!(inverse.expected().len(), 3);
    let mut session = EditorSession::new(before.clone());
    let commit = session
        .apply_transaction(&Transaction::new(&before, vec![Operation::FlatListTextReplace(op)]))?
        .into_commit()
        .ok_or("commit")?;
    exact(
        session.state(),
        &state(
            &context,
            vec![
                p("outside")?,
                list(vec![p("first")?], Some(8))?,
                empty()?,
                list(vec![p("last")?], Some(10))?,
                p("tail")?,
            ],
            None,
            None,
        )?,
    );
    assert_eq!(
        commit.relocation().relocate_point(&before, &point(&[2, 0], 2, Affinity::Before)?)?,
        PointRelocation::Exact(point(&[4, 0], 2, Affinity::Before)?)
    );
    let empty_point = Point::Children {
        parent_path: NodePath::try_from_indices(vec![1, 1, 0])?,
        child_index: 0,
        affinity: Affinity::After,
    };
    assert_eq!(
        commit.relocation().relocate_point(&before, &empty_point)?,
        PointRelocation::Exact(Point::Children {
            parent_path: NodePath::try_from_indices(vec![2])?,
            child_index: 0,
            affinity: Affinity::After
        })
    );
    history(&mut session, &before)
}

#[test]
fn cross_root_replacement_preserves_untouched_items_and_deletes_interior_points() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![
            list(vec![p("first")?, block(heading(2)?, "a🙂b", formats()?)?], Some(8))?,
            block(heading(5)?, "middle", formats()?)?,
            list(vec![p("cdef")?, p("last")?], None)?,
        ],
        None,
        None,
    )?;
    let op = FlatListTextReplace::capture(
        &context,
        before.document(),
        range(&[0, 1, 0], 1, &[2, 0, 0], 2)?,
        vec![p("XY")?],
        vec![ordered(8, 3)?],
    )?;
    let mut session = EditorSession::new(before.clone());
    let commit = session
        .apply_transaction(&Transaction::new(&before, vec![Operation::FlatListTextReplace(op)]))?
        .into_commit()
        .ok_or("commit")?;
    exact(
        session.state(),
        &state(
            &context,
            vec![list(vec![p("first")?, p("aXYef")?, p("last")?], Some(8))?],
            None,
            None,
        )?,
    );
    for affinity in [Affinity::Before, Affinity::After] {
        for source in [
            point(&[0, 1, 0, 0], 3, affinity)?,
            point(&[1, 0], 2, affinity)?,
            point(&[2, 0, 0, 0], 1, affinity)?,
            Point::Children { parent_path: NodePath::root(), child_index: 1, affinity },
        ] {
            assert_eq!(
                commit.relocation().relocate_point(&before, &source)?,
                PointRelocation::Deleted {
                    before: point(&[0, 1, 0, 0], 1, affinity)?,
                    after: point(&[0, 1, 0, 0], 3, affinity)?
                }
            );
        }
        assert_eq!(
            commit.relocation().relocate_point(&before, &point(&[2, 0, 0, 0], 4, affinity)?)?,
            PointRelocation::Exact(point(&[0, 1, 0, 0], 5, affinity)?)
        );
    }
    history(&mut session, &before)
}

#[test]
fn unchanged_text_reformat_and_reparent_retains_backward_selection() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let selection = RangeSelection::new(
        point(&[0, 1, 0, 0], 3, Affinity::Before)?,
        point(&[0, 0, 0, 0], 1, Affinity::After)?,
    );
    let before = state(
        &context,
        vec![list(vec![p("abc")?, p("def")?], None)?],
        Selection::Range(selection),
        None,
    )?;
    let op = FlatListTextReplace::capture(
        &context,
        before.document(),
        range(&[0, 0, 0], 0, &[0, 1, 0], 3)?,
        vec![
            block(heading(2)?, "abc", FormatSet::default())?,
            block(heading(5)?, "def", FormatSet::default())?,
        ],
        vec![FlatListRootShape::TextBlock, FlatListRootShape::TextBlock],
    )?;
    let mut session = EditorSession::new(before.clone());
    session
        .apply_transaction(&Transaction::new(&before, vec![Operation::FlatListTextReplace(op)]))?;
    assert_eq!(
        session.state().selection(),
        Some(
            &RangeSelection::new(
                point(&[1, 0], 3, Affinity::Before)?,
                point(&[0, 0], 1, Affinity::After)?
            )
            .into()
        )
    );
    history(&mut session, &before)
}

#[test]
fn source_guards_precede_noop_and_failed_batch_preserves_redo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(&context, vec![list(vec![p("abc")?], Some(8))?], None, None)?;
    let noop = FlatListTextReplace::capture(
        &context,
        before.document(),
        range(&[0, 0, 0], 1, &[0, 0, 0], 1)?,
        vec![empty()?],
        vec![ordered(8, 1)?],
    )?;
    assert!(matches!(noop.apply(&context, before.document())?, AppliedOperation::Unchanged));
    let changed = state(&context, vec![list(vec![p("abc")?], Some(9))?], None, None)?;
    assert!(matches!(
        noop.apply(&context, changed.document()),
        Err(FlatListTextReplaceError::ExpectedMismatch)
    ));
    let op = Operation::FlatListTextReplace(FlatListTextReplace::capture(
        &context,
        before.document(),
        range(&[0, 0, 0], 1, &[0, 0, 0], 1)?,
        vec![empty()?, empty()?],
        vec![ordered(8, 2)?],
    )?);
    let mut session = EditorSession::new(before.clone());
    session.apply_transaction(&Transaction::new(&before, vec![op.clone()]))?;
    session.undo()?;
    let current = session.state().clone();
    let history = session.history_status();
    assert!(session.apply_transaction(&Transaction::new(&current, vec![op.clone(), op])).is_err());
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    Ok(())
}

#[test]
fn cross_root_replacement_restores_mixed_run_seams_and_original_heading_ranks() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let combine = |kind, parts: Vec<NodeRef>| -> Result<NodeRef, Box<dyn Error>> {
        let template = block(kind, "", FormatSet::default())?;
        let mut children = Vec::new();
        for part in parts {
            children.extend(part.as_element().ok_or("element")?.children().iter().cloned());
        }
        Ok(NodeRef::element(template.as_element().ok_or("template")?.try_with_children(children)?))
    };
    let left = combine(
        heading(2)?,
        vec![p("a🙂")?, block(TextBlockKind::Paragraph, "bc", FormatSet::default())?],
    )?;
    let right = combine(
        heading(5)?,
        vec![block(TextBlockKind::Paragraph, "de", FormatSet::default())?, p("f🙂g")?],
    )?;
    let before = state(&context, vec![list(vec![left], Some(8))?, right], None, None)?;
    let op = FlatListTextReplace::capture(
        &context,
        before.document(),
        range(&[0, 0, 0], 1, &[1], 3)?,
        vec![block(TextBlockKind::Paragraph, "X", FormatSet::default())?],
        vec![bullet(1)],
    )?;
    let mut session = EditorSession::new(before.clone());
    session
        .apply_transaction(&Transaction::new(&before, vec![Operation::FlatListTextReplace(op)]))?;
    let expected = combine(
        TextBlockKind::Paragraph,
        vec![p("a")?, block(TextBlockKind::Paragraph, "X", FormatSet::default())?, p("🙂g")?],
    )?;
    exact(session.state(), &state(&context, vec![list(vec![expected], None)?], None, None)?);
    history(&mut session, &before)
}

#[test]
fn invalid_path_order_offsets_layout_and_ordinals_reject() -> TestResult {
    for path in [vec![], vec![0, 0], vec![0, 0, 1], vec![0, 0, 0, 0], vec![u32::MAX]] {
        assert!(range(&path, 0, &path, 0).is_err());
    }
    assert!(range(&[1], 0, &[0], 1).is_err());
    assert!(range(&[0], 2, &[0], 1).is_err());
    let source = list(vec![p("a🙂b")?], None)?;
    for layout in [
        vec![],
        vec![bullet(0)],
        vec![bullet(2)],
        vec![FlatListRootShape::TextBlock, FlatListRootShape::TextBlock],
    ] {
        assert!(
            FlatListTextReplace::try_new(
                0,
                range(&[0, 0, 0], 1, &[0, 0, 0], 1)?,
                vec![source.clone()],
                vec![empty()?],
                layout
            )
            .is_err()
        );
    }
    for (a, b) in [(2, 2), (0, 2), (0, 9)] {
        assert!(
            FlatListTextReplace::try_new(
                0,
                range(&[0, 0, 0], a, &[0, 0, 0], b)?,
                vec![source.clone()],
                vec![empty()?],
                vec![bullet(1)]
            )
            .is_err()
        );
    }
    assert!(
        FlatListTextReplace::try_new(
            1,
            range(&[0, 0, 0], 0, &[0, 0, 0], 0)?,
            vec![source.clone()],
            vec![empty()?],
            vec![bullet(1)]
        )
        .is_err()
    );
    assert!(
        FlatListTextReplace::try_new(
            0,
            range(&[0, 2, 0], 0, &[0, 2, 0], 0)?,
            vec![source],
            vec![empty()?],
            vec![bullet(1)]
        )
        .is_err()
    );
    assert!(matches!(
        FlatListTextReplace::try_new(
            0,
            range(&[0, 0, 0], 0, &[0, 0, 0], 0)?,
            vec![list(vec![p("a")?], Some(2_147_483_647))?],
            vec![empty()?, empty()?],
            vec![ordered(2_147_483_647, 2)?]
        ),
        Err(FlatListTextReplaceError::OrdinalOverflow)
    ));
    Ok(())
}

#[test]
fn full_document_limits_include_untouched_roots_and_real_container_depth() -> TestResult {
    let context = context(DocumentLimits::default().with_max_total_text_bytes(6))?;
    let before = state(&context, vec![list(vec![p("ab")?], None)?, p("cdef")?], None, None)?;
    let op = FlatListTextReplace::capture(
        &context,
        before.document(),
        range(&[0, 0, 0], 1, &[0, 0, 0], 1)?,
        vec![p("x")?],
        vec![bullet(1)],
    )?;
    assert!(matches!(
        op.apply(&context, before.document()),
        Err(FlatListTextReplaceError::Validation(_))
    ));
    let small = self::context(DocumentLimits::default().with_max_children_per_element(2))?;
    let before = state(&small, vec![list(vec![p("a")?, p("b")?], None)?, p("tail")?], None, None)?;
    let op = FlatListTextReplace::capture(
        &small,
        before.document(),
        range(&[0, 0, 0], 1, &[0, 0, 0], 1)?,
        vec![empty()?, empty()?],
        vec![bullet(1), bullet(2)],
    )?;
    assert!(matches!(
        op.apply(&small, before.document()),
        Err(FlatListTextReplaceError::Validation(_))
    ));
    let shallow = self::context(DocumentLimits::default().with_max_node_depth(2))?;
    let before = state(&shallow, vec![p("abc")?], None, None)?;
    assert!(matches!(
        FlatListTextReplace::capture(
            &shallow,
            before.document(),
            range(&[0], 1, &[0], 1)?,
            vec![p("x")?],
            vec![bullet(1)],
        ),
        Err(FlatListTextReplaceError::Validation(_))
    ));
    Ok(())
}

#[test]
fn foreign_proofs_legacy_schemas_and_all_existing_codecs_remain_closed() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(&context, vec![list(vec![p("ab")?], None)?], None, None)?;
    let op = FlatListTextReplace::capture(
        &context,
        before.document(),
        range(&[0, 0, 0], 1, &[0, 0, 0], 1)?,
        vec![empty()?, empty()?],
        vec![bullet(2)],
    )?;
    assert!(matches!(
        op.apply(&self::context(DocumentLimits::default())?, before.document()),
        Err(FlatListTextReplaceError::DocumentProof(_))
    ));
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
    let op = Operation::FlatListTextReplace(op);
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

/// Enumerates every scalar-aligned leaf point and every element-child gap,
/// including root/list/item boundaries that have no text-leaf representation.
fn points(node: &NodeRef, path: &[u32], result: &mut Vec<Point>) -> TestResult {
    if let Some(text) = node.as_text() {
        let mut offset = 0;
        for ch in text.text().chars().map(Some).chain(std::iter::once(None)) {
            for affinity in [Affinity::Before, Affinity::After] {
                result.push(point(path, offset, affinity)?);
            }
            if let Some(ch) = ch {
                offset += u32::try_from(ch.len_utf16())?;
            }
        }
    } else if let Some(element) = node.as_element() {
        for index in 0..=element.children().len() {
            for affinity in [Affinity::Before, Affinity::After] {
                result.push(Point::Children {
                    parent_path: NodePath::try_from_indices(path.to_vec())?,
                    child_index: u32::try_from(index)?,
                    affinity,
                });
            }
        }
        for (index, child) in element.children().iter().enumerate() {
            let mut path = path.to_vec();
            path.push(u32::try_from(index)?);
            points(child, &path, result)?;
        }
    }
    Ok(())
}

#[test]
fn every_text_and_structural_boundary_maps_to_valid_endpoints_in_both_directions() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![
            p("outside")?,
            list(vec![p("a🙂b")?, empty()?, block(heading(3)?, "de", formats()?)?], Some(5))?,
            p("fg")?,
            list(vec![p("h🙂i")?, empty()?, p("jk")?], None)?,
            p("tail")?,
        ],
        None,
        None,
    )?;
    // Split, join over multiple containers, and same-text empty-item exit.
    for (range, inserted, layout) in [
        (
            range(&[1, 0, 0], 1, &[1, 0, 0], 1)?,
            vec![empty()?, empty()?],
            vec![bullet(2), FlatListRootShape::TextBlock, ordered(30, 1)?],
        ),
        (
            range(&[1, 0, 0], 1, &[3, 0, 0], 3)?,
            vec![p("X")?, empty()?, p("Y")?],
            vec![bullet(2), FlatListRootShape::TextBlock, ordered(30, 2)?],
        ),
        (
            range(&[1, 1, 0], 0, &[1, 1, 0], 0)?,
            vec![empty()?],
            vec![ordered(5, 1)?, FlatListRootShape::TextBlock, ordered(7, 1)?],
        ),
    ] {
        let op =
            FlatListTextReplace::capture(&context, before.document(), range, inserted, layout)?;
        let AppliedOperation::Changed(change) = op.apply(&context, before.document())? else {
            return Err("changed".into());
        };
        let Operation::FlatListTextReplace(inverse) = &change.inverse else {
            return Err("inverse".into());
        };
        let AppliedOperation::Changed(undo) = inverse.apply(&context, &change.document)? else {
            return Err("undo".into());
        };
        assert_eq!(&undo.document, before.document());
        for (source, result, map) in [
            (before.document(), &change.document, &change.relocation),
            (&change.document, &undo.document, &undo.relocation),
        ] {
            let RelocationStepMap::FlatListTextReplace(map) = map else {
                return Err("list map".into());
            };
            let mut all = Vec::new();
            points(source.root(), &[], &mut all)?;
            for point in all {
                let relocated = map.relocate(source, result, &point)?;
                match relocated {
                    PointRelocation::Exact(point) => {
                        point.resolve(result)?;
                    }
                    PointRelocation::Deleted { before, after } => {
                        before.resolve(result)?;
                        after.resolve(result)?;
                    }
                }
            }
        }
    }
    Ok(())
}

#[test]
fn text_preserving_reparent_keeps_unselected_block_point_representation() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before =
        state(&context, vec![list(vec![p("first")?, empty()?, p("last")?], None)?], None, None)?;
    let op = FlatListTextReplace::capture(
        &context,
        before.document(),
        range(&[0, 1, 0], 0, &[0, 1, 0], 0)?,
        vec![empty()?],
        vec![
            FlatListRootShape::TextBlock,
            FlatListRootShape::TextBlock,
            FlatListRootShape::TextBlock,
        ],
    )?;
    let AppliedOperation::Changed(change) = op.apply(&context, before.document())? else {
        return Err("changed".into());
    };
    let RelocationStepMap::FlatListTextReplace(map) = &change.relocation else {
        return Err("list map".into());
    };
    for affinity in [Affinity::Before, Affinity::After] {
        for index in [0, 2] {
            for child_index in [0, 1] {
                let point = Point::Children {
                    parent_path: NodePath::try_from_indices(vec![0, index, 0])?,
                    child_index,
                    affinity,
                };
                assert_eq!(
                    map.relocate(before.document(), &change.document, &point)?,
                    PointRelocation::Exact(Point::Children {
                        parent_path: NodePath::try_from_indices(vec![index])?,
                        child_index,
                        affinity
                    })
                );
            }
        }
    }
    Ok(())
}

/// Builds an independent mixture of bare roots, bullets and numbered lists.
/// Returns real source paths and an explicit operation layout, not a flattened
/// document or a call into the production layout builder.
type Forest = (Vec<NodeRef>, Vec<NodePath>, Vec<FlatListRootShape>);

fn forest(blocks: &[NodeRef], seed: usize) -> Result<Forest, Box<dyn Error>> {
    let mut roots = Vec::new();
    let mut paths = Vec::new();
    let mut layout = Vec::new();
    let mut cursor = 0;
    while cursor < blocks.len() {
        let root = u32::try_from(roots.len())?;
        let family = (seed.wrapping_add(cursor)) % 3;
        let count = if family == 0 { 1 } else { (seed % 3 + 1).min(blocks.len() - cursor) };
        if family == 0 {
            roots.push(blocks[cursor].clone());
            paths.push(NodePath::try_from_indices(vec![root])?);
            layout.push(FlatListRootShape::TextBlock);
        } else {
            roots.push(list(blocks[cursor..cursor + count].to_vec(), (family == 2).then_some(30))?);
            layout.push(if family == 2 {
                ordered(30, u32::try_from(count)?)?
            } else {
                bullet(u32::try_from(count)?)
            });
            for item in 0..count {
                paths.push(NodePath::try_from_indices(vec![root, u32::try_from(item)?, 0])?);
            }
        }
        cursor += count;
    }
    Ok((roots, paths, layout))
}

proptest! {
    #[test]
    fn arbitrary_root_partitions_and_guard_spans_restore_exactly(texts in prop::collection::vec("[a-z🙂אב]{0,8}",1..9),left_insert in "[a-z🙂]{0,5}",right_insert in "[a-z🙂]{0,5}",a in any::<usize>(),b in any::<usize>(),source_seed in any::<usize>(),result_seed in any::<usize>()) {
        let check=||->TestResult {
            let context=context(DocumentLimits::default())?;
            let blocks=texts.iter().enumerate().map(|(i,text)| block(heading(u32::try_from(i%6+1)?)?,text,formats()?)).collect::<Result<Vec<_>,_>>()?;
            let (roots,paths,_)=forest(&blocks,source_seed)?;
            let first=(a%texts.len()).min(b%texts.len());let last=(a%texts.len()).max(b%texts.len());
            let lb:Vec<usize>=texts[first].char_indices().map(|(i,_)|i).chain(std::iter::once(texts[first].len())).collect();
            let rb:Vec<usize>=texts[last].char_indices().map(|(i,_)|i).chain(std::iter::once(texts[last].len())).collect();
            let mut l=lb[a%lb.len()];let mut r=rb[b%rb.len()];if first==last && l>r {std::mem::swap(&mut l,&mut r);}
            let mut result=blocks[..first].to_vec();
            result.push(p(&format!("{}{}",&texts[first][..l],left_insert))?);
            result.push(block(heading(6)?,&format!("{}{}",right_insert,&texts[last][r..]),formats()?)?);
            result.extend_from_slice(&blocks[last+1..]);
            let (expected,_,layout)=forest(&result,result_seed)?;
            let before=state(&context,roots.clone(),None,None)?;
            let op=FlatListTextReplace::try_new(0,FlatListTextRange::try_new(paths[first].clone(),TextOffset::try_new(u64::try_from(texts[first][..l].encode_utf16().count())?)?,paths[last].clone(),TextOffset::try_new(u64::try_from(texts[last][..r].encode_utf16().count())?)?)?,roots,vec![p(&left_insert)?,block(heading(6)?,&right_insert,formats()?)?],layout)?;
            let mut session=EditorSession::new(before.clone());
            let changed=session.apply_transaction(&Transaction::new(&before,vec![Operation::FlatListTextReplace(op)]))?.into_commit().is_some();
            exact(session.state(),&state(&context,expected,None,None)?);
            if changed {history(&mut session,&before)?;}
            Ok(())
        };
        let result=check();prop_assert!(result.is_ok(),"{result:?}");
    }
    #[test]
    fn unicode_split_matches_string_oracle_and_exact_inverse(source in "[a-z🙂אב]{0,24}",seed in any::<usize>(),rank in 1_u32..7, ordered_list in any::<bool>()) {
        let check=||->TestResult {
            let context=context(DocumentLimits::default())?;
            let boundaries:Vec<usize>=source.char_indices().map(|(i,_)|i).chain(std::iter::once(source.len())).collect();
            let split=boundaries[seed%boundaries.len()];let offset=u64::try_from(source[..split].encode_utf16().count())?;
            let start=ordered_list.then_some(99);
            let before=state(&context,vec![list(vec![p("before")?,block(heading(rank)?,&source,formats()?)?,p("after")?],start)?],None,None)?;
            let op=FlatListTextReplace::capture(&context,before.document(),range(&[0,1,0],offset,&[0,1,0],offset)?,vec![block(heading(rank)?,"",FormatSet::default())?,empty()?],vec![if ordered_list {ordered(99,4)?}else{bullet(4)}])?;
            let mut session=EditorSession::new(before.clone());session.apply_transaction(&Transaction::new(&before,vec![Operation::FlatListTextReplace(op)]))?;
            exact(session.state(),&state(&context,vec![list(vec![p("before")?,block(heading(rank)?,&source[..split],formats()?)?,p(&source[split..])?,p("after")?],start)?],None,None)?);
            history(&mut session,&before)
        };
        let result=check();prop_assert!(result.is_ok(),"{result:?}");
    }
    #[test]
    fn unicode_cross_item_join_matches_string_oracle_and_exact_inverse(left in "[a-z🙂אב]{0,20}",right in "[a-z🙂]{0,20}",insert in "[a-z🙂]{0,8}",a in any::<usize>(),b in any::<usize>()) {
        let check=||->TestResult {
            let context=context(DocumentLimits::default())?;
            let l:Vec<usize>=left.char_indices().map(|(i,_)|i).chain(std::iter::once(left.len())).collect();
            let r:Vec<usize>=right.char_indices().map(|(i,_)|i).chain(std::iter::once(right.len())).collect();
            let first=l[a%l.len()];let last=r[b%r.len()];
            let before=state(&context,vec![list(vec![p("before")?,block(heading(3)?,&left,formats()?)?,block(heading(6)?,&right,formats()?)?,p("after")?],Some(4))?],None,None)?;
            let op=FlatListTextReplace::capture(&context,before.document(),range(&[0,1,0],u64::try_from(left[..first].encode_utf16().count())?,&[0,2,0],u64::try_from(right[..last].encode_utf16().count())?)?,vec![p(&insert)?],vec![ordered(4,3)?])?;
            let mut session=EditorSession::new(before.clone());session.apply_transaction(&Transaction::new(&before,vec![Operation::FlatListTextReplace(op)]))?;
            exact(session.state(),&state(&context,vec![list(vec![p("before")?,p(&format!("{}{}{}",&left[..first],insert,&right[last..]))?,p("after")?],Some(4))?],None,None)?);
            history(&mut session,&before)
        };
        let result=check();prop_assert!(result.is_ok(),"{result:?}");
    }
}
