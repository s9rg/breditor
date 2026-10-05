//! V7 nested session recovery across independently compiled contexts and cursors.
use super::structural_codec_test_support::{TestResult, block, extensions, formats, name, state};
use super::{SessionCheckpointJsonCodecV6, SessionCheckpointJsonCodecV7};
use crate::{
    action::{
        ActionId, ActionInvocation, ActionRegistration, ActionRegistry,
        builtins::{IndentListItemsAction, OutdentListItemsAction},
    },
    block::TextBlockKind,
    document::{ElementNode, NodeRef, PropertyMap},
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState},
};
use std::error::Error;

fn context() -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_nested_list_profile(
            SchemaId::new(name("test/nested-session-v7")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        DocumentLimits::default(),
    ))
}
fn element(kind: &str, children: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    Ok(NodeRef::element(ElementNode::try_new(name(kind)?, None, PropertyMap::default(), children)?))
}
fn exact(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.document().root(), expected.document().root());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}

#[test]
fn nested_session_v7_recovers_every_cursor_and_retains_exact_undo_redo() -> TestResult {
    let context = context()?;
    let mut items = Vec::new();
    for text in ["first", "a🙂b", "last"] {
        items.push(element(
            "breditor/list-item",
            vec![block(TextBlockKind::Paragraph, text, formats()?)?],
        )?);
    }
    let point = |offset| -> Result<Point, Box<dyn Error>> {
        Ok(Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 1, 0, 0])?,
            utf16_offset: offset,
            affinity: Affinity::After,
        })
    };
    let before = state(
        &context,
        vec![element("breditor/bullet-list", items)?],
        Selection::Range(RangeSelection::new(point(4)?, point(1)?)),
        None,
    )?;
    let registry = ActionRegistry::try_new(vec![
        ActionRegistration::new(ActionId::try_new("test/indent")?, IndentListItemsAction),
        ActionRegistration::new(ActionId::try_new("test/outdent")?, OutdentListItemsAction),
    ])?;
    let mut session = EditorSession::new(before.clone());
    let mut boundaries = vec![before];
    for id in ["test/indent", "test/outdent"] {
        let prepared = registry
            .prepare(session.state(), &ActionInvocation::without_input(ActionId::try_new(id)?))?;
        session.execute_prepared_action(prepared)?;
        boundaries.push(session.state().clone());
    }
    assert_eq!(session.undo_depth(), 2);
    let codec = SessionCheckpointJsonCodecV7::new(context.clone());
    for cursor in (0..=2).rev() {
        let json = codec.encode(&session)?;
        // New compiler proof models a new process; no in-memory schema identity
        // or operation handles are reused by the decoder.
        let fresh = SessionCheckpointJsonCodecV7::new(self::context()?);
        let mut restored = fresh.decode(&json)?;
        assert_eq!(fresh.encode(&restored)?, json);
        exact(restored.state(), &boundaries[cursor]);
        assert_eq!(restored.undo_depth(), u32::try_from(cursor)?);
        assert_eq!(restored.redo_depth(), u32::try_from(2 - cursor)?);
        for index in (0..cursor).rev() {
            restored.undo()?.ok_or("missing recovered undo")?;
            exact(restored.state(), &boundaries[index]);
        }
        for expected in boundaries.iter().skip(1) {
            restored.redo()?.ok_or("missing recovered redo")?;
            exact(restored.state(), expected);
        }
        assert!(SessionCheckpointJsonCodecV6::new(context.clone()).decode(&json).is_err());
        let value: serde_json::Value = serde_json::from_str(&json)?;
        for changed in [
            {
                let mut v = value.clone();
                v["cursor"] = 99.into();
                v
            },
            {
                let mut v = value.clone();
                v["formatVersion"] = 6.into();
                v
            },
            {
                let mut v = value.clone();
                v["entries"][0]["forwardOperations"] = serde_json::json!([]);
                v
            },
        ] {
            assert!(fresh.decode(&serde_json::to_string(&changed)?).is_err());
        }
        if cursor > 0 {
            session.undo()?.ok_or("undo to next cursor")?;
        }
    }
    Ok(())
}
