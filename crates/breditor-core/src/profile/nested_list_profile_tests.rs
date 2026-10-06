//! Nested command graph, routed state, isolation and durable recovery.
use super::*;
use crate::{
    action::{
        ActionActivation, ActionId, ActionStateId, ActionStateOutcome,
        builtins::*,
        routing::{IntentId, IntentInvocation},
    },
    block::TextBlockKind,
    codec::{
        SessionCheckpointJsonCodecV7,
        structural_codec_test_support::{TestResult, block, name, state},
    },
    document::{ElementNode, FormatSet, NodeRef, PropertyMap},
    engine::EditorEngine,
    position::{Affinity, NodePath, Point},
    schema::{DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
};
use std::error::Error;
fn profile() -> Result<CompiledEditorProfile, Box<dyn Error>> {
    Ok(CompiledEditorProfile::try_compile_nested_list_profile(
        SchemaId::new(name("test/nested-profile")?, SchemaVersion::one()),
        super::flat_list_profile_tests::extension(1, 1, false)?,
    )?)
}
fn element(kind: &str, children: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    Ok(NodeRef::element(ElementNode::try_new(name(kind)?, None, PropertyMap::default(), children)?))
}
fn engine(profile: &CompiledEditorProfile, child: bool) -> Result<EditorEngine, Box<dyn Error>> {
    let p = |text| block(TextBlockKind::Paragraph, text, FormatSet::default());
    let root = element(
        "breditor/bullet-list",
        vec![
            element(
                "breditor/list-item",
                vec![
                    p("parent")?,
                    element(
                        "breditor/bullet-list",
                        vec![element("breditor/list-item", vec![p("child")?])?],
                    )?,
                ],
            )?,
            element("breditor/list-item", vec![p("tail")?])?,
        ],
    )?;
    let path = if child { vec![0, 0, 1, 0, 0, 0] } else { vec![0, 1, 0, 0] };
    let point = Point::Text {
        text_path: NodePath::try_from_indices(path)?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    let before = state(
        &profile.editor_context(DocumentLimits::default()),
        vec![root],
        Selection::Range(RangeSelection::new(point.clone(), point)),
        None,
    )?;
    Ok(EditorEngine::try_with_compiled_profile(EditorSession::new(before), profile.clone())?)
}
fn intent(value: &str) -> Result<IntentInvocation, Box<dyn Error>> {
    Ok(IntentInvocation::without_input(IntentId::try_new(value)?))
}
fn activation(
    profile: &CompiledEditorProfile,
    engine: &EditorEngine,
    value: &str,
) -> Result<ActionActivation, Box<dyn Error>> {
    let batch = profile.action_state_catalog().derive(engine.session())?;
    let entry = batch.entry(&ActionStateId::try_new(value)?).ok_or("state")?;
    let ActionStateOutcome::Resolved(value) = entry.outcome() else {
        return Err("unresolved".into());
    };
    Ok(value.indicator().activation())
}
#[test]
fn nested_profile_complete_commands_and_existing_profiles_isolated() -> TestResult {
    let nested = profile()?;
    assert_eq!(nested.action_registry().len(), 22);
    assert_eq!(nested.intent_router().intent_count(), 16);
    assert_eq!(nested.intent_router().binding_count(), 16);
    assert_eq!(nested.action_state_catalog().len(), 18);
    assert!(nested.schema().supports_nested_list_reframe());
    assert!(!nested.schema().supports_flat_list_operations());
    for id in [
        insert_nested_list_text_action_id(),
        insert_nested_list_plain_text_action_id(),
        insert_nested_list_break_action_id(),
        delete_nested_list_backward_action_id(),
        delete_nested_list_forward_action_id(),
        delete_nested_list_selection_action_id(),
    ] {
        assert!(nested.action_registry().descriptor(&id).is_some());
    }
    for id in [insert_flat_list_text_action_id(), insert_text_action_id()] {
        assert!(nested.action_registry().descriptor(&id).is_none());
    }
    let flat = CompiledEditorProfile::try_compile_flat_list_profile(
        SchemaId::new(name("test/flat-profile")?, SchemaVersion::one()),
        super::flat_list_profile_tests::extension(1, 1, false)?,
    )?;
    assert!(flat.action_registry().descriptor(&insert_nested_list_text_action_id()).is_none());
    assert!(
        flat.action_registry()
            .descriptor(&ActionId::try_new("breditor/indent-list-items")?)
            .is_none()
    );
    assert_eq!(flat.action_state_catalog().len(), 16);
    Ok(())
}
#[test]
fn nested_profile_routes_and_toolbar_state_survive_v7_recovery() -> TestResult {
    let profile = profile()?;
    let mut engine = engine(&profile, true)?;
    let before = engine.state().clone();
    let mut cache = profile.action_state_cache();
    cache.refresh(engine.session())?;
    for (command, control) in [
        ("breditor/format-heading-3", "breditor/control-heading-3"),
        ("breditor/format-ordered-list", "breditor/control-ordered-list"),
        ("breditor/format-strong", "breditor/control-bold"),
        ("example/toggle-intent-0", "example/toggle-state-0"),
    ] {
        assert!(engine.execute_intent(&engine.observation(), &intent(command)?)?.is_committed());
        assert_eq!(activation(&profile, &engine, control)?, ActionActivation::Active);
        cache.refresh(engine.session())?;
    }
    for command in ["breditor/outdent-list-items", "breditor/remove-list"] {
        assert!(engine.execute_intent(&engine.observation(), &intent(command)?)?.is_committed());
    }
    let codec =
        SessionCheckpointJsonCodecV7::new(profile.editor_context(DocumentLimits::default()));
    let mut restored = codec.decode(&codec.encode(engine.session())?)?;
    let count = restored.undo_depth();
    for _ in 0..count {
        restored.undo()?.ok_or("undo")?;
    }
    assert_eq!(restored.state().document(), before.document());
    assert_eq!(restored.state().selection(), before.selection());
    for _ in 0..count {
        restored.redo()?.ok_or("redo")?;
    }
    // Undo/redo advances snapshot revisions; durable content and caret state
    // must match, not the old pre-replay revision identifier.
    assert_eq!(restored.state().document(), engine.state().document());
    assert_eq!(restored.state().selection(), engine.state().selection());
    assert_eq!(restored.state().pending_formats(), engine.state().pending_formats());
    Ok(())
}
#[test]
fn nested_profile_indent_and_outdent_route_real_nested_handlers() -> TestResult {
    let profile = profile()?;
    let mut engine = engine(&profile, false)?;
    let before = engine.state().clone();
    assert!(
        engine
            .execute_intent(&engine.observation(), &intent("breditor/indent-list-items")?)?
            .is_committed()
    );
    assert_ne!(engine.state().document(), before.document());
    assert!(
        engine
            .execute_intent(&engine.observation(), &intent("breditor/outdent-list-items")?)?
            .is_committed()
    );
    assert_eq!(engine.state().document(), before.document());
    Ok(())
}

#[test]
fn nested_profile_reserved_ids_and_extension_capacity_are_enforced() -> TestResult {
    let id =
        || SchemaId::new(name("test/nested-limits").expect("static name"), SchemaVersion::one());
    assert!(
        CompiledEditorProfile::try_compile_nested_list_profile(
            id(),
            super::flat_list_profile_tests::extension(1, 0, true)?
        )
        .is_err()
    );
    let maximum = CompiledEditorProfile::try_compile_nested_list_profile(
        id(),
        super::flat_list_profile_tests::extension(254, 1, false)?,
    )?;
    assert_eq!(maximum.action_state_catalog().len(), 271);
    assert_eq!(maximum.intent_router().intent_count(), 269);
    assert!(
        CompiledEditorProfile::try_compile_nested_list_profile(
            id(),
            super::flat_list_profile_tests::extension(255, 1, false)?
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn nested_checkpointed_v7_failure_preserves_redo_observation_and_bytes() -> TestResult {
    use crate::{
        action::{ActionInput, ActionInvocation, ActionValue},
        codec::SessionCheckpointLimits,
        engine::CheckpointedEditorEngine,
    };
    let p = profile()?;
    let mut owner = CheckpointedEditorEngine::try_new_v7(
        engine(&p, true)?,
        SessionCheckpointLimits::default().with_max_retained_nodes(100),
    )?;
    assert_eq!(owner.session_checkpoint_format_version(), 7);
    assert!(
        owner
            .execute_intent(&owner.observation(), &intent("breditor/format-heading-3")?)?
            .is_committed()
    );
    let changed = owner.state().clone();
    let _ = owner.undo(&owner.observation())?.ok_or("undo")?;
    let before = owner.state().clone();
    let observation = owner.observation();
    let saved = owner.session_checkpoint_json().to_owned();
    let paste = ActionInvocation::new(
        insert_nested_list_plain_text_action_id(),
        ActionInput::typed(
            insert_plain_text_input_contract(),
            ActionValue::try_from_string("X\n".repeat(100))?,
        ),
    );
    assert!(matches!(
        owner.execute_action_after_closing_history_group(&observation, &paste),
        Err(crate::engine::CheckpointedEditorEngineError::SessionCheckpointRepresentation {
            codec_code: crate::codec::CodecErrorCode::ResourceLimit
        })
    ));
    assert_eq!(owner.state(), &before);
    assert_eq!(owner.observation(), observation);
    assert_eq!(owner.session_checkpoint_json(), saved);
    assert_eq!(owner.session().redo_depth(), 1);
    let _ = owner.redo(&observation)?.ok_or("redo remains usable")?;
    assert_eq!(owner.state().document(), changed.document());
    let codec = SessionCheckpointJsonCodecV7::new(p.editor_context(DocumentLimits::default()));
    let restored = codec.decode(owner.session_checkpoint_json())?;
    assert_eq!(restored.state().document(), owner.state().document());
    assert_eq!(restored.state().selection(), owner.state().selection());
    Ok(())
}
