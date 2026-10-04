//! Complete saved flat-list sessions, real action histories and replay rejection.
use super::structural_codec_test_support::{
    TestResult, block, extensions, formats, heading, name, state,
};
use super::*;
use crate::{
    action::{
        ActionId, ActionInput, ActionInvocation, ActionRegistration, ActionRegistry, ActionValue,
        builtins::*,
    },
    block::{ListKind, OrderedListStart, TextBlockKind},
    document::{ElementNode, FormatSet, NodeRef, PropertyInteger, PropertyMap, PropertyValue},
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::{EditorSession, HistoryCapacity},
    state::{EditorContext, EditorState},
    transaction::{PendingFormatsUpdate, SelectionUpdate, Transaction},
};
use proptest::prelude::*;
use serde_json::{Value, json};
use std::error::Error;

fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_flat_list_profile(
            SchemaId::new(name("example/list-session")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        limits,
    ))
}
fn list(block: NodeRef) -> Result<NodeRef, Box<dyn Error>> {
    let item = NodeRef::element(ElementNode::try_new(
        name("breditor/list-item")?,
        None,
        PropertyMap::default(),
        vec![block],
    )?);
    Ok(NodeRef::element(ElementNode::try_new(
        name("breditor/ordered-list")?,
        None,
        PropertyMap::try_from_sorted(vec![(
            name("breditor/start")?,
            PropertyValue::from_integer(PropertyInteger::try_new(8)?),
        )])?,
        vec![item],
    )?))
}
fn point(path: &[u32], offset: u32) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(path.to_vec())?,
        utf16_offset: offset,
        affinity: Affinity::After,
    })
}
fn caret(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}
fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![
        ActionRegistration::with_input(
            ActionId::try_new("test/type")?,
            insert_text_input_contract(),
            InsertFlatListTextAction,
        ),
        ActionRegistration::with_input(
            insert_flat_list_plain_text_action_id(),
            insert_plain_text_input_contract(),
            InsertFlatListPlainTextAction,
        ),
        ActionRegistration::new(insert_flat_list_break_action_id(), InsertFlatListBreakAction),
        ActionRegistration::new(
            delete_flat_list_backward_action_id(),
            DeleteFlatListBackwardAction,
        ),
        ActionRegistration::new(delete_flat_list_forward_action_id(), DeleteFlatListForwardAction),
        ActionRegistration::new(
            delete_flat_list_selection_action_id(),
            DeleteFlatListSelectionAction,
        ),
        ActionRegistration::new(
            clear_flat_list_inline_formats_action_id(),
            ClearFlatListInlineFormatsAction,
        ),
        ActionRegistration::new(
            ActionId::try_new("test/heading")?,
            SetFlatListBlockKindAction::new(heading(3)?),
        ),
        ActionRegistration::new(
            ActionId::try_new("test/bullet")?,
            WrapListAction::new(ListKind::Bullet),
        ),
        ActionRegistration::new(
            ActionId::try_new("test/ordered")?,
            WrapListAction::new(ListKind::Ordered(OrderedListStart::try_new(8)?)),
        ),
        ActionRegistration::new(ActionId::try_new("test/unwrap")?, UnwrapListAction),
        ActionRegistration::new(
            ActionId::try_new("test/strong")?,
            ToggleFlatListInlineFormatAction::new(name("breditor/strong")?),
        ),
        ActionRegistration::with_input(
            ActionId::try_new("test/link")?,
            set_inline_format_input_contract(),
            SetFlatListInlineFormatAction::new(name("example/link")?),
        ),
    ])?)
}
fn run(session: &mut EditorSession, invocation: &ActionInvocation) -> TestResult {
    session.execute_prepared_action(registry()?.prepare(session.state(), invocation)?)?;
    Ok(())
}
fn no_input(session: &mut EditorSession, id: &str) -> TestResult {
    run(session, &ActionInvocation::without_input(ActionId::try_new(id)?))
}
fn typing(value: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(
        ActionId::try_new("test/type")?,
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string(value)?),
    ))
}
fn paste(value: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(
        insert_flat_list_plain_text_action_id(),
        ActionInput::typed(
            insert_plain_text_input_contract(),
            ActionValue::try_from_string(value)?,
        ),
    ))
}
fn select(session: &mut EditorSession, selection: Selection) -> TestResult {
    session.apply_transaction(
        &Transaction::new(session.state(), vec![])
            .with_selection_update(SelectionUpdate::Set(Some(selection)))
            .with_pending_formats_update(PendingFormatsUpdate::Set(None)),
    )?;
    Ok(())
}
fn initial(context: &EditorContext) -> Result<EditorState, Box<dyn Error>> {
    state(
        context,
        vec![list(block(heading(2)?, "a🙂b", formats()?)?)?],
        caret(point(&[0, 0, 0, 0], 1)?),
        Some(formats()?),
    )
}
fn small(context: &EditorContext) -> Result<EditorSession, Box<dyn Error>> {
    let mut session = EditorSession::new(initial(context)?);
    run(&mut session, &typing("X")?)?;
    no_input(&mut session, "breditor/insert-flat-list-break")?;
    Ok(session)
}
fn fixture(context: &EditorContext) -> Result<EditorSession, Box<dyn Error>> {
    let start = state(
        context,
        vec![
            block(heading(2)?, "a🙂b", formats()?)?,
            block(heading(4)?, "e\u{301}z", formats()?)?,
            block(TextBlockKind::Paragraph, "tail", formats()?)?,
        ],
        caret(point(&[0, 0], 1)?),
        Some(formats()?),
    )?;
    let mut session = EditorSession::new(start);
    run(&mut session, &typing("X")?)?;
    no_input(&mut session, "test/ordered")?;
    no_input(&mut session, "breditor/insert-flat-list-break")?;
    run(&mut session, &typing("Y")?)?;
    no_input(&mut session, "test/heading")?;
    run(&mut session, &paste("\nQ\n")?)?;
    no_input(&mut session, "breditor/delete-flat-list-backward")?;
    select(&mut session, RangeSelection::new(point(&[1, 0], 1)?, point(&[0, 0, 0, 0], 1)?).into())?;
    no_input(&mut session, "breditor/clear-flat-list-inline-formats")?;
    no_input(&mut session, "breditor/delete-flat-list-selection")?;
    no_input(&mut session, "test/unwrap")?;
    no_input(&mut session, "test/bullet")?;
    select(&mut session, caret(point(&[0, 0, 0, 0], 0)?))?;
    no_input(&mut session, "breditor/delete-flat-list-backward")?;
    select(&mut session, caret(point(&[0, 0], 3)?))?;
    no_input(&mut session, "breditor/delete-flat-list-forward")?;
    no_input(&mut session, "test/ordered")?;
    select(
        &mut session,
        RangeSelection::new(point(&[0, 0, 0, 0], 7)?, point(&[0, 0, 0, 0], 0)?).into(),
    )?;
    let input = ActionValue::try_object(vec![
        ("operation".into(), ActionValue::try_from_string("set")?),
        (
            "properties".into(),
            ActionValue::try_array(vec![ActionValue::try_object(vec![
                ("name".into(), ActionValue::try_from_string("example/href")?),
                ("value".into(), ActionValue::try_from_string("new")?),
            ])?])?,
        ),
    ])?;
    run(
        &mut session,
        &ActionInvocation::new(
            ActionId::try_new("test/link")?,
            ActionInput::typed(set_inline_format_input_contract(), input),
        ),
    )?;
    no_input(&mut session, "test/strong")?;
    Ok(session)
}
fn same(a: &EditorState, b: &EditorState) {
    assert_eq!(a.snapshot(), b.snapshot());
    assert_eq!(a.document(), b.document());
    assert_eq!(a.selection(), b.selection());
    assert_eq!(a.pending_formats(), b.pending_formats());
}
fn exercise_branches(original: &mut EditorSession, restored: &mut EditorSession) -> TestResult {
    same(restored.state(), original.state());
    assert_eq!(restored.undo_depth(), original.undo_depth());
    assert_eq!(restored.redo_depth(), original.redo_depth());
    assert_eq!(restored.history_capacity(), original.history_capacity());
    while original.can_undo() {
        original.undo()?.ok_or("undo")?;
        restored.undo()?.ok_or("restored undo")?;
        same(restored.state(), original.state());
    }
    while original.can_redo() {
        original.redo()?.ok_or("redo")?;
        restored.redo()?.ok_or("restored redo")?;
        same(restored.state(), original.state());
    }
    Ok(())
}

