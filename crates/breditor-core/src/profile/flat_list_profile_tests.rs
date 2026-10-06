//! Complete heading profile: commands, routed state, extensions and durable engine.
use super::*;
use crate::{
    action::{
        ActionActivation, ActionId, ActionInput, ActionInvocation, ActionStateId,
        ActionStateOutcome, ActionValue,
        builtins::*,
        routing::{BindingId, IntentId, IntentInvocation},
    },
    codec::{
        SessionCheckpointJsonCodecV6, SessionCheckpointLimits,
        structural_codec_test_support::{TestResult, block, heading, state},
    },
    document::{FormatSet, PropertyValue},
    engine::{CheckpointedEditorEngine, EditorEngine},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSetSpecV1, InlineFormatSpecV1, InlineFormatToggleSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    position::{Affinity, NodePath, Point},
    schema::{DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
};
use std::error::Error;

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    Ok(QualifiedName::try_new(value)?)
}
fn schema_id() -> Result<SchemaId, Box<dyn Error>> {
    Ok(SchemaId::new(name("example/heading-editor")?, SchemaVersion::one()))
}
pub(super) fn extension(toggles: u32, sets: u32, reserved: bool) -> Result<ExtensionSet, Box<dyn Error>> {
    let mut ts = vec![];
    let mut ss = vec![];
    let mut toggle_formats = vec![];
    let mut set_formats = vec![];
    let mut contracts = vec![];
    for i in 0..toggles {
        let kind = name(&if i == 0 {
            "example/italic".to_owned()
        } else {
            format!("example/italic-{i}")
        })?;
        toggle_formats.push(InlineFormatSpecV1::new(kind.clone(), PersistedTypeRevision::one()));
        ts.push(InlineFormatToggleSpecV1::new(
            kind,
            ActionId::try_new(if reserved {
                "breditor/set-heading-1".to_owned()
            } else {
                format!("example/toggle-{i}")
            })?,
            IntentId::try_new(format!("example/toggle-intent-{i}"))?,
            BindingId::try_new(format!("example/toggle-binding-{i}"))?,
            ActionStateId::try_new(format!("example/toggle-state-{i}"))?,
        ));
    }
    for i in 0..sets {
        let kind =
            name(&if i == 0 { "example/link".to_owned() } else { format!("example/link-{i}") })?;
        set_formats.push(InlineFormatSpecV1::new(kind.clone(), PersistedTypeRevision::one()));
        contracts.push(InlineFormatPropertyContractV1::try_new(
            kind.clone(),
            vec![InlineFormatPropertySpecV1::new(
                name("example/href")?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, 2_048)?,
            )],
        )?);
        ss.push(InlineFormatSetSpecV1::new(
            kind,
            ActionId::try_new(format!("example/set-{i}"))?,
            IntentId::try_new(format!("example/set-intent-{i}"))?,
            BindingId::try_new(format!("example/set-binding-{i}"))?,
            ActionStateId::try_new(format!("example/set-state-{i}"))?,
        ));
    }
    let toggles = ExtensionManifest::try_new_with_inline_formats_and_toggles(
        ExtensionId::new(name("example/toggle-owner")?, ExtensionVersion::try_new(1)?),
        vec![],
        vec![],
        toggle_formats,
        ts,
    )?;
    let sets = ExtensionManifest::try_new_with_inline_format_declarations_and_sets(
        ExtensionId::new(name("example/set-owner")?, ExtensionVersion::try_new(1)?),
        vec![],
        vec![],
        set_formats,
        contracts,
        vec![],
        ss,
    )?;
    Ok(ExtensionSet::try_new(vec![toggles, sets], ExtensionLimits::default())?)
}
fn profile() -> Result<CompiledEditorProfile, Box<dyn Error>> {
    Ok(CompiledEditorProfile::try_compile_flat_list_profile(schema_id()?, extension(1, 1, false)?)?)
}
fn point(block: u32, offset: u32) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(vec![block, 0])?,
        utf16_offset: offset,
        affinity: Affinity::Before,
    })
}
fn selected() -> Result<Selection, Box<dyn Error>> {
    Ok(RangeSelection::new(point(1, 2)?, point(0, 0)?).into())
}
fn engine(
    profile: &CompiledEditorProfile,
    selection: Selection,
) -> Result<CheckpointedEditorEngine, Box<dyn Error>> {
    let context = profile.editor_context(DocumentLimits::default());
    let state = state(
        &context,
        vec![
            block(heading(1)?, "ab", FormatSet::default())?,
            block(heading(2)?, "cd", FormatSet::default())?,
        ],
        selection,
        None,
    )?;
    Ok(CheckpointedEditorEngine::try_new_v6(
        EditorEngine::try_with_compiled_profile(EditorSession::new(state), profile.clone())?,
        SessionCheckpointLimits::default(),
    )?)
}
fn intent(name: &str) -> Result<IntentInvocation, Box<dyn Error>> {
    Ok(IntentInvocation::without_input(IntentId::try_new(name)?))
}
fn activation(
    profile: &CompiledEditorProfile,
    session: &EditorSession,
    id: &str,
) -> Result<ActionActivation, Box<dyn Error>> {
    let batch = profile.action_state_catalog().derive(session)?;
    let entry = batch.entry(&ActionStateId::try_new(id)?).ok_or("state entry")?;
    let ActionStateOutcome::Resolved(value) = entry.outcome() else {
        return Err("unresolved state".into());
    };
    Ok(value.indicator().activation())
}

