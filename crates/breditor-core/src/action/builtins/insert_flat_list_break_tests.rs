//! Public Enter action/session laws for the experimental flat-list profile.
use super::*;
use crate::{
    action::{Action, ActionDecision, ActionInvocation, ActionRegistration, ActionRegistry},
    block::TextBlockKind,
    codec::structural_codec_test_support::{
        TestResult, block, extensions, formats, heading, name, state,
    },
    document::{ElementNode, FormatSet, NodeRef, PropertyInteger, PropertyMap, PropertyValue},
    position::{Affinity, NodePath, Point},
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
            SchemaId::new(name("example/list-enter")?, SchemaVersion::one()),
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
fn p(text: &str) -> Result<NodeRef, Box<dyn Error>> {
    block(TextBlockKind::Paragraph, text, formats()?)
}
fn text(path: &[u32], offset: u32) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(path.to_vec())?,
        utf16_offset: offset,
        affinity: Affinity::Before,
    })
}
fn gap(path: &[u32]) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children {
        parent_path: NodePath::try_from_indices(path.to_vec())?,
        child_index: 0,
        affinity: Affinity::After,
    })
}
fn caret(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}
fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![ActionRegistration::new(
        insert_flat_list_break_action_id(),
        InsertFlatListBreakAction,
    )])?)
}
fn enter(session: &mut EditorSession) -> TestResult {
    let prepared = registry()?.prepare(
        session.state(),
        &ActionInvocation::without_input(insert_flat_list_break_action_id()),
    )?;
    session.execute_prepared_action(prepared)?;
    Ok(())
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
fn enter_at_every_scalar_boundary_preserves_all_ranks_and_container_families() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 0..=6 {
        let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
        for family in 0..3 {
            for (offset, left, right) in
                [(0, "", "a🙂b"), (1, "a", "🙂b"), (3, "a🙂", "b"), (4, "a🙂b", "")]
            {
                let source = block(kind, "a🙂b", formats()?)?;
                let (roots, path) = if family == 0 {
                    (vec![source], vec![0, 0])
                } else {
                    (
                        vec![list(
                            vec![p("first")?, source, p("last")?],
                            (family == 2).then_some(8),
                        )?],
                        vec![0, 1, 0, 0],
                    )
                };
                let before = state(&context, roots, caret(text(&path, offset)?), Some(formats()?))?;
                let left = block(kind, left, formats()?)?;
                let right = block(
                    if right.is_empty() { TextBlockKind::Paragraph } else { kind },
                    right,
                    formats()?,
                )?;
                let (result, path) = if family == 0 {
                    (vec![left, right], vec![1])
                } else {
                    (
                        vec![list(
                            vec![p("first")?, left, right, p("last")?],
                            (family == 2).then_some(8),
                        )?],
                        vec![0, 2, 0],
                    )
                };
                let mut session = EditorSession::new(before.clone());
                enter(&mut session)?;
                exact(
                    session.state(),
                    &state(&context, result, caret(gap(&path)?), Some(formats()?))?,
                );
                assert_eq!(session.undo_depth(), 1);
                history(&mut session, &before)?;
            }
        }
    }
    Ok(())
}

#[test]
fn empty_item_exit_preserves_prefix_suffix_ordinals_at_first_middle_last_and_only_item()
-> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 0..=6 {
        for start in [None, Some(20)] {
            for (count, index) in [(1, 0), (3, 0), (3, 1), (3, 2)] {
                let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
                let mut blocks = vec![p("untouched")?; count];
                blocks[index] = block(kind, "", FormatSet::default())?;
                let before = state(
                    &context,
                    vec![p("outside")?, list(blocks.clone(), start)?, p("tail")?],
                    caret(gap(&[1, u32::try_from(index)?, 0])?),
                    Some(formats()?),
                )?;
                let mut roots = vec![p("outside")?];
                if index > 0 {
                    roots.push(list(blocks[..index].to_vec(), start)?);
                }
                let caret_root = u32::try_from(roots.len())?;
                roots.push(p("")?);
                if index + 1 < count {
                    let suffix_offset = u32::try_from(index + 1)?;
                    roots.push(list(
                        blocks[index + 1..].to_vec(),
                        start.map(|start| start + suffix_offset),
                    )?);
                }
                roots.push(p("tail")?);
                let mut session = EditorSession::new(before.clone());
                enter(&mut session)?;
                exact(
                    session.state(),
                    &state(&context, roots, caret(gap(&[caret_root])?), Some(formats()?))?,
                );
                history(&mut session, &before)?;
            }
        }
    }
    Ok(())
}

