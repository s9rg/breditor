//! Selection-driven flat-list removal without discarding unselected items.
use super::{flat_list_support as support, support::disabled};
use crate::{
    action::{Action, ActionActivation, ActionEvaluation, ActionFault, ActionStateSpec},
    state::EditorState,
};

/// Lifts only touched list-item blocks to the root, preserving their exact kinds.
///
/// Unselected list prefixes/suffixes remain lists; numbered suffixes retain
/// their original first ordinal. Bare blocks are unchanged. Direction, text,
/// typed inline formats, pending formats and exact undo/redo are preserved.
/// A range ending at a later block's start excludes it; an empty-item caret
/// unwraps that item. One invocation records one history event. Opt-in only.
#[derive(Clone, Copy, Debug, Default)]
pub struct UnwrapListAction;
impl Action for UnwrapListAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        support::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        let source = match support::capture(state)? {
            Ok(source) => source,
            Err(decision) => return Ok(support::evaluation(decision, ActionActivation::Inactive)),
        };
        let activation = support::activation(&source, |kind| kind.is_some());
        if activation == ActionActivation::Inactive {
            return Ok(support::evaluation(disabled("breditor/list-unchanged"), activation));
        }
        let mut output = Vec::new();
        for section in &source.sections {
            if section.kind.is_none() {
                output.push(section.original.clone());
                continue;
            }
            support::retain(section, 0..section.selected.start, &mut output)?;
            output.extend(section.blocks[section.selected.clone()].iter().cloned());
            support::retain(section, section.selected.end..section.blocks.len(), &mut output)?;
        }
        Ok(support::evaluation(support::plan(state, &source, output)?, activation))
    }
}
