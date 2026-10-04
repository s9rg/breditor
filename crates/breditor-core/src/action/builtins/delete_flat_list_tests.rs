//! Public list deletion, boundary policy, Unicode and exact-history laws.
use super::*;
use crate::{
    action::{
        Action, ActionDecision, ActionId, ActionInvocation, ActionRegistration, ActionRegistry,
    },
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
            SchemaId::new(name("example/list-delete")?, SchemaVersion::one()),
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
fn p(value: &str) -> Result<NodeRef, Box<dyn Error>> {
    block(TextBlockKind::Paragraph, value, formats()?)
}
fn text(path: &[u32], offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(path.to_vec())?,
        utf16_offset: offset,
        affinity,
    })
}
fn gap(path: &[u32], affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children {
        parent_path: NodePath::try_from_indices(path.to_vec())?,
        child_index: 0,
        affinity,
    })
}
fn caret(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}
fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![
        ActionRegistration::new(
            delete_flat_list_backward_action_id(),
            DeleteFlatListBackwardAction,
        ),
        ActionRegistration::new(delete_flat_list_forward_action_id(), DeleteFlatListForwardAction),
        ActionRegistration::new(
            delete_flat_list_selection_action_id(),
            DeleteFlatListSelectionAction,
        ),
    ])?)
}
fn apply(session: &mut EditorSession, id: ActionId) -> TestResult {
    let prepared = registry()?.prepare(session.state(), &ActionInvocation::without_input(id))?;
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
fn directional_grapheme_deletion_preserves_all_ranks_and_container_families() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 0..=6 {
        for family in 0..3 {
            for cluster in ["🙂", "e\u{301}", "👩‍🔬", "🇷🇸"] {
                for backward in [false, true] {
                    let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
                    let source = block(kind, &format!("a{cluster}b"), formats()?)?;
                    let expected = block(kind, "ab", formats()?)?;
                    let (roots, result, path) = if family == 0 {
                        (vec![source], vec![expected], vec![0, 0])
                    } else {
                        (
                            vec![list(
                                vec![p("prefix")?, source, p("suffix")?],
                                (family == 2).then_some(10),
                            )?],
                            vec![list(
                                vec![p("prefix")?, expected, p("suffix")?],
                                (family == 2).then_some(10),
                            )?],
                            vec![0, 1, 0, 0],
                        )
                    };
                    let offset = if backward {
                        1 + u32::try_from(cluster.encode_utf16().count())?
                    } else {
                        1
                    };
                    let before = state(
                        &context,
                        roots,
                        caret(text(&path, offset, Affinity::Before)?),
                        Some(formats()?),
                    )?;
                    let mut session = EditorSession::new(before.clone());
                    apply(
                        &mut session,
                        if backward {
                            delete_flat_list_backward_action_id()
                        } else {
                            delete_flat_list_forward_action_id()
                        },
                    )?;
                    exact(
                        session.state(),
                        &state(
                            &context,
                            result,
                            caret(text(
                                &path,
                                1,
                                if backward { Affinity::After } else { Affinity::Before },
                            )?),
                            Some(formats()?),
                        )?,
                    );
                    history(&mut session, &before)?;
                }
            }
        }
    }
    Ok(())
}

#[test]
fn first_item_backspace_lifts_without_changing_rank_text_or_suffix_ordinals() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 0..=6 {
        for value in ["", "a🙂b"] {
            for start in [None, Some(20)] {
                for has_suffix in [false, true] {
                    for outside in [false, true] {
                        let kind =
                            if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
                        let first = block(kind, value, formats()?)?;
                        let mut blocks = vec![first.clone()];
                        if has_suffix {
                            blocks.push(p("tail")?);
                        }
                        let root = u32::from(outside);
                        let mut roots = Vec::new();
                        if outside {
                            roots.push(p("before")?);
                        }
                        roots.push(list(blocks, start)?);
                        let point = if value.is_empty() {
                            gap(&[root, 0, 0], Affinity::Before)?
                        } else {
                            text(&[root, 0, 0, 0], 0, Affinity::Before)?
                        };
                        let before = state(&context, roots, caret(point), Some(formats()?))?;
                        let mut expected = Vec::new();
                        if outside {
                            expected.push(p("before")?);
                        }
                        expected.push(first);
                        if has_suffix {
                            expected.push(list(vec![p("tail")?], start.map(|n| n + 1))?);
                        }
                        let point = if value.is_empty() {
                            gap(&[root], Affinity::After)?
                        } else {
                            text(&[root, 0], 0, Affinity::After)?
                        };
                        let mut session = EditorSession::new(before.clone());
                        apply(&mut session, delete_flat_list_backward_action_id())?;
                        exact(
                            session.state(),
                            &state(&context, expected, caret(point), Some(formats()?))?,
                        );
                        assert_eq!(session.undo_depth(), 1);
                        history(&mut session, &before)?;
                    }
                }
            }
        }
    }
    Ok(())
}