#[test]
fn empty_bare_heading_converts_but_empty_bare_paragraph_splits() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 0..=6 {
        let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
        let before = state(
            &context,
            vec![block(kind, "", FormatSet::default())?],
            caret(gap(&[0])?),
            Some(formats()?),
        )?;
        let mut session = EditorSession::new(before.clone());
        enter(&mut session)?;
        let count = if rank == 0 { 2 } else { 1 };
        exact(
            session.state(),
            &state(
                &context,
                vec![p("")?; count],
                caret(gap(&[u32::try_from(count - 1)?])?),
                Some(formats()?),
            )?,
        );
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn extended_selection_inside_one_list_is_one_edit_with_exact_directional_undo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for backward in [false, true] {
        let a = text(&[0, 1, 0, 0], 1)?;
        let b = text(&[0, 3, 0, 0], 1)?;
        let selection =
            if backward { RangeSelection::new(b, a) } else { RangeSelection::new(a, b) };
        let before = state(
            &context,
            vec![list(
                vec![
                    p("before")?,
                    block(heading(2)?, "ab", formats()?)?,
                    p("deleted")?,
                    block(heading(5)?, "cd", formats()?)?,
                    p("after")?,
                ],
                Some(7),
            )?],
            Selection::Range(selection),
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        enter(&mut session)?;
        exact(
            session.state(),
            &state(
                &context,
                vec![list(
                    vec![
                        p("before")?,
                        block(heading(2)?, "a", formats()?)?,
                        block(heading(5)?, "d", formats()?)?,
                        p("after")?,
                    ],
                    Some(7),
                )?],
                caret(gap(&[0, 2, 0])?),
                None,
            )?,
        );
        assert_eq!(session.undo_depth(), 1);
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn cross_container_break_retains_boundary_families_and_original_suffix_numbering() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for left_family in 0..3 {
        for right_family in 0..3 {
            for backward in [false, true] {
                let left = block(heading(2)?, "ab", formats()?)?;
                let right = block(heading(5)?, "cd", formats()?)?;
                let (left, path) = if left_family == 0 {
                    (left, vec![0, 0])
                } else {
                    (
                        list(
                            vec![p("prefix")?, left, p("deleted")?],
                            (left_family == 2).then_some(8),
                        )?,
                        vec![0, 1, 0, 0],
                    )
                };
                let (right, endpath) = if right_family == 0 {
                    (right, vec![2, 0])
                } else {
                    (
                        list(
                            vec![p("deleted")?, right, p("suffix")?],
                            (right_family == 2).then_some(40),
                        )?,
                        vec![2, 1, 0, 0],
                    )
                };
                let a = text(&path, 1)?;
                let b = text(&endpath, 1)?;
                let selection =
                    if backward { RangeSelection::new(b, a) } else { RangeSelection::new(a, b) };
                let before = state(
                    &context,
                    vec![left, p("removed root")?, right],
                    Selection::Range(selection),
                    None,
                )?;
                let left = block(heading(2)?, "a", formats()?)?;
                let right = block(heading(5)?, "d", formats()?)?;
                let left = if left_family == 0 {
                    left
                } else {
                    list(vec![p("prefix")?, left], (left_family == 2).then_some(8))?
                };
                let (right, caret_path) = if right_family == 0 {
                    (right, vec![1])
                } else {
                    (
                        list(vec![right, p("suffix")?], (right_family == 2).then_some(41))?,
                        vec![1, 0, 0],
                    )
                };
                let mut session = EditorSession::new(before.clone());
                enter(&mut session)?;
                exact(
                    session.state(),
                    &state(&context, vec![left, right], caret(gap(&caret_path)?), None)?,
                );
                history(&mut session, &before)?;
            }
        }
    }
    Ok(())
}

#[test]
fn budget_ordinal_and_schema_rejections_do_not_change_state_or_redo() -> TestResult {
    let flat = context(DocumentLimits::default())?;
    let zero = flat.clone().with_max_operations_per_transaction(0);
    let limited = context(DocumentLimits::default().with_max_children_per_element(1))?;
    let base = EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default());
    for (context, roots, selection, code) in [
        (&flat, vec![p("a")?], None, "breditor/no-selection"),
        (
            &zero,
            vec![p("a")?],
            Some(caret(text(&[0, 0], 0)?)),
            "breditor/operation-budget-exceeded",
        ),
        (
            &base,
            vec![block(TextBlockKind::Paragraph, "a", FormatSet::default())?],
            Some(caret(text(&[0, 0], 0)?)),
            "breditor/unsupported-schema",
        ),
        (
            &limited,
            vec![list(vec![p("a")?], None)?],
            Some(caret(text(&[0, 0, 0, 0], 0)?)),
            "breditor/result-limit-exceeded",
        ),
        (
            &flat,
            vec![list(vec![p("a")?], Some(2_147_483_647))?],
            Some(caret(text(&[0, 0, 0, 0], 0)?)),
            "breditor/list-ordinal-overflow",
        ),
    ] {
        let before = state(context, roots, selection, None)?;
        assert!(
            matches!(InsertFlatListBreakAction.evaluate(&before,&())?.decision(),ActionDecision::Disabled(reason) if reason.code().as_str()==code)
        );
        let mut session = EditorSession::new(before.clone());
        let history = session.history_status();
        assert!(enter(&mut session).is_err());
        assert_eq!(session.state(), &before);
        assert_eq!(session.history_status(), history);
    }
    Ok(())
}

#[test]
fn stale_preparation_rejects_and_two_enters_undo_as_separate_events() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before =
        state(&context, vec![list(vec![p("abc")?], None)?], caret(text(&[0, 0, 0, 0], 1)?), None)?;
    let prepared = registry()?
        .prepare(&before, &ActionInvocation::without_input(insert_flat_list_break_action_id()))?;
    let mut session = EditorSession::new(before.clone());
    enter(&mut session)?;
    let first = session.state().clone();
    assert!(session.execute_prepared_action(prepared).is_err());
    exact(session.state(), &first);
    enter(&mut session)?;
    assert_eq!(session.undo_depth(), 2);
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &first);
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &before);
    Ok(())
}