#[test]
fn flat_list_profile_has_complete_distinct_command_surface() -> TestResult {
    let p = profile()?;
    assert!(p.schema().supports_flat_list_operations());
    assert_eq!(p.action_registry().len(), 20);
    assert_eq!(p.intent_router().intent_count(), 14);
    assert_eq!(p.intent_router().binding_count(), 14);
    assert_eq!(p.action_state_catalog().len(), 16);
    for id in [
        insert_flat_list_text_action_id(),
        insert_flat_list_plain_text_action_id(),
        insert_flat_list_break_action_id(),
        delete_flat_list_backward_action_id(),
        delete_flat_list_forward_action_id(),
        delete_flat_list_selection_action_id(),
        clear_flat_list_inline_formats_action_id(),
    ] {
        assert!(p.action_registry().descriptor(&id).is_some());
    }
    for id in [
        insert_text_action_id(),
        insert_plain_text_action_id(),
        insert_paragraph_break_action_id(),
        delete_backward_action_id(),
        toggle_strong_action_id(),
    ] {
        assert!(p.action_registry().descriptor(&id).is_none());
    }
    for (suffix, action) in [
        ("paragraph", "paragraph"),
        ("heading-1", "heading-1"),
        ("heading-2", "heading-2"),
        ("heading-3", "heading-3"),
        ("heading-4", "heading-4"),
        ("heading-5", "heading-5"),
        ("heading-6", "heading-6"),
    ] {
        let binding = p
            .intent_router()
            .binding(&BindingId::try_new(format!("breditor/format-{suffix}-binding"))?)
            .ok_or("binding")?;
        assert_eq!(binding.action_id().as_str(), format!("breditor/set-{action}"));
        assert!(
            p.descriptor()
                .intents()
                .iter()
                .any(|i| i.id().as_str() == format!("breditor/format-{suffix}"))
        );
    }
    Ok(())
}

#[test]
fn flat_list_profile_kind_toolbar_and_routed_commands_share_exact_history() -> TestResult {
    let p = profile()?;
    let mut engine = engine(&p, selected()?)?;
    let before = engine.state().clone();
    let mut cache = p.action_state_cache();
    assert!(cache.refresh(engine.session())?.is_full());
    assert_eq!(
        activation(&p, engine.session(), "breditor/control-heading-1")?,
        ActionActivation::Mixed
    );
    assert_eq!(
        activation(&p, engine.session(), "breditor/control-heading-2")?,
        ActionActivation::Mixed
    );
    for target in ["heading-3", "heading-6", "paragraph"] {
        assert!(
            engine
                .execute_intent(
                    &engine.observation(),
                    &intent(&format!("breditor/format-{target}"))?
                )?
                .is_committed()
        );
        assert_eq!(
            activation(&p, engine.session(), &format!("breditor/control-{target}"))?,
            ActionActivation::Active
        );
        let update = cache.refresh(engine.session())?;
        assert!(update.is_delta());
        assert_eq!(
            update.observation().batch(),
            &p.action_state_catalog().derive(engine.session())?
        );
        assert_eq!(engine.state().selection(), before.selection());
    }
    assert_eq!(engine.session().undo_depth(), 3);
    let recreated = profile()?;
    let session =
        SessionCheckpointJsonCodecV6::new(recreated.editor_context(DocumentLimits::default()))
            .decode(engine.session_checkpoint_json())?;
    let mut restored = CheckpointedEditorEngine::try_new_v6(
        EditorEngine::try_with_compiled_profile(session, recreated.clone())?,
        SessionCheckpointLimits::default(),
    )?;
    assert!(restored.check_observation(&engine.observation()).is_err());
    assert!(cache.refresh(restored.session()).is_err());
    for _ in 0..3 {
        let _ = restored.undo(&restored.observation())?.ok_or("undo")?;
    }
    assert_eq!(restored.state().document(), before.document());
    assert_eq!(restored.state().selection(), before.selection());
    for _ in 0..3 {
        let _ = restored.redo(&restored.observation())?.ok_or("redo")?;
    }
    assert_eq!(restored.state().document(), engine.state().document());
    Ok(())
}

