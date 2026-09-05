//! Black-box contracts for failure-atomic checkpoint-constrained publication.

use std::{error::Error, fmt::Display, io};

use breditor_core::{
    action::{
        ActionInput, ActionInvocation, ActionValue,
        builtins::{insert_text_action_id, insert_text_input_contract, toggle_strong_action_id},
    },
    codec::{
        CodecErrorCode, DocumentJsonCodec, SessionCheckpointJsonCodec, SessionCheckpointLimits,
    },
    engine::{
        CheckpointedEditorEngine, CheckpointedEditorEngineError, CheckpointedEditorEngineErrorCode,
        EditorActionOutcome, EditorEngine, EditorEngineErrorCode, EditorEngineEventKind,
    },
    position::{Affinity, NodePath, Point},
    schema::DocumentLimits,
    selection::{RangeSelection, Selection},
    session::{EditorSession, HistoryCapacity},
    state::{EditorContext, EditorState, LineageId},
};
use proptest::{
    prelude::*,
    test_runner::{Config, TestCaseError},
};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

fn document_json(text: &str) -> String {
    serde_json::json!({
        "format": "breditor/document",
        "formatVersion": 1,
        "schema": { "name": "breditor/base", "version": 1 },
        "root": {
            "kind": "element",
            "type": "breditor/document",
            "entityId": null,
            "properties": {},
            "children": [{
                "kind": "element",
                "type": "breditor/paragraph",
                "entityId": null,
                "properties": {},
                "children": if text.is_empty() {
                    Vec::<serde_json::Value>::new()
                } else {
                    vec![serde_json::json!({
                        "kind": "text",
                        "text": text,
                        "formats": [],
                    })]
                },
            }],
        },
    })
    .to_string()
}

fn collapsed(offset: u32) -> TestResult<Selection> {
    let point = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: offset,
        affinity: Affinity::After,
    };
    Ok(RangeSelection::new(point.clone(), point).into())
}

fn engine(
    context: &EditorContext,
    lineage: &str,
    text: &str,
    selection: Option<Selection>,
    capacity: HistoryCapacity,
) -> TestResult<EditorEngine> {
    let decoding_context = EditorContext::default();
    let document = DocumentJsonCodec::new(decoding_context.schema().clone())
        .with_limits(decoding_context.limits().clone())
        .decode(&document_json(text))?;
    let state =
        EditorState::try_new(context, LineageId::try_new(lineage)?, document, selection, None)?;
    Ok(EditorEngine::try_with_base_actions(EditorSession::with_history_capacity(state, capacity))?)
}

