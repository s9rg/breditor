//! Flat-list formatting contracts through public registry/session boundaries.
use super::*;
use crate::{
    action::{
        Action, ActionActivation, ActionDecision, ActionEvaluation, ActionId, ActionInput,
        ActionInvocation, ActionStateValue, ActionValue,
    },
    block::TextBlockKind,
    codec::structural_codec_test_support::{
        TestResult, block, extensions, formats, heading, name, state,
    },
    document::{
        ElementNode, Format, FormatSet, NodeRef, PropertyInteger, PropertyMap, PropertyValue,
    },
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeOrder, RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState},
    transaction::{SelectionUpdate, Transaction},
};
use proptest::prelude::*;
use std::error::Error;

fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_flat_list_profile(
            SchemaId::new(name("example/list-format")?, SchemaVersion::one()),
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
fn merged(kind: TextBlockKind, runs: &[(&str, FormatSet)]) -> Result<NodeRef, Box<dyn Error>> {
    let empty = block(kind, "", FormatSet::default())?;
    let mut children = vec![];
    for (text, formats) in runs {
        children.extend(
            block(kind, text, formats.clone())?
                .as_element()
                .ok_or("block")?
                .children()
                .iter()
                .cloned(),
        );
    }
    Ok(NodeRef::element(empty.as_element().ok_or("block")?.try_with_children(children)?))
}
fn text(path: &[u32], offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(path.to_vec())?,
        utf16_offset: offset,
        affinity,
    })
}
fn gap(path: &[u32], index: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children {
        parent_path: NodePath::try_from_indices(path.to_vec())?,
        child_index: index,
        affinity,
    })
}
fn select(anchor: Point, focus: Point) -> Selection {
    RangeSelection::new(anchor, focus).into()
}
fn caret(point: Point) -> Selection {
    select(point.clone(), point)
}
fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![
        ActionRegistration::new(
            ActionId::try_new("test/strong")?,
            ToggleFlatListInlineFormatAction::new(name("breditor/strong")?),
        ),
        ActionRegistration::with_input(
            ActionId::try_new("test/link")?,
            set_inline_format_input_contract(),
            SetFlatListInlineFormatAction::new(name("example/link")?),
        ),
        ActionRegistration::new(
            clear_flat_list_inline_formats_action_id(),
            ClearFlatListInlineFormatsAction,
        ),
    ])?)
}
fn invocation(id: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::without_input(ActionId::try_new(id)?))
}
fn link(href: Option<&str>) -> Result<ActionInvocation, Box<dyn Error>> {
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
fn strong() -> Result<FormatSet, Box<dyn Error>> {
    Ok(FormatSet::try_from_formats(vec![Format::new(
        name("breditor/strong")?,
        PropertyMap::default(),
    )])?)
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
        matches!(evaluation.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == code),
        "{:?}",
        evaluation.decision()
    );
}
fn kind_registry(target: TextBlockKind) -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![ActionRegistration::new(
        ActionId::try_new("test/kind")?,
        SetFlatListBlockKindAction::new(target),
    )])?)
}

