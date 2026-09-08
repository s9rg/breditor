//! Black-box contracts for profile-owned engine generation and descriptors.

mod support;

use std::{error::Error, io};

use breditor_core::{
    action::{
        ActionActivation, ActionId, ActionInput, ActionInvocation, ActionStateCache, ActionStateId,
        ActionValue,
        builtins::{
            FORMAT_STRONG_INTENT_NAME, format_strong_intent_id, insert_text_action_id,
            insert_text_input_contract, toggle_strong_action_id,
        },
        routing::{BindingId, IntentExecutionOutcome, IntentId, IntentInvocation},
    },
    codec::{
        CodecErrorCode, DocumentJsonCodec, DocumentJsonCodecV2, SESSION_CHECKPOINT_FORMAT_VERSION,
        SESSION_CHECKPOINT_V2_FORMAT_VERSION, SessionCheckpointJsonCodec,
        SessionCheckpointJsonCodecV2, SessionCheckpointLimits,
    },
    engine::{
        CheckpointedEditorEngine, CheckpointedEditorEngineError, CheckpointedEditorEngineErrorCode,
        EditorEngine, EditorEngineError, EditorEngineErrorCode, EditorEngineProfileError,
    },
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatSpecV1, InlineFormatToggleSpecV1,
    },
    identity::QualifiedName,
    position::{Affinity, Point},
    profile::{CompiledEditorProfile, CompiledProfileActionStateSource},
    schema::{DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::ReplayDirection,
};
use serde_json::json;
use support::{TestResult, path, test_error};

const FORMAT: &str = "example/highlight";
const ACTION: &str = "example/toggle-highlight";
const INTENT: &str = "example/toggle-highlight-intent";
const BINDING: &str = "example/toggle-highlight-binding";
const ACTION_STATE: &str = "example/highlight-control";

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn compiled_profile() -> Result<CompiledEditorProfile, Box<dyn Error>> {
    let extension_id =
        ExtensionId::new(name("example/highlight-extension")?, ExtensionVersion::one());
    let format = InlineFormatSpecV1::new(name(FORMAT)?, PersistedTypeRevision::try_new(7)?);
    let toggle = InlineFormatToggleSpecV1::new(
        name(FORMAT)?,
        ActionId::try_new(ACTION)?,
        IntentId::try_new(INTENT)?,
        BindingId::try_new(BINDING)?,
        ActionStateId::try_new(ACTION_STATE)?,
    );
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_toggles(
        extension_id,
        Vec::new(),
        Vec::new(),
        vec![format],
        vec![toggle],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    let schema_id = SchemaId::new(name("example/profiled-engine")?, SchemaVersion::try_new(1)?);
    CompiledEditorProfile::try_compile_base_text_profile(schema_id, extensions).map_err(Into::into)
}

fn document_json(profile: &CompiledEditorProfile, text: &str) -> String {
    json!({
        "format": "breditor/document",
        "formatVersion": 2,
        "schema": {
            "name": profile.schema().id().name().as_str(),
            "version": profile.schema().id().version().get(),
        },
        "schemaFingerprint": profile.schema().fingerprint().to_string(),
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
                "children": [{
                    "kind": "text",
                    "text": text,
                    "formats": [],
                }],
            }],
        },
    })
    .to_string()
}

fn selected_text() -> Result<Selection, Box<dyn Error>> {
    Ok(RangeSelection::new(
        Point::Text { text_path: path(&[0, 0])?, utf16_offset: 0, affinity: Affinity::Before },
        Point::Text { text_path: path(&[0, 0])?, utf16_offset: 3, affinity: Affinity::After },
    )
    .into())
}

fn profiled_state(
    profile: &CompiledEditorProfile,
    limits: DocumentLimits,
    lineage: &str,
    selection: Option<Selection>,
) -> Result<EditorState, Box<dyn Error>> {
    let context = profile.editor_context(limits);
    let document = DocumentJsonCodecV2::new(profile.schema().clone())
        .decode(&document_json(profile, "abc"))?;
    EditorState::try_new(&context, LineageId::try_new(lineage)?, document, selection, None)
        .map_err(Into::into)
}

