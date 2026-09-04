//! Black-box contracts for the guarded product-level editor engine.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionInput, ActionInvocation, ActionStateCatalog, ActionStateId,
        ActionStateOutcome, ActionStateRegistration, ActionStateSource, ActionValue,
        ObservedAvailability,
        builtins::{insert_text_action_id, insert_text_input_contract, toggle_strong_action_id},
    },
    codec::DocumentJsonCodec,
    document::{Format, FormatSet, PropertyMap},
    engine::{
        EditorActionOutcome, EditorEngine, EditorEngineError, EditorEngineErrorCode,
        EditorEngineEvent, EditorEngineEventKind,
    },
    identity::QualifiedName,
    position::{Affinity, Point},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::ReplayDirection,
};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn strong_formats() -> Result<FormatSet, Box<dyn Error>> {
    Ok(FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::default(),
    )])?)
}

fn text_point(utf16_offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text { text_path: path(&[0, 0])?, utf16_offset, affinity })
}

fn collapsed(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}

fn editor_state(
    lineage: &str,
    text: &str,
    selection: Option<Selection>,
    pending_formats: Option<FormatSet>,
) -> Result<EditorState, Box<dyn Error>> {
    let context = EditorContext::default();
    let children = if text.is_empty() { Vec::new() } else { vec![text_node(text, false)] };
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&children)]))?;
    EditorState::try_new(
        &context,
        LineageId::try_new(lineage)?,
        document,
        selection,
        pending_formats,
    )
    .map_err(Into::into)
}

fn engine(
    lineage: &str,
    text: &str,
    selection: Option<Selection>,
    pending_formats: Option<FormatSet>,
) -> Result<EditorEngine, Box<dyn Error>> {
    EditorEngine::try_with_base_actions(EditorSession::new(editor_state(
        lineage,
        text,
        selection,
        pending_formats,
    )?))
    .map_err(Into::into)
}