#[test]
fn mixed_inline_selection_across_all_families_preserves_layout_and_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for reverse in [false, true] {
        let a = text(&[0, 0], 1, Affinity::Before)?;
        let b = text(&[2, 0, 0, 0], 2, Affinity::After)?;
        let selection = if reverse { select(b, a) } else { select(a, b) };
        let roots = |last| -> Result<Vec<NodeRef>, Box<dyn Error>> {
            Ok(vec![
                block(heading(2)?, "abc", formats()?)?,
                list(vec![block(heading(4)?, "", FormatSet::default())?], None)?,
                list(
                    vec![
                        block(TextBlockKind::Paragraph, "xy", last)?,
                        block(heading(6)?, "suffix", formats()?)?,
                    ],
                    Some(17),
                )?,
            ])
        };
        let before = state(&context, roots(FormatSet::default())?, selection.clone(), None)?;
        let mut session = EditorSession::new(before.clone());
        let prepared = registry()?.prepare(&before, &invocation("test/strong")?)?;
        assert_eq!(prepared.indicator().activation(), ActionActivation::Mixed);
        session.execute_prepared_action(prepared)?;
        exact(session.state(), &state(&context, roots(strong()?)?, selection, None)?);
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn typed_properties_replace_remove_and_report_uniform_mixed_unset() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![list(
            vec![
                merged(heading(2)?, &[("a", linked("old")?), ("🙂", linked("new")?)])?,
                block(heading(5)?, "e\u{301}", linked("old")?)?,
            ],
            Some(8),
        )?],
        select(text(&[0, 1, 0, 0], 2, Affinity::Before)?, text(&[0, 0, 0, 0], 0, Affinity::After)?),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    let request = link(Some("new"))?;
    let prepared = registry()?.prepare(&before, &request)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Mixed);
    assert!(matches!(prepared.indicator().value(), ActionStateValue::Mixed { .. }));
    session.execute_prepared_action(prepared)?;
    exact(
        session.state(),
        &state(
            &context,
            vec![list(
                vec![
                    block(heading(2)?, "a🙂", linked("new")?)?,
                    block(heading(5)?, "e\u{301}", linked("new")?)?,
                ],
                Some(8),
            )?],
            before.selection().cloned(),
            None,
        )?,
    );
    history(&mut session, &before)?;
    let prepared = registry()?.prepare(session.state(), &request)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Active);
    assert!(matches!(prepared.indicator().value(), ActionStateValue::Uniform { .. }));
    assert!(session.execute_prepared_action(prepared).is_err());
    session.execute_prepared_action(registry()?.prepare(session.state(), &link(None)?)?)?;
    assert!(matches!(
        registry()?.prepare(session.state(), &link(None)?)?.indicator().value(),
        ActionStateValue::Unset { .. }
    ));
    assert_eq!(
        session.state().document(),
        state(
            &context,
            vec![list(
                vec![
                    block(heading(2)?, "a🙂", strong()?)?,
                    block(heading(5)?, "e\u{301}", strong()?)?
                ],
                Some(8)
            )?],
            before.selection().cloned(),
            None
        )?
        .document()
    );
    Ok(())
}

#[test]
fn partial_clear_canonicalizes_runs_and_restores_original_gap_selection() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![list(
            vec![
                block(heading(1)?, "prefix", formats()?)?,
                merged(heading(6)?, &[("ab", linked("old")?), ("🙂", linked("new")?)])?,
            ],
            Some(20),
        )?],
        select(gap(&[0, 1, 0], 2, Affinity::Before)?, text(&[0, 1, 0, 0], 1, Affinity::After)?),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(
        registry()?.prepare(&before, &invocation("breditor/clear-flat-list-inline-formats")?)?,
    )?;
    exact(
        session.state(),
        &state(
            &context,
            vec![list(
                vec![
                    block(heading(1)?, "prefix", formats()?)?,
                    merged(heading(6)?, &[("a", linked("old")?), ("b🙂", FormatSet::default())])?,
                ],
                Some(20),
            )?],
            select(
                text(&[0, 1, 0, 1], 3, Affinity::Before)?,
                text(&[0, 1, 0, 1], 0, Affinity::After)?,
            ),
            None,
        )?,
    );
    history(&mut session, &before)
}

