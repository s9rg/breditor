//! Heading mutations must be durable before the live owner publishes them.
#![cfg(feature = "experimental-structural-properties")]

use std::error::Error;

use breditor_core::{
    action::{
        ActionId, ActionInput, ActionInvocation, ActionRegistration, ActionRegistry, ActionValue,
        builtins::{
            InsertTextBlockBreakAction, InsertTextBlockTextAction, SetTextBlockKindAction,
            insert_text_block_break_action_id, insert_text_block_text_action_id,
            insert_text_input_contract,
        },
    },
    block::{HeadingLevel, TextBlockKind},
    codec::{
        CodecErrorCode, DocumentJsonCodecV2, SessionCheckpointJsonCodecV5, SessionCheckpointLimits,
    },
    engine::{
        CheckpointedEditorEngine, CheckpointedEditorEngineError, CheckpointedEditorEngineErrorCode,
        EditorActionOutcome, EditorEngine,
    },
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::{EditorSession, HistoryCapacity},
    state::{EditorContext, EditorState, LineageId},
};
use proptest::prelude::*;
use serde_json::json;

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

fn context() -> TestResult<EditorContext> {
    let schema = CompiledSchema::try_compile_text_block_profile(
        SchemaId::new(
            QualifiedName::try_new("example/heading-engine")?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}

fn registry() -> TestResult<ActionRegistry> {
    Ok(ActionRegistry::try_new(vec![
        ActionRegistration::with_input(
            insert_text_block_text_action_id(),
            insert_text_input_contract(),
            InsertTextBlockTextAction,
        ),
        ActionRegistration::new(insert_text_block_break_action_id(), InsertTextBlockBreakAction),
        ActionRegistration::new(
            ActionId::try_new("example/heading-three")?,
            SetTextBlockKindAction::new(TextBlockKind::Heading(HeadingLevel::try_new(3)?)),
        ),
    ])?)
}

fn caret(offset: u32) -> TestResult<Selection> {
    let point = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: offset,
        affinity: Affinity::Before,
    };
    Ok(RangeSelection::new(point.clone(), point).into())
}

fn raw() -> TestResult<EditorEngine> {
    raw_with_limits(DocumentLimits::default())
}

fn raw_with_limits(limits: DocumentLimits) -> TestResult<EditorEngine> {
    let context = EditorContext::new(context()?.schema().clone(), limits);
    let source = json!({
        "format": "breditor/document", "formatVersion": 2,
        "schema": {"name": "example/heading-engine", "version": 1},
        "schemaFingerprint": context.schema().fingerprint().to_string(),
        "root": {
            "kind": "element", "type": "breditor/document", "entityId": null,
            "properties": {}, "children": [{
                "kind": "element", "type": "breditor/heading", "entityId": null,
                "properties": {"breditor/level": 2},
                "children": [{"kind": "text", "text": "a🙂b", "formats": []}]
            }]
        }
    });
    let document =
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&source.to_string())?;
    let state = EditorState::try_new(
        &context,
        LineageId::try_new("heading-engine")?,
        document,
        Some(caret(1)?),
        None,
    )?;
    Ok(EditorEngine::new(
        EditorSession::with_history_capacity(state, HistoryCapacity::try_new(8)?),
        registry()?,
    ))
}

fn guarded(limits: SessionCheckpointLimits) -> TestResult<CheckpointedEditorEngine> {
    Ok(CheckpointedEditorEngine::try_new_v5(raw()?, limits)?)
}

