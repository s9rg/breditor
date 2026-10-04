//! Public action/registry and history laws for flat list wrapping and removal.
use super::{UnwrapListAction, WrapListAction};
use crate::{
    action::{
        Action, ActionActivation, ActionDecision, ActionEvaluation, ActionId, ActionInvocation,
        ActionRegistration, ActionRegistry,
    },
    block::{ListKind, OrderedListStart, TextBlockKind},
    codec::structural_codec_test_support::{
        TestResult, block, extensions, formats, heading, name, state,
    },
    document::{ElementNode, FormatSet, NodeRef, PropertyInteger, PropertyMap, PropertyValue},
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState},
};
use proptest::prelude::*;
use std::error::Error;

fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_flat_list_profile(
            SchemaId::new(name("example/list-actions")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        limits,
    ))
}
fn numbered(start: u32) -> Result<ListKind, Box<dyn Error>> {
    Ok(ListKind::Ordered(OrderedListStart::try_new(start)?))
}
/// Expected trees are built independently of the action's list factory.
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
fn text(path: &[u32], offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(path.to_vec())?,
        utf16_offset: offset,
        affinity,
    })
}
fn boundary(path: &[u32], index: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children {
        parent_path: NodePath::try_from_indices(path.to_vec())?,
        child_index: index,
        affinity,
    })
}
fn select(start: Point, end: Point, backward: bool) -> Selection {
    if backward {
        RangeSelection::new(end, start).into()
    } else {
        RangeSelection::new(start, end).into()
    }
}
fn caret(point: Point) -> Selection {
    select(point.clone(), point, false)
}
fn registry(target: ListKind) -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![
        ActionRegistration::new(ActionId::try_new("test/wrap")?, WrapListAction::new(target)),
        ActionRegistration::new(ActionId::try_new("test/unwrap")?, UnwrapListAction),
    ])?)
}
fn invocation(id: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::without_input(ActionId::try_new(id)?))
}
fn apply(session: &mut EditorSession, target: ListKind, id: &str) -> TestResult {
    let prepared = registry(target)?.prepare(session.state(), &invocation(id)?)?;
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
    assert_eq!(session.undo_depth(), 1);
    session.undo()?.ok_or("undo")?;
    exact(session.state(), before);
    session.redo()?.ok_or("redo")?;
    exact(session.state(), &after);
    Ok(())
}
fn disabled(evaluation: &ActionEvaluation, code: &str) {
    assert!(
        matches!(evaluation.decision(),ActionDecision::Disabled(reason) if reason.code().as_str()==code),
        "{evaluation:?}"
    );
}
fn blocks(count: usize) -> Result<Vec<NodeRef>, Box<dyn Error>> {
    (0..count)
        .map(|i| {
            block(
                if i.is_multiple_of(2) { heading(3)? } else { TextBlockKind::Paragraph },
                &format!("{i}🙂"),
                formats()?,
            )
        })
        .collect()
}

#[test]
fn wrapping_spatial_range_excludes_next_block_start_and_preserves_direction() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = blocks(4)?;
    for backward in [false, true] {
        for as_children in [false, true] {
            for target in [ListKind::Bullet, numbered(12)?] {
                let start = text(&[1, 0], 1, Affinity::After)?;
                let end = if as_children {
                    boundary(&[3], 0, Affinity::Before)?
                } else {
                    text(&[3, 0], 0, Affinity::Before)?
                };
                let before = state(&context, blocks.clone(), select(start, end, backward), None)?;
                let mut session = EditorSession::new(before.clone());
                apply(&mut session, target, "test/wrap")?;
                let end = if as_children {
                    boundary(&[2], 0, Affinity::Before)?
                } else {
                    text(&[2, 0], 0, Affinity::Before)?
                };
                let expected = state(
                    &context,
                    vec![
                        blocks[0].clone(),
                        list(
                            blocks[1..3].to_vec(),
                            if target == ListKind::Bullet { None } else { Some(12) },
                        )?,
                        blocks[3].clone(),
                    ],
                    select(text(&[1, 0, 0, 0], 1, Affinity::After)?, end, backward),
                    None,
                )?;
                exact(session.state(), &expected);
                history(&mut session, &before)?;
            }
        }
    }
    Ok(())
}

