//! Marker conversion laws and exact split/numbering fixtures.
use super::*;
use crate::{
    action::{Action, ActionActivation, ActionDecision, ActionId},
    block::{ListKind, OrderedListStart},
};

pub(super) fn entries(
    node: &NodeRef,
    marker: Option<bool>,
    output: &mut Vec<(NodeRef, Option<bool>)>,
) -> TestResult {
    let element = node.as_element().ok_or("element")?;
    let marker = match element.kind().as_str() {
        "breditor/paragraph" | "breditor/heading" => {
            output.push((node.clone(), marker));
            return Ok(());
        }
        "breditor/bullet-list" => Some(false),
        "breditor/ordered-list" => Some(true),
        _ => marker,
    };
    for child in element.children() {
        entries(child, marker, output)?;
    }
    Ok(())
}

#[test]
fn nested_wrap_marker_matrix_preserves_blocks_and_recovers() -> TestResult {
    let context = context()?;
    for ordered in [false, true] {
        let target = if ordered {
            ListKind::Ordered(OrderedListStart::try_new(5)?)
        } else {
            ListKind::Bullet
        };
        let id = ActionId::from_qualified_name(name("test/nested-wrap")?);
        let registry = ActionRegistry::try_new(vec![ActionRegistration::new(
            id.clone(),
            WrapNestedListAction::new(target),
        )])?;
        for first in 0..8 {
            for last in first..8 {
                for end in [0, 1] {
                    for reverse in [false, true] {
                        let before = selected(
                            &context,
                            first,
                            1,
                            last,
                            if last == first { 1 } else { end },
                            reverse,
                        )?;
                        let stop = if last > first && end == 0 { last } else { last + 1 };
                        let mut expected = Vec::new();
                        entries(before.document().root(), None, &mut expected)?;
                        let matched = expected[first..stop]
                            .iter()
                            .filter(|(_, marker)| *marker == Some(ordered))
                            .count();
                        let activation = if matched == 0 {
                            ActionActivation::Inactive
                        } else if matched == stop - first {
                            ActionActivation::Active
                        } else {
                            ActionActivation::Mixed
                        };
                        let evaluation =
                            WrapNestedListAction::new(target).evaluate(&before, &())?;
                        assert_eq!(evaluation.indicator().activation(), activation);
                        if activation == ActionActivation::Active {
                            assert!(matches!(evaluation.decision(), ActionDecision::Disabled(_)));
                            continue;
                        }
                        for (_, marker) in &mut expected[first..stop] {
                            *marker = Some(ordered);
                        }
                        let mut session = EditorSession::new(before.clone());
                        session.execute_prepared_action(
                            registry
                                .prepare(&before, &ActionInvocation::without_input(id.clone()))?,
                        )?;
                        let mut actual = Vec::new();
                        entries(session.state().document().root(), None, &mut actual)?;
                        assert_eq!(actual, expected);
                        let range =
                            crate::action::text_position::normalize_nested_list_range_selection(
                                session.state(),
                            )?;
                        assert_eq!(range.start().offset().get(), 1);
                        assert_eq!(
                            range.end().offset().get(),
                            if first == last { 1 } else { u64::from(end) }
                        );
                        history(&session, &before)?;
                    }
                }
            }
        }
    }
    Ok(())
}

#[test]
fn nested_wrap_splits_child_section_preserving_suffix_ordinal() -> TestResult {
    let context = context()?;
    let before = selected(&context, 2, 1, 2, 1, false)?;
    let id = ActionId::from_qualified_name(name("test/nested-wrap")?);
    let registry = ActionRegistry::try_new(vec![ActionRegistration::new(
        id.clone(),
        WrapNestedListAction::new(ListKind::Bullet),
    )])?;
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(
        registry.prepare(&before, &ActionInvocation::without_input(id))?,
    )?;
    let expected = vec![
        text("op")?,
        list(
            vec![
                item(vec![
                    block(heading(2)?, "ab", formats()?)?,
                    list(vec![item(vec![text("cd")?])?], None)?,
                    list(vec![item(vec![text("ef")?])?], Some(21))?,
                ])?,
                item(vec![text("gh")?, list(vec![item(vec![text("ij")?])?], None)?])?,
                item(vec![text("kl")?])?,
            ],
            Some(7),
        )?,
        text("mn")?,
    ];
    assert_eq!(
        session
            .state()
            .document()
            .root()
            .as_element()
            .ok_or("root")?
            .children()
            .iter()
            .cloned()
            .collect::<Vec<_>>(),
        expected
    );
    history(&session, &before)?;
    Ok(())
}

#[test]
fn nested_wrap_rejects_final_limits_without_changing_history() -> TestResult {
    for limits in [
        DocumentLimits::default().with_max_children_per_element(2),
        DocumentLimits::default().with_max_nodes(12),
    ] {
        let context = EditorContext::new(context()?.schema().clone(), limits);
        let point = Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0, 1, 0, 0, 0])?,
            utf16_offset: 1,
            affinity: Affinity::Before,
        };
        let before = state(
            &context,
            vec![list(
                vec![item(vec![
                    text("parent")?,
                    list(vec![item(vec![text("cd")?])?, item(vec![text("ef")?])?], Some(20))?,
                ])?],
                None,
            )?],
            Selection::Range(RangeSelection::new(point.clone(), point)),
            Some(formats()?),
        )?;
        let id = ActionId::from_qualified_name(name("test/wrap-limit")?);
        let registry = ActionRegistry::try_new(vec![ActionRegistration::new(
            id.clone(),
            WrapNestedListAction::new(ListKind::Bullet),
        )])?;
        assert!(matches!(
            WrapNestedListAction::new(ListKind::Bullet).evaluate(&before, &())?.decision(),
            ActionDecision::Disabled(_)
        ));
        let mut session = EditorSession::new(before.clone());
        assert!(
            session
                .execute_prepared_action(
                    registry.prepare(&before, &ActionInvocation::without_input(id))?
                )
                .is_err()
        );
        assert_eq!(session.state(), &before);
        assert_eq!(session.undo_depth(), 0);
    }
    Ok(())
}