#[test]
fn selecting_only_an_existing_break_moves_caret_without_new_undo_entry() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![list(vec![p("a")?, p("b")?], Some(9))?],
        Selection::Range(RangeSelection::new(text(&[0, 1, 0, 0], 0)?, text(&[0, 0, 0, 0], 1)?)),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    enter(&mut session)?;
    assert_eq!(session.state().document(), before.document());
    assert_eq!(session.state().selection(), Some(&caret(gap(&[0, 1, 0])?)));
    assert_eq!(session.undo_depth(), 0);
    Ok(())
}

#[test]
fn replacing_selection_at_exact_node_and_item_limits_is_atomic() -> TestResult {
    let context =
        context(DocumentLimits::default().with_max_children_per_element(2).with_max_nodes(8))?;
    let before = state(
        &context,
        vec![list(vec![p("ab")?, p("cd")?], None)?],
        Selection::Range(RangeSelection::new(text(&[0, 0, 0, 0], 1)?, text(&[0, 1, 0, 0], 1)?)),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    enter(&mut session)?;
    exact(
        session.state(),
        &state(&context, vec![list(vec![p("a")?, p("d")?], None)?], caret(gap(&[0, 1, 0])?), None)?,
    );
    history(&mut session, &before)
}

#[test]
fn disabled_enter_preserves_existing_redo_after_selection_change() -> TestResult {
    let context = context(DocumentLimits::default().with_max_children_per_element(3))?;
    let before = state(
        &context,
        vec![
            list(vec![p("abc")?, p("tail")?], None)?,
            list(vec![p("x")?, p("y")?, p("z")?], None)?,
        ],
        caret(text(&[0, 0, 0, 0], 1)?),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    enter(&mut session)?;
    session.undo()?.ok_or("undo")?;
    session.apply_transaction(
        &Transaction::new(session.state(), vec![])
            .with_selection_update(SelectionUpdate::Set(Some(caret(text(&[1, 0, 0, 0], 0)?)))),
    )?;
    let current = session.state().clone();
    let history = session.history_status();
    assert_eq!(session.redo_depth(), 1);
    assert!(enter(&mut session).is_err());
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("redo survives")?;
    Ok(())
}

proptest! {
    #[test]
    fn unicode_item_enter_matches_independent_string_oracle(source in "[a-z🙂אב]{1,24}",seed in any::<usize>(),rank in 0_u32..7,start in 1_u32..10000) {
        let check=||->TestResult {
            let context=context(DocumentLimits::default())?;
            let kind=if rank==0{TextBlockKind::Paragraph}else{heading(rank)?};
            let boundaries:Vec<usize>=source.char_indices().map(|(i,_)|i).chain(std::iter::once(source.len())).collect();let split=boundaries[seed%boundaries.len()];
            let offset=u32::try_from(source[..split].encode_utf16().count())?;
            let before=state(&context,vec![list(vec![p("prefix")?,block(kind,&source,formats()?)?,p("suffix")?],Some(start))?],caret(text(&[0,1,0,0],offset)?),Some(formats()?))?;
            let mut session=EditorSession::new(before.clone());enter(&mut session)?;
            exact(session.state(),&state(&context,vec![list(vec![p("prefix")?,block(kind,&source[..split],formats()?)?,block(if split==source.len(){TextBlockKind::Paragraph}else{kind},&source[split..],formats()?)?,p("suffix")?],Some(start))?],caret(gap(&[0,2,0])?),Some(formats()?))?);
            history(&mut session,&before)
        };let result=check();prop_assert!(result.is_ok(),"{result:?}");
    }
}