fn insert(text: &str) -> TestResult<ActionInvocation> {
    Ok(ActionInvocation::new(
        insert_text_action_id(),
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}

fn checkpointed(
    context: &EditorContext,
    lineage: &str,
    text: &str,
    selection: Option<Selection>,
    capacity: HistoryCapacity,
) -> TestResult<CheckpointedEditorEngine> {
    Ok(CheckpointedEditorEngine::try_new(
        engine(context, lineage, text, selection, capacity)?,
        SessionCheckpointLimits::default(),
    )?)
}

fn assert_cached_checkpoint_is_exact(engine: &CheckpointedEditorEngine) -> TestResult {
    let encoded = SessionCheckpointJsonCodec::new(engine.state().context().clone())
        .with_limits(*engine.session_checkpoint_limits())
        .encode(engine.session())?;
    assert_eq!(engine.session_checkpoint_json(), encoded);
    Ok(())
}

fn require_checkpoint_error<T: std::fmt::Debug>(
    result: Result<T, CheckpointedEditorEngineError>,
) -> TestResult<CheckpointedEditorEngineError> {
    match result {
        Err(error) => Ok(error),
        Ok(value) => Err(io::Error::other(format!("expected failure, got {value:?}")).into()),
    }
}

fn property_config() -> Config {
    Config { cases: 48, max_shrink_iters: 1_024, ..Config::default() }
}

fn test_failure(error: impl Display) -> TestCaseError {
    TestCaseError::fail(error.to_string())
}

#[test]
fn every_effective_path_refreshes_the_exact_checkpoint_and_noops_reuse_it() -> TestResult {
    let context = EditorContext::default();
    let capacity = HistoryCapacity::try_new(8)?;
    let mut engine =
        checkpointed(&context, "checkpointed-all-paths", "a", Some(collapsed(1)?), capacity)?;
    assert_cached_checkpoint_is_exact(&engine)?;

    let initial = engine.observation();
    let inserted = engine.execute_action(&initial, &insert("b")?)?;
    assert!(matches!(inserted, EditorActionOutcome::Committed(_)));
    assert_cached_checkpoint_is_exact(&engine)?;

    let before_close = engine.observation();
    let close = engine
        .close_history_group(&before_close)?
        .ok_or_else(|| io::Error::other("typing group was not open"))?;
    assert_eq!(close.kind(), EditorEngineEventKind::CloseHistoryGroup);
    assert_cached_checkpoint_is_exact(&engine)?;
    let closed_json = engine.session_checkpoint_json().to_owned();
    let after_close = engine.observation();
    assert!(engine.close_history_group(&after_close)?.is_none());
    assert_eq!(engine.session_checkpoint_json(), closed_json);

    let undo =
        engine.undo(&after_close)?.ok_or_else(|| io::Error::other("undo was unavailable"))?;
    assert_eq!(undo.kind(), EditorEngineEventKind::Undo);
    assert_cached_checkpoint_is_exact(&engine)?;
    let after_undo = engine.observation();
    let redo = engine.redo(&after_undo)?.ok_or_else(|| io::Error::other("redo was unavailable"))?;
    assert_eq!(redo.kind(), EditorEngineEventKind::Redo);
    assert_cached_checkpoint_is_exact(&engine)?;

    let after_redo = engine.observation();
    let selection = engine
        .set_selection(&after_redo, Some(collapsed(0)?))?
        .ok_or_else(|| io::Error::other("selection change was ignored"))?;
    assert_eq!(selection.kind(), EditorEngineEventKind::Selection);
    assert_cached_checkpoint_is_exact(&engine)?;
    let selection_json = engine.session_checkpoint_json().to_owned();
    let after_selection = engine.observation();
    assert!(engine.set_selection(&after_selection, Some(collapsed(0)?))?.is_none());
    assert_eq!(engine.session_checkpoint_json(), selection_json);

    let cleared = engine
        .clear_history(&after_selection)?
        .ok_or_else(|| io::Error::other("history clear was ineffective"))?;
    assert_eq!(cleared.kind(), EditorEngineEventKind::ClearHistory);
    assert_cached_checkpoint_is_exact(&engine)?;
    let cleared_json = engine.session_checkpoint_json().to_owned();
    let after_clear = engine.observation();
    assert!(engine.clear_history(&after_clear)?.is_none());
    assert!(engine.undo(&after_clear)?.is_none());
    assert!(engine.redo(&after_clear)?.is_none());
    assert_eq!(engine.session_checkpoint_json(), cleared_json);
    Ok(())
}

#[test]
fn disabled_and_erroneous_actions_preserve_owner_observation_and_cached_bytes() -> TestResult {
    let context = EditorContext::default();
    let mut engine = checkpointed(
        &context,
        "checkpointed-no-publication",
        "private-disabled-text",
        None,
        HistoryCapacity::default(),
    )?;
    let before = engine.state().clone();
    let observation = engine.observation();
    let checkpoint = engine.session_checkpoint_json().to_owned();

    let disabled = engine.execute_action(
        &observation,
        &ActionInvocation::without_input(toggle_strong_action_id()),
    )?;
    let EditorActionOutcome::Disabled(disabled) = disabled else {
        return Err(io::Error::other("toggle was unexpectedly enabled").into());
    };
    assert_eq!(disabled.observation(), &observation);
    assert_eq!(engine.state(), &before);
    assert_eq!(engine.observation(), observation);
    assert_eq!(engine.session_checkpoint_json(), checkpoint);
    engine.check_observation(disabled.observation())?;

    let invalid = ActionInvocation::without_input(breditor_core::action::ActionId::try_new(
        "test/missing-checkpointed-action",
    )?);
    let error = require_checkpoint_error(engine.execute_action(&observation, &invalid))?;
    assert_eq!(error.code(), CheckpointedEditorEngineErrorCode::EditorEngine);
    assert_eq!(error.editor_engine_code(), Some(EditorEngineErrorCode::ActionPreparation));
    assert_eq!(
        error.editor_engine_error().map(breditor_core::engine::EditorEngineError::code),
        Some(EditorEngineErrorCode::ActionPreparation)
    );
    assert_eq!(error.checkpoint_codec_code(), None);
    assert_eq!(engine.state(), &before);
    assert_eq!(engine.observation(), observation);
    assert_eq!(engine.session_checkpoint_json(), checkpoint);
    assert!(!format!("{error:?}").contains("private-disabled-text"));
    Ok(())
}

#[test]
fn tight_output_limit_rejects_action_before_publication_even_without_history() -> TestResult {
    const PRIVATE_INSERT: &str = "private-candidate-payload";
    let defaults = EditorContext::default();
    let disabled_history = HistoryCapacity::DISABLED;
    let baseline = checkpointed(
        &defaults,
        "checkpointed-tight-000",
        "a",
        Some(collapsed(1)?),
        disabled_history,
    )?;
    let initial_bytes = baseline.session_checkpoint_json().len();
    let mut expanded = baseline;
    let expected = expanded.observation();
    let _ = expanded.execute_action(&expected, &insert(PRIVATE_INSERT)?)?;
    let expanded_bytes = expanded.session_checkpoint_json().len();
    assert!(expanded_bytes > initial_bytes);

    let maximum = expanded_bytes - 1;
    assert!(maximum >= initial_bytes);
    let tight_context = EditorContext::new(
        defaults.schema().clone(),
        DocumentLimits::default().with_max_json_bytes(maximum),
    );
    let mut engine = checkpointed(
        &tight_context,
        "checkpointed-tight-001",
        "a",
        Some(collapsed(1)?),
        disabled_history,
    )?;
    let before_state = engine.state().clone();
    let before_history = engine.session().history_status();
    let before_observation = engine.observation();
    let before_checkpoint = engine.session_checkpoint_json().to_owned();

    let error = require_checkpoint_error(
        engine.execute_action(&before_observation, &insert(PRIVATE_INSERT)?),
    )?;
    assert_eq!(error.code(), CheckpointedEditorEngineErrorCode::SessionCheckpointRepresentation);
    assert_eq!(error.editor_engine_code(), None);
    assert_eq!(error.checkpoint_codec_code(), Some(CodecErrorCode::OutputTooLarge));
    assert_eq!(engine.state(), &before_state);
    assert_eq!(engine.session().history_status(), before_history);
    assert_eq!(engine.observation(), before_observation);
    assert_eq!(engine.session_checkpoint_json(), before_checkpoint);
    engine.check_observation(&before_observation)?;
    assert!(engine.undo(&before_observation)?.is_none());
    assert!(!format!("{error:?}").contains(PRIVATE_INSERT));
    assert!(!error.to_string().contains(PRIVATE_INSERT));
    Ok(())
}

#[test]
fn construction_rejects_an_initial_session_outside_the_checkpoint_boundary() -> TestResult {
    let defaults = EditorContext::default();
    let baseline = checkpointed(
        &defaults,
        "checkpointed-construct-000",
        "private-initial-payload",
        None,
        HistoryCapacity::DISABLED,
    )?;
    let maximum = baseline
        .session_checkpoint_json()
        .len()
        .checked_sub(1)
        .ok_or_else(|| io::Error::other("checkpoint was unexpectedly empty"))?;
    let tight_context = EditorContext::new(
        defaults.schema().clone(),
        DocumentLimits::default().with_max_json_bytes(maximum),
    );
    let unguarded = engine(
        &tight_context,
        "checkpointed-construct-001",
        "private-initial-payload",
        None,
        HistoryCapacity::DISABLED,
    )?;
    let error = require_checkpoint_error(CheckpointedEditorEngine::try_new(
        unguarded,
        SessionCheckpointLimits::default(),
    ))?;

    assert_eq!(error.code(), CheckpointedEditorEngineErrorCode::SessionCheckpointRepresentation);
    assert_eq!(error.checkpoint_codec_code(), Some(CodecErrorCode::OutputTooLarge));
    assert!(!format!("{error:?}").contains("private-initial-payload"));
    Ok(())
}

#[test]
fn aggregate_operation_limit_rejects_a_later_history_entry_atomically() -> TestResult {
    let context = EditorContext::default();
    let raw = engine(
        &context,
        "checkpointed-resource-limit",
        "a",
        Some(collapsed(1)?),
        HistoryCapacity::try_new(8)?,
    )?;
    let limits = SessionCheckpointLimits::default().with_max_aggregate_forward_operations(1);
    let mut engine = CheckpointedEditorEngine::try_new(raw, limits)?;

    let first_observation = engine.observation();
    assert!(matches!(
        engine.execute_action(&first_observation, &insert("b")?)?,
        EditorActionOutcome::Committed(_)
    ));
    let before_close = engine.observation();
    assert!(engine.close_history_group(&before_close)?.is_some());

    let before_state = engine.state().clone();
    let before_history = engine.session().history_status();
    let before_observation = engine.observation();
    let before_checkpoint = engine.session_checkpoint_json().to_owned();
    let error = require_checkpoint_error(
        engine.execute_action(&before_observation, &insert("private-second-entry")?),
    )?;

    assert_eq!(error.code(), CheckpointedEditorEngineErrorCode::SessionCheckpointRepresentation);
    assert_eq!(error.checkpoint_codec_code(), Some(CodecErrorCode::ResourceLimit));
    assert_eq!(engine.state(), &before_state);
    assert_eq!(engine.session().history_status(), before_history);
    assert_eq!(engine.observation(), before_observation);
    assert_eq!(engine.session_checkpoint_json(), before_checkpoint);
    engine.check_observation(&before_observation)?;
    assert!(!format!("{error:?}").contains("private-second-entry"));

    let undo = engine
        .undo(&before_observation)?
        .ok_or_else(|| io::Error::other("admitted first history entry was not undoable"))?;
    assert_eq!(undo.kind(), EditorEngineEventKind::Undo);
    assert_cached_checkpoint_is_exact(&engine)?;
    Ok(())
}

#[test]
fn output_limit_rejects_selection_change_without_publishing() -> TestResult {
    let defaults = EditorContext::default();
    let capacity = HistoryCapacity::DISABLED;
    let mut baseline = checkpointed(&defaults, "checkpointed-selection-base", "a", None, capacity)?;
    let initial_bytes = baseline.session_checkpoint_json().len();
    let baseline_observation = baseline.observation();
    assert!(baseline.set_selection(&baseline_observation, Some(collapsed(1)?))?.is_some());
    let selected_bytes = baseline.session_checkpoint_json().len();
    assert!(selected_bytes > initial_bytes);

    let maximum = selected_bytes - 1;
    assert!(maximum >= initial_bytes);
    let tight_context = EditorContext::new(
        defaults.schema().clone(),
        DocumentLimits::default().with_max_json_bytes(maximum),
    );
    let mut engine =
        checkpointed(&tight_context, "checkpointed-selection-live", "a", None, capacity)?;
    let before_state = engine.state().clone();
    let before_observation = engine.observation();
    let before_checkpoint = engine.session_checkpoint_json().to_owned();
    let error =
        require_checkpoint_error(engine.set_selection(&before_observation, Some(collapsed(1)?)))?;

    assert_eq!(error.checkpoint_codec_code(), Some(CodecErrorCode::OutputTooLarge));
    assert_eq!(engine.state(), &before_state);
    assert_eq!(engine.observation(), before_observation);
    assert_eq!(engine.session_checkpoint_json(), before_checkpoint);
    engine.check_observation(&before_observation)?;
    Ok(())
}

proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn generated_command_sequences_never_diverge_from_the_cached_checkpoint(
        commands in prop::collection::vec(0_u8..6, 0..40),
    ) {
        let context = EditorContext::default();
        let mut engine = checkpointed(
            &context,
            "checkpointed-generated-sequence",
            "a",
            Some(collapsed(1).map_err(test_failure)?),
            HistoryCapacity::try_new(4).map_err(test_failure)?,
        )
        .map_err(test_failure)?;

        for command in commands {
            let expected = engine.observation();
            let before = engine.session_checkpoint_json().to_owned();
            let effective = match command {
                0 => engine
                    .execute_action(&expected, &insert("x").map_err(test_failure)?)
                    .map_err(test_failure)?
                    .event()
                    .is_some(),
                1 => engine.undo(&expected).map_err(test_failure)?.is_some(),
                2 => engine.redo(&expected).map_err(test_failure)?.is_some(),
                3 => engine.close_history_group(&expected).map_err(test_failure)?.is_some(),
                4 => engine.clear_history(&expected).map_err(test_failure)?.is_some(),
                _ => {
                    let selection = engine.state().selection().cloned();
                    engine
                        .set_selection(&expected, selection)
                        .map_err(test_failure)?
                        .is_some()
                }
            };

            let fresh = SessionCheckpointJsonCodec::new(engine.state().context().clone())
                .with_limits(*engine.session_checkpoint_limits())
                .encode(engine.session())
                .map_err(test_failure)?;
            prop_assert_eq!(engine.session_checkpoint_json(), fresh);
            if !effective {
                prop_assert_eq!(engine.session_checkpoint_json(), before);
                engine.check_observation(&expected).map_err(test_failure)?;
            }
        }
    }
}