#[test]
fn flat_list_profile_extension_and_bold_formatting_work_on_headings() -> TestResult {
    let p = profile()?;
    let mut e = engine(&p, selected()?)?;
    for (command, control) in [
        ("breditor/format-strong", "breditor/control-bold"),
        ("example/toggle-intent-0", "example/toggle-state-0"),
    ] {
        assert!(e.execute_intent(&e.observation(), &intent(command)?)?.is_committed());
        assert_eq!(activation(&p, e.session(), control)?, ActionActivation::Active);
    }
    let input = ActionValue::try_object(vec![
        ("operation".to_owned(), ActionValue::try_from_string("set")?),
        (
            "properties".to_owned(),
            ActionValue::try_array(vec![ActionValue::try_object(vec![
                ("name".to_owned(), ActionValue::try_from_string("example/href")?),
                ("value".to_owned(), ActionValue::try_from_string("https://example.test/🙂")?),
            ])?])?,
        ),
    ])?;
    let invocation = IntentInvocation::new(
        IntentId::try_new("example/set-intent-0")?,
        ActionInput::typed(set_inline_format_input_contract(), input),
    );
    assert!(e.execute_intent(&e.observation(), &invocation)?.is_committed());
    assert_eq!(activation(&p, e.session(), "example/set-state-0")?, ActionActivation::Active);
    let text = e
        .state()
        .document()
        .node_at(&NodePath::try_from_indices(vec![0, 0])?)?
        .as_text()
        .ok_or("text")?;
    assert_eq!(
        text.formats()
            .get(&name("example/link")?)
            .and_then(|f| f.properties().get(&name("example/href").ok()?))
            .and_then(PropertyValue::as_string),
        Some("https://example.test/🙂")
    );
    assert!(
        e.execute_intent(&e.observation(), &intent("breditor/clear-inline-formatting")?)?
            .is_committed()
    );
    assert_eq!(activation(&p, e.session(), "example/set-state-0")?, ActionActivation::Inactive);
    let _ = e.undo(&e.observation())?.ok_or("undo")?;
    assert_eq!(activation(&p, e.session(), "example/set-state-0")?, ActionActivation::Active);
    Ok(())
}

#[test]
fn flat_list_profile_typing_paste_break_and_deletion_use_v6() -> TestResult {
    let p = profile()?;
    let point = point(0, 1)?;
    let mut e = engine(&p, RangeSelection::new(point.clone(), point).into())?;
    for (id, contract, text) in [
        (insert_flat_list_text_action_id(), insert_text_input_contract(), "X"),
        (insert_flat_list_plain_text_action_id(), insert_plain_text_input_contract(), "Y\nZ"),
    ] {
        let invocation = ActionInvocation::new(
            id,
            ActionInput::typed(contract, ActionValue::try_from_string(text)?),
        );
        assert!(e.execute_action(&e.observation(), &invocation)?.event().is_some());
    }
    for id in [
        insert_flat_list_break_action_id(),
        delete_flat_list_backward_action_id(),
        delete_flat_list_forward_action_id(),
    ] {
        assert!(
            e.execute_action(&e.observation(), &ActionInvocation::without_input(id))?
                .event()
                .is_some()
        );
    }
    let restored = SessionCheckpointJsonCodecV6::new(p.editor_context(DocumentLimits::default()))
        .decode(e.session_checkpoint_json())?;
    assert_eq!(restored.state().document(), e.state().document());
    assert_eq!(restored.state().selection(), e.state().selection());
    assert_eq!(e.session_checkpoint_format_version(), 6);
    Ok(())
}