fn typing(text: &str) -> TestResult<ActionInvocation> {
    Ok(ActionInvocation::new(
        insert_text_block_text_action_id(),
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}

fn heading() -> TestResult<ActionInvocation> {
    Ok(ActionInvocation::without_input(ActionId::try_new("example/heading-three")?))
}

fn run(engine: &mut CheckpointedEditorEngine, action: &ActionInvocation) -> TestResult {
    assert!(matches!(
        engine.execute_action(&engine.observation(), action)?,
        EditorActionOutcome::Committed(_)
    ));
    exact(engine)
}

fn exact(engine: &CheckpointedEditorEngine) -> TestResult {
    assert_eq!(engine.session_checkpoint_format_version(), 5);
    let codec = SessionCheckpointJsonCodecV5::new(engine.state().context().clone())
        .with_limits(*engine.session_checkpoint_limits());
    assert_eq!(codec.encode(engine.session())?, engine.session_checkpoint_json());
    // A new context proves this is durable data rather than a same-owner shortcut.
    let reader = SessionCheckpointJsonCodecV5::new(context()?)
        .with_limits(*engine.session_checkpoint_limits());
    let restored = reader.decode(engine.session_checkpoint_json())?;
    same(restored.state(), engine.state());
    assert_eq!(restored.undo_depth(), engine.session().undo_depth());
    assert_eq!(restored.redo_depth(), engine.session().redo_depth());
    assert_eq!(reader.encode(&restored)?, engine.session_checkpoint_json());
    Ok(())
}

fn same(left: &EditorState, right: &EditorState) {
    assert_eq!(left.snapshot(), right.snapshot());
    assert_eq!(left.document(), right.document());
    assert_eq!(left.selection(), right.selection());
    assert_eq!(left.pending_formats(), right.pending_formats());
}

fn representation<T>(result: Result<T, CheckpointedEditorEngineError>) -> TestResult {
    let error = result.err().ok_or("candidate must fail checkpoint admission")?;
    assert_eq!(error.code(), CheckpointedEditorEngineErrorCode::SessionCheckpointRepresentation);
    assert!(error.checkpoint_codec_code().is_some());
    assert_eq!(error.editor_engine_code(), None);
    Ok(())
}

#[test]
fn v5_live_heading_operations_reload_and_replay_all_retained_cursors() -> TestResult {
    let mut engine = guarded(SessionCheckpointLimits::default())?;
    exact(&engine)?;
    run(&mut engine, &typing("X")?)?;
    run(&mut engine, &heading()?)?;
    run(&mut engine, &ActionInvocation::without_input(insert_text_block_break_action_id()))?;
    assert_eq!(engine.session().undo_depth(), 3);
    let expected = engine.state().clone();
    for cursor in (0..=3).rev() {
        assert_eq!(engine.session().undo_depth(), cursor);
        exact(&engine)?;
        let restored_session = SessionCheckpointJsonCodecV5::new(context()?)
            .decode(engine.session_checkpoint_json())?;
        let mut restored = CheckpointedEditorEngine::try_new_v5(
            EditorEngine::new(restored_session, registry()?),
            SessionCheckpointLimits::default(),
        )?;
        assert!(restored.check_observation(&engine.observation()).is_err());
        while restored.session().can_redo() {
            let _ = restored.redo(&restored.observation())?.ok_or("redo absent")?;
            exact(&restored)?;
        }
        assert_eq!(restored.state().document(), expected.document());
        assert_eq!(restored.state().selection(), expected.selection());
        if cursor > 0 {
            let _ = engine.undo(&engine.observation())?.ok_or("undo absent")?;
        }
    }
    Ok(())
}

#[test]
fn v5_rejected_candidate_preserves_redo_selection_checkpoint_and_observation() -> TestResult {
    // One retained operation is legal; a second independent event is not.
    let limits = SessionCheckpointLimits::default().with_max_aggregate_forward_operations(1);
    let mut engine = guarded(limits)?;
    run(&mut engine, &typing("X")?)?;
    let before = engine.observation();
    let state = engine.state().clone();
    let json = engine.session_checkpoint_json().to_owned();
    representation(engine.execute_action_after_closing_history_group(&before, &heading()?))?;
    assert_eq!(engine.observation(), before);
    same(engine.state(), &state);
    assert_eq!(engine.session_checkpoint_json(), json);
    let _ = engine.undo(&before)?.ok_or("undo absent")?;
    exact(&engine)?;
    assert_eq!(engine.session().redo_depth(), 1);
    let before = engine.observation();
    // A selection-only update does not consume the retained-operation budget.
    let _ = engine.set_selection(&before, Some(caret(0)?))?.ok_or("selection absent")?;
    assert_eq!(engine.session().redo_depth(), 1);
    exact(&engine)?;
    let _ = engine.redo(&engine.observation())?.ok_or("redo absent")?;
    exact(&engine)?;
    assert_eq!(engine.state().document(), state.document());
    Ok(())
}

#[test]
fn v5_zero_operation_budget_rejects_all_heading_primitive_families_atomically() -> TestResult {
    let limits = SessionCheckpointLimits::default().with_max_aggregate_forward_operations(0);
    for action in [
        typing("X")?,
        heading()?,
        ActionInvocation::without_input(insert_text_block_break_action_id()),
    ] {
        let mut engine = guarded(limits)?;
        let before = engine.observation();
        let state = engine.state().clone();
        let checkpoint = engine.session_checkpoint_json().to_owned();
        representation(engine.execute_action(&before, &action))?;
        assert_eq!(engine.observation(), before);
        same(engine.state(), &state);
        assert_eq!(engine.session_checkpoint_json(), checkpoint);
        assert_eq!(engine.session().undo_depth(), 0);
        assert_eq!(engine.session().redo_depth(), 0);
        exact(&engine)?;
    }
    Ok(())
}

#[test]
fn v5_failed_edit_at_redo_frontier_does_not_discard_saved_future() -> TestResult {
    let limits = SessionCheckpointLimits::default().with_max_retained_text_bytes(32);
    let mut engine = guarded(limits)?;
    run(&mut engine, &typing("X")?)?;
    let _ = engine.undo(&engine.observation())?.ok_or("undo absent")?;
    let before = engine.observation();
    let state = engine.state().clone();
    let checkpoint = engine.session_checkpoint_json().to_owned();
    representation(engine.execute_action(&before, &typing(&"Q".repeat(40))?))?;
    assert_eq!(engine.observation(), before);
    same(engine.state(), &state);
    assert_eq!(engine.session_checkpoint_json(), checkpoint);
    assert_eq!(engine.session().redo_depth(), 1);
    let _ = engine.redo(&before)?.ok_or("saved future lost")?;
    exact(&engine)
}

#[test]
fn v5_history_boundaries_selection_noops_and_clear_refresh_exact_cached_bytes() -> TestResult {
    let mut engine = guarded(SessionCheckpointLimits::default())?;
    run(&mut engine, &typing("X")?)?;
    let _ = engine.close_history_group(&engine.observation())?.ok_or("boundary absent")?;
    exact(&engine)?;
    let before = engine.observation();
    let checkpoint = engine.session_checkpoint_json().to_owned();
    assert!(engine.close_history_group(&before)?.is_none());
    assert!(engine.set_selection(&before, engine.state().selection().cloned())?.is_none());
    assert_eq!(engine.observation(), before);
    assert_eq!(engine.session_checkpoint_json(), checkpoint);
    run(&mut engine, &heading()?)?;
    let _ = engine.undo_after_closing_history_group(&engine.observation())?;
    exact(&engine)?;
    let _ = engine.redo_after_closing_history_group(&engine.observation())?;
    exact(&engine)?;
    let _ = engine.clear_history(&engine.observation())?.ok_or("clear absent")?;
    exact(&engine)?;
    assert_eq!(engine.session().undo_depth(), 0);
    assert_eq!(engine.session().redo_depth(), 0);
    assert!(engine.clear_history(&engine.observation())?.is_none());
    Ok(())
}

#[test]
fn v5_failed_construction_never_returns_a_partial_owner() -> TestResult {
    representation(CheckpointedEditorEngine::try_new_v5(
        raw()?,
        SessionCheckpointLimits::default().with_max_retained_nodes(0),
    ))?;
    Ok(())
}

#[test]
fn older_owner_never_silently_upgrades_for_heading_edits() -> TestResult {
    let mut engine =
        CheckpointedEditorEngine::try_new_v3(raw()?, SessionCheckpointLimits::default())?;
    assert_eq!(engine.session_checkpoint_format_version(), 3);
    let before = engine.observation();
    let checkpoint = engine.session_checkpoint_json().to_owned();
    representation(engine.execute_action(&before, &typing("X")?))?;
    assert_eq!(engine.session_checkpoint_format_version(), 3);
    assert_eq!(engine.observation(), before);
    assert_eq!(engine.session_checkpoint_json(), checkpoint);
    Ok(())
}

#[test]
fn v5_exact_output_ceiling_rejects_candidate_but_keeps_the_owner_usable() -> TestResult {
    let size = guarded(SessionCheckpointLimits::default())?.session_checkpoint_json().len();
    let limits = DocumentLimits::default().with_max_json_bytes(size);
    let mut engine = CheckpointedEditorEngine::try_new_v5(
        raw_with_limits(limits)?,
        SessionCheckpointLimits::default(),
    )?;
    assert_eq!(engine.session_checkpoint_json().len(), size);
    let before = engine.observation();
    let checkpoint = engine.session_checkpoint_json().to_owned();
    let error = engine.execute_action(&before, &typing("X")?).err().ok_or("output limit")?;
    assert_eq!(error.checkpoint_codec_code(), Some(CodecErrorCode::OutputTooLarge));
    assert_eq!(engine.observation(), before);
    assert_eq!(engine.session_checkpoint_json(), checkpoint);
    exact(&engine)?;
    assert!(engine.set_selection(&before, engine.state().selection().cloned())?.is_none());
    representation(CheckpointedEditorEngine::try_new_v5(
        raw_with_limits(DocumentLimits::default().with_max_json_bytes(size - 1))?,
        SessionCheckpointLimits::default(),
    ))?;
    Ok(())
}

#[test]
fn v5_stale_observation_cannot_publish_even_when_the_checkpoint_budget_would_also_fail()
-> TestResult {
    let mut engine =
        guarded(SessionCheckpointLimits::default().with_max_aggregate_forward_operations(1))?;
    let stale = engine.observation();
    run(&mut engine, &typing("X")?)?;
    let before = engine.observation();
    let checkpoint = engine.session_checkpoint_json().to_owned();
    let error = engine.execute_action(&stale, &heading()?).err().ok_or("stale observation")?;
    assert_eq!(error.code(), CheckpointedEditorEngineErrorCode::EditorEngine);
    assert_eq!(error.checkpoint_codec_code(), None);
    assert_eq!(engine.observation(), before);
    assert_eq!(engine.session_checkpoint_json(), checkpoint);
    exact(&engine)
}

fn randomized_history(commands: &[(u8, String)], operation_budget: u64) -> TestResult {
    let mut engine = guarded(
        SessionCheckpointLimits::default().with_max_aggregate_forward_operations(operation_budget),
    )?;
    for (command, text) in commands {
        let before = engine.observation();
        let state = engine.state().clone();
        let checkpoint = engine.session_checkpoint_json().to_owned();
        let result = match command {
            0 => engine.execute_action(&before, &typing(text)?).map(|_| ()),
            1 => engine.execute_action(&before, &heading()?).map(|_| ()),
            2 => engine
                .execute_action(
                    &before,
                    &ActionInvocation::without_input(insert_text_block_break_action_id()),
                )
                .map(|_| ()),
            3 => engine.undo(&before).map(|_| ()),
            4 => engine.redo(&before).map(|_| ()),
            5 => engine.close_history_group(&before).map(|_| ()),
            6 => engine.clear_history(&before).map(|_| ()),
            _ => engine
                .execute_action_after_closing_history_group(&before, &typing(text)?)
                .map(|_| ()),
        };
        if result.is_err() {
            representation(result)?;
            assert_eq!(engine.observation(), before);
            same(engine.state(), &state);
            assert_eq!(engine.session_checkpoint_json(), checkpoint);
        }
        exact(&engine)?;
    }
    Ok(())
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 128, .. ProptestConfig::default() })]
    #[test]
    fn v5_randomized_publications_always_reload_or_preserve_the_exact_old_owner(
        commands in prop::collection::vec((0_u8..8, "[a-z🙂é]{1,4}"), 1..32),
        operation_budget in 0_u64..8,
    ) {
        randomized_history(&commands, operation_budget)
            .map_err(|error| TestCaseError::fail(error.to_string()))?;
    }
}
