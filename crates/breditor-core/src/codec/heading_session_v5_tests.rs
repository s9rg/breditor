//! Save/reload actual heading actions, including both retained history branches.
use super::structural_codec_test_support::{TestResult, block, context, formats, heading, state};
use super::*;
use crate::{
    action::{
        ActionId, ActionInput, ActionInvocation, ActionRegistration, ActionRegistry, ActionValue,
        builtins::*,
    },
    document::FormatSet,
    position::{Affinity, NodePath, Point},
    schema::DocumentLimits,
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState},
    transaction::{PendingFormatsUpdate, SelectionUpdate, Transaction},
};
use serde_json::{Value, json};
use std::error::Error;

fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![
        ActionRegistration::with_input(
            insert_text_block_text_action_id(),
            insert_text_input_contract(),
            InsertTextBlockTextAction,
        ),
        ActionRegistration::new(insert_text_block_break_action_id(), InsertTextBlockBreakAction),
        ActionRegistration::new(
            delete_text_block_backward_action_id(),
            DeleteTextBlockBackwardAction,
        ),
        ActionRegistration::new(
            delete_text_block_selection_action_id(),
            DeleteTextBlockSelectionAction,
        ),
        ActionRegistration::new(
            clear_text_block_inline_formats_action_id(),
            ClearTextBlockInlineFormatsAction,
        ),
        ActionRegistration::new(
            ActionId::try_new("example/heading")?,
            SetTextBlockKindAction::new(heading(3)?),
        ),
    ])?)
}
fn point(block: u32, offset: u32) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(vec![block, 0])?,
        utf16_offset: offset,
        affinity: Affinity::After,
    })
}
fn initial(context: &EditorContext) -> Result<EditorState, Box<dyn Error>> {
    let p = point(0, 1)?;
    state(
        context,
        vec![block(heading(2)?, "a🙂b", formats()?)?, block(heading(4)?, "e\u{301}z", formats()?)?],
        Selection::from(RangeSelection::new(p.clone(), p)),
        Some(formats()?),
    )
}
fn run(session: &mut EditorSession, invocation: &ActionInvocation) -> TestResult {
    session.execute_prepared_action(registry()?.prepare(session.state(), invocation)?)?;
    Ok(())
}
fn typing(text: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(
        insert_text_block_text_action_id(),
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}
fn fixture(context: &EditorContext) -> Result<EditorSession, Box<dyn Error>> {
    let mut session = EditorSession::new(initial(context)?);
    run(&mut session, &typing("X")?)?;
    run(&mut session, &ActionInvocation::without_input(ActionId::try_new("example/heading")?))?;
    run(&mut session, &ActionInvocation::without_input(insert_text_block_break_action_id()))?;
    run(&mut session, &typing("Y")?)?;
    run(&mut session, &ActionInvocation::without_input(delete_text_block_backward_action_id()))?;
    run(&mut session, &ActionInvocation::without_input(delete_text_block_backward_action_id()))?;
    let selected = RangeSelection::new(point(1, 2)?, point(0, 1)?).into();
    let selection = Transaction::new(session.state(), vec![])
        .with_selection_update(SelectionUpdate::Set(Some(selected)))
        .with_pending_formats_update(PendingFormatsUpdate::Set(None));
    session.apply_transaction(&selection)?;
    run(
        &mut session,
        &ActionInvocation::without_input(clear_text_block_inline_formats_action_id()),
    )?;
    run(&mut session, &ActionInvocation::without_input(delete_text_block_selection_action_id()))?;
    Ok(session)
}
fn same(a: &EditorState, b: &EditorState) {
    assert_eq!(a.snapshot(), b.snapshot());
    assert_eq!(a.document(), b.document());
    assert_eq!(a.selection(), b.selection());
    assert_eq!(a.pending_formats(), b.pending_formats());
}

#[test]
fn v5_heading_actions_reload_every_cursor_and_replay_both_branches_exactly() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let codec = SessionCheckpointJsonCodecV5::new(context.clone());
    let depth = fixture(&context)?.undo_depth();
    assert!(depth >= 6);
    for undo_count in 0..=depth {
        let mut original = fixture(&context)?;
        for _ in 0..undo_count {
            original.undo()?.ok_or("undo")?;
        }
        let encoded = codec.encode(&original)?;
        let independent = self::context(DocumentLimits::default())?;
        let reader = SessionCheckpointJsonCodecV5::new(independent);
        let mut restored = reader.decode(&encoded)?;
        same(restored.state(), original.state());
        assert_eq!(restored.undo_depth(), original.undo_depth());
        assert_eq!(restored.redo_depth(), original.redo_depth());
        assert_eq!(restored.history_capacity(), original.history_capacity());
        // Runtime preparation stamps are deliberately not portable identities.
        assert_ne!(restored.history_status(), original.history_status());
        assert_eq!(reader.encode(&restored)?, encoded);
        while original.can_undo() {
            original.undo()?.ok_or("original undo")?;
            restored.undo()?.ok_or("restored undo")?;
            same(restored.state(), original.state());
        }
        while original.can_redo() {
            original.redo()?.ok_or("original redo")?;
            restored.redo()?.ok_or("restored redo")?;
            same(restored.state(), original.state());
        }
        let expected = state(
            restored.state().context(),
            vec![block(heading(3)?, "az", formats()?)?],
            restored.state().selection().cloned(),
            None,
        )?;
        assert_eq!(restored.state().document(), expected.document());
    }
    Ok(())
}