#[test]
fn flat_list_profile_reserves_core_identities_and_retains_old_compiler_contracts() -> TestResult {
    assert!(matches!(
        CompiledEditorProfile::try_compile_flat_list_profile(schema_id()?, extension(1, 0, true)?),
        Err(ProfileCompilationError::ReservedActionId { .. })
    ));
    let base = CompiledEditorProfile::try_compile_base_text_profile(
        schema_id()?,
        extension(1, 1, false)?,
    )?;
    let structural = profile()?;
    assert_ne!(base.schema().fingerprint(), structural.schema().fingerprint());
    assert_eq!(base.action_state_catalog().len(), 6);
    assert!(base.action_registry().descriptor(&insert_text_action_id()).is_some());
    assert!(base.action_registry().descriptor(&insert_flat_list_text_action_id()).is_none());
    let another = profile()?;
    assert_ne!(structural.generation(), another.generation());
    assert_eq!(structural.schema().fingerprint(), another.schema().fingerprint());
    Ok(())
}

#[test]
fn flat_list_profile_preserves_stricter_schema_limit_with_ten_structural_controls() -> TestResult {
    for (toggles, sets) in [(255, 0), (128, 127), (0, 255)] {
        let exact = CompiledEditorProfile::try_compile_flat_list_profile(
            schema_id()?,
            extension(toggles, sets, false)?,
        )?;
        assert_eq!(exact.action_state_catalog().len(), 269);
        assert_eq!(exact.intent_router().intent_count(), 267);
        let runtime = engine(&exact, selected()?)?;
        let _ = exact.action_state_catalog().derive(runtime.session())?;
    }
    assert!(matches!(
        CompiledEditorProfile::try_compile_flat_list_profile(
            schema_id()?,
            extension(128, 128, false)?
        ),
        Err(ProfileCompilationError::Schema {
            source: crate::schema::SchemaCompilationError::TooManyInlineFormats {
                actual: 256,
                maximum: 255
            }
        })
    ));
    Ok(())
}

#[test]
fn flat_list_profile_every_kind_route_has_its_declared_target_and_blocked_active_state()
-> TestResult {
    use crate::{action::ObservedAvailability, block::TextBlockKind};
    let p = profile()?;
    for rank in 0..=6 {
        let suffix = if rank == 0 { "paragraph".to_owned() } else { format!("heading-{rank}") };
        let target = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
        let mut e = engine(&p, selected()?)?;
        let command = intent(&format!("breditor/format-{suffix}"))?;
        assert!(e.execute_intent(&e.observation(), &command)?.is_committed());
        let expected = state(
            e.state().context(),
            vec![
                block(target, "ab", FormatSet::default())?,
                block(target, "cd", FormatSet::default())?,
            ],
            selected()?,
            None,
        )?;
        assert_eq!(e.state().document(), expected.document());
        let batch = p.action_state_catalog().derive(e.session())?;
        let entry = batch
            .entry(&ActionStateId::try_new(format!("breditor/control-{suffix}"))?)
            .ok_or("control")?;
        let ActionStateOutcome::Resolved(value) = entry.outcome() else {
            return Err("unresolved".into());
        };
        assert_eq!(value.indicator().activation(), ActionActivation::Active);
        assert!(
            matches!(value.availability(),ObservedAvailability::Blocked(reason) if reason.code().as_str()=="breditor/block-kind-unchanged")
        );
        let before = e.observation();
        let json = e.session_checkpoint_json().to_owned();
        assert!(!e.execute_intent(&before, &command)?.is_committed());
        assert_eq!(e.observation(), before);
        assert_eq!(e.session_checkpoint_json(), json);
    }
    Ok(())
}

#[test]
fn flat_list_profile_selection_at_next_start_excludes_that_block_and_missing_selection_blocks()
-> TestResult {
    let p = profile()?;
    let mut e = engine(&p, RangeSelection::new(point(0, 0)?, point(1, 0)?).into())?;
    assert_eq!(
        activation(&p, e.session(), "breditor/control-heading-1")?,
        ActionActivation::Active
    );
    assert_eq!(
        activation(&p, e.session(), "breditor/control-heading-2")?,
        ActionActivation::Inactive
    );
    let _ = e.set_selection(&e.observation(), None)?.ok_or("selection")?;
    for rank in 1..=6 {
        assert_eq!(
            activation(&p, e.session(), &format!("breditor/control-heading-{rank}"))?,
            ActionActivation::Inactive
        );
        let before = e.observation();
        assert!(
            !e.execute_intent(&before, &intent(&format!("breditor/format-heading-{rank}"))?)?
                .is_committed()
        );
        assert_eq!(e.observation(), before);
    }
    Ok(())
}

