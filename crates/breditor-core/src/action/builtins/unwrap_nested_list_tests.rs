//! Root extraction, retained marker families and exact recovery laws.
use super::*;
use crate::action::{Action, ActionActivation, ActionDecision, ActionId};

#[test]
fn nested_unwrap_endpoint_matrix_preserves_unselected_markers_and_blocks() -> TestResult {
    let context = context()?;
    let id = ActionId::from_qualified_name(name("test/nested-unwrap")?);
    let registry =
        ActionRegistry::try_new(vec![ActionRegistration::new(id.clone(), UnwrapNestedListAction)])?;
    for first in 0..8 {
        for last in first..8 {
            for end in [0, 1] {
                for reverse in [false, true] {
                    let before = selected(
                        &context,
                        first,
                        1,
                        last,
                        if first == last { 1 } else { end },
                        reverse,
                    )?;
                    let stop = if last > first && end == 0 { last } else { last + 1 };
                    let mut expected = Vec::new();
                    super::wrap_tests::entries(before.document().root(), None, &mut expected)?;
                    let matched =
                        expected[first..stop].iter().filter(|(_, marker)| marker.is_some()).count();
                    let activation = if matched == 0 {
                        ActionActivation::Inactive
                    } else if matched == stop - first {
                        ActionActivation::Active
                    } else {
                        ActionActivation::Mixed
                    };
                    let evaluation = UnwrapNestedListAction.evaluate(&before, &())?;
                    assert_eq!(evaluation.indicator().activation(), activation);
                    if matched == 0 {
                        assert!(matches!(evaluation.decision(), ActionDecision::Disabled(_)));
                        continue;
                    }
                    for (_, marker) in &mut expected[first..stop] {
                        *marker = None;
                    }
                    let mut session = EditorSession::new(before.clone());
                    session.execute_prepared_action(
                        registry.prepare(&before, &ActionInvocation::without_input(id.clone()))?,
                    )?;
                    let mut actual = Vec::new();
                    super::wrap_tests::entries(
                        session.state().document().root(),
                        None,
                        &mut actual,
                    )?;
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
    Ok(())
}

#[test]
fn nested_unwrap_exact_ancestor_split_and_suffix_numbering() -> TestResult {
    let context = context()?;
    let before = selected(&context, 2, 1, 2, 1, false)?;
    let id = ActionId::from_qualified_name(name("test/nested-unwrap")?);
    let registry =
        ActionRegistry::try_new(vec![ActionRegistration::new(id.clone(), UnwrapNestedListAction)])?;
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(
        registry.prepare(&before, &ActionInvocation::without_input(id))?,
    )?;
    let expected = vec![
        text("op")?,
        list(vec![item(vec![block(heading(2)?, "ab", formats()?)?])?], Some(7))?,
        text("cd")?,
        list(vec![item(vec![text("ef")?])?], Some(21))?,
        list(
            vec![
                item(vec![text("gh")?, list(vec![item(vec![text("ij")?])?], None)?])?,
                item(vec![text("kl")?])?,
            ],
            Some(8),
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
fn nested_unwrap_root_fanout_failure_is_atomic() -> TestResult {
    let context = EditorContext::new(
        context()?.schema().clone(),
        DocumentLimits::default().with_max_children_per_element(2),
    );
    let point = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0, 1, 0, 0, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
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
    assert!(matches!(
        UnwrapNestedListAction.evaluate(&before, &())?.decision(),
        ActionDecision::Disabled(_)
    ));
    let id = ActionId::from_qualified_name(name("test/nested-unwrap")?);
    let registry =
        ActionRegistry::try_new(vec![ActionRegistration::new(id.clone(), UnwrapNestedListAction)])?;
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
    Ok(())
}