#[test]
fn partial_unwrap_keeps_original_numbered_suffix_and_empty_caret() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let mut blocks = blocks(3)?;
    blocks[1] = block(heading(6)?, "", FormatSet::default())?;
    for start in [None, Some(31)] {
        let before = state(
            &context,
            vec![list(blocks.clone(), start)?],
            caret(boundary(&[0, 1, 0], 0, Affinity::After)?),
            Some(formats()?),
        )?;
        let mut session = EditorSession::new(before.clone());
        apply(&mut session, ListKind::Bullet, "test/unwrap")?;
        let expected = state(
            &context,
            vec![
                list(vec![blocks[0].clone()], start)?,
                blocks[1].clone(),
                list(vec![blocks[2].clone()], start.map(|s| s + 2))?,
            ],
            caret(boundary(&[1], 0, Affinity::After)?),
            Some(formats()?),
        )?;
        exact(session.state(), &expected);
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn partial_marker_conversion_preserves_unselected_items_and_suffix_ordinal() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = blocks(4)?;
    for backward in [false, true] {
        let before = state(
            &context,
            vec![list(blocks.clone(), Some(10))?],
            select(
                text(&[0, 1, 0, 0], 1, Affinity::Before)?,
                text(&[0, 3, 0, 0], 0, Affinity::After)?,
                backward,
            ),
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        apply(&mut session, ListKind::Bullet, "test/wrap")?;
        let expected = state(
            &context,
            vec![
                list(vec![blocks[0].clone()], Some(10))?,
                list(blocks[1..3].to_vec(), None)?,
                list(vec![blocks[3].clone()], Some(13))?,
            ],
            select(
                text(&[1, 0, 0, 0], 1, Affinity::Before)?,
                text(&[2, 0, 0, 0], 0, Affinity::After)?,
                backward,
            ),
            None,
        )?;
        exact(session.state(), &expected);
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn numbered_wrap_keeps_existing_restarts_and_does_not_merge_adjacent_containers() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = blocks(6)?;
    let before = state(
        &context,
        vec![
            blocks[0].clone(),
            list(vec![blocks[1].clone()], Some(99))?,
            list(vec![blocks[2].clone()], Some(7))?,
            list(vec![blocks[3].clone()], None)?,
            blocks[4].clone(),
            blocks[5].clone(),
        ],
        select(text(&[0, 0], 0, Affinity::Before)?, text(&[5, 0], 1, Affinity::After)?, false),
        None,
    )?;
    let prepared = registry(numbered(3)?)?.prepare(&before, &invocation("test/wrap")?)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Mixed);
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(prepared)?;
    let expected = state(
        &context,
        vec![
            list(vec![blocks[0].clone()], Some(3))?,
            list(vec![blocks[1].clone()], Some(99))?,
            list(vec![blocks[2].clone()], Some(7))?,
            list(vec![blocks[3].clone()], Some(3))?,
            list(blocks[4..6].to_vec(), Some(3))?,
        ],
        select(
            text(&[0, 0, 0, 0], 0, Affinity::Before)?,
            text(&[4, 1, 0, 0], 1, Affinity::After)?,
            false,
        ),
        None,
    )?;
    exact(session.state(), &expected);
    let again = WrapListAction::new(numbered(1)?).evaluate(session.state(), &())?;
    assert_eq!(again.indicator().activation(), ActionActivation::Active);
    disabled(&again, "breditor/list-unchanged");
    history(&mut session, &before)
}

#[test]
fn mixed_root_list_unwrap_preserves_bare_blocks_and_both_partial_edges() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = blocks(7)?;
    let before = state(
        &context,
        vec![
            list(blocks[0..3].to_vec(), Some(5))?,
            blocks[3].clone(),
            list(blocks[4..7].to_vec(), Some(40))?,
        ],
        select(
            text(&[0, 1, 0, 0], 1, Affinity::After)?,
            text(&[2, 1, 0, 0], 0, Affinity::Before)?,
            true,
        ),
        None,
    )?;
    let prepared = registry(ListKind::Bullet)?.prepare(&before, &invocation("test/unwrap")?)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Mixed);
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(prepared)?;
    let expected = state(
        &context,
        vec![
            list(vec![blocks[0].clone()], Some(5))?,
            blocks[1].clone(),
            blocks[2].clone(),
            blocks[3].clone(),
            blocks[4].clone(),
            list(blocks[5..7].to_vec(), Some(41))?,
        ],
        select(text(&[1, 0], 1, Affinity::After)?, text(&[5, 0, 0, 0], 0, Affinity::Before)?, true),
        None,
    )?;
    exact(session.state(), &expected);
    history(&mut session, &before)
}