#[test]
fn collapsed_formatting_honors_affinity_pending_override_and_zero_operation_budget() -> TestResult {
    let context = context(DocumentLimits::default())?.with_max_operations_per_transaction(0);
    for affinity in [Affinity::Before, Affinity::After] {
        let before = state(
            &context,
            vec![list(
                vec![merged(heading(1)?, &[("a", formats()?), ("b", FormatSet::default())])?],
                None,
            )?],
            caret(text(&[0, 0, 0, 0], 1, affinity)?),
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
    }
    for request in [
        invocation("test/strong")?,
        link(Some("new"))?,
        invocation("breditor/clear-flat-list-inline-formats")?,
    ] {
        let before = state(
            &context,
            vec![list(vec![block(heading(3)?, "", FormatSet::default())?], Some(4))?],
            caret(gap(&[0, 0, 0], 0, Affinity::After)?),
            Some(formats()?),
        )?;
        let mut session = EditorSession::new(before.clone());
        session.execute_prepared_action(registry()?.prepare(&before, &request)?)?;
        assert_eq!(session.state().document(), before.document());
        assert_eq!(session.state().selection(), before.selection());
        assert_eq!(session.undo_depth(), 0);
    }
    Ok(())
}

#[test]
fn list_typing_consumes_plain_override_and_undo_restores_it() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let initial = state(
        &context,
        vec![list(vec![block(heading(2)?, "ab", formats()?)?], Some(11))?],
        caret(text(&[0, 0, 0, 0], 1, Affinity::After)?),
        None,
    )?;
    let mut session = EditorSession::new(initial.clone());
    session.execute_prepared_action(
        registry()?.prepare(&initial, &invocation("breditor/clear-flat-list-inline-formats")?)?,
    )?;
    let before = session.state().clone();
    assert_eq!(before.pending_formats(), Some(&FormatSet::default()));
    let typing = ActionRegistry::try_new(vec![ActionRegistration::with_input(
        ActionId::try_new("test/insert")?,
        insert_text_input_contract(),
        InsertFlatListTextAction,
    )])?;
    let input = ActionInvocation::new(
        ActionId::try_new("test/insert")?,
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string("🙂")?),
    );
    session.execute_prepared_action(typing.prepare(&before, &input)?)?;
    exact(
        session.state(),
        &state(
            &context,
            vec![list(
                vec![merged(
                    heading(2)?,
                    &[("a", formats()?), ("🙂", FormatSet::default()), ("b", formats()?)],
                )?],
                Some(11),
            )?],
            caret(text(&[0, 0, 0, 2], 0, Affinity::Before)?),
            None,
        )?,
    );
    history(&mut session, &before)
}

#[test]
fn kind_change_covers_all_ranks_and_preserves_exact_selection_and_pending() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 0..=6 {
        let target = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
        let source = if rank == 0 { heading(1)? } else { TextBlockKind::Paragraph };
        for empty in [false, true] {
            let selected = if empty {
                caret(gap(&[0, 1, 0], 0, Affinity::Before)?)
            } else {
                caret(gap(&[0, 1, 0], 1, Affinity::Before)?)
            };
            let value = if empty { "" } else { "🙂" };
            let roots = |kind| -> Result<Vec<NodeRef>, Box<dyn Error>> {
                Ok(vec![list(
                    vec![
                        block(heading(6)?, "prefix", formats()?)?,
                        block(kind, value, formats()?)?,
                        block(heading(2)?, "suffix", formats()?)?,
                    ],
                    Some(19),
                )?])
            };
            let before = state(&context, roots(source)?, selected.clone(), Some(formats()?))?;
            let evaluated = SetFlatListBlockKindAction::new(target).evaluate(&before, &())?;
            let ActionDecision::Enabled(plan) = evaluated.decision() else {
                return Err("expected heading conversion plan".into());
            };
            let [crate::operation::Operation::FlatListTextReplace(op)] = plan.operations() else {
                return Err("expected one list replacement".into());
            };
            // A complete list remains guarded, but only the selected item is
            // replaced, including a collapsed empty paragraph and UTF-16 text.
            assert_eq!(op.guard_start(), 0);
            assert_eq!(op.expected(), roots(source)?);
            assert_eq!(op.inserted().len(), 1);
            assert_eq!(op.range().start_path().as_slice(), &[0, 1, 0]);
            assert_eq!(op.range().end_path().as_slice(), &[0, 1, 0]);
            assert_eq!(op.range().start_offset().get(), 0);
            assert_eq!(op.range().end_offset().get(), if empty { 0 } else { 2 });
            let codec = crate::codec::OperationJsonCodecV6::new(context.clone());
            let operation = &plan.operations()[0];
            assert_eq!(codec.decode(&codec.encode(operation)?)?, *operation);
            let mut session = EditorSession::new(before.clone());
            let registry = kind_registry(target)?;
            let prepared = registry.prepare(&before, &invocation("test/kind")?)?;
            assert_eq!(prepared.indicator().activation(), ActionActivation::Inactive);
            session.execute_prepared_action(prepared)?;
            exact(session.state(), &state(&context, roots(target)?, selected, Some(formats()?))?);
            history(&mut session, &before)?;
            let prepared = registry.prepare(session.state(), &invocation("test/kind")?)?;
            assert_eq!(prepared.indicator().activation(), ActionActivation::Active);
            let saved = session.state().clone();
            assert!(session.execute_prepared_action(prepared).is_err());
            assert_eq!(session.state(), &saved);
        }
    }
    Ok(())
}