#[test]
fn list_item_join_snaps_new_grapheme_seam_and_groups_following_backspace() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for backward in [false, true] {
        let left = block(heading(2)?, "e", formats()?)?;
        let right = block(heading(5)?, "\u{301}b", FormatSet::default())?;
        let before = state(
            &context,
            vec![list(vec![left.clone(), right.clone(), p("tail")?], Some(8))?],
            caret(if backward {
                text(&[0, 1, 0, 0], 0, Affinity::Before)?
            } else {
                text(&[0, 0, 0, 0], 1, Affinity::After)?
            }),
            Some(formats()?),
        )?;
        let joined = NodeRef::element(
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
        let mut session = EditorSession::new(before.clone());
        apply(
            &mut session,
            if backward {
                delete_flat_list_backward_action_id()
            } else {
                delete_flat_list_forward_action_id()
            },
        )?;
        let point = if backward {
            text(&[0, 0, 0, 1], 1, Affinity::After)?
        } else {
            text(&[0, 0, 0, 0], 0, Affinity::Before)?
        };
        exact(
            session.state(),
            &state(
                &context,
                vec![list(vec![joined, p("tail")?], Some(8))?],
                caret(point),
                Some(formats()?),
            )?,
        );
        apply(
            &mut session,
            if backward {
                delete_flat_list_backward_action_id()
            } else {
                delete_flat_list_forward_action_id()
            },
        )?;
        exact(
            session.state(),
            &state(
                &context,
                vec![list(
                    vec![block(heading(2)?, "b", FormatSet::default())?, p("tail")?],
                    Some(8),
                )?],
                caret(text(
                    &[0, 0, 0, 0],
                    0,
                    if backward { Affinity::After } else { Affinity::Before },
                )?),
                Some(formats()?),
            )?,
        );
        assert_eq!(session.undo_depth(), 1);
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn forward_boundary_join_handles_every_container_pair_without_renumbering_suffix() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for left_family in 0..3 {
        for right_family in 0..3 {
            let left = block(heading(2)?, "a", formats()?)?;
            let right = block(heading(5)?, "b", formats()?)?;
            let (left, path) = if left_family == 0 {
                (left, vec![0, 0])
            } else {
                (list(vec![p("prefix")?, left], (left_family == 2).then_some(8))?, vec![0, 1, 0, 0])
            };
            let right = if right_family == 0 {
                right
            } else {
                list(vec![right, p("suffix")?], (right_family == 2).then_some(40))?
            };
            let before = state(
                &context,
                vec![left, right, p("outside")?],
                caret(text(&path, 1, Affinity::After)?),
                None,
            )?;
            let joined = block(heading(2)?, "ab", formats()?)?;
            let left = if left_family == 0 {
                joined
            } else {
                list(vec![p("prefix")?, joined], (left_family == 2).then_some(8))?
            };
            let mut roots = vec![left];
            if right_family != 0 {
                roots.push(list(vec![p("suffix")?], (right_family == 2).then_some(41))?);
            }
            roots.push(p("outside")?);
            let mut session = EditorSession::new(before.clone());
            apply(&mut session, delete_flat_list_forward_action_id())?;
            exact(
                session.state(),
                &state(&context, roots, caret(text(&path, 1, Affinity::Before)?), None)?,
            );
            history(&mut session, &before)?;
        }
    }
    Ok(())
}

#[test]
fn second_backspace_after_first_item_lift_joins_but_has_separate_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![
            p("left")?,
            list(vec![block(heading(3)?, "right", formats()?)?, p("tail")?], Some(20))?,
        ],
        caret(text(&[1, 0, 0, 0], 0, Affinity::Before)?),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, delete_flat_list_backward_action_id())?;
    let lifted = session.state().clone();
    apply(&mut session, delete_flat_list_backward_action_id())?;
    exact(
        session.state(),
        &state(
            &context,
            vec![p("leftright")?, list(vec![p("tail")?], Some(21))?],
            caret(text(&[0, 0], 4, Affinity::After)?),
            None,
        )?,
    );
    assert_eq!(session.undo_depth(), 2);
    session.undo()?.ok_or("undo join")?;
    exact(session.state(), &lifted);
    session.undo()?.ok_or("undo lift")?;
    exact(session.state(), &before);
    Ok(())
}

