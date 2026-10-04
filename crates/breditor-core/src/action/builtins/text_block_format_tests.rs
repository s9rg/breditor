//! Public registry, toolbar, bounded publication and history contracts.
use super::*;
use crate::{
    action::{
        Action, ActionActivation, ActionDecision, ActionEvaluation, ActionId, ActionInput,
        ActionInvocation, ActionStateValue, ActionValue,
    },
    block::TextBlockKind,
    codec::structural_codec_test_support::{
        TestResult, block, context, formats, heading, name, state,
    },
    document::{Format, FormatSet, NodeRef, PropertyMap, PropertyValue},
    position::{Affinity, NodePath, Point},
    schema::DocumentLimits,
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::EditorState,
};
use proptest::prelude::*;
use std::error::Error;

fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![
        ActionRegistration::new(
            ActionId::try_new("test/strong")?,
            ToggleTextBlockInlineFormatAction::new(name("breditor/strong")?),
        ),
        ActionRegistration::with_input(
            ActionId::try_new("test/link")?,
            set_inline_format_input_contract(),
            SetTextBlockInlineFormatAction::new(name("example/link")?),
        ),
        ActionRegistration::new(
            clear_text_block_inline_formats_action_id(),
            ClearTextBlockInlineFormatsAction,
        ),
    ])?)
}
fn point(block: u32, run: u32, offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(vec![block, run])?,
        utf16_offset: offset,
        affinity,
    })
}
fn select(anchor: Point, focus: Point) -> Selection {
    RangeSelection::new(anchor, focus).into()
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
fn invocation(id: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::without_input(ActionId::try_new(id)?))
}
fn link_input(href: Option<&str>) -> Result<ActionInvocation, Box<dyn Error>> {
    let mut entries = vec![(
        "operation".into(),
        ActionValue::try_from_string(if href.is_some() { "set" } else { "remove" })?,
    )];
    if let Some(href) = href {
        entries.push((
            "properties".into(),
            ActionValue::try_array(vec![ActionValue::try_object(vec![
                ("name".into(), ActionValue::try_from_string("example/href")?),
                ("value".into(), ActionValue::try_from_string(href)?),
            ])?])?,
        ));
    }
    Ok(ActionInvocation::new(
        ActionId::try_new("test/link")?,
        ActionInput::typed(set_inline_format_input_contract(), ActionValue::try_object(entries)?),
    ))
}
fn linked(href: &str) -> Result<FormatSet, Box<dyn Error>> {
    Ok(FormatSet::try_from_formats(vec![
        Format::new(name("breditor/strong")?, PropertyMap::default()),
        Format::new(
            name("example/link")?,
            PropertyMap::try_from_sorted(vec![(
                name("example/href")?,
                PropertyValue::from_string(href),
            )])?,
        ),
    ])?)
}
fn merged(kind: TextBlockKind, runs: &[(&str, FormatSet)]) -> Result<NodeRef, Box<dyn Error>> {
    let empty = block(kind, "", FormatSet::default())?;
    let mut children = vec![];
    for (text, formats) in runs {
        let node = block(kind, text, formats.clone())?;
        children.extend(node.as_element().ok_or("block")?.children().iter().cloned());
    }
    Ok(NodeRef::element(empty.as_element().ok_or("block")?.try_with_children(children)?))
}
fn disabled(evaluation: &ActionEvaluation, code: &str) {
    assert!(
        matches!(evaluation.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == code),
        "unexpected decision: {:?}",
        evaluation.decision()
    );
}