#[test]
fn same_block_partial_range_and_empty_root_caret_wrap_the_whole_block() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 1..=6 {
        for empty in [false, true] {
            let block = block(heading(rank)?, if empty { "" } else { "a🙂b" }, formats()?)?;
            let selection = if empty {
                caret(boundary(&[0], 0, Affinity::Before)?)
            } else {
                select(
                    text(&[0, 0], 1, Affinity::Before)?,
                    text(&[0, 0], 3, Affinity::After)?,
                    true,
                )
            };
            let before = state(
                &context,
                vec![block.clone()],
                selection,
                if empty { Some(formats()?) } else { None },
            )?;
            let mut session = EditorSession::new(before.clone());
            apply(&mut session, ListKind::Bullet, "test/wrap")?;
            let selection = if empty {
                caret(boundary(&[0, 0, 0], 0, Affinity::Before)?)
            } else {
                select(
                    text(&[0, 0, 0, 0], 1, Affinity::Before)?,
                    text(&[0, 0, 0, 0], 3, Affinity::After)?,
                    true,
                )
            };
            exact(
                session.state(),
                &state(
                    &context,
                    vec![list(vec![block], None)?],
                    selection,
                    if empty { Some(formats()?) } else { None },
                )?,
            );
            history(&mut session, &before)?;
        }
    }
    Ok(())
}

#[test]
fn disabled_actions_are_noops_and_keep_existing_redo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = blocks(1)?;
    let before =
        state(&context, blocks, caret(text(&[0, 0], 0, Affinity::Before)?), Some(formats()?))?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, ListKind::Bullet, "test/wrap")?;
    session.undo()?.ok_or("undo")?;
    let current = session.state().clone();
    let history = session.history_status();
    let prepared =
        registry(ListKind::Bullet)?.prepare(session.state(), &invocation("test/unwrap")?)?;
    assert!(matches!(
        session.execute_prepared_action(prepared),
        Err(crate::action::ActionExecutionError::Disabled { .. })
    ));
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("redo")?;
    let current = session.state().clone();
    let history = session.history_status();
    let prepared =
        registry(ListKind::Bullet)?.prepare(session.state(), &invocation("test/wrap")?)?;
    assert!(matches!(
        session.execute_prepared_action(prepared),
        Err(crate::action::ActionExecutionError::Disabled { .. })
    ));
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    Ok(())
}

#[test]
fn stale_prepared_action_cannot_overwrite_a_later_marker_choice() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before =
        state(&context, blocks(1)?, caret(text(&[0, 0], 1, Affinity::After)?), Some(formats()?))?;
    let stale = registry(ListKind::Bullet)?.prepare(&before, &invocation("test/wrap")?)?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, numbered(7)?, "test/wrap")?;
    let current = session.state().clone();
    let history = session.history_status();
    assert!(session.execute_prepared_action(stale).is_err());
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &before);
    Ok(())
}