#[test]
fn flat_list_profile_typed_toolbar_reports_uniform_mixed_and_unset_properties() -> TestResult {
    use crate::action::ActionStateValue;
    let p = profile()?;
    let mut e = engine(&p, selected()?)?;
    let set = |url: &str| -> Result<IntentInvocation, Box<dyn Error>> {
        Ok(IntentInvocation::new(
            IntentId::try_new("example/set-intent-0")?,
            ActionInput::typed(
                set_inline_format_input_contract(),
                ActionValue::try_object(vec![
                    ("operation".to_owned(), ActionValue::try_from_string("set")?),
                    (
                        "properties".to_owned(),
                        ActionValue::try_array(vec![ActionValue::try_object(vec![
                            ("name".to_owned(), ActionValue::try_from_string("example/href")?),
                            ("value".to_owned(), ActionValue::try_from_string(url)?),
                        ])?])?,
                    ),
                ])?,
            ),
        ))
    };
    let value = |session: &EditorSession| -> Result<ActionStateValue, Box<dyn Error>> {
        let batch = p.action_state_catalog().derive(session)?;
        let entry = batch.entry(&ActionStateId::try_new("example/set-state-0")?).ok_or("entry")?;
        let ActionStateOutcome::Resolved(value) = entry.outcome() else {
            return Err("unresolved".into());
        };
        Ok(value.indicator().value().clone())
    };
    assert!(matches!(value(e.session())?, ActionStateValue::Unset { .. }));
    assert!(e.execute_intent(&e.observation(), &set("https://example.test/a")?)?.is_committed());
    assert!(matches!(value(e.session())?, ActionStateValue::Uniform { .. }));
    let _ = e.set_selection(
        &e.observation(),
        Some(RangeSelection::new(point(1, 0)?, point(1, 2)?).into()),
    )?;
    assert!(e.execute_intent(&e.observation(), &set("https://example.test/b")?)?.is_committed());
    let _ = e.set_selection(&e.observation(), Some(selected()?))?;
    assert!(matches!(value(e.session())?, ActionStateValue::Mixed { .. }));
    assert_eq!(activation(&p, e.session(), "example/set-state-0")?, ActionActivation::Active);
    let before = e.observation();
    let json = e.session_checkpoint_json().to_owned();
    let invalid = IntentInvocation::new(
        IntentId::try_new("example/set-intent-0")?,
        ActionInput::typed(set_inline_format_input_contract(), ActionValue::null()),
    );
    assert!(e.execute_intent_after_closing_history_group(&before, &invalid).is_err());
    assert_eq!(e.observation(), before);
    assert_eq!(e.session_checkpoint_json(), json);
    Ok(())
}

fn list_node(
    start: Option<u32>,
    blocks: Vec<crate::document::NodeRef>,
) -> Result<crate::document::NodeRef, Box<dyn Error>> {
    use crate::document::{ElementNode, NodeRef, PropertyInteger, PropertyMap};
    let children = blocks
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
    let properties = match start {
        Some(start) => PropertyMap::try_from_sorted(vec![(
            name("breditor/start")?,
            PropertyValue::from_integer(PropertyInteger::try_new(i64::from(start))?),
        )])?,
        None => PropertyMap::default(),
    };
    Ok(NodeRef::element(ElementNode::try_new(
        name(if start.is_some() { "breditor/ordered-list" } else { "breditor/bullet-list" })?,
        None,
        properties,
        children,
    )?))
}

fn list_point(root: u32, item: u32, offset: u32) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(vec![root, item, 0, 0])?,
        utf16_offset: offset,
        affinity: Affinity::Before,
    })
}