#[test]
fn toggle_mixed_cross_block_selection_adds_everywhere_with_exact_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for reverse in [false, true] {
        let a = point(0, 0, 1, Affinity::Before)?;
        let b = point(2, 0, 2, Affinity::After)?;
        let selection = if reverse { select(b, a) } else { select(a, b) };
        let before = state(
            &context,
            vec![
                block(heading(2)?, "abc", formats()?)?,
                block(heading(4)?, "", FormatSet::default())?,
                block(TextBlockKind::Paragraph, "xy", FormatSet::default())?,
            ],
            selection,
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        let prepared = registry()?.prepare(&before, &invocation("test/strong")?)?;
        assert_eq!(prepared.indicator().activation(), ActionActivation::Mixed);
        session.execute_prepared_action(prepared)?;
        let strong = FormatSet::try_from_formats(vec![Format::new(
            name("breditor/strong")?,
            PropertyMap::default(),
        )])?;
        let expected = state(
            &context,
            vec![
                block(heading(2)?, "abc", formats()?)?,
                block(heading(4)?, "", FormatSet::default())?,
                block(TextBlockKind::Paragraph, "xy", strong)?,
            ],
            before.selection().cloned(),
            None,
        )?;
        exact(session.state(), &expected);
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn typed_set_and_remove_report_properties_preserve_peers_and_fold_runs() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![
            merged(heading(2)?, &[("a", linked("old")?), ("🙂", linked("new")?)])?,
            block(heading(5)?, "e\u{301}", linked("old")?)?,
        ],
        select(point(1, 0, 2, Affinity::Before)?, point(0, 0, 0, Affinity::After)?),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    let request = link_input(Some("new"))?;
    let prepared = registry()?.prepare(&before, &request)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Mixed);
    assert!(matches!(prepared.indicator().value(), ActionStateValue::Mixed { .. }));
    session.execute_prepared_action(prepared)?;
    let expected = state(
        &context,
        vec![
            block(heading(2)?, "a🙂", linked("new")?)?,
            block(heading(5)?, "e\u{301}", linked("new")?)?,
        ],
        before.selection().cloned(),
        None,
    )?;
    exact(session.state(), &expected);
    history(&mut session, &before)?;
    let again = registry()?.prepare(session.state(), &request)?;
    assert_eq!(again.indicator().activation(), ActionActivation::Active);
    assert!(matches!(again.indicator().value(), ActionStateValue::Uniform { .. }));
    assert!(session.execute_prepared_action(again).is_err());
    let saved = session.state().clone();
    let prepared = registry()?.prepare(&saved, &link_input(None)?)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Active);
    session.execute_prepared_action(prepared)?;
    let check = registry()?.prepare(session.state(), &link_input(None)?)?;
    assert!(matches!(check.indicator().value(), ActionStateValue::Unset { .. }));
    for node in session.state().document().root().as_element().ok_or("root")?.children() {
        let formats = node
            .as_element()
            .ok_or("block")?
            .children()
            .get(0)
            .ok_or("leaf")?
            .as_text()
            .ok_or("text")?
            .formats();
        assert_eq!(formats.len(), 1);
        assert!(formats.get(&name("breditor/strong")?).is_some());
    }
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &saved);
    Ok(())
}

#[test]
fn clear_same_block_preserves_backward_alias_selection_and_restores_exact_source() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![merged(heading(6)?, &[("ab", linked("old")?), ("🙂", linked("new")?)])?],
        select(
            Point::Children {
                parent_path: NodePath::try_from_indices(vec![0])?,
                child_index: 2,
                affinity: Affinity::Before,
            },
            point(0, 0, 1, Affinity::After)?,
        ),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    let prepared =
        registry()?.prepare(&before, &invocation("breditor/clear-text-block-inline-formats")?)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Stateless);
    session.execute_prepared_action(prepared)?;
    let expected = state(
        &context,
        vec![merged(heading(6)?, &[("a", linked("old")?), ("b🙂", FormatSet::default())])?],
        select(point(0, 1, 3, Affinity::Before)?, point(0, 1, 0, Affinity::After)?),
        None,
    )?;
    exact(session.state(), &expected);
    history(&mut session, &before)
}

