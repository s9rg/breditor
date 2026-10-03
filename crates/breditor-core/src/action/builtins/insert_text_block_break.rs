//! Atomic Enter behavior in the experimental paragraph/heading profile.
use super::{
    support::{
        collapsed_selection, disabled, fault, require_operation_budget, require_text_block_range,
        strict_relocation,
    },
    text_block_support::text_block_source,
};
use crate::{
    action::{Action, ActionDecision, ActionEvaluation, ActionFault, ActionId, ActionPlan},
    block::TextBlockKind,
    document::{ElementNode, NodeRef, PropertyMap},
    identity::QualifiedName,
    operation::{
        Operation, RootTextBoundary, RootTextRange, TextBlockReplace, TextBlockReplaceError,
        block_kind,
    },
    position::{Affinity, NodePath, Point},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

/// Inserts a semantic block break, replacing the exact active text selection.
///
/// Nonempty headings split into two same-rank headings; at their end the right
/// block is a paragraph. Enter in an empty heading changes it to a paragraph
/// without adding a block. At the start of a nonempty heading, the empty left
/// heading retains its rank. Cross-block selection keeps the spatial start
/// kind on the left and end kind on the right, except an empty right suffix
/// becomes a paragraph. Source direction does not alter these choices.
///
/// The result caret is at the right block start (or converted empty block).
/// Pending formats survive and each break is one undo event. Experimental only:
/// no base/browser registration and no durable encoding yet.
#[derive(Clone, Copy, Debug, Default)]
pub struct InsertTextBlockBreakAction;

/// Returns the opt-in experimental block-break identity.
#[must_use]
pub fn insert_text_block_break_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/insert-text-block-break",
    ))
}

impl Action for InsertTextBlockBreakAction {
    type Input = ();
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state).map(ActionEvaluation::stateless)
    }
}

fn evaluate(state: &EditorState) -> Result<ActionDecision, ActionFault> {
    let range = match require_text_block_range(state)? {
        Ok(range) => range,
        Err(reason) => return Ok(ActionDecision::Disabled(reason)),
    };
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    let (first, source) = text_block_source(state, range.start().paragraph_path())?;
    let (last, tail) = text_block_source(state, range.end().paragraph_path())?;
    let first_kind = block_kind(&first).map_err(|_| fault("breditor/text-block-source-fault"))?;
    let exit_empty = range.is_collapsed()
        && source.is_empty()
        && matches!(first_kind, TextBlockKind::Heading(_));
    let replacement = if exit_empty {
        vec![empty_block(&first, true)?]
    } else {
        vec![
            empty_block(&first, false)?,
            empty_block(&last, range.end().offset() == tail.utf16_len())?,
        ]
    };
    let start =
        RootTextBoundary::try_new(range.start().paragraph_path().clone(), range.start().offset())
            .map_err(|_| fault("breditor/text-block-break-range-fault"))?;
    let end = RootTextBoundary::try_new(range.end().paragraph_path().clone(), range.end().offset())
        .map_err(|_| fault("breditor/text-block-break-range-fault"))?;
    let operation_range = RootTextRange::try_new(start, end)
        .map_err(|_| fault("breditor/text-block-break-range-fault"))?;
    let operation =
        TextBlockReplace::capture(state.context(), state.document(), operation_range, replacement)
            .and_then(|operation| {
                operation.apply(state.context(), state.document())?;
                Ok(operation)
            });
    let operation = match operation {
        Ok(operation) => operation,
        Err(TextBlockReplaceError::RootChildLimit | TextBlockReplaceError::Validation(_)) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(_) => return Err(fault("breditor/text-block-break-plan-fault")),
    };
    let index = range
        .start()
        .paragraph_path()
        .last_index()
        .ok_or_else(|| fault("breditor/text-block-break-range-fault"))?;
    let index = if exit_empty {
        index
    } else {
        index.checked_add(1).ok_or_else(|| fault("breditor/text-block-break-range-fault"))?
    };
    let path = NodePath::try_from_indices(vec![index])
        .map_err(|_| fault("breditor/text-block-break-range-fault"))?;
    let selection = collapsed_selection(Point::Children {
        parent_path: path,
        child_index: 0,
        affinity: Affinity::After,
    });
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::TextBlockReplace(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(selection)),
        PendingFormatsUpdate::Set(state.pending_formats().cloned()),
        HistoryIntent::Record,
    )))
}

fn empty_block(template: &NodeRef, paragraph: bool) -> Result<NodeRef, ActionFault> {
    let element = if paragraph {
        ElementNode::try_new(
            QualifiedName::from_known_static("breditor/paragraph"),
            None,
            PropertyMap::default(),
            vec![],
        )
    } else {
        template
            .as_element()
            .ok_or_else(|| fault("breditor/text-block-source-fault"))?
            .try_with_children(vec![])
    }
    .map_err(|_| fault("breditor/text-block-break-node-fault"))?;
    Ok(NodeRef::element(element))
}