#[test]
fn list_routes_reparent_selection_report_state_and_restore_exact_history() -> TestResult {
    use crate::action::ObservedAvailability;
    let p = profile()?;
    let mut e = engine(&p, selected()?)?;
    let before = e.state().clone();
    let mut cache = p.action_state_cache();
    let _ = cache.refresh(e.session())?;
    for (command, control, start) in [
        ("breditor/format-bullet-list", "breditor/control-bullet-list", None),
        ("breditor/format-ordered-list", "breditor/control-ordered-list", Some(1)),
    ] {
        assert!(e.execute_intent(&e.observation(), &intent(command)?)?.is_committed());
        let expected_selection =
            Selection::from(RangeSelection::new(list_point(0, 1, 2)?, list_point(0, 0, 0)?));
        let expected = state(
            e.state().context(),
            vec![list_node(
                start,
                vec![
                    block(heading(1)?, "ab", FormatSet::default())?,
                    block(heading(2)?, "cd", FormatSet::default())?,
                ],
            )?],
            expected_selection,
            None,
        )?;
        assert_eq!(e.state().document(), expected.document());
        assert_eq!(e.state().selection(), expected.selection());
        assert_eq!(activation(&p, e.session(), control)?, ActionActivation::Active);
        assert_eq!(
            activation(&p, e.session(), "breditor/control-remove-list")?,
            ActionActivation::Active
        );
        let update = cache.refresh(e.session())?;
        assert!(update.is_delta());
        assert_eq!(update.observation().batch(), &p.action_state_catalog().derive(e.session())?);
        let batch = p.action_state_catalog().derive(e.session())?;
        let ActionStateOutcome::Resolved(value) =
            batch.entry(&ActionStateId::try_new(control)?).ok_or("control")?.outcome()
        else {
            return Err("resolved".into());
        };
        assert!(
            matches!(value.availability(), ObservedAvailability::Blocked(reason) if reason.code().as_str() == "breditor/list-unchanged")
        );
        let observation = e.observation();
        let saved = e.session_checkpoint_json().to_owned();
        assert!(!e.execute_intent(&observation, &intent(command)?)?.is_committed());
        assert_eq!(e.observation(), observation);
        assert_eq!(e.session_checkpoint_json(), saved);
    }
    assert!(e.execute_intent(&e.observation(), &intent("breditor/remove-list")?)?.is_committed());
    assert_eq!(e.state().document(), before.document());
    assert_eq!(e.state().selection(), before.selection());
    assert_eq!(e.session().undo_depth(), 3);
    let other = profile()?;
    let session =
        SessionCheckpointJsonCodecV6::new(other.editor_context(DocumentLimits::default()))
            .decode(e.session_checkpoint_json())?;
    let mut restored = CheckpointedEditorEngine::try_new_v6(
        EditorEngine::try_with_compiled_profile(session, other.clone())?,
        SessionCheckpointLimits::default(),
    )?;
    assert!(restored.check_observation(&e.observation()).is_err());
    assert!(cache.refresh(restored.session()).is_err());
    assert_eq!(restored.session_checkpoint_json(), e.session_checkpoint_json());
    for _ in 0..3 {
        let _ = restored.undo(&restored.observation())?.ok_or("undo")?;
        let _ = e.undo(&e.observation())?.ok_or("original undo")?;
    }
    assert_eq!(restored.state().document(), before.document());
    assert_eq!(restored.state().selection(), before.selection());
    for _ in 0..3 {
        let _ = restored.redo(&restored.observation())?.ok_or("redo")?;
        let _ = e.redo(&e.observation())?.ok_or("original redo")?;
    }
    assert_eq!(restored.state().document(), e.state().document());
    assert_eq!(restored.state().selection(), e.state().selection());
    assert_eq!(restored.session_checkpoint_json(), e.session_checkpoint_json());
    Ok(())
}