#[test]
fn collapsed_actions_use_focus_affinity_pending_override_and_zero_operation_budget() -> TestResult {
    let context = context(DocumentLimits::default())?.with_max_operations_per_transaction(0);
    for affinity in [Affinity::Before, Affinity::After] {
        let p = point(0, 0, 1, affinity)?;
        let before = state(
            &context,
            vec![merged(heading(1)?, &[("a", formats()?), ("b", FormatSet::default())])?],
            select(p.clone(), p),
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        let prepared = registry()?.prepare(&before, &invocation("test/strong")?)?;
        assert_eq!(
            prepared.indicator().activation(),
            if affinity == Affinity::Before {
                ActionActivation::Active
            } else {
                ActionActivation::Inactive
            }
        );
        session.execute_prepared_action(prepared)?;
        assert_eq!(session.state().document(), before.document());
        assert_eq!(session.state().selection(), before.selection());
        assert_eq!(
            session
                .state()
                .pending_formats()
                .ok_or("pending")?
                .get(&name("breditor/strong")?)
                .is_some(),
            affinity == Affinity::After
        );
        assert_eq!(session.undo_depth(), 0);
        assert!(session.undo()?.is_none());
    }
    for request in [
        invocation("test/strong")?,
        link_input(Some("new"))?,
        invocation("breditor/clear-text-block-inline-formats")?,
    ] {
        let p = Point::Children {
            parent_path: NodePath::try_from_indices(vec![0])?,
            child_index: 0,
            affinity: Affinity::After,
        };
        let before = state(
            &context,
            vec![block(heading(3)?, "", FormatSet::default())?],
            select(p.clone(), p),
            Some(formats()?),
        )?;
        let mut session = EditorSession::new(before.clone());
        let prepared = registry()?.prepare(&before, &request)?;
        session.execute_prepared_action(prepared)?;
        assert_eq!(session.state().document(), before.document());
        assert_eq!(session.undo_depth(), 0);
        assert!(session.undo()?.is_none());
    }
    Ok(())
}

#[test]
fn final_valid_cross_rewrite_does_not_require_over_budget_intermediate_state() -> TestResult {
    // First block splits (+1 node/property owner); last block merges (-1).
    let context = context(DocumentLimits::default().with_max_nodes(7).with_max_property_values(6))?;
    let before = state(
        &context,
        vec![
            block(heading(1)?, "abc", linked("old")?)?,
            merged(
                heading(2)?,
                &[("a", linked("old")?), ("b", linked("new")?), ("c", linked("old")?)],
            )?,
        ],
        select(point(0, 0, 1, Affinity::After)?, point(1, 1, 1, Affinity::Before)?),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    let prepared = registry()?.prepare(&before, &link_input(Some("new"))?)?;
    session.execute_prepared_action(prepared)?;
    let expected = state(
        &context,
        vec![
            merged(heading(1)?, &[("a", linked("old")?), ("bc", linked("new")?)])?,
            merged(heading(2)?, &[("ab", linked("new")?), ("c", linked("old")?)])?,
        ],
        select(point(0, 1, 0, Affinity::After)?, point(1, 0, 2, Affinity::Before)?),
        None,
    )?;
    exact(session.state(), &expected);
    history(&mut session, &before)
}

#[test]
fn heading_typing_consumes_format_override_and_undo_restores_it() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let p = point(0, 0, 1, Affinity::After)?;
    let initial =
        state(&context, vec![block(heading(2)?, "ab", formats()?)?], select(p.clone(), p), None)?;
    let mut session = EditorSession::new(initial.clone());
    session.execute_prepared_action(
        registry()?.prepare(&initial, &invocation("breditor/clear-text-block-inline-formats")?)?,
    )?;
    let before_typing = session.state().clone();
    assert_eq!(before_typing.pending_formats(), Some(&FormatSet::default()));
    let typing = ActionRegistry::try_new(vec![ActionRegistration::with_input(
        insert_text_block_text_action_id(),
        insert_text_input_contract(),
        InsertTextBlockTextAction,
    )])?;
    let input = ActionInvocation::new(
        insert_text_block_text_action_id(),
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string("🙂")?),
    );
    session.execute_prepared_action(typing.prepare(&before_typing, &input)?)?;
    let expected = state(
        &context,
        vec![merged(
            heading(2)?,
            &[("a", formats()?), ("🙂", FormatSet::default()), ("b", formats()?)],
        )?],
        // Typing's established canonical seam encoding uses the right leaf.
        select(point(0, 2, 0, Affinity::Before)?, point(0, 2, 0, Affinity::Before)?),
        None,
    )?;
    exact(session.state(), &expected);
    history(&mut session, &before_typing)
}

#[test]
fn missing_selection_legacy_schema_noops_and_operation_budget_remain_disabled() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let absent =
        state(&context, vec![block(heading(2)?, "ab", FormatSet::default())?], None, None)?;
    disabled(&ClearTextBlockInlineFormatsAction.evaluate(&absent, &())?, "breditor/no-selection");
    let selected = select(point(0, 0, 0, Affinity::After)?, point(0, 0, 2, Affinity::Before)?);
    let plain = state(
        &context,
        vec![block(heading(2)?, "ab", FormatSet::default())?],
        selected.clone(),
        None,
    )?;
    disabled(
        &ClearTextBlockInlineFormatsAction.evaluate(&plain, &())?,
        "breditor/inline-format-unchanged",
    );
    disabled(
        &SetTextBlockInlineFormatAction::new(name("example/link")?)
            .evaluate(&plain, &SetInlineFormatInput::Remove)?,
        "breditor/inline-format-unchanged",
    );
    let zero = context.with_max_operations_per_transaction(0);
    let plain = state(
        &zero,
        vec![block(heading(2)?, "ab", FormatSet::default())?],
        selected.clone(),
        None,
    )?;
    disabled(
        &ToggleTextBlockInlineFormatAction::new(name("breditor/strong")?).evaluate(&plain, &())?,
        "breditor/operation-budget-exceeded",
    );
    let base = crate::state::EditorContext::new(
        crate::schema::CompiledSchema::breditor_base(),
        DocumentLimits::default(),
    );
    let plain = state(
        &base,
        vec![block(TextBlockKind::Paragraph, "ab", FormatSet::default())?],
        selected,
        None,
    )?;
    disabled(
        &ClearTextBlockInlineFormatsAction.evaluate(&plain, &())?,
        "breditor/unsupported-schema",
    );
    disabled(
        &ToggleTextBlockInlineFormatAction::new(name("breditor/strong")?).evaluate(&plain, &())?,
        "breditor/unsupported-schema",
    );
    disabled(
        &SetTextBlockInlineFormatAction::new(name("example/link")?)
            .evaluate(&plain, &SetInlineFormatInput::Remove)?,
        "breditor/unsupported-schema",
    );
    Ok(())
}