#[test]
fn real_list_actions_restore_every_cursor_and_both_branches_in_fresh_contexts() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let codec = SessionCheckpointJsonCodecV6::new(context.clone());
    let depth = fixture(&context)?.undo_depth();
    assert!(depth >= 12);
    for count in 0..=depth {
        let mut original = fixture(&context)?;
        for _ in 0..count {
            original.undo()?.ok_or("undo")?;
        }
        let encoded = codec.encode(&original)?;
        let reader = SessionCheckpointJsonCodecV6::new(self::context(DocumentLimits::default())?);
        let mut restored = reader.decode(&encoded)?;
        assert_eq!(reader.encode(&restored)?, encoded);
        assert_ne!(restored.history_status(), original.history_status());
        assert!(codec.encode(&restored).is_err());
        exercise_branches(&mut original, &mut restored)?;
        assert_eq!(reader.encode(&restored)?, codec.encode(&original)?);
        let saved: Value = serde_json::from_str(&encoded)?;
        assert_eq!(saved["formatVersion"], 6);
        assert_eq!(saved["historyBase"]["formatVersion"], 3);
        assert!(
            saved["entries"]
                .as_array()
                .ok_or("entries")?
                .iter()
                .all(|entry| entry.get("inverseOperations").is_none())
        );
    }
    Ok(())
}