#[test]
fn limits_and_missing_selection_disable_without_faults_or_state_changes() -> TestResult {
    let blocks = blocks(3)?;
    let context = context(DocumentLimits::default())?;
    let no_selection = state(&context, blocks.clone(), None, None)?;
    disabled(
        &WrapListAction::new(ListKind::Bullet).evaluate(&no_selection, &())?,
        "breditor/no-selection",
    );
    disabled(&UnwrapListAction.evaluate(&no_selection, &())?, "breditor/no-selection");
    let selected =
        select(text(&[0, 0], 0, Affinity::Before)?, text(&[2, 0], 1, Affinity::After)?, false);
    let before = state(&context, blocks.clone(), selected.clone(), None)?;
    disabled(
        &WrapListAction::new(numbered(2_147_483_647)?).evaluate(&before, &())?,
        "breditor/result-limit-exceeded",
    );
    let zero = state(
        &context.clone().with_max_operations_per_transaction(0),
        blocks.clone(),
        selected.clone(),
        None,
    )?;
    disabled(
        &WrapListAction::new(ListKind::Bullet).evaluate(&zero, &())?,
        "breditor/operation-budget-exceeded",
    );
    let limited = state(
        &self::context(DocumentLimits::default().with_max_nodes(8))?,
        blocks.clone(),
        caret(text(&[1, 0], 1, Affinity::Before)?),
        Some(formats()?),
    )?;
    disabled(
        &WrapListAction::new(ListKind::Bullet).evaluate(&limited, &())?,
        "breditor/result-limit-exceeded",
    );
    let base = EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default());
    let before = state(
        &base,
        vec![block(TextBlockKind::Paragraph, "x", FormatSet::default())?],
        caret(text(&[0, 0], 0, Affinity::Before)?),
        None,
    )?;
    disabled(
        &WrapListAction::new(ListKind::Bullet).evaluate(&before, &())?,
        "breditor/unsupported-schema",
    );
    disabled(&UnwrapListAction.evaluate(&before, &())?, "breditor/unsupported-schema");
    Ok(())
}

#[test]
fn unwrap_preview_counts_retained_siblings_against_root_budget() -> TestResult {
    let context = context(DocumentLimits::default().with_max_children_per_element(3))?;
    let blocks = blocks(3)?;
    let before = state(
        &context,
        vec![list(blocks.clone(), None)?, blocks[0].clone()],
        select(
            text(&[0, 0, 0, 0], 0, Affinity::Before)?,
            text(&[0, 2, 0, 0], 1, Affinity::After)?,
            false,
        ),
        None,
    )?;
    disabled(&UnwrapListAction.evaluate(&before, &())?, "breditor/result-limit-exceeded");
    Ok(())
}

#[test]
fn excluded_first_item_does_not_reframe_the_following_list() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = blocks(3)?;
    let following = list(blocks[1..].to_vec(), Some(77))?;
    for backward in [false, true] {
        let before = state(
            &context,
            vec![blocks[0].clone(), following.clone()],
            select(
                text(&[0, 0], 1, Affinity::After)?,
                boundary(&[1, 0, 0], 0, Affinity::Before)?,
                backward,
            ),
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        apply(&mut session, ListKind::Bullet, "test/wrap")?;
        exact(
            session.state(),
            &state(
                &context,
                vec![list(vec![blocks[0].clone()], None)?, following.clone()],
                select(
                    text(&[0, 0, 0, 0], 1, Affinity::After)?,
                    boundary(&[1, 0, 0], 0, Affinity::Before)?,
                    backward,
                ),
                None,
            )?,
        );
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn later_text_run_start_is_not_mistaken_for_block_start() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = blocks(2)?;
    let plain = block(TextBlockKind::Paragraph, "x", FormatSet::default())?;
    let mixed = NodeRef::element(
        blocks[1].as_element().ok_or("block")?.try_with_children(
            blocks[1]
                .as_element()
                .ok_or("block")?
                .children()
                .iter()
                .cloned()
                .chain(plain.as_element().ok_or("plain")?.children().iter().cloned())
                .collect(),
        )?,
    );
    let before = state(
        &context,
        vec![blocks[0].clone(), mixed.clone()],
        select(text(&[0, 0], 0, Affinity::Before)?, text(&[1, 1], 0, Affinity::After)?, false),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, ListKind::Bullet, "test/wrap")?;
    exact(
        session.state(),
        &state(
            &context,
            vec![list(vec![blocks[0].clone(), mixed], None)?],
            select(
                text(&[0, 0, 0, 0], 0, Affinity::Before)?,
                text(&[0, 1, 0, 1], 0, Affinity::After)?,
                false,
            ),
            None,
        )?,
    );
    history(&mut session, &before)
}

#[test]
fn mixed_selection_preserves_whole_matching_numbered_containers() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = blocks(7)?;
    let left = list(blocks[..3].to_vec(), Some(71))?;
    let right = list(blocks[4..].to_vec(), Some(200))?;
    let before = state(
        &context,
        vec![left.clone(), blocks[3].clone(), right.clone()],
        select(
            text(&[0, 1, 0, 0], 1, Affinity::After)?,
            text(&[2, 1, 0, 0], 0, Affinity::Before)?,
            true,
        ),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, numbered(5)?, "test/wrap")?;
    exact(
        session.state(),
        &state(
            &context,
            vec![left, list(vec![blocks[3].clone()], Some(5))?, right],
            before.selection().cloned(),
            None,
        )?,
    );
    history(&mut session, &before)
}