fn insert_invocation(text: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(
        insert_text_action_id(),
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}

fn only_text(state: &EditorState) -> Result<&str, Box<dyn Error>> {
    let root = state
        .document()
        .root()
        .as_element()
        .ok_or_else(|| test_error("validated root was not an element"))?;
    let paragraph = root
        .children()
        .get(0)
        .and_then(breditor_core::document::NodeRef::as_element)
        .ok_or_else(|| test_error("first paragraph was missing"))?;
    let text = paragraph
        .children()
        .get(0)
        .and_then(breditor_core::document::NodeRef::as_text)
        .ok_or_else(|| test_error("first text node was missing"))?;
    Ok(text.text())
}

fn require_event(outcome: EditorActionOutcome) -> Result<EditorEngineEvent, Box<dyn Error>> {
    outcome.into_event().ok_or_else(|| test_error("action was unexpectedly disabled").into())
}

fn assert_stale(error: &EditorEngineError) {
    assert_eq!(error.code(), EditorEngineErrorCode::StaleSnapshot);
    assert_eq!(error.code().as_str(), "editor_engine.stale_snapshot");
}

fn assert_stale_engine(error: &EditorEngineError) {
    assert_eq!(error.code(), EditorEngineErrorCode::StaleEngine);
    assert_eq!(error.code().as_str(), "editor_engine.stale_engine");
}

fn require_engine_error<T: std::fmt::Debug>(
    result: Result<T, EditorEngineError>,
    context: &str,
) -> Result<EditorEngineError, Box<dyn Error>> {
    match result {
        Err(error) => Ok(error),
        Ok(value) => Err(test_error(format!("{context}; got success {value:?}")).into()),
    }
}

#[test]
fn engine_is_send_and_sync() {
    fn assert_send_sync<T: Send + Sync>() {}

    assert_send_sync::<EditorEngine>();
}

#[test]
fn enabled_action_is_prepared_and_published_inside_one_guarded_call() -> TestResult {
    const PRIVATE_TEXT: &str = "private-engine-payload";

    let caret = collapsed(text_point(22, Affinity::After)?);
    let mut engine = engine("engine-action-success", PRIVATE_TEXT, Some(caret), None)?;
    let initial = engine.state().clone();
    let expected = engine.observation();
    let outcome = engine.execute_action(&expected, &insert_invocation("!")?)?;

    assert!(outcome.event().is_some());
    assert!(outcome.disabled().is_none());
    let debug = format!("{outcome:?}");
    assert!(debug.contains("Action"));
    assert!(!debug.contains(PRIVATE_TEXT));

    let event = require_event(outcome)?;
    assert_eq!(event.kind(), EditorEngineEventKind::Action);
    assert_eq!(event.observation(), &engine.observation());
    let commit = event.commit().ok_or_else(|| test_error("action event had no commit"))?;
    assert_eq!(commit.before(), &initial);
    assert_eq!(commit.after(), engine.state());
    assert_eq!(only_text(engine.state())?, "private-engine-payload!");
    assert_eq!(commit.metadata().action().map(QualifiedName::as_str), Some("breditor/insert-text"));
    assert_eq!(engine.session().undo_depth(), 1);
    assert_eq!(engine.session().redo_depth(), 0);

    let engine_debug = format!("{engine:?}");
    assert!(engine_debug.contains("action_count: 7"));
    assert!(!engine_debug.contains(PRIVATE_TEXT));
    Ok(())
}

#[test]
fn disabled_action_is_coherent_data_and_does_not_mutate_the_engine() -> TestResult {
    const PRIVATE_TEXT: &str = "disabled-private-payload";

    let mut engine = engine("engine-action-disabled", PRIVATE_TEXT, None, None)?;
    let state_before = engine.state().clone();
    let history_before = engine.session().history_status();
    let expected = engine.observation();
    let outcome = engine
        .execute_action(&expected, &ActionInvocation::without_input(toggle_strong_action_id()))?;

    assert!(outcome.event().is_none());
    let disabled =
        outcome.disabled().ok_or_else(|| test_error("action was unexpectedly committed"))?;
    assert_eq!(disabled.action(), &toggle_strong_action_id());
    assert_eq!(disabled.reason().code().as_str(), "breditor/no-selection");
    assert_eq!(disabled.reason().detail(), None);
    assert_eq!(disabled.indicator().activation(), ActionActivation::Inactive);
    assert_eq!(disabled.observation(), &expected);
    assert_eq!(engine.state(), &state_before);
    assert_eq!(engine.session().history_status(), history_before);

    let debug = format!("{outcome:?}");
    assert!(debug.contains("breditor/no-selection"));
    assert!(!debug.contains(PRIVATE_TEXT));
    assert!(outcome.into_event().is_none());
    Ok(())
}

#[test]
fn action_preparation_failures_are_typed_redacted_and_atomic() -> TestResult {
    const PRIVATE_TEXT: &str = "preparation-private-payload";

    let caret = collapsed(text_point(27, Affinity::After)?);
    let mut engine = engine("engine-action-error", PRIVATE_TEXT, Some(caret), None)?;
    let state_before = engine.state().clone();
    let history_before = engine.session().history_status();
    let expected = engine.observation();
    let invocation = ActionInvocation::without_input(breditor_core::action::ActionId::try_new(
        "test/missing-action",
    )?);
    let error = require_engine_error(
        engine.execute_action(&expected, &invocation),
        "unknown action unexpectedly executed",
    )?;

    assert_eq!(error.code(), EditorEngineErrorCode::ActionPreparation);
    assert_eq!(error.code().as_str(), "editor_engine.action_preparation");
    assert_eq!(engine.state(), &state_before);
    assert_eq!(engine.session().history_status(), history_before);
    assert!(!format!("{error:?}").contains(PRIVATE_TEXT));
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn every_mutation_rejects_a_stale_snapshot_before_effects() -> TestResult {
    let caret = collapsed(text_point(1, Affinity::After)?);
    let mut engine = engine("engine-stale-guard", "a", Some(caret), None)?;
    let stale = engine.observation();
    let _ = require_event(engine.execute_action(&stale, &insert_invocation("b")?)?)?;
    let state_before = engine.state().clone();
    let history_before = engine.session().history_status();

    let missing = ActionInvocation::without_input(breditor_core::action::ActionId::try_new(
        "test/missing-action",
    )?);
    let action_error = require_engine_error(
        engine.execute_action(&stale, &missing),
        "stale guard must run before action lookup",
    )?;
    assert_stale(&action_error);

    let selection_error = require_engine_error(
        engine.set_selection(&stale, None),
        "stale selection must be rejected",
    )?;
    assert_stale(&selection_error);
    let undo_error = require_engine_error(engine.undo(&stale), "stale undo must be rejected")?;
    assert_stale(&undo_error);
    let redo_error = require_engine_error(engine.redo(&stale), "stale redo must be rejected")?;
    assert_stale(&redo_error);
    let close_error =
        require_engine_error(engine.close_history_group(&stale), "stale close must be rejected")?;
    assert_stale(&close_error);
    let clear_error =
        require_engine_error(engine.clear_history(&stale), "stale clear must be rejected")?;
    assert_stale(&clear_error);

    assert_eq!(engine.state(), &state_before);
    assert_eq!(engine.session().history_status(), history_before);
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn selection_echo_is_a_no_op_but_a_real_change_clears_pending_formats_and_grouping() -> TestResult {
    let caret = collapsed(text_point(1, Affinity::After)?);
    let mut engine = engine("engine-selection", "a", Some(caret), None)?;

    let expected = engine.observation();
    let _ =
        require_event(engine.execute_action(
            &expected,
            &ActionInvocation::without_input(toggle_strong_action_id()),
        )?)?;
    assert_eq!(engine.state().pending_formats(), Some(&strong_formats()?));

    let state_before_echo = engine.state().clone();
    let history_before_echo = engine.session().history_status();
    let expected = engine.observation();
    let echoed = engine.set_selection(&expected, state_before_echo.selection().cloned())?;
    assert!(echoed.is_none());
    assert_eq!(engine.state(), &state_before_echo);
    assert_eq!(engine.session().history_status(), history_before_echo);

    let _ = require_event(engine.execute_action(&expected, &insert_invocation("b")?)?)?;
    assert_eq!(engine.state().pending_formats(), None);
    let state_before_echo = engine.state().clone();
    let history_before_echo = engine.session().history_status();
    let expected = engine.observation();
    let echoed = engine.set_selection(&expected, state_before_echo.selection().cloned())?;
    assert!(echoed.is_none());
    assert_eq!(engine.state(), &state_before_echo);
    assert_eq!(engine.session().history_status(), history_before_echo);
    let closed = engine
        .close_history_group(&expected)?
        .ok_or_else(|| test_error("open history group was not closed"))?;
    assert_eq!(closed.kind(), EditorEngineEventKind::CloseHistoryGroup);
    assert!(closed.commit().is_none());
    assert_eq!(closed.observation(), &engine.observation());
    let expected = engine.observation();
    assert!(engine.close_history_group(&expected)?.is_none());

    let _ = require_event(engine.execute_action(&expected, &insert_invocation("c")?)?)?;
    let expected = engine.observation();
    let moved_to_start = collapsed(text_point(0, Affinity::Before)?);
    let _ = engine
        .set_selection(&expected, Some(moved_to_start))?
        .ok_or_else(|| test_error("selection change after typing was unexpectedly ignored"))?;
    let current = engine.observation();
    assert!(engine.close_history_group(&current)?.is_none());

    let _ =
        require_event(engine.execute_action(
            &current,
            &ActionInvocation::without_input(toggle_strong_action_id()),
        )?)?;
    assert_eq!(engine.state().pending_formats(), Some(&strong_formats()?));
    let expected = engine.observation();
    let document_before_selection = engine.state().document().clone();
    let changed_selection = collapsed(text_point(1, Affinity::After)?);
    let changed = engine
        .set_selection(&expected, Some(changed_selection.clone()))?
        .ok_or_else(|| test_error("real selection change was unexpectedly ignored"))?;

    assert_eq!(changed.kind(), EditorEngineEventKind::Selection);
    let commit =
        changed.commit().ok_or_else(|| test_error("selection event did not retain its commit"))?;
    assert!(commit.forward_operations().is_empty());
    assert_eq!(commit.before().document(), &document_before_selection);
    assert_eq!(commit.after().document(), &document_before_selection);
    assert_eq!(engine.state().selection(), Some(&changed_selection));
    assert_eq!(engine.state().pending_formats(), None);
    assert_eq!(engine.session().undo_depth(), 2);
    let current = engine.observation();
    assert!(engine.close_history_group(&current)?.is_none());
    Ok(())
}

#[test]
fn invalid_selection_is_atomic_and_uses_the_stable_redacted_error_contract() -> TestResult {
    const PRIVATE_TEXT: &str = "selection-private-payload";

    let caret = collapsed(text_point(25, Affinity::After)?);
    let mut engine = engine("engine-invalid-selection", PRIVATE_TEXT, Some(caret), None)?;
    let state_before = engine.state().clone();
    let history_before = engine.session().history_status();
    let expected = engine.observation();
    let invalid_point =
        Point::Text { text_path: path(&[99, 99])?, utf16_offset: 0, affinity: Affinity::After };
    let error = require_engine_error(
        engine.set_selection(&expected, Some(collapsed(invalid_point))),
        "invalid selection must fail closed",
    )?;

    assert_eq!(error.code(), EditorEngineErrorCode::SelectionUpdate);
    assert_eq!(error.code().as_str(), "editor_engine.selection_update");
    assert_eq!(engine.state(), &state_before);
    assert_eq!(engine.session().history_status(), history_before);
    let debug = format!("{error:?}");
    assert!(debug.contains("SelectionUpdate"));
    assert!(debug.contains("<redacted>"));
    assert!(!debug.contains(PRIVATE_TEXT));
    Ok(())
}

#[test]
fn guarded_history_replays_and_controls_report_exact_effectiveness() -> TestResult {
    let caret = collapsed(text_point(1, Affinity::After)?);
    let mut engine = engine("engine-history", "a", Some(caret), None)?;
    let expected = engine.observation();
    let _ = require_event(engine.execute_action(&expected, &insert_invocation("b")?)?)?;

    let current = engine.observation();
    let closed = engine
        .close_history_group(&current)?
        .ok_or_else(|| test_error("open history group was not closed"))?;
    assert_eq!(closed.kind(), EditorEngineEventKind::CloseHistoryGroup);
    let stale_history_error = require_engine_error(
        engine.undo(&current),
        "history-only change did not stale the prior observation",
    )?;
    assert_eq!(stale_history_error.code(), EditorEngineErrorCode::StaleHistory);
    assert_eq!(stale_history_error.code().as_str(), "editor_engine.stale_history");
    let current = engine.observation();
    assert!(engine.close_history_group(&current)?.is_none());

    let current = engine.observation();
    let undo =
        engine.undo(&current)?.ok_or_else(|| test_error("undo was unexpectedly unavailable"))?;
    assert_eq!(undo.kind(), EditorEngineEventKind::Undo);
    assert_eq!(undo.observation(), &engine.observation());
    let undo_commit = undo.commit().ok_or_else(|| test_error("undo event had no commit"))?;
    assert_eq!(undo_commit.metadata().action().map(QualifiedName::as_str), Some("breditor/undo"));
    assert_eq!(only_text(engine.state())?, "a");
    assert_eq!(engine.session().undo_depth(), 0);
    assert_eq!(engine.session().redo_depth(), 1);

    let current = engine.observation();
    let redo =
        engine.redo(&current)?.ok_or_else(|| test_error("redo was unexpectedly unavailable"))?;
    assert_eq!(redo.kind(), EditorEngineEventKind::Redo);
    assert_eq!(redo.observation(), &engine.observation());
    let redo_commit = redo.commit().ok_or_else(|| test_error("redo event had no commit"))?;
    assert_eq!(redo_commit.metadata().action().map(QualifiedName::as_str), Some("breditor/redo"));
    assert_eq!(only_text(engine.state())?, "ab");
    assert_eq!(engine.session().undo_depth(), 1);
    assert_eq!(engine.session().redo_depth(), 0);

    let current = engine.observation();
    let state_before_clear = engine.state().clone();
    let cleared = engine
        .clear_history(&current)?
        .ok_or_else(|| test_error("nonempty history was not cleared"))?;
    assert_eq!(cleared.kind(), EditorEngineEventKind::ClearHistory);
    assert!(cleared.commit().is_none());
    let current = engine.observation();
    assert!(engine.clear_history(&current)?.is_none());
    assert_eq!(engine.state(), &state_before_clear);
    assert_eq!(engine.session().undo_depth(), 0);
    assert_eq!(engine.session().redo_depth(), 0);
    assert!(engine.undo(&current)?.is_none());
    assert!(engine.redo(&current)?.is_none());
    Ok(())
}

#[test]
fn immutable_engine_views_compose_with_toolbar_catalogs_and_round_trip_into_parts() -> TestResult {
    let caret = collapsed(text_point(1, Affinity::After)?);
    let mut engine = engine("engine-catalog", "a", Some(caret), None)?;
    let strong_id = ActionStateId::try_new("test/toolbar-strong")?;
    let undo_id = ActionStateId::try_new("test/toolbar-undo")?;
    let catalog = ActionStateCatalog::try_new(
        engine.action_registry().clone(),
        vec![
            ActionStateRegistration::new(
                strong_id.clone(),
                ActionStateSource::direct(ActionInvocation::without_input(
                    toggle_strong_action_id(),
                )),
            ),
            ActionStateRegistration::new(
                undo_id.clone(),
                ActionStateSource::history(ReplayDirection::Undo),
            ),
        ],
    )?;

    let initial = catalog.derive(engine.session())?;
    assert_eq!(initial.base_snapshot(), engine.state().snapshot());
    let strong =
        initial.entry(&strong_id).ok_or_else(|| test_error("strong toolbar entry was missing"))?;
    let ActionStateOutcome::Resolved(strong) = strong.outcome() else {
        return Err(test_error("strong toolbar entry was not resolved").into());
    };
    assert!(matches!(strong.availability(), ObservedAvailability::Enabled));
    let undo =
        initial.entry(&undo_id).ok_or_else(|| test_error("undo toolbar entry was missing"))?;
    let ActionStateOutcome::Resolved(undo) = undo.outcome() else {
        return Err(test_error("undo toolbar entry was not resolved").into());
    };
    assert!(!undo.availability().is_enabled());

    let expected = engine.observation();
    let _ = require_event(engine.execute_action(&expected, &insert_invocation("b")?)?)?;
    let changed = catalog.derive(engine.session())?;
    let undo = changed
        .entry(&undo_id)
        .ok_or_else(|| test_error("undo toolbar entry was missing after edit"))?;
    let ActionStateOutcome::Resolved(undo) = undo.outcome() else {
        return Err(test_error("undo toolbar entry was not resolved after edit").into());
    };
    assert!(undo.availability().is_enabled());

    let snapshot = engine.state().snapshot().clone();
    let history = engine.session().history_status();
    let (session, registry) = engine.into_parts();
    assert_eq!(session.state().snapshot(), &snapshot);
    assert_eq!(session.history_status(), history);
    assert_eq!(registry.len(), 7);
    let rebuilt = EditorEngine::new(session, registry);
    assert_eq!(rebuilt.state().snapshot(), &snapshot);
    assert_eq!(rebuilt.action_registry().len(), 7);
    Ok(())
}

#[test]
fn rebuilding_an_engine_invalidates_observations_before_registry_lookup() -> TestResult {
    let caret = collapsed(text_point(1, Affinity::After)?);
    let engine = engine("engine-instance-guard", "a", Some(caret), None)?;
    let obsolete = engine.observation();
    let (session, _) = engine.into_parts();
    let mut rebuilt = EditorEngine::new(session, breditor_core::action::ActionRegistry::default());
    assert_eq!(obsolete.snapshot(), rebuilt.state().snapshot());
    assert_eq!(obsolete.history_status(), &rebuilt.session().history_status());
    assert_ne!(obsolete, rebuilt.observation());
    let state_before = rebuilt.state().clone();
    let history_before = rebuilt.session().history_status();

    let error = require_engine_error(
        rebuilt.execute_action(&obsolete, &insert_invocation("b")?),
        "observation from consumed engine crossed into replacement registry",
    )?;

    assert_stale_engine(&error);
    assert_eq!(rebuilt.state(), &state_before);
    assert_eq!(rebuilt.session().history_status(), history_before);
    Ok(())
}
