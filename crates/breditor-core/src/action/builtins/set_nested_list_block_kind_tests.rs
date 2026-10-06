//! Kind conversion against an independent path-preserving tree oracle.
use super::*;
use crate::{
    action::{Action, ActionActivation, ActionDecision, ActionId},
    operation::block_kind,
};

fn expected(
    node: &NodeRef,
    path: &NodePath,
    selected: &[Vec<u32>],
    target: TextBlockKind,
) -> Result<NodeRef, Box<dyn Error>> {
    let element = node.as_element().ok_or("element")?;
    if selected.iter().any(|p| p.as_slice() == path.as_slice()) {
        let template = block(target, "", formats()?)?;
        return Ok(NodeRef::element(
            template
                .as_element()
                .ok_or("template")?
                .try_with_children(element.children().iter().cloned().collect())?,
        ));
    }
    if matches!(element.kind().as_str(), "breditor/paragraph" | "breditor/heading") {
        return Ok(node.clone());
    }
    let children = element
        .children()
        .iter()
        .enumerate()
        .map(|(index, child)| {
            expected(child, &path.try_child(u32::try_from(index)?)?, selected, target)
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(NodeRef::element(element.try_with_children(children)?))
}

#[test]
fn nested_kind_all_endpoint_pairs_keep_tree_selection_and_recovery() -> TestResult {
    let context = context()?;
    let paths = paths();
    for target in [TextBlockKind::Paragraph, heading(2)?, heading(6)?] {
        let id = ActionId::from_qualified_name(name("test/set-nested-kind")?);
        let registry = ActionRegistry::try_new(vec![ActionRegistration::new(
            id.clone(),
            SetNestedListBlockKindAction::new(target),
        )])?;
        for first in 0..paths.len() {
            for last in first..paths.len() {
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
                        let touched = &paths[first..stop];
                        let matched = touched
                            .iter()
                            .map(|p| {
                                let node = before
                                    .document()
                                    .node_at(&NodePath::try_from_indices(p.clone())?)?;
                                Ok(usize::from(block_kind(node)? == target))
                            })
                            .collect::<Result<Vec<_>, Box<dyn Error>>>()?
                            .into_iter()
                            .sum::<usize>();
                        let activation = if matched == 0 {
                            ActionActivation::Inactive
                        } else if matched == touched.len() {
                            ActionActivation::Active
                        } else {
                            ActionActivation::Mixed
                        };
                        let evaluation =
                            SetNestedListBlockKindAction::new(target).evaluate(&before, &())?;
                        assert_eq!(evaluation.indicator().activation(), activation);
                        if activation == ActionActivation::Active {
                            assert!(matches!(evaluation.decision(), ActionDecision::Disabled(_)));
                            continue;
                        }
                        let tree =
                            expected(before.document().root(), &NodePath::root(), touched, target)?;
                        let mut session = EditorSession::new(before.clone());
                        session.execute_prepared_action(
                            registry
                                .prepare(&before, &ActionInvocation::without_input(id.clone()))?,
                        )?;
                        assert_eq!(session.state().document().root(), &tree);
                        assert_eq!(session.state().selection(), before.selection());
                        history(&session, &before)?;
                    }
                }
            }
        }
    }
    Ok(())
}

#[test]
fn nested_kind_empty_caret_limits_and_pending_formats() -> TestResult {
    for max_nodes in [4, 10] {
        let context = EditorContext::new(
            context()?.schema().clone(),
            DocumentLimits::default().with_max_nodes(max_nodes).with_max_property_values(1),
        );
        let point = Point::Children {
            parent_path: NodePath::try_from_indices(vec![0, 0, 0])?,
            child_index: 0,
            affinity: Affinity::After,
        };
        let before = state(
            &context,
            vec![list(vec![item(vec![text("")?])?], None)?],
            Selection::Range(RangeSelection::new(point.clone(), point)),
            Some(formats()?),
        )?;
        let id = ActionId::from_qualified_name(name("test/kind")?);
        let registry = ActionRegistry::try_new(vec![ActionRegistration::new(
            id.clone(),
            SetNestedListBlockKindAction::new(heading(3)?),
        )])?;
        let mut session = EditorSession::new(before.clone());
        session.execute_prepared_action(
            registry.prepare(&before, &ActionInvocation::without_input(id))?,
        )?;
        assert_eq!(session.state().selection(), before.selection());
        assert_eq!(session.state().pending_formats(), before.pending_formats());
        history(&session, &before)?;
    }
    let context = EditorContext::new(
        context()?.schema().clone(),
        DocumentLimits::default().with_max_property_values(0),
    );
    let point = Point::Children {
        parent_path: NodePath::try_from_indices(vec![0, 0, 0])?,
        child_index: 0,
        affinity: Affinity::After,
    };
    let before = state(
        &context,
        vec![list(vec![item(vec![text("")?])?], None)?],
        Selection::Range(RangeSelection::new(point.clone(), point)),
        None,
    )?;
    let evaluation = SetNestedListBlockKindAction::new(heading(3)?).evaluate(&before, &())?;
    assert!(matches!(evaluation.decision(), ActionDecision::Disabled(_)));
    Ok(())
}