proptest! {
    #[test]
    fn arbitrary_partial_marker_conversion_keeps_unselected_ordinals(count in 1_usize..20,a in any::<usize>(),b in any::<usize>(),start in 1_i64..10000,backward in any::<bool>(),to_numbered in any::<bool>()) {
        let check=||->TestResult {
            let context=context(DocumentLimits::default())?;
            let blocks=blocks(count)?;
            let first=(a%count).min(b%count);let last=(a%count).max(b%count);
            let old_start=if to_numbered {None}else{Some(start)};
            let before=state(&context,vec![list(blocks.clone(),old_start)?],select(text(&[0,u32::try_from(first)?,0,0],0,Affinity::Before)?,text(&[0,u32::try_from(last)?,0,0],1,Affinity::After)?,backward),None)?;
            let mut expected=vec![];
            if first>0 {expected.push(list(blocks[..first].to_vec(),old_start)?);}
            let selected_root=u32::from(first>0);
            expected.push(list(blocks[first..=last].to_vec(),if to_numbered {Some(23)}else{None})?);
            let suffix_offset=i64::try_from(last+1)?;
            if last+1<count {expected.push(list(blocks[last+1..].to_vec(),old_start.map(|n|n+suffix_offset))?);}
            let expected=state(&context,expected,select(text(&[selected_root,0,0,0],0,Affinity::Before)?,text(&[selected_root,u32::try_from(last-first)?,0,0],1,Affinity::After)?,backward),None)?;
            let mut session=EditorSession::new(before.clone());apply(&mut session,if to_numbered {numbered(23)?}else{ListKind::Bullet},"test/wrap")?;
            exact(session.state(),&expected);history(&mut session,&before)
        };
        let result=check();prop_assert!(result.is_ok(),"{result:?}");
    }
}

proptest! {
    #[test]
    fn arbitrary_partial_unwrap_matches_independent_slice_and_ordinal_model(count in 1_usize..20,a in any::<usize>(),b in any::<usize>(),start in 1_i64..10000,backward in any::<bool>()) {
        let check=||->TestResult {
            let context=context(DocumentLimits::default())?;
            let blocks=blocks(count)?;
            let first=(a%count).min(b%count);let last=(a%count).max(b%count);
            let before=state(&context,vec![list(blocks.clone(),Some(start))?],select(text(&[0,u32::try_from(first)?,0,0],0,Affinity::Before)?,text(&[0,u32::try_from(last)?,0,0],1,Affinity::After)?,backward),None)?;
            let mut expected=vec![];
            if first>0 {expected.push(list(blocks[..first].to_vec(),Some(start))?);}
            let selected_root=u32::from(first>0);
            expected.extend(blocks[first..=last].iter().cloned());
            if last+1<count {expected.push(list(blocks[last+1..].to_vec(),Some(start+i64::try_from(last+1)?))?);}
            let expected=state(&context,expected,select(text(&[selected_root,0],0,Affinity::Before)?,text(&[selected_root+u32::try_from(last-first)?,0],1,Affinity::After)?,backward),None)?;
            let mut session=EditorSession::new(before.clone());apply(&mut session,ListKind::Bullet,"test/unwrap")?;
            exact(session.state(),&expected);history(&mut session,&before)
        };
        let result=check();prop_assert!(result.is_ok(),"{result:?}");
    }
}