#[test]
fn kind_change_excludes_end_zero_and_reports_mixed_across_root_families() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for reverse in [false, true] {
        let a = text(&[0, 0], 1, Affinity::Before)?;
        let b = text(&[2, 1, 0, 0], 0, Affinity::After)?;
        let selection = if reverse { select(b, a) } else { select(a, b) };
        let roots = |kind| -> Result<Vec<NodeRef>, Box<dyn Error>> {
            Ok(vec![
                block(kind, "a", formats()?)?,
                list(vec![block(heading(3)?, "b", formats()?)?], None)?,
                list(
                    vec![
                        block(kind, "c", formats()?)?,
                        block(heading(6)?, "excluded", formats()?)?,
                    ],
                    Some(2_147_483_646),
                )?,
            ])
        };
        let before = state(&context, roots(TextBlockKind::Paragraph)?, selection.clone(), None)?;
        let evaluated = SetFlatListBlockKindAction::new(heading(3)?).evaluate(&before, &())?;
        let ActionDecision::Enabled(plan) = evaluated.decision() else {
            return Err("expected mixed heading conversion plan".into());
        };
        let [crate::operation::Operation::FlatListTextReplace(op)] = plan.operations() else {
            return Err("expected one list replacement".into());
        };
        assert_eq!(op.expected(), roots(TextBlockKind::Paragraph)?);
        assert_eq!(op.inserted().len(), 3);
        assert_eq!(op.range().start_path().as_slice(), &[0]);
        assert_eq!(op.range().end_path().as_slice(), &[2, 0, 0]);
        assert_eq!(op.range().end_offset().get(), 1);
        let mut session = EditorSession::new(before.clone());
        let registry = kind_registry(heading(3)?)?;
        let prepared = registry.prepare(&before, &invocation("test/kind")?)?;
        assert_eq!(prepared.indicator().activation(), ActionActivation::Mixed);
        session.execute_prepared_action(prepared)?;
        exact(session.state(), &state(&context, roots(heading(3)?)?, selection, None)?);
        history(&mut session, &before)?;
    }
    Ok(())
}

#[test]
fn budgets_validate_complete_result_without_publishing_partial_changes() -> TestResult {
    for limits in [
        DocumentLimits::default().with_max_nodes(7),
        DocumentLimits::default().with_max_property_values(2),
        DocumentLimits::default().with_max_text_bytes(2),
    ] {
        let context = context(limits)?;
        let before = state(
            &context,
            vec![list(
                vec![merged(heading(1)?, &[("ab", formats()?), ("cd", FormatSet::default())])?],
                None,
            )?],
            select(
                text(&[0, 0, 0, 0], 1, Affinity::After)?,
                text(&[0, 0, 0, 1], 1, Affinity::Before)?,
            ),
            None,
        )?;
        let request = if context.limits().max_text_bytes() == 2 {
            invocation("breditor/clear-flat-list-inline-formats")?
        } else {
            link(Some("new"))?
        };
        let mut session = EditorSession::new(before.clone());
        let prepared = registry()?.prepare(&before, &request)?;
        assert!(session.execute_prepared_action(prepared).is_err());
        assert_eq!(session.state(), &before);
        assert_eq!(session.undo_depth(), 0);
    }
    let context = context(DocumentLimits::default().with_max_property_values(1))?;
    let before = state(
        &context,
        vec![list(vec![block(TextBlockKind::Paragraph, "a", formats()?)?], None)?],
        caret(text(&[0, 0, 0, 0], 0, Affinity::After)?),
        None,
    )?;
    disabled(
        &SetFlatListBlockKindAction::new(heading(2)?).evaluate(&before, &())?,
        "breditor/result-limit-exceeded",
    );
    Ok(())
}