#[test]
fn partial_list_conversion_keeps_numbered_suffix_and_excludes_later_start() -> TestResult {
    let p = profile()?;
    let context = p.editor_context(DocumentLimits::default());
    let blocks = vec![
        block(heading(1)?, "ab", FormatSet::default())?,
        block(heading(2)?, "cd", FormatSet::default())?,
        block(heading(3)?, "ef", FormatSet::default())?,
    ];
    let before = state(
        &context,
        vec![list_node(Some(8), blocks.clone())?],
        Selection::from(RangeSelection::new(list_point(0, 1, 0)?, list_point(0, 2, 0)?)),
        None,
    )?;
    let mut e = CheckpointedEditorEngine::try_new_v6(
        EditorEngine::try_with_compiled_profile(EditorSession::new(before.clone()), p.clone())?,
        SessionCheckpointLimits::default(),
    )?;
    let observation = e.observation();
    assert!(
        !e.execute_intent(&observation, &intent("breditor/format-ordered-list")?)?.is_committed()
    );
    assert_eq!(e.observation(), observation);
    assert_eq!(e.state(), &before);
    assert_eq!(
        activation(&p, e.session(), "breditor/control-heading-2")?,
        ActionActivation::Active
    );
    assert_eq!(
        activation(&p, e.session(), "breditor/control-heading-3")?,
        ActionActivation::Inactive
    );
    assert!(
        e.execute_intent(&e.observation(), &intent("breditor/format-bullet-list")?)?.is_committed()
    );
    let expected = state(
        &context,
        vec![
            list_node(Some(8), vec![blocks[0].clone()])?,
            list_node(None, vec![blocks[1].clone()])?,
            list_node(Some(10), vec![blocks[2].clone()])?,
        ],
        None,
        None,
    )?;
    assert_eq!(e.state().document(), expected.document());
    let _ = e.undo(&e.observation())?.ok_or("undo")?;
    assert_eq!(e.state().document(), before.document());
    assert_eq!(e.state().selection(), before.selection());
    let _ = e.redo(&e.observation())?.ok_or("redo")?;
    assert_eq!(e.state().document(), expected.document());
    Ok(())
}

#[test]
fn compiled_list_commands_edit_item_headings_and_extension_formats_end_to_end() -> TestResult {
    let p = profile()?;
    let mut e = engine(&p, selected()?)?;
    assert!(
        e.execute_intent(&e.observation(), &intent("breditor/format-ordered-list")?)?
            .is_committed()
    );
    for command in
        ["breditor/format-strong", "example/toggle-intent-0", "breditor/format-heading-4"]
    {
        assert!(e.execute_intent(&e.observation(), &intent(command)?)?.is_committed());
    }
    assert_eq!(activation(&p, e.session(), "example/toggle-state-0")?, ActionActivation::Active);
    assert_eq!(
        activation(&p, e.session(), "breditor/control-heading-4")?,
        ActionActivation::Active
    );
    let set_link = link_intent("https://example.test/list")?;
    assert!(e.execute_intent(&e.observation(), &set_link)?.is_committed());
    assert_eq!(activation(&p, e.session(), "example/set-state-0")?, ActionActivation::Active);
    let text = e
        .state()
        .document()
        .node_at(&NodePath::try_from_indices(vec![0, 0, 0, 0])?)?
        .as_text()
        .ok_or("text")?;
    assert_eq!(
        text.formats()
            .get(&name("example/link")?)
            .and_then(|f| f.properties().get(&name("example/href").ok()?))
            .and_then(PropertyValue::as_string),
        Some("https://example.test/list")
    );
    assert!(
        e.execute_intent(&e.observation(), &intent("breditor/clear-inline-formatting")?)?
            .is_committed()
    );
    assert_eq!(activation(&p, e.session(), "example/set-state-0")?, ActionActivation::Inactive);
    let _ = e.undo(&e.observation())?.ok_or("undo clear")?;
    assert_eq!(activation(&p, e.session(), "example/set-state-0")?, ActionActivation::Active);
    let point = list_point(0, 0, 1)?;
    let _ = e
        .set_selection(&e.observation(), Some(RangeSelection::new(point.clone(), point).into()))?
        .ok_or("selection")?;
    for (id, contract, text) in [
        (insert_flat_list_text_action_id(), insert_text_input_contract(), "🙂"),
        (insert_flat_list_plain_text_action_id(), insert_plain_text_input_contract(), "Y\nZ"),
    ] {
        assert!(
            e.execute_action(
                &e.observation(),
                &ActionInvocation::new(
                    id,
                    ActionInput::typed(contract, ActionValue::try_from_string(text)?)
                )
            )?
            .event()
            .is_some()
        );
    }
    for id in [
        insert_flat_list_break_action_id(),
        delete_flat_list_backward_action_id(),
        delete_flat_list_forward_action_id(),
    ] {
        assert!(
            e.execute_action(&e.observation(), &ActionInvocation::without_input(id))?
                .event()
                .is_some()
        );
    }
    let saved = e.session_checkpoint_json().to_owned();
    let other = profile()?;
    let mut restored =
        SessionCheckpointJsonCodecV6::new(other.editor_context(DocumentLimits::default()))
            .decode(&saved)?;
    assert_eq!(restored.state().document(), e.state().document());
    assert_eq!(restored.state().selection(), e.state().selection());
    let depth = restored.undo_depth();
    for _ in 0..depth {
        restored.undo()?.ok_or("undo")?;
    }
    for _ in 0..depth {
        restored.redo()?.ok_or("redo")?;
    }
    assert_eq!(restored.state().document(), e.state().document());
    assert_eq!(restored.state().selection(), e.state().selection());
    Ok(())
}

