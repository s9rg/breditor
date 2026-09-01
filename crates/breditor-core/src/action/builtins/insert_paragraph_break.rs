use crate::{
    action::{Action, ActionDecision, ActionFault, ActionId, ActionPlan},
    document::TextFragment,
    identity::QualifiedName,
    operation::{Operation, ParagraphSplit, TextRange, TextSplice},
    position::{Affinity, Point},
    selection::Selection,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

use super::{
    super::text_position::right_paragraph_path,
    support::{
        base_shape_fits, collapsed_selection, disabled, fault, fragment_range_parts,
        paragraph_fragment, require_base_range, require_operation_budget, strict_relocation,
    },
};

/// Semantic action that replaces a same-paragraph selection with a paragraph break.
///
/// A collapsed range becomes one [`ParagraphSplit`]. An extended range chooses
/// a deterministic split/delete ordering whose intermediate state satisfies the
/// active limits, and publishes both operations in one atomic transaction.
/// Cross-paragraph ranges remain deliberately disabled until a native
/// block-range replacement operation exists.
#[derive(Clone, Copy, Debug, Default)]
pub struct InsertParagraphBreakAction;

/// Returns the stable built-in paragraph-break action identity.
#[must_use]
pub fn insert_paragraph_break_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/insert-paragraph-break",
    ))
}

impl Action for InsertParagraphBreakAction {
    type Input = ();

    fn evaluate(
        &self,
        state: &EditorState,
        (): &Self::Input,
    ) -> Result<ActionDecision, ActionFault> {
        let range = match require_base_range(state)? {
            Ok(range) => range,
            Err(reason) => return Ok(ActionDecision::Disabled(reason)),
        };
        let operation_count = if range.is_collapsed() { 1 } else { 2 };
        if let Some(decision) = require_operation_budget(state, operation_count) {
            return Ok(decision);
        }

        let paragraph_path = range.start().paragraph_path();
        let split_offset = range.start().offset();
        let source = paragraph_fragment(state, paragraph_path, split_offset)?;
        let operations = if range.is_collapsed() {
            let (left, right) = source
                .split_at(split_offset)
                .map_err(|_| fault("breditor/fragment-split-fault"))?;
            if !base_shape_fits(state, 1, source.len(), &[&left, &right]) {
                return Ok(disabled("breditor/result-limit-exceeded"));
            }
            let split = ParagraphSplit::try_new(paragraph_path.clone(), split_offset, source)
                .map_err(|_| fault("breditor/paragraph-split-construction-fault"))?;
            vec![Operation::from(split)]
        } else {
            let (prefix, selected, suffix) =
                fragment_range_parts(&source, range.start().offset(), range.end().offset())?;
            if !base_shape_fits(state, 1, source.len(), &[&prefix, &suffix]) {
                return Ok(disabled("breditor/result-limit-exceeded"));
            }
            let tail = selected
                .try_concat(&suffix)
                .map_err(|_| fault("breditor/fragment-concat-fault"))?;
            if base_shape_fits(state, 1, source.len(), &[&prefix, &tail]) {
                split_then_delete(paragraph_path, split_offset, source, selected)?
            } else {
                let Ok(without_selection) = prefix.try_concat(&suffix) else {
                    return Ok(disabled("breditor/intermediate-limit-exceeded"));
                };
                if !base_shape_fits(state, 1, source.len(), &[&without_selection]) {
                    return Ok(disabled("breditor/intermediate-limit-exceeded"));
                }
                delete_then_split(
                    state,
                    paragraph_path,
                    range.start().offset(),
                    range.end().offset(),
                    split_offset,
                    without_selection,
                )?
            }
        };

        let result_paragraph = right_paragraph_path(paragraph_path)
            .map_err(|_| fault("breditor/result-paragraph-path-fault"))?;
        let caret = Point::Children {
            parent_path: result_paragraph,
            child_index: 0,
            affinity: Affinity::After,
        };
        let selection: Selection = collapsed_selection(caret);
        Ok(ActionDecision::Enabled(ActionPlan::new(
            operations,
            strict_relocation(),
            SelectionUpdate::Set(Some(selection)),
            PendingFormatsUpdate::Set(state.pending_formats().cloned()),
            HistoryIntent::Record,
        )))
    }
}

fn split_then_delete(
    paragraph_path: &crate::position::NodePath,
    split_offset: crate::position::TextOffset,
    source: TextFragment,
    selected: TextFragment,
) -> Result<Vec<Operation>, ActionFault> {
    let right_path = right_paragraph_path(paragraph_path)
        .map_err(|_| fault("breditor/result-paragraph-path-fault"))?;
    let split = ParagraphSplit::try_new(paragraph_path.clone(), split_offset, source)
        .map_err(|_| fault("breditor/paragraph-split-construction-fault"))?;
    let splice_range =
        TextRange::try_new(right_path, crate::position::TextOffset::ZERO, selected.utf16_len())
            .map_err(|_| fault("breditor/text-range-construction-fault"))?;
    let splice = TextSplice::try_new(splice_range, selected, TextFragment::empty())
        .map_err(|_| fault("breditor/text-splice-construction-fault"))?;
    Ok(vec![Operation::from(split), Operation::from(splice)])
}

fn delete_then_split(
    state: &EditorState,
    paragraph_path: &crate::position::NodePath,
    start: crate::position::TextOffset,
    end: crate::position::TextOffset,
    split_offset: crate::position::TextOffset,
    without_selection: TextFragment,
) -> Result<Vec<Operation>, ActionFault> {
    let splice_range = TextRange::try_new(paragraph_path.clone(), start, end)
        .map_err(|_| fault("breditor/text-range-construction-fault"))?;
    let splice =
        TextSplice::capture(state.context(), state.document(), splice_range, TextFragment::empty())
            .map_err(|_| fault("breditor/text-splice-capture-fault"))?;
    let split = ParagraphSplit::try_new(paragraph_path.clone(), split_offset, without_selection)
        .map_err(|_| fault("breditor/paragraph-split-construction-fault"))?;
    Ok(vec![Operation::from(splice), Operation::from(split)])
}