#[test]
fn atomic_cross_block_formatting_never_requires_an_over_budget_intermediate() -> TestResult {
    let context =
        context(DocumentLimits::default().with_max_nodes(10).with_max_property_values(6))?;
    let before = state(
        &context,
        vec![list(
            vec![
                block(heading(1)?, "abc", linked("old")?)?,
                merged(
                    heading(2)?,
                    &[("a", linked("old")?), ("b", linked("new")?), ("c", linked("old")?)],
                )?,
            ],
            None,
        )?],
        select(text(&[0, 0, 0, 0], 1, Affinity::After)?, text(&[0, 1, 0, 1], 1, Affinity::Before)?),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(registry()?.prepare(&before, &link(Some("new"))?)?)?;
    exact(
        session.state(),
        &state(
            &context,
            vec![list(
                vec![
                    merged(heading(1)?, &[("a", linked("old")?), ("bc", linked("new")?)])?,
                    merged(heading(2)?, &[("ab", linked("new")?), ("c", linked("old")?)])?,
                ],
                None,
            )?],
            select(
                text(&[0, 0, 0, 1], 0, Affinity::After)?,
                text(&[0, 1, 0, 0], 2, Affinity::Before)?,
            ),
            None,
        )?,
    );
    history(&mut session, &before)
}

#[test]
fn empty_ranges_invalid_properties_noops_and_schema_isolation_are_disabled() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![list(
            vec![block(heading(1)?, "a", formats()?)?, block(heading(2)?, "b", formats()?)?],
            None,
        )?],
        select(text(&[0, 0, 0, 0], 1, Affinity::After)?, text(&[0, 1, 0, 0], 0, Affinity::Before)?),
        None,
    )?;
    disabled(
        &ClearFlatListInlineFormatsAction.evaluate(&before, &())?,
        "breditor/no-selected-text",
    );
    let invalid = SetFlatListInlineFormatAction::new(name("example/link")?)
        .evaluate(&before, &SetInlineFormatInput::Set(PropertyMap::default()))?;
    disabled(&invalid, "breditor/invalid-inline-format-properties");
    assert_eq!(invalid.indicator().activation(), ActionActivation::Inactive);
    for other in [
        EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default()),
        crate::codec::structural_codec_test_support::context(DocumentLimits::default())?,
    ] {
        let before = state(
            &other,
            vec![block(TextBlockKind::Paragraph, "a", FormatSet::default())?],
            caret(text(&[0, 0], 0, Affinity::After)?),
            None,
        )?;
        disabled(
            &ClearFlatListInlineFormatsAction.evaluate(&before, &())?,
            "breditor/unsupported-schema",
        );
        disabled(
            &SetFlatListBlockKindAction::new(heading(2)?).evaluate(&before, &())?,
            "breditor/unsupported-schema",
        );
        disabled(
            &ToggleFlatListInlineFormatAction::new(name("breditor/strong")?)
                .evaluate(&before, &())?,
            "breditor/unsupported-schema",
        );
        disabled(
            &SetFlatListInlineFormatAction::new(name("example/link")?)
                .evaluate(&before, &SetInlineFormatInput::Remove)?,
            "breditor/unsupported-schema",
        );
    }
    let before = state(
        &context,
        vec![list(vec![block(heading(2)?, "a", FormatSet::default())?], None)?],
        None,
        None,
    )?;
    disabled(&ClearFlatListInlineFormatsAction.evaluate(&before, &())?, "breditor/no-selection");
    disabled(
        &SetFlatListBlockKindAction::new(heading(1)?).evaluate(&before, &())?,
        "breditor/no-selection",
    );
    let before = state(
        &context,
        vec![list(vec![block(heading(2)?, "a", FormatSet::default())?], None)?],
        select(text(&[0, 0, 0, 0], 0, Affinity::After)?, text(&[0, 0, 0, 0], 1, Affinity::Before)?),
        None,
    )?;
    disabled(
        &ClearFlatListInlineFormatsAction.evaluate(&before, &())?,
        "breditor/inline-format-unchanged",
    );
    let zero = context.with_max_operations_per_transaction(0);
    let before = state(
        &zero,
        vec![list(vec![block(heading(2)?, "a", FormatSet::default())?], None)?],
        before.selection().cloned(),
        None,
    )?;
    disabled(
        &ToggleFlatListInlineFormatAction::new(name("breditor/strong")?).evaluate(&before, &())?,
        "breditor/operation-budget-exceeded",
    );
    disabled(
        &SetFlatListBlockKindAction::new(heading(1)?).evaluate(&before, &())?,
        "breditor/operation-budget-exceeded",
    );
    Ok(())
}