#[test]
fn all_deletion_actions_remove_cross_container_selection_with_directional_undo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for backward in [false, true] {
        for id in [
            delete_flat_list_backward_action_id(),
            delete_flat_list_forward_action_id(),
            delete_flat_list_selection_action_id(),
        ] {
            let a = text(&[0, 1, 0, 0], 1, Affinity::After)?;
            let b = text(&[2, 1, 0, 0], 1, Affinity::Before)?;
            let selection =
                if backward { RangeSelection::new(b, a) } else { RangeSelection::new(a, b) };
            let before = state(
                &context,
                vec![
                    list(
                        vec![p("prefix")?, block(heading(2)?, "ab", formats()?)?, p("gone")?],
                        None,
                    )?,
                    p("removed root")?,
                    list(
                        vec![p("gone")?, block(heading(5)?, "cd", formats()?)?, p("suffix")?],
                        Some(40),
                    )?,
                ],
                Selection::Range(selection),
                None,
            )?;
            let mut session = EditorSession::new(before.clone());
            apply(&mut session, id)?;
            exact(
                session.state(),
                &state(
                    &context,
                    vec![
                        list(vec![p("prefix")?, block(heading(2)?, "ad", formats()?)?], None)?,
                        list(vec![p("suffix")?], Some(42))?,
                    ],
                    caret(text(&[0, 1, 0, 0], 1, Affinity::After)?),
                    None,
                )?,
            );
            assert_eq!(session.undo_depth(), 1);
            history(&mut session, &before)?;
        }
    }
    Ok(())
}

#[test]
fn exact_selection_can_remove_part_of_cluster_but_directional_caret_inside_is_disabled()
-> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![list(vec![p("e\u{301}b")?], None)?],
        caret(text(&[0, 0, 0, 0], 1, Affinity::Before)?),
        None,
    )?;
    for evaluation in [
        DeleteFlatListBackwardAction.evaluate(&before, &())?,
        DeleteFlatListForwardAction.evaluate(&before, &())?,
    ] {
        assert!(
            matches!(evaluation.decision(),ActionDecision::Disabled(reason) if reason.code().as_str()=="breditor/caret-not-grapheme-boundary")
        );
    }
    let selected = state(
        &context,
        vec![list(vec![p("e\u{301}b")?], None)?],
        Selection::Range(RangeSelection::new(
            text(&[0, 0, 0, 0], 1, Affinity::After)?,
            text(&[0, 0, 0, 0], 2, Affinity::Before)?,
        )),
        None,
    )?;
    let mut session = EditorSession::new(selected.clone());
    apply(&mut session, delete_flat_list_selection_action_id())?;
    exact(
        session.state(),
        &state(
            &context,
            vec![list(vec![p("eb")?], None)?],
            caret(text(&[0, 0, 0, 0], 1, Affinity::After)?),
            None,
        )?,
    );
    history(&mut session, &selected)
}

