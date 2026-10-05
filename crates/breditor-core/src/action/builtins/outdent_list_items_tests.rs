//! Outdent reading-order and exact history regressions.
use super::{
    OutdentListItemsAction,
    indent_list_items_tests::{item, list},
};
use crate::{
    action::{
        Action, ActionDecision, ActionId, ActionInvocation, ActionRegistration, ActionRegistry,
    },
    block::TextBlockKind,
    codec::structural_codec_test_support::{TestResult, block, extensions, formats, name, state},
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::EditorContext,
};
use std::error::Error;

#[test]
fn outdent_middle_prefix_suffix_and_whole_runs_preserve_reading_order_and_history() -> TestResult {
    for numbered in [false, true] {
        for (first, end) in [(0_usize, 1_usize), (1, 2), (1, 3), (0, 3)] {
            let context = EditorContext::new(
                CompiledSchema::try_compile_nested_list_profile(
                    SchemaId::new(name("test/nested-outdent")?, SchemaVersion::one()),
                    &extensions()?,
                )?,
                DocumentLimits::default(),
            );
            let text = |s| block(TextBlockKind::Paragraph, s, formats()?);
            let head = text("parent")?;
            let leaves = [text("aaa")?, text("bbb")?, text("ccc")?];
            let mut source_items = Vec::new();
            let mut child_lists = Vec::new();
            for label in ["child-a", "child-b", "child-c"] {
                child_lists.push(list(vec![item(vec![text(label)?])?], None)?);
            }
            for index in 0..3 {
                source_items.push(item(vec![leaves[index].clone(), child_lists[index].clone()])?);
            }
            let later = list(vec![item(vec![text("later-section")?])?], Some(42))?;
            let trailing = item(vec![text("outer-tail")?])?;
            let source = list(
                vec![
                    item(vec![
                        head.clone(),
                        list(source_items.clone(), numbered.then_some(5))?,
                        later.clone(),
                    ])?,
                    trailing.clone(),
                ],
                Some(9),
            )?;
            let point = |index, offset| -> Result<Point, Box<dyn Error>> {
                Ok(Point::Text {
                    text_path: NodePath::try_from_indices(vec![
                        0,
                        0,
                        1,
                        u32::try_from(index)?,
                        0,
                        0,
                    ])?,
                    utf16_offset: offset,
                    affinity: Affinity::After,
                })
            };
            let before = state(
                &context,
                vec![source],
                Selection::Range(RangeSelection::new(point(end - 1, 3)?, point(first, 0)?)),
                None,
            )?;
            let mut session = EditorSession::new(before.clone());
            let id = ActionId::try_new("test/outdent")?;
            let registry = ActionRegistry::try_new(vec![ActionRegistration::new(
                id.clone(),
                OutdentListItemsAction,
            )])?;
            session.execute_prepared_action(
                registry.prepare(session.state(), &ActionInvocation::without_input(id))?,
            )?;
            let mut parent = vec![head];
            if first > 0 {
                parent.push(list(source_items[..first].to_vec(), numbered.then_some(5))?);
            }
            let mut expected = vec![item(parent)?];
            expected.extend(source_items[first..end - 1].iter().cloned());
            let mut last = vec![leaves[end - 1].clone(), child_lists[end - 1].clone()];
            if end < 3 {
                last.push(list(
                    source_items[end..].to_vec(),
                    numbered.then_some(5 + i64::try_from(end)?),
                )?);
            }
            last.push(later);
            expected.push(item(last)?);
            expected.push(trailing);
            let expected = list(expected, Some(9))?;
            assert_eq!(
                session.state().document().root().as_element().ok_or("root")?.children().get(0),
                Some(&expected)
            );
            let after = session.state().clone();
            assert_eq!(session.undo_depth(), 1);
            let mapped = |index, offset| -> Result<Point, Box<dyn Error>> {
                Ok(Point::Text {
                    text_path: NodePath::try_from_indices(vec![0, u32::try_from(index)?, 0, 0])?,
                    utf16_offset: offset,
                    affinity: Affinity::After,
                })
            };
            assert_eq!(
                after.selection(),
                Some(&Selection::Range(RangeSelection::new(
                    mapped(end - first, 3)?,
                    mapped(1, 0)?
                )))
            );
            assert!(
                matches!(OutdentListItemsAction.evaluate(&after, &())?.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/list-already-root")
            );
            session.undo()?.ok_or("undo")?;
            assert_eq!(session.state().document(), before.document());
            assert_eq!(session.state().selection(), before.selection());
            session.redo()?.ok_or("redo")?;
            assert_eq!(session.state().document(), after.document());
            assert_eq!(session.state().selection(), after.selection());
        }
    }
    Ok(())
}