fn profiled_engine(
    profile: CompiledEditorProfile,
    limits: DocumentLimits,
    lineage: &str,
    selection: Option<Selection>,
) -> Result<EditorEngine, Box<dyn Error>> {
    let state = profiled_state(&profile, limits, lineage, selection)?;
    EditorEngine::try_with_compiled_profile(EditorSession::new(state), profile).map_err(Into::into)
}

fn unprofiled_engine(
    lineage: &str,
    selection: Option<Selection>,
) -> Result<EditorEngine, Box<dyn Error>> {
    let context = EditorContext::default();
    let document =
        DocumentJsonCodec::new(context.schema().clone()).decode(&support::document_json(&[
            support::paragraph(&[support::text_node("abc", false)]),
        ]))?;
    let state =
        EditorState::try_new(&context, LineageId::try_new(lineage)?, document, selection, None)?;
    EditorEngine::try_with_base_actions(EditorSession::new(state)).map_err(Into::into)
}

fn insert_text(text: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(
        insert_text_action_id(),
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}

fn require_engine_error<T: std::fmt::Debug>(
    result: Result<T, EditorEngineError>,
) -> Result<EditorEngineError, Box<dyn Error>> {
    match result {
        Err(error) => Ok(error),
        Ok(value) => Err(test_error(format!("expected engine failure, got {value:?}")).into()),
    }
}

fn require_checkpoint_error<T: std::fmt::Debug>(
    result: Result<T, CheckpointedEditorEngineError>,
) -> Result<CheckpointedEditorEngineError, Box<dyn Error>> {
    match result {
        Err(error) => Ok(error),
        Ok(value) => Err(test_error(format!("expected checkpoint failure, got {value:?}")).into()),
    }
}

#[test]
fn descriptor_is_owned_canonical_and_complete() -> TestResult {
    let profile = compiled_profile()?;
    let descriptor = profile.descriptor().clone();

    assert_eq!(descriptor.generation(), profile.generation());
    assert_eq!(descriptor.schema_binding(), &profile.schema().durable_binding());
    assert_eq!(
        descriptor
            .inline_formats()
            .iter()
            .map(|format| (format.kind().as_str(), format.revision().get()))
            .collect::<Vec<_>>(),
        vec![("breditor/strong", 1), (FORMAT, 7)],
    );
    assert_eq!(
        descriptor.inline_format(&name(FORMAT)?).map(|format| format.revision().get()),
        Some(7),
    );
    assert!(descriptor.inline_format(&name("example/missing")?).is_none());

    let intents = descriptor.intents();
    assert_eq!(intents.len(), 2);
    assert_eq!(intents[0].id().as_str(), FORMAT_STRONG_INTENT_NAME);
    assert_eq!(intents[1].id().as_str(), INTENT);
    for intent in intents {
        assert!(intent.input_contract().is_none());
        assert!(intent.state_contract().supports_activation());
    }

    let states = descriptor.action_states();
    assert_eq!(
        states.iter().map(|state| state.id().as_str()).collect::<Vec<_>>(),
        vec![
            "breditor/control-bold",
            "breditor/control-redo",
            "breditor/control-undo",
            ACTION_STATE,
        ],
    );
    assert!(matches!(
        states[0].source(),
        CompiledProfileActionStateSource::Routed(intent)
            if intent == &format_strong_intent_id()
    ));
    assert!(matches!(
        states[1].source(),
        CompiledProfileActionStateSource::History(ReplayDirection::Redo)
    ));
    assert!(matches!(
        states[2].source(),
        CompiledProfileActionStateSource::History(ReplayDirection::Undo)
    ));
    assert!(matches!(
        states[3].source(),
        CompiledProfileActionStateSource::Routed(intent) if intent.as_str() == INTENT
    ));
    assert!(states[3].contract().supports_activation());
    assert_eq!(descriptor.intent(&IntentId::try_new(INTENT)?), Some(&intents[1]),);
    assert_eq!(descriptor.action_state(&ActionStateId::try_new(ACTION_STATE)?), Some(&states[3]),);
    Ok(())
}

#[test]
fn profile_constructor_and_observation_guards_preserve_two_identity_layers() -> TestResult {
    let profile = compiled_profile()?;
    let clone = profile.clone();
    assert!(std::ptr::eq(profile.descriptor(), clone.descriptor()));
    let first = profiled_engine(profile, DocumentLimits::default(), "profile-guard-first", None)?;
    let second = profiled_engine(clone, DocumentLimits::default(), "profile-guard-second", None)?;
    assert_eq!(first.profile_generation(), second.profile_generation());
    let same_generation_foreign_engine = second.observation();
    assert_eq!(
        first.check_observation(&same_generation_foreign_engine),
        Err(EditorEngineError::StaleEngine),
    );

    let independent = profiled_engine(
        compiled_profile()?,
        DocumentLimits::default(),
        "profile-guard-independent",
        None,
    )?;
    assert_ne!(first.profile_generation(), independent.profile_generation());
    assert_eq!(
        first.check_observation(&independent.observation()),
        Err(EditorEngineError::ProfileGenerationMismatch),
    );
    Ok(())
}

#[test]
fn construction_rejects_missing_and_wrong_generation_before_schema_identity() -> TestResult {
    let profile = compiled_profile()?;
    let context = EditorContext::new(profile.schema().clone(), DocumentLimits::default());
    let document = DocumentJsonCodecV2::new(profile.schema().clone())
        .decode(&document_json(&profile, "abc"))?;
    let unprofiled = EditorState::try_new(
        &context,
        LineageId::try_new("profile-missing-generation")?,
        document,
        None,
        None,
    )?;
    assert!(matches!(
        EditorEngine::try_with_compiled_profile(EditorSession::new(unprofiled), profile.clone()),
        Err(EditorEngineProfileError::MissingGeneration)
    ));

    let other = compiled_profile()?;
    let wrong_generation =
        profiled_state(&other, DocumentLimits::default(), "profile-wrong-generation", None)?;
    assert!(matches!(
        EditorEngine::try_with_compiled_profile(EditorSession::new(wrong_generation), profile,),
        Err(EditorEngineProfileError::GenerationMismatch)
    ));
    Ok(())
}

#[test]
fn typed_intent_commits_or_blocks_with_indicator_and_successor_observation() -> TestResult {
    let mut committed = profiled_engine(
        compiled_profile()?,
        DocumentLimits::default(),
        "profile-intent-commit",
        Some(selected_text()?),
    )?;
    let expected = committed.observation();
    let outcome = committed
        .execute_intent(&expected, &IntentInvocation::without_input(IntentId::try_new(INTENT)?))?;
    assert!(matches!(outcome.execution(), IntentExecutionOutcome::Committed { .. }));
    assert!(outcome.is_committed());
    assert_eq!(outcome.observation(), &committed.observation());
    assert_eq!(outcome.observation().profile_generation(), committed.profile_generation());

    let mut blocked = profiled_engine(
        compiled_profile()?,
        DocumentLimits::default(),
        "profile-intent-blocked",
        None,
    )?;
    let expected = blocked.observation();
    let outcome = blocked
        .execute_intent(&expected, &IntentInvocation::without_input(IntentId::try_new(INTENT)?))?;
    assert!(!outcome.is_committed());
    assert_eq!(
        outcome.execution().blocked_reason().map(|reason| reason.code().as_str()),
        Some("breditor/no-selection")
    );
    assert_eq!(
        outcome
            .execution()
            .blocked_indicator()
            .map(breditor_core::action::ActionStateIndicator::activation),
        Some(ActionActivation::Inactive),
    );
    assert_eq!(outcome.observation(), &expected);

    let error = require_engine_error(blocked.execute_intent(
        &expected,
        &IntentInvocation::without_input(IntentId::try_new("example/unknown")?),
    ))?;
    assert_eq!(error.code(), EditorEngineErrorCode::IntentRouting);
    assert_eq!(blocked.observation(), expected);
    Ok(())
}

#[test]
fn exact_base_strong_intent_matches_direct_action_durable_bytes() -> TestResult {
    const BASE_FINGERPRINT: &str =
        "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
    let mut routed = profiled_engine(
        CompiledEditorProfile::try_compile_breditor_base()?,
        DocumentLimits::default(),
        "base-strong-equivalence",
        Some(selected_text()?),
    )?;
    let mut direct = profiled_engine(
        CompiledEditorProfile::try_compile_breditor_base()?,
        DocumentLimits::default(),
        "base-strong-equivalence",
        Some(selected_text()?),
    )?;
    assert_eq!(routed.state().context().schema().fingerprint().to_string(), BASE_FINGERPRINT);

    let expected = routed.observation();
    let outcome = routed
        .execute_intent(&expected, &IntentInvocation::without_input(format_strong_intent_id()))?;
    assert!(outcome.is_committed());
    let binding = outcome
        .execution()
        .binding()
        .ok_or_else(|| test_error("strong intent omitted its binding"))?;
    assert_eq!(binding.intent_id(), &format_strong_intent_id());
    assert_eq!(binding.action_id(), &toggle_strong_action_id());

    let expected = direct.observation();
    assert!(direct
        .execute_action(
            &expected,
            &ActionInvocation::without_input(toggle_strong_action_id()),
        )?
        .event()
        .is_some());

    assert_eq!(routed.state().snapshot(), direct.state().snapshot());
    assert_eq!(routed.state().document().root(), direct.state().document().root());
    assert_eq!(routed.state().selection(), direct.state().selection());
    assert_eq!(routed.state().pending_formats(), direct.state().pending_formats());
    let routed_v1_bytes = SessionCheckpointJsonCodec::new(routed.state().context().clone())
        .with_limits(SessionCheckpointLimits::default())
        .encode(routed.session())?;
    let direct_v1_bytes = SessionCheckpointJsonCodec::new(direct.state().context().clone())
        .with_limits(SessionCheckpointLimits::default())
        .encode(direct.session())?;
    assert_eq!(routed_v1_bytes, direct_v1_bytes);
    let routed_bytes = SessionCheckpointJsonCodecV2::new(routed.state().context().clone())
        .with_limits(SessionCheckpointLimits::default())
        .encode(routed.session())?;
    let direct_bytes = SessionCheckpointJsonCodecV2::new(direct.state().context().clone())
        .with_limits(SessionCheckpointLimits::default())
        .encode(direct.session())?;
    assert_eq!(routed_bytes, direct_bytes);
    Ok(())
}

#[test]
fn exact_base_strong_intent_matches_direct_action_at_a_collapsed_caret() -> TestResult {
    let caret =
        Point::Text { text_path: path(&[0, 0])?, utf16_offset: 1, affinity: Affinity::After };
    let selection = Some(RangeSelection::new(caret.clone(), caret).into());
    let mut routed = profiled_engine(
        CompiledEditorProfile::try_compile_breditor_base()?,
        DocumentLimits::default(),
        "base-strong-caret-equivalence",
        selection.clone(),
    )?;
    let mut direct = profiled_engine(
        CompiledEditorProfile::try_compile_breditor_base()?,
        DocumentLimits::default(),
        "base-strong-caret-equivalence",
        selection,
    )?;

    let expected = routed.observation();
    let outcome = routed
        .execute_intent(&expected, &IntentInvocation::without_input(format_strong_intent_id()))?;
    assert!(outcome.is_committed());

    let expected = direct.observation();
    assert!(
        direct
            .execute_action(
                &expected,
                &ActionInvocation::without_input(toggle_strong_action_id()),
            )?
            .event()
            .is_some()
    );

    assert_eq!(routed.state().snapshot(), direct.state().snapshot());
    assert_eq!(routed.state().document().root(), direct.state().document().root());
    assert_eq!(routed.state().selection(), direct.state().selection());
    assert!(routed.state().pending_formats().is_some());
    assert_eq!(routed.state().pending_formats(), direct.state().pending_formats());
    let routed_v1_bytes = SessionCheckpointJsonCodec::new(routed.state().context().clone())
        .with_limits(SessionCheckpointLimits::default())
        .encode(routed.session())?;
    let direct_v1_bytes = SessionCheckpointJsonCodec::new(direct.state().context().clone())
        .with_limits(SessionCheckpointLimits::default())
        .encode(direct.session())?;
    assert_eq!(routed_v1_bytes, direct_v1_bytes);
    let routed_v2_bytes = SessionCheckpointJsonCodecV2::new(routed.state().context().clone())
        .with_limits(SessionCheckpointLimits::default())
        .encode(routed.session())?;
    let direct_v2_bytes = SessionCheckpointJsonCodecV2::new(direct.state().context().clone())
        .with_limits(SessionCheckpointLimits::default())
        .encode(direct.session())?;
    assert_eq!(routed_v2_bytes, direct_v2_bytes);
    Ok(())
}

#[test]
fn unprofiled_intent_rejection_runs_after_observation_guards() -> TestResult {
    let invocation = IntentInvocation::without_input(IntentId::try_new(INTENT)?);
    let mut engine = unprofiled_engine("unprofiled-intent", Some(selected_text()?))?;
    let current = engine.observation();

    let error = require_engine_error(engine.execute_intent(&current, &invocation))?;
    assert_eq!(error, EditorEngineError::ProfileUnavailable);
    assert_eq!(error.code(), EditorEngineErrorCode::ProfileUnavailable);

    let foreign = unprofiled_engine("unprofiled-intent-foreign", Some(selected_text()?))?;
    let error = require_engine_error(engine.execute_intent(&foreign.observation(), &invocation))?;
    assert_eq!(error, EditorEngineError::StaleEngine);

    let action = engine.execute_action(&current, &insert_text("!")?)?;
    assert!(action.event().is_some());
    let error = require_engine_error(engine.execute_intent(&current, &invocation))?;
    assert!(matches!(error, EditorEngineError::StaleSnapshot { .. }));
    Ok(())
}

#[test]
fn profile_generation_survives_every_engine_mutation_kind() -> TestResult {
    let profile = compiled_profile()?;
    let generation = profile.generation().clone();
    let caret =
        Point::Text { text_path: path(&[0, 0])?, utf16_offset: 3, affinity: Affinity::After };
    let mut engine = profiled_engine(
        profile,
        DocumentLimits::default(),
        "profile-generation-mutations",
        Some(RangeSelection::new(caret.clone(), caret).into()),
    )?;
    assert_eq!(engine.observation().profile_generation(), Some(&generation));

    let expected = engine.observation();
    let action = engine.execute_action(&expected, &insert_text("!")?)?;
    let action = action.event().ok_or_else(|| test_error("insert-text action was disabled"))?;
    assert_eq!(action.observation().profile_generation(), Some(&generation));

    let expected = engine.observation();
    let close = engine
        .close_history_group(&expected)?
        .ok_or_else(|| test_error("open history group was not closed"))?;
    assert_eq!(close.observation().profile_generation(), Some(&generation));

    let expected = engine.observation();
    let selection = engine
        .set_selection(&expected, Some(selected_text()?))?
        .ok_or_else(|| test_error("selection change was unexpectedly ignored"))?;
    assert_eq!(selection.observation().profile_generation(), Some(&generation));

    let expected = engine.observation();
    let undo =
        engine.undo(&expected)?.ok_or_else(|| test_error("undo was unexpectedly unavailable"))?;
    assert_eq!(undo.observation().profile_generation(), Some(&generation));

    let expected = engine.observation();
    let redo =
        engine.redo(&expected)?.ok_or_else(|| test_error("redo was unexpectedly unavailable"))?;
    assert_eq!(redo.observation().profile_generation(), Some(&generation));

    let expected = engine.observation();
    let clear = engine
        .clear_history(&expected)?
        .ok_or_else(|| test_error("nonempty history was not cleared"))?;
    assert_eq!(clear.observation().profile_generation(), Some(&generation));
    assert_eq!(engine.observation().profile_generation(), Some(&generation));
    Ok(())
}

#[test]
fn profile_cache_rejects_another_generation_atomically() -> TestResult {
    let profile = compiled_profile()?;
    let mut cache = profile.action_state_cache();
    let first_session = EditorSession::new(profiled_state(
        &profile,
        DocumentLimits::default(),
        "profile-cache-first",
        None,
    )?);
    let first = cache.refresh(&first_session)?;
    assert_eq!(first.observation().profile_generation(), Some(profile.generation()),);
    let retained = cache.current().cloned();

    let other = compiled_profile()?;
    let other_session = EditorSession::new(profiled_state(
        &other,
        DocumentLimits::default(),
        "profile-cache-other",
        None,
    )?);
    assert!(matches!(
        cache.refresh(&other_session),
        Err(breditor_core::action::ActionStateDeriveError::ProfileGenerationMismatch)
    ));
    assert_eq!(cache.current(), retained.as_ref());

    let mut advanced_unbound = ActionStateCache::new(profile.action_state_catalog().clone());
    let unbound = advanced_unbound.refresh(&first_session)?;
    assert!(unbound.observation().profile_generation().is_none());
    Ok(())
}

#[test]
fn v2_restore_mints_a_fresh_generation_with_the_same_durable_binding() -> TestResult {
    let fresh_profile = compiled_profile()?;
    let fresh_binding = fresh_profile.schema().durable_binding();
    let fresh_generation = fresh_profile.generation().clone();
    let engine = profiled_engine(
        fresh_profile,
        DocumentLimits::default(),
        "profile-restore",
        Some(selected_text()?),
    )?;
    let checkpointed =
        CheckpointedEditorEngine::try_new_v2(engine, SessionCheckpointLimits::default())?;
    assert_eq!(
        checkpointed.session_checkpoint_format_version(),
        SESSION_CHECKPOINT_V2_FORMAT_VERSION,
    );
    let checkpoint = checkpointed.session_checkpoint_json().to_owned();

    let restored_profile = compiled_profile()?;
    assert_eq!(restored_profile.schema().durable_binding(), fresh_binding);
    assert_ne!(restored_profile.generation(), &fresh_generation);
    let context = restored_profile.editor_context(DocumentLimits::default());
    let session = SessionCheckpointJsonCodecV2::new(context)
        .with_limits(SessionCheckpointLimits::default())
        .decode(&checkpoint)?;
    let restored = EditorEngine::try_with_compiled_profile(session, restored_profile)?;
    assert_eq!(restored.state().snapshot(), checkpointed.state().snapshot());
    assert_eq!(restored.state().document().root(), checkpointed.state().document().root());
    assert_eq!(restored.state().selection(), checkpointed.state().selection());
    assert_eq!(restored.state().pending_formats(), checkpointed.state().pending_formats());
    assert_ne!(restored.profile_generation(), Some(&fresh_generation));
    assert_eq!(restored.observation().profile_generation(), restored.profile_generation(),);
    Ok(())
}

#[test]
fn trusted_base_profile_can_use_fingerprint_bearing_session_checkpoint_v2() -> TestResult {
    let profile = CompiledEditorProfile::try_compile_breditor_base()?;
    assert_eq!(
        profile
            .descriptor()
            .inline_formats()
            .iter()
            .map(|format| (format.kind().as_str(), format.revision().get()))
            .collect::<Vec<_>>(),
        vec![("breditor/strong", 1)],
    );
    assert_eq!(profile.descriptor().intents().len(), 1);
    assert_eq!(profile.descriptor().intents()[0].id(), &format_strong_intent_id());
    assert!(matches!(
        profile.descriptor().action_states()[0].source(),
        CompiledProfileActionStateSource::Routed(intent)
            if intent == &format_strong_intent_id()
    ));
    let context = profile.editor_context(DocumentLimits::default());
    let document =
        DocumentJsonCodec::new(profile.schema().clone()).decode(&support::document_json(&[
            support::paragraph(&[support::text_node("abc", false)]),
        ]))?;
    let state = EditorState::try_new(
        &context,
        LineageId::try_new("profile-base-v1")?,
        document,
        None,
        None,
    )?;
    let engine = EditorEngine::try_with_compiled_profile(EditorSession::new(state), profile)?;
    let checkpointed =
        CheckpointedEditorEngine::try_new_v2(engine, SessionCheckpointLimits::default())?;
    assert_eq!(
        checkpointed.session_checkpoint_format_version(),
        SESSION_CHECKPOINT_V2_FORMAT_VERSION,
    );
    let independently_encoded =
        SessionCheckpointJsonCodecV2::new(checkpointed.state().context().clone())
            .with_limits(*checkpointed.session_checkpoint_limits())
            .encode(checkpointed.session())?;
    assert_eq!(checkpointed.session_checkpoint_json(), independently_encoded);
    Ok(())
}

#[test]
fn trusted_base_profile_preserves_explicit_legacy_session_checkpoint_v1() -> TestResult {
    let profile = CompiledEditorProfile::try_compile_breditor_base()?;
    let context = profile.editor_context(DocumentLimits::default());
    let document =
        DocumentJsonCodec::new(profile.schema().clone()).decode(&support::document_json(&[
            support::paragraph(&[support::text_node("abc", false)]),
        ]))?;
    let state = EditorState::try_new(
        &context,
        LineageId::try_new("profile-base-explicit-v1")?,
        document,
        None,
        None,
    )?;
    let raw = EditorEngine::try_with_compiled_profile(EditorSession::new(state), profile)?;
    let checkpointed = CheckpointedEditorEngine::try_new(raw, SessionCheckpointLimits::default())?;
    assert_eq!(checkpointed.session_checkpoint_format_version(), SESSION_CHECKPOINT_FORMAT_VERSION,);
    assert!(checkpointed.profile_generation().is_some());
    let independently_encoded =
        SessionCheckpointJsonCodec::new(checkpointed.state().context().clone())
            .with_limits(*checkpointed.session_checkpoint_limits())
            .encode(checkpointed.session())?;
    assert_eq!(checkpointed.session_checkpoint_json(), independently_encoded);
    Ok(())
}

#[test]
fn legacy_unprofiled_base_engine_preserves_session_checkpoint_v1() -> TestResult {
    let context = EditorContext::default();
    let document =
        DocumentJsonCodec::new(context.schema().clone()).decode(&support::document_json(&[
            support::paragraph(&[support::text_node("abc", false)]),
        ]))?;
    let state = EditorState::try_new(
        &context,
        LineageId::try_new("legacy-base-v1")?,
        document,
        None,
        None,
    )?;
    let raw = EditorEngine::try_with_base_actions(EditorSession::new(state))?;
    let checkpointed = CheckpointedEditorEngine::try_new(raw, SessionCheckpointLimits::default())?;
    assert_eq!(checkpointed.session_checkpoint_format_version(), SESSION_CHECKPOINT_FORMAT_VERSION,);
    let independently_encoded =
        SessionCheckpointJsonCodec::new(checkpointed.state().context().clone())
            .with_limits(*checkpointed.session_checkpoint_limits())
            .encode(checkpointed.session())?;
    assert_eq!(checkpointed.session_checkpoint_json(), independently_encoded);
    Ok(())
}

#[test]
fn v2_intent_checkpoint_failure_is_atomic() -> TestResult {
    const PRIVATE_PAYLOAD: &str = "profile-private-checkpoint-payload";
    let baseline_profile = compiled_profile()?;
    let mut baseline = CheckpointedEditorEngine::try_new_v2(
        profiled_engine(
            baseline_profile,
            DocumentLimits::default(),
            PRIVATE_PAYLOAD,
            Some(selected_text()?),
        )?,
        SessionCheckpointLimits::default(),
    )?;
    let initial_bytes = baseline.session_checkpoint_json().len();
    let expected = baseline.observation();
    let _ = baseline
        .execute_intent(&expected, &IntentInvocation::without_input(IntentId::try_new(INTENT)?))?;
    let expanded_bytes = baseline.session_checkpoint_json().len();
    assert!(expanded_bytes > initial_bytes);

    let maximum = expanded_bytes
        .checked_sub(1)
        .ok_or_else(|| io::Error::other("expanded checkpoint was empty"))?;
    let mut constrained = CheckpointedEditorEngine::try_new_v2(
        profiled_engine(
            compiled_profile()?,
            DocumentLimits::default().with_max_json_bytes(maximum),
            PRIVATE_PAYLOAD,
            Some(selected_text()?),
        )?,
        SessionCheckpointLimits::default(),
    )?;
    let before_state = constrained.state().clone();
    let before_history = constrained.session().history_status();
    let before_observation = constrained.observation();
    let before_checkpoint = constrained.session_checkpoint_json().to_owned();
    let error = require_checkpoint_error(constrained.execute_intent(
        &before_observation,
        &IntentInvocation::without_input(IntentId::try_new(INTENT)?),
    ))?;
    assert_eq!(error.code(), CheckpointedEditorEngineErrorCode::SessionCheckpointRepresentation,);
    assert_eq!(error.checkpoint_codec_code(), Some(CodecErrorCode::OutputTooLarge));
    assert_eq!(constrained.state(), &before_state);
    assert_eq!(constrained.session().history_status(), before_history);
    assert_eq!(constrained.observation(), before_observation);
    assert_eq!(constrained.session_checkpoint_json(), before_checkpoint);
    assert!(!format!("{error:?}").contains(PRIVATE_PAYLOAD));
    Ok(())
}