#[test]
fn document_edges_and_collapsed_selection_disable_without_mutation() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for (roots, point, id, code) in [
        (
            vec![p("a")?],
            text(&[0, 0], 0, Affinity::Before)?,
            delete_flat_list_backward_action_id(),
            "breditor/at-document-start",
        ),
        (
            vec![list(vec![p("a")?], None)?],
            text(&[0, 0, 0, 0], 1, Affinity::After)?,
            delete_flat_list_forward_action_id(),
            "breditor/at-document-end",
        ),
        (
            vec![list(vec![p("a")?], None)?],
            text(&[0, 0, 0, 0], 0, Affinity::Before)?,
            delete_flat_list_selection_action_id(),
            "breditor/collapsed-selection",
        ),
    ] {
        let before = state(&context, roots, caret(point), None)?;
        let prepared =
            registry()?.prepare(&before, &ActionInvocation::without_input(id.clone()))?;
        let mut session = EditorSession::new(before.clone());
        let error = session.execute_prepared_action(prepared).err().ok_or("disabled")?;
        assert!(
            matches!(error,crate::action::ActionExecutionError::Disabled{reason} if reason.code().as_str()==code)
        );
        assert_eq!(session.state(), &before);
    }
    Ok(())
}

#[test]
fn lift_and_join_preview_full_result_budgets_and_fail_atomically() -> TestResult {
    let context = context(DocumentLimits::default().with_max_children_per_element(2))?;
    let before = state(
        &context,
        vec![list(vec![p("a")?, p("b")?], None)?, p("outside")?],
        caret(text(&[0, 0, 0, 0], 0, Affinity::Before)?),
        None,
    )?;
    assert!(
        matches!(DeleteFlatListBackwardAction.evaluate(&before,&())?.decision(),ActionDecision::Disabled(reason) if reason.code().as_str()=="breditor/result-limit-exceeded")
    );
    let context = self::context(DocumentLimits::default().with_max_text_bytes(3))?;
    let before = state(
        &context,
        vec![list(vec![p("abc")?, p("def")?], None)?],
        caret(text(&[0, 0, 0, 0], 3, Affinity::After)?),
        None,
    )?;
    assert!(
        matches!(DeleteFlatListForwardAction.evaluate(&before,&())?.decision(),ActionDecision::Disabled(reason) if reason.code().as_str()=="breditor/result-limit-exceeded")
    );
    let mut session = EditorSession::new(before.clone());
    assert!(apply(&mut session, delete_flat_list_forward_action_id()).is_err());
    assert_eq!(session.state(), &before);
    Ok(())
}

#[test]
fn backward_bare_block_boundary_joins_last_item_of_previous_list() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![
            list(vec![p("prefix")?, block(heading(4)?, "left", formats()?)?], Some(90))?,
            p("right")?,
            p("outside")?,
        ],
        caret(text(&[1, 0], 0, Affinity::Before)?),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, delete_flat_list_backward_action_id())?;
    exact(
        session.state(),
        &state(
            &context,
            vec![
                list(vec![p("prefix")?, block(heading(4)?, "leftright", formats()?)?], Some(90))?,
                p("outside")?,
            ],
            caret(text(&[0, 1, 0, 0], 4, Affinity::After)?),
            None,
        )?,
    );
    history(&mut session, &before)
}