#[test]
fn stale_preparation_preserves_newer_state_and_redo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![list(vec![block(heading(2)?, "ab", formats()?)?], None)?],
        select(text(&[0, 0, 0, 0], 0, Affinity::After)?, text(&[0, 0, 0, 0], 2, Affinity::Before)?),
        None,
    )?;
    for (registry, id) in [(registry()?, "test/strong"), (kind_registry(heading(5)?)?, "test/kind")]
    {
        let request = invocation(id)?;
        let stale = registry.prepare(&before, &request)?;
        let mut session = EditorSession::new(before.clone());
        session.execute_prepared_action(registry.prepare(&before, &request)?)?;
        session.undo()?.ok_or("undo")?;
        let saved = session.state().clone();
        let history = session.history_status();
        assert!(session.execute_prepared_action(stale).is_err());
        assert_eq!(session.state(), &saved);
        assert_eq!(session.history_status(), history);
        session.redo()?.ok_or("redo")?;
    }
    Ok(())
}

#[test]
fn property_budgets_include_roots_outside_the_guarded_span() -> TestResult {
    let context = context(DocumentLimits::default().with_max_property_values(2))?;
    let before = state(
        &context,
        vec![
            list(vec![block(TextBlockKind::Paragraph, "a", FormatSet::default())?], None)?,
            block(heading(1)?, "outside", formats()?)?,
        ],
        select(text(&[0, 0, 0, 0], 0, Affinity::After)?, text(&[0, 0, 0, 0], 1, Affinity::Before)?),
        None,
    )?;
    disabled(
        &SetFlatListBlockKindAction::new(heading(2)?).evaluate(&before, &())?,
        "breditor/result-limit-exceeded",
    );
    disabled(
        &SetFlatListInlineFormatAction::new(name("example/link")?).evaluate(
            &before,
            &SetInlineFormatInput::Set(PropertyMap::try_from_sorted(vec![(
                name("example/href")?,
                PropertyValue::from_string("new"),
            )])?),
        )?,
        "breditor/result-limit-exceeded",
    );
    Ok(())
}

#[test]
fn rejected_leaf_merge_preserves_redo_after_selection_change() -> TestResult {
    let context = context(DocumentLimits::default().with_max_text_bytes(2))?;
    let before = state(
        &context,
        vec![list(
            vec![merged(heading(2)?, &[("ab", formats()?), ("cd", FormatSet::default())])?],
            None,
        )?],
        select(text(&[0, 0, 0, 0], 0, Affinity::After)?, text(&[0, 0, 0, 0], 1, Affinity::Before)?),
        None,
    )?;
    let registry = registry()?;
    let request = invocation("breditor/clear-flat-list-inline-formats")?;
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(registry.prepare(&before, &request)?)?;
    let formatted = session.state().clone();
    session.undo()?.ok_or("undo")?;
    session.apply_transaction(&Transaction::new(session.state(), vec![]).with_selection_update(
        SelectionUpdate::Set(Some(select(
            text(&[0, 0, 0, 0], 1, Affinity::After)?,
            text(&[0, 0, 0, 1], 1, Affinity::Before)?,
        ))),
    ))?;
    let saved = session.state().clone();
    let history = session.history_status();
    disabled(
        &ClearFlatListInlineFormatsAction.evaluate(&saved, &())?,
        "breditor/result-limit-exceeded",
    );
    assert!(session.execute_prepared_action(registry.prepare(&saved, &request)?).is_err());
    assert_eq!(session.state(), &saved);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("redo")?;
    exact(session.state(), &formatted);
    Ok(())
}

