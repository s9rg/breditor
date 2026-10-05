//! Registry/history tests with independently constructed nested trees.
use super::IndentListItemsAction;
use crate::{
    action::{
        Action, ActionDecision, ActionId, ActionInvocation, ActionRegistration, ActionRegistry,
    },
    block::TextBlockKind,
    codec::structural_codec_test_support::{TestResult, block, extensions, formats, name, state},
    document::{ElementNode, NodeRef, PropertyInteger, PropertyMap, PropertyValue},
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::EditorContext,
};
use std::error::Error;
pub(super) fn item(children: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    Ok(NodeRef::element(ElementNode::try_new(
        name("breditor/list-item")?,
        None,
        PropertyMap::default(),
        children,
    )?))
}
pub(super) fn list(items: Vec<NodeRef>, start: Option<i64>) -> Result<NodeRef, Box<dyn Error>> {
    let props = if let Some(start) = start {
        PropertyMap::try_from_sorted(vec![(
            name("breditor/start")?,
            PropertyValue::from_integer(PropertyInteger::try_new(start)?),
        )])?
    } else {
        PropertyMap::default()
    };
    Ok(NodeRef::element(ElementNode::try_new(
        name(if start.is_some() { "breditor/ordered-list" } else { "breditor/bullet-list" })?,
        None,
        props,
        items,
    )?))
}
fn selection(index: u32) -> Result<Selection, Box<dyn Error>> {
    let point = |offset| -> Result<Point, Box<dyn Error>> {
        Ok(Point::Text {
            text_path: NodePath::try_from_indices(vec![0, index, 0, 0])?,
            utf16_offset: offset,
            affinity: Affinity::After,
        })
    };
    Ok(Selection::Range(RangeSelection::new(point(3)?, point(0)?)))
}
#[test]
fn indent_preserves_descendants_numbering_and_exact_history() -> TestResult {
    for ordered in [false, true] {
        for existing in [false, true] {
            let context = EditorContext::new(
                CompiledSchema::try_compile_nested_list_profile(
                    SchemaId::new(name("test/nested-indent")?, SchemaVersion::one()),
                    &extensions()?,
                )?,
                DocumentLimits::default(),
            );
            let text = |s| block(TextBlockKind::Paragraph, s, formats()?);
            let a = text("aaa")?;
            let child = item(vec![text("old")?])?;
            let b = item(vec![text("a🙂b")?, list(vec![item(vec![text("descendant")?])?], None)?])?;
            let tail = item(vec![text("tail")?])?;
            let start = ordered.then_some(7);
            let mut first = vec![a.clone()];
            if existing {
                first.push(list(vec![child.clone()], start)?);
            }
            let source = list(vec![item(first)?, b.clone(), tail.clone()], start)?;
            let before = state(&context, vec![source], selection(1)?, None)?;
            let limited_context = EditorContext::new(
                context.schema().clone(),
                DocumentLimits::default().with_max_node_depth(6),
            );
            let limited = state(
                &limited_context,
                before
                    .document()
                    .root()
                    .as_element()
                    .ok_or("root")?
                    .children()
                    .iter()
                    .cloned()
                    .collect(),
                selection(1)?,
                None,
            )?;
            assert!(matches!(IndentListItemsAction.evaluate(&limited, &())?.decision(),
                ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/result-limit-exceeded"));
            let mut session = EditorSession::new(before.clone());
            let id = ActionId::try_new("test/indent")?;
            let registry = ActionRegistry::try_new(vec![ActionRegistration::new(
                id.clone(),
                IndentListItemsAction,
            )])?;
            let prepared =
                registry.prepare(session.state(), &ActionInvocation::without_input(id))?;
            session.execute_prepared_action(prepared)?;
            let nested_items = if existing { vec![child, b] } else { vec![b] };
            let nested_start = ordered.then_some(if existing { 7 } else { 8 });
            let expected =
                list(vec![item(vec![a, list(nested_items, nested_start)?])?, tail], start)?;
            assert_eq!(
                session.state().document().root().as_element().ok_or("root")?.children().get(0),
                Some(&expected)
            );
            assert_eq!(session.undo_depth(), 1);
            let after = session.state().clone();
            session.undo()?.ok_or("undo")?;
            assert_eq!(session.state().document(), before.document());
            assert_eq!(session.state().selection(), before.selection());
            assert_eq!(session.state().pending_formats(), before.pending_formats());
            session.redo()?.ok_or("redo")?;
            assert_eq!(session.state().document(), after.document());
            assert_eq!(session.state().selection(), after.selection());
            let first = state(
                &context,
                before
                    .document()
                    .root()
                    .as_element()
                    .ok_or("root")?
                    .children()
                    .iter()
                    .cloned()
                    .collect(),
                selection(0)?,
                None,
            )?;
            assert!(
                matches!(IndentListItemsAction.evaluate(&first, &())?.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/no-preceding-list-item")
            );
        }
    }
    Ok(())
}