#[test]
fn typing_merge_continues_after_reload_and_new_edit_replaces_redo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let codec = SessionCheckpointJsonCodecV6::new(context.clone());
    let mut original = EditorSession::new(initial(&context)?);
    run(&mut original, &typing("X")?)?;
    let mut restored = codec.decode(&codec.encode(&original)?)?;
    run(&mut restored, &typing("Y")?)?;
    assert_eq!(restored.undo_depth(), 1);
    restored.undo()?.ok_or("undo")?;
    assert_eq!(restored.state().document(), initial(&context)?.document());
    assert_eq!(restored.state().pending_formats(), Some(&formats()?));
    let mut restored = codec.decode(&codec.encode(&restored)?)?;
    run(&mut restored, &typing("Z")?)?;
    assert_eq!(restored.redo_depth(), 0);
    assert_eq!(restored.undo_depth(), 1);
    assert_eq!(codec.encode(&codec.decode(&codec.encode(&restored)?)?)?, codec.encode(&restored)?);
    Ok(())
}

#[test]
fn state_only_selection_and_pending_formats_preserve_a_saved_redo_branch() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let mut source = small(&context)?;
    source.undo()?.ok_or("undo")?;
    select(&mut source, caret(point(&[0, 0, 0, 0], 0)?))?;
    no_input(&mut source, "breditor/clear-flat-list-inline-formats")?;
    assert_eq!(source.state().pending_formats(), Some(&FormatSet::default()));
    assert_eq!(source.redo_depth(), 1);
    let codec = SessionCheckpointJsonCodecV6::new(context);
    let mut restored = codec.decode(&codec.encode(&source)?)?;
    exercise_branches(&mut source, &mut restored)
}

#[test]
fn empty_item_pending_state_and_zero_history_capacity_restore() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let selected = Point::Children {
        parent_path: NodePath::try_from_indices(vec![0, 0, 0])?,
        child_index: 0,
        affinity: Affinity::Before,
    };
    let before = state(
        &context,
        vec![list(block(heading(6)?, "", FormatSet::default())?)?],
        caret(selected),
        Some(formats()?),
    )?;
    let source = EditorSession::with_history_capacity(before, HistoryCapacity::try_new(0)?);
    let codec = SessionCheckpointJsonCodecV6::new(context);
    let restored = codec.decode(&codec.encode(&source)?)?;
    same(restored.state(), source.state());
    assert_eq!(restored.undo_depth(), 0);
    assert_eq!(restored.redo_depth(), 0);
    Ok(())
}

#[test]
fn capacity_eviction_preserves_the_correct_list_history_base() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let mut source =
        EditorSession::with_history_capacity(initial(&context)?, HistoryCapacity::try_new(2)?);
    let mut first = None;
    for input in ["X\nY", "Q\nR", "M\nN"] {
        run(&mut source, &paste(input)?)?;
        if first.is_none() {
            first = Some(source.state().clone());
        }
    }
    let codec = SessionCheckpointJsonCodecV6::new(context);
    let mut restored = codec.decode(&codec.encode(&source)?)?;
    assert_eq!(restored.undo_depth(), 2);
    restored.undo()?.ok_or("undo")?;
    restored.undo()?.ok_or("undo")?;
    let first = first.ok_or("first")?;
    assert_eq!(restored.state().document(), first.document());
    assert_eq!(restored.state().selection(), first.selection());
    assert!(restored.undo()?.is_none());
    Ok(())
}

#[test]
fn stale_future_guard_and_invalid_future_editor_values_reject_entire_checkpoint() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let mut source = small(&context)?;
    source.undo()?.ok_or("undo")?;
    let codec = SessionCheckpointJsonCodecV6::new(context);
    let encoded = codec.encode(&source)?;
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["entries"][1]["forwardOperations"][0]["expected"]["children"][0]["children"][0]["children"]
        [0]["children"][0]["text"] = json!("changed");
    assert!(
        matches!(codec.decode(&value.to_string()),Err(SessionCheckpointV6CodecError::InvalidCheckpoint(error))if matches!(error.as_ref(),SessionCheckpointCodecError::Apply(error)if error.entry_index()==1&&error.operation_index()==Some(0)&&error.direction()==SessionCheckpointReplayDirection::Forward))
    );
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["entries"][1]["resultSelection"] =
        serde_json::to_value(super::editor_value_payload_v1::encode_selection_record_v1(&caret(
            point(&[0, 99, 0, 0], 0)?,
        )))?;
    assert!(codec.decode(&value.to_string()).is_err());
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["entries"][1]["resultPendingFormats"] =
        json!([{"kind":"example/link","properties":{"example/href":42}}]);
    assert!(codec.decode(&value.to_string()).is_err());
    assert_eq!(source.redo_depth(), 1);
    Ok(())
}