#[test]
fn budgets_invalid_properties_and_structural_only_ranges_disable_without_changes() -> TestResult {
    for limits in [
        DocumentLimits::default().with_max_nodes(5),
        DocumentLimits::default().with_max_property_values(2),
        DocumentLimits::default().with_max_text_bytes(2),
    ] {
        let context = context(limits)?;
        let before = state(
            &context,
            vec![merged(heading(1)?, &[("ab", formats()?), ("cd", FormatSet::default())])?],
            select(point(0, 0, 1, Affinity::After)?, point(0, 1, 1, Affinity::Before)?),
            None,
        )?;
        // Node/property limits reject splitting linked text; leaf limit rejects
        // merging the clear span with its surviving plain suffix.
        let action = if context.limits().max_text_bytes() == 2 {
            ClearTextBlockInlineFormatsAction.evaluate(&before, &())?
        } else {
            SetTextBlockInlineFormatAction::new(name("example/link")?).evaluate(
                &before,
                &SetInlineFormatInput::Set(PropertyMap::try_from_sorted(vec![(
                    name("example/href")?,
                    PropertyValue::from_string("new"),
                )])?),
            )?
        };
        disabled(&action, "breditor/result-limit-exceeded");
    }
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(heading(1)?, "a", formats()?)?, block(heading(2)?, "b", formats()?)?],
        select(point(0, 0, 1, Affinity::After)?, point(1, 0, 0, Affinity::Before)?),
        None,
    )?;
    for request in [
        invocation("test/strong")?,
        link_input(None)?,
        invocation("breditor/clear-text-block-inline-formats")?,
    ] {
        let mut session = EditorSession::new(before.clone());
        let prepared = registry()?.prepare(&before, &request)?;
        assert!(session.execute_prepared_action(prepared).is_err());
        assert_eq!(session.state(), &before);
        assert_eq!(session.undo_depth(), 0);
    }
    let p = point(0, 0, 0, Affinity::After)?;
    let before =
        state(&context, vec![block(heading(1)?, "a", formats()?)?], select(p.clone(), p), None)?;
    let evaluation = SetTextBlockInlineFormatAction::new(name("example/link")?)
        .evaluate(&before, &SetInlineFormatInput::Set(PropertyMap::default()))?;
    disabled(&evaluation, "breditor/invalid-inline-format-properties");
    assert!(matches!(evaluation.indicator().value(), ActionStateValue::Uniform { .. }));
    disabled(
        &ToggleTextBlockInlineFormatAction::new(name("example/link")?).evaluate(&before, &())?,
        "breditor/unsupported-inline-format",
    );
    Ok(())
}

#[test]
fn stale_format_preparation_cannot_destroy_redo_or_replace_a_newer_state() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(heading(2)?, "ab", formats()?)?],
        select(point(0, 0, 0, Affinity::After)?, point(0, 0, 2, Affinity::Before)?),
        None,
    )?;
    let request = invocation("test/strong")?;
    let registry = registry()?;
    let stale = registry.prepare(&before, &request)?;
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(registry.prepare(&before, &request)?)?;
    session.undo()?.ok_or("undo")?;
    let current = session.state().clone();
    let history = session.history_status();
    assert!(session.execute_prepared_action(stale).is_err());
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("redo")?;
    Ok(())
}

proptest! {
    #[test]
    fn text_block_clear_formatting_matches_independent_text_and_history(
        left in "[a-z]{1,20}", right in "[a-z]{1,20}", a in 1_u32..7, b in 1_u32..7, reverse in any::<bool>(),
    ) {
        let result = (|| -> TestResult {
            let context = context(DocumentLimits::default())?;
            let start = point(0, 0, 0, Affinity::After)?;
            let end = point(1, 0, u32::try_from(right.len())?, Affinity::Before)?;
            let selection = if reverse { select(end, start) } else { select(start, end) };
            let before = state(&context, vec![block(heading(a)?, &left, formats()?)?, block(heading(b)?, &right, formats()?)?], selection.clone(), None)?;
            let mut session = EditorSession::new(before.clone());
            let prepared = registry()?.prepare(&before, &invocation("breditor/clear-text-block-inline-formats")?)?;
            session.execute_prepared_action(prepared)?;
            let expected = state(&context, vec![block(heading(a)?, &left, FormatSet::default())?, block(heading(b)?, &right, FormatSet::default())?], selection, None)?;
            exact(session.state(), &expected);
            history(&mut session, &before)
        })();
        prop_assert!(result.is_ok(), "{result:?}");
    }
}