#[test]
fn v5_heading_typing_merge_continues_after_reload_and_new_edit_replaces_redo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let mut original = EditorSession::new(initial(&context)?);
    run(&mut original, &typing("X")?)?;
    let codec = SessionCheckpointJsonCodecV5::new(context.clone());
    let mut restored = codec.decode(&codec.encode(&original)?)?;
    run(&mut restored, &typing("Y")?)?;
    assert_eq!(restored.undo_depth(), 1);
    restored.undo()?.ok_or("merged undo")?;
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
fn v5_stale_future_text_guard_rejects_the_whole_saved_session() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let mut source = fixture(&context)?;
    source.undo()?.ok_or("undo")?;
    let codec = SessionCheckpointJsonCodecV5::new(context);
    let mut value: Value = serde_json::from_str(&codec.encode(&source)?)?;
    let index = value["entries"].as_array().ok_or("entries")?.len() - 1;
    value["entries"][index]["forwardOperations"][0]["expected"]["children"][0]["children"][0]["text"] =
        json!("different");
    assert!(
        matches!(codec.decode(&value.to_string()), Err(SessionCheckpointV5CodecError::InvalidCheckpoint(error)) if matches!(error.as_ref(), SessionCheckpointCodecError::Apply(error) if error.entry_index() == u64::try_from(index).unwrap_or(u64::MAX)))
    );
    assert_eq!(source.redo_depth(), 1);
    Ok(())
}

#[test]
fn v5_heading_history_rejects_older_formats_and_reports_payload_indexes() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = fixture(&context)?;
    let codec = SessionCheckpointJsonCodecV5::new(context.clone());
    let encoded = codec.encode(&source)?;
    assert!(SessionCheckpointJsonCodecV4::new(context.clone()).encode(&source).is_err());
    assert!(SessionCheckpointJsonCodecV4::new(context.clone()).decode(&encoded).is_err());
    assert!(
        SessionCheckpointJsonCodecV4::new(context)
            .decode(&encoded.replacen("\"formatVersion\":5", "\"formatVersion\":4", 1))
            .is_err()
    );
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["entries"][0]["forwardOperations"][0]["replacement"]["runs"][0]["formats"][1]["properties"]
        ["example/href"] = json!(null);
    assert!(matches!(
        codec.decode(&value.to_string()),
        Err(SessionCheckpointV5CodecError::OperationPayload {
            entry_index: 0,
            operation_index: 0,
            ..
        })
    ));
    Ok(())
}

#[test]
fn v5_empty_heading_pending_typing_state_reloads_without_inventing_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let p = Point::Children {
        parent_path: NodePath::try_from_indices(vec![0])?,
        child_index: 0,
        affinity: Affinity::Before,
    };
    let before = state(
        &context,
        vec![block(heading(6)?, "", FormatSet::default())?],
        Selection::from(RangeSelection::new(p.clone(), p)),
        Some(formats()?),
    )?;
    let source = EditorSession::new(before);
    let codec = SessionCheckpointJsonCodecV5::new(context);
    let restored = codec.decode(&codec.encode(&source)?)?;
    same(restored.state(), source.state());
    assert_eq!(restored.undo_depth(), 0);
    assert_eq!(restored.redo_depth(), 0);
    Ok(())
}