#[test]
fn bad_list_payload_reports_entry_and_operation_and_old_versions_stay_closed() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = small(&context)?;
    let codec = SessionCheckpointJsonCodecV6::new(context.clone());
    let encoded = codec.encode(&source)?;
    assert!(SessionCheckpointJsonCodecV5::new(context.clone()).encode(&source).is_err());
    assert!(SessionCheckpointJsonCodecV5::new(context.clone()).decode(&encoded).is_err());
    assert!(
        SessionCheckpointJsonCodecV5::new(context)
            .decode(&encoded.replacen("\"formatVersion\":6", "\"formatVersion\":5", 1))
            .is_err()
    );
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["entries"][0]["forwardOperations"][0]["replacement"]["runs"][0]["formats"][1]["properties"]
        ["example/href"] = json!(null);
    assert!(matches!(
        codec.decode(&value.to_string()),
        Err(SessionCheckpointV6CodecError::OperationPayload {
            entry_index: 0,
            operation_index: 0,
            ..
        })
    ));
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["entries"][1]["forwardOperations"][0]["layout"] =
        json!([{"kind":"ordered","start":2_147_483_647,"items":2}]);
    assert!(matches!(
        codec.decode(&value.to_string()),
        Err(SessionCheckpointV6CodecError::OperationPayload {
            entry_index: 1,
            operation_index: 0,
            ..
        })
    ));
    Ok(())
}

#[test]
fn input_output_and_aggregate_budgets_reject_before_returning_a_session() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = small(&context)?;
    let encoded = SessionCheckpointJsonCodecV6::new(context.clone()).encode(&source)?;
    for delta in [0, 1] {
        let bounded = SessionCheckpointJsonCodecV6::new(EditorContext::new(
            context.schema().clone(),
            DocumentLimits::default().with_max_json_bytes(encoded.len() - delta),
        ));
        if delta == 0 {
            let restored = bounded.decode(&encoded)?;
            assert_eq!(bounded.encode(&restored)?, encoded);
        } else {
            assert!(matches!(
                bounded.decode(&encoded),
                Err(SessionCheckpointV6CodecError::InputTooLarge { .. })
            ));
        }
    }
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["historyBase"] = json!(null);
    value["entries"][0]["forwardOperations"] = json!([null]);
    let bounded = SessionCheckpointJsonCodecV6::new(context.clone())
        .with_limits(SessionCheckpointLimits::default().with_max_aggregate_forward_operations(1));
    assert_eq!(
        bounded.decode(&value.to_string()).err().ok_or("count")?.code(),
        CodecErrorCode::ResourceLimit
    );
    assert_eq!(bounded.encode(&source).err().ok_or("count")?.code(), CodecErrorCode::ResourceLimit);
    for limits in [
        SessionCheckpointLimits::default().with_max_retained_nodes(1),
        SessionCheckpointLimits::default().with_max_retained_text_bytes(1),
        SessionCheckpointLimits::default().with_max_retained_property_values(1),
        SessionCheckpointLimits::default().with_max_retained_property_string_bytes(1),
    ] {
        let bounded = SessionCheckpointJsonCodecV6::new(context.clone()).with_limits(limits);
        assert_eq!(
            bounded.decode(&encoded).err().ok_or("budget")?.code(),
            CodecErrorCode::ResourceLimit
        );
        assert_eq!(
            bounded.encode(&source).err().ok_or("budget")?.code(),
            CodecErrorCode::ResourceLimit
        );
    }
    Ok(())
}

proptest! {
    #[test]
    fn randomized_list_edit_sessions_restore_every_retained_boundary(
        inputs in prop::collection::vec("[a-z🙂\n]{1,8}",0..7),cursor in 0_u32..30,
    ) {
        let result=(||->TestResult {
            let context=context(DocumentLimits::default())?;let mut original=EditorSession::new(initial(&context)?);
            for (index,input) in inputs.iter().enumerate(){run(&mut original,&paste(input)?)?;run(&mut original,&typing("X")?)?;no_input(&mut original,if index%2==0{"test/bullet"}else{"test/ordered"})?;}
            let count=cursor%(original.undo_depth()+1);for _ in 0..count{original.undo()?.ok_or("undo")?;}
            let codec=SessionCheckpointJsonCodecV6::new(context);let encoded=codec.encode(&original)?;let mut restored=codec.decode(&encoded)?;assert_eq!(codec.encode(&restored)?,encoded);exercise_branches(&mut original,&mut restored)?;Ok(())
        })();prop_assert!(result.is_ok(),"{result:?}");
    }
}