fn link_intent(url: &str) -> Result<IntentInvocation, Box<dyn Error>> {
    Ok(IntentInvocation::new(
        IntentId::try_new("example/set-intent-0")?,
        ActionInput::typed(
            set_inline_format_input_contract(),
            ActionValue::try_object(vec![
                ("operation".to_owned(), ActionValue::try_from_string("set")?),
                (
                    "properties".to_owned(),
                    ActionValue::try_array(vec![ActionValue::try_object(vec![
                        ("name".to_owned(), ActionValue::try_from_string("example/href")?),
                        ("value".to_owned(), ActionValue::try_from_string(url)?),
                    ])?])?,
                ),
            ])?,
        ),
    ))
}

#[test]
fn checkpoint_failure_keeps_state_observation_cached_bytes_and_redo_reusable() -> TestResult {
    let p = profile()?;
    let initial = engine(&p, selected()?)?.state().clone();
    let inner = EditorEngine::try_with_compiled_profile(EditorSession::new(initial), p.clone())?;
    let limits = SessionCheckpointLimits::default().with_max_retained_nodes(13);
    let mut e = CheckpointedEditorEngine::try_new_v6(inner, limits)?;
    assert!(
        e.execute_intent(&e.observation(), &intent("breditor/format-bullet-list")?)?.is_committed()
    );
    let _ = e.undo(&e.observation())?.ok_or("undo")?;
    let before = e.state().clone();
    let observation = e.observation();
    let saved = e.session_checkpoint_json().to_owned();
    let paste = ActionInvocation::new(
        insert_flat_list_plain_text_action_id(),
        ActionInput::typed(
            insert_plain_text_input_contract(),
            ActionValue::try_from_string("A\nB\nC\nD")?,
        ),
    );
    assert!(matches!(
        e.execute_action_after_closing_history_group(&observation, &paste),
        Err(crate::engine::CheckpointedEditorEngineError::SessionCheckpointRepresentation {
            codec_code: crate::codec::CodecErrorCode::ResourceLimit
        })
    ));
    assert_eq!(e.state(), &before);
    assert_eq!(e.observation(), observation);
    assert_eq!(e.session_checkpoint_json(), saved);
    assert_eq!(e.session().redo_depth(), 1);
    let _ = e.redo(&observation)?.ok_or("redo still usable")?;
    assert_eq!(
        activation(&p, e.session(), "breditor/control-bullet-list")?,
        ActionActivation::Active
    );
    Ok(())
}

#[test]
fn v5_owner_does_not_upgrade_implicitly_and_list_routes_require_selection() -> TestResult {
    let p = profile()?;
    let initial = engine(&p, selected()?)?.state().clone();
    let mut old = CheckpointedEditorEngine::try_new_v5(
        EditorEngine::try_with_compiled_profile(EditorSession::new(initial), p.clone())?,
        SessionCheckpointLimits::default(),
    )?;
    let observation = old.observation();
    let saved = old.session_checkpoint_json().to_owned();
    assert!(matches!(
        old.execute_intent(&observation, &intent("breditor/format-bullet-list")?),
        Err(crate::engine::CheckpointedEditorEngineError::SessionCheckpointRepresentation { .. })
    ));
    assert_eq!(old.observation(), observation);
    assert_eq!(old.session_checkpoint_json(), saved);
    assert_eq!(old.session_checkpoint_format_version(), 5);
    let mut e = engine(&p, selected()?)?;
    let _ = e.set_selection(&e.observation(), None)?.ok_or("clear selection")?;
    for (command, control) in [
        ("breditor/format-bullet-list", "breditor/control-bullet-list"),
        ("breditor/format-ordered-list", "breditor/control-ordered-list"),
        ("breditor/remove-list", "breditor/control-remove-list"),
    ] {
        let observation = e.observation();
        assert!(!e.execute_intent(&observation, &intent(command)?)?.is_committed());
        assert_eq!(e.observation(), observation);
        assert_eq!(activation(&p, e.session(), control)?, ActionActivation::Inactive);
    }
    Ok(())
}