proptest! {
    #[test]
    fn flat_list_clear_matches_unicode_substring_oracle_and_exact_history(
        left in prop::collection::vec(prop::sample::select(vec!['a','🙂','é','\u{301}','中']),1..20),
        right in prop::collection::vec(prop::sample::select(vec!['b','🚀','\u{301}','界']),1..20),
        a in 0_usize..40,b in 0_usize..40,rank in 1_u32..7,reverse in any::<bool>(),
    ) {
        let result=(|| -> TestResult {
            let context=context(DocumentLimits::default())?;
            let a=a%left.len(); let b=1+b%right.len();
            let left_prefix=left[..a].iter().collect::<String>(); let left_suffix=left[a..].iter().collect::<String>();
            let right_prefix=right[..b].iter().collect::<String>(); let right_suffix=right[b..].iter().collect::<String>();
            let left=left.iter().collect::<String>(); let right=right.iter().collect::<String>();
            let start=text(&[0,1,0,0],u32::try_from(left_prefix.encode_utf16().count())?,Affinity::After)?;
            let end=text(&[2,0,0,0],u32::try_from(right_prefix.encode_utf16().count())?,Affinity::Before)?;
            let selection=if reverse {select(end,start)}else{select(start,end)};
            let roots=|left,right,middle| -> Result<Vec<NodeRef>,Box<dyn Error>> {Ok(vec![list(vec![block(heading(6)?,"unselected",formats()?)?,left],Some(9))?,block(heading(3)?,"middle",middle)?,list(vec![right,block(heading(1)?,"unselected",formats()?)?],None)?])};
            let before=state(&context,roots(block(heading(rank)?,&left,formats()?)?,block(TextBlockKind::Paragraph,&right,formats()?)?,formats()?)?,selection,None)?;
            let mut session=EditorSession::new(before.clone()); session.execute_prepared_action(registry()?.prepare(&before,&invocation("breditor/clear-flat-list-inline-formats")?)?)?;
            let expected=state(&context,roots(merged(heading(rank)?,&[(&left_prefix,formats()?),(&left_suffix,FormatSet::default())])?,merged(TextBlockKind::Paragraph,&[(&right_prefix,FormatSet::default()),(&right_suffix,formats()?)])?,FormatSet::default())?,None,None)?;
            assert_eq!(session.state().document(),expected.document());
            let actual=crate::action::text_position::normalize_flat_list_range_selection(session.state())?;
            assert_eq!(actual.order(),if reverse {RangeOrder::Backward}else{RangeOrder::Forward});
            assert_eq!(actual.start().paragraph_path(),&NodePath::try_from_indices(vec![0,1,0])?);
            assert_eq!(actual.end().paragraph_path(),&NodePath::try_from_indices(vec![2,0,0])?);
            let Some(Selection::Range(result))=session.state().selection() else {return Err("missing selection".into());};
            assert_eq!(result.anchor().affinity(),if reverse {Affinity::Before}else{Affinity::After});
            assert_eq!(result.focus().affinity(),if reverse {Affinity::After}else{Affinity::Before});
            assert_eq!(actual.start().offset().get(),u64::try_from(left_prefix.encode_utf16().count())?);
            assert_eq!(actual.end().offset().get(),u64::try_from(right_prefix.encode_utf16().count())?);
            history(&mut session,&before)
        })(); prop_assert!(result.is_ok(),"{result:?}");
    }
}