#[test]
fn removing_all_selected_content_leaves_one_empty_start_kind_block() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for nested in [false, true] {
        let first = block(heading(6)?, "a", formats()?)?;
        let (roots, a, b) = if nested {
            (vec![list(vec![first, p("b")?], Some(99))?], vec![0, 0, 0, 0], vec![0, 1, 0, 0])
        } else {
            (vec![first, p("b")?], vec![0, 0], vec![1, 0])
        };
        let before = state(
            &context,
            roots,
            Selection::Range(RangeSelection::new(
                text(&b, 1, Affinity::Before)?,
                text(&a, 0, Affinity::After)?,
            )),
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        apply(&mut session, delete_flat_list_selection_action_id())?;
        let empty = block(heading(6)?, "", FormatSet::default())?;
        let (roots, path) = if nested {
            (vec![list(vec![empty], Some(99))?], vec![0, 0, 0])
        } else {
            (vec![empty], vec![0])
        };
        exact(session.state(), &state(&context, roots, caret(gap(&path, Affinity::After)?), None)?);
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn disabled_join_preserves_existing_redo_after_selection_change() -> TestResult {
    let context = context(DocumentLimits::default().with_max_text_bytes(3))?;
    let before = state(
        &context,
        vec![list(vec![p("abc")?, p("def")?], None)?],
        caret(text(&[0, 1, 0, 0], 3, Affinity::Before)?),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, delete_flat_list_backward_action_id())?;
    let deleted = session.state().clone();
    session.undo()?.ok_or("undo")?;
    session.apply_transaction(&Transaction::new(session.state(), vec![]).with_selection_update(
        SelectionUpdate::Set(Some(caret(text(&[0, 0, 0, 0], 3, Affinity::After)?))),
    ))?;
    let current = session.state().clone();
    let history = session.history_status();
    assert_eq!(session.redo_depth(), 1);
    assert!(apply(&mut session, delete_flat_list_forward_action_id()).is_err());
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("redo survives")?;
    exact(session.state(), &deleted);
    Ok(())
}

#[test]
fn stale_deletion_preparation_and_schema_selection_budget_fail_closed() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![list(vec![p("abc")?], None)?],
        caret(text(&[0, 0, 0, 0], 3, Affinity::Before)?),
        None,
    )?;
    let prepared = registry()?.prepare(
        &before,
        &ActionInvocation::without_input(delete_flat_list_backward_action_id()),
    )?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, delete_flat_list_backward_action_id())?;
    let current = session.state().clone();
    let history = session.history_status();
    assert!(matches!(
        session.execute_prepared_action(prepared),
        Err(crate::action::ActionExecutionError::Prepared(_))
    ));
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    let base = EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default());
    let zero = context.clone().with_max_operations_per_transaction(0);
    for (context, selection, code) in [
        (&base, Some(caret(text(&[0, 0], 1, Affinity::After)?)), "breditor/unsupported-schema"),
        (
            &zero,
            Some(caret(text(&[0, 0], 1, Affinity::After)?)),
            "breditor/operation-budget-exceeded",
        ),
        (&context, None, "breditor/no-selection"),
    ] {
        let before = state(
            context,
            vec![block(TextBlockKind::Paragraph, "ab", FormatSet::default())?],
            selection,
            None,
        )?;
        for evaluation in [
            DeleteFlatListBackwardAction.evaluate(&before, &())?,
            DeleteFlatListForwardAction.evaluate(&before, &())?,
        ] {
            assert!(
                matches!(evaluation.decision(),ActionDecision::Disabled(reason) if reason.code().as_str()==code)
            );
        }
    }
    Ok(())
}

proptest! {
    #[test]
    fn selected_item_deletion_matches_independent_unicode_strings(left in "[a-z🙂אב]{0,16}",right in "[a-z🙂]{0,16}",a in any::<usize>(),b in any::<usize>(),rank in 0_u32..7,backward in any::<bool>()) {
        let check=||->TestResult {
            let context=context(DocumentLimits::default())?;let kind=if rank==0{TextBlockKind::Paragraph}else{heading(rank)?};
            let lb:Vec<usize>=left.char_indices().map(|(i,_)|i).chain(std::iter::once(left.len())).collect();let rb:Vec<usize>=right.char_indices().map(|(i,_)|i).chain(std::iter::once(right.len())).collect();let first=lb[a%lb.len()];let last=rb[b%rb.len()];
            let l=u32::try_from(left[..first].encode_utf16().count())?;let r=u32::try_from(right[..last].encode_utf16().count())?;
            let endpoint=|item,value:&str,offset|->Result<Point,Box<dyn Error>>{if value.is_empty(){gap(&[0,item,0],Affinity::Before)}else{text(&[0,item,0,0],offset,Affinity::Before)}};
            let start=endpoint(1,&left,l)?;let end=endpoint(2,&right,r)?;let selection=if backward{RangeSelection::new(end,start)}else{RangeSelection::new(start,end)};
            let before=state(&context,vec![list(vec![p("prefix")?,block(kind,&left,formats()?)?,p(&right)?,p("suffix")?],Some(8))?],Selection::Range(selection),None)?;
            let result=format!("{}{}",&left[..first],&right[last..]);let point=if result.is_empty(){gap(&[0,1,0],Affinity::After)?}else{text(&[0,1,0,0],l,Affinity::After)?};
            let mut session=EditorSession::new(before.clone());apply(&mut session,delete_flat_list_selection_action_id())?;
            exact(session.state(),&state(&context,vec![list(vec![p("prefix")?,block(kind,&result,formats()?)?,p("suffix")?],Some(8))?],caret(point),None)?);history(&mut session,&before)
        };let result=check();prop_assert!(result.is_ok(),"{result:?}");
    }
}
