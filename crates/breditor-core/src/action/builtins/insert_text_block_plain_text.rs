//! Atomic normalized plain-text insertion for direct-root paragraphs and headings.

use super::{
    super::text_position::TextRangeSelection,
    InsertPlainTextAction, InsertPlainTextInput,
    delete_text_block_structure::root_range,
    insert_plain_text::{ReplacementError, derive_result, replacement_fragments, result_selection},
    insert_text::source_range,
    insert_text_block_structure::first_middle_formats,
    support::{
        disabled, effective_typing_formats, fault, fragment_range_parts, require_operation_budget,
        require_text_block_range, strict_relocation,
    },
    text_block_support::text_block_source,
};
use crate::{
    action::{
        Action, ActionDecision, ActionEvaluation, ActionFault, ActionId, ActionPlan,
        ActionStateSpec,
    },
    document::{ElementNode, FormatSet, NodeRef, PropertyMap, TextFragment},
    identity::QualifiedName,
    operation::{Operation, TextBlockReplace, TextBlockReplaceError},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

/// Inserts plain text with normalized CRLF/CR/LF boundaries as one atomic edit.
///
/// Uses the existing bounded [`InsertPlainTextInput`] contract. Single-line
/// insertion retains the spatial start kind. Multiline insertion keeps that
/// kind on the first block, uses paragraphs for interior lines, and retains
/// the spatial end kind on the last block only when original suffix text
/// survives there. Otherwise the last block is a paragraph. Empty input lines
/// are retained; unlike Enter, pasting a newline into an empty heading creates
/// two blocks rather than converting it in place.
///
/// Carets inherit pending formats then focus-affinity context. Ranges inherit
/// the first spatially selected run, falling back to the surviving left seam,
/// then right seam, then no formats for text-empty structural ranges. All new
/// runs use that set; retained prefix/suffix runs keep their original formats.
/// Success consumes pending formats and places a Before-affinity caret before
/// retained suffix text. The action requests independent history; an exact
/// document replacement can instead be a selection-only commit.
///
/// Full result validation includes untouched siblings. Every mutation uses one
/// guarded [`TextBlockReplace`], durably supported by V5. This action remains
/// experimental and is not registered in the default/browser profile.
#[derive(Clone, Copy, Debug, Default)]
pub struct InsertTextBlockPlainTextAction;

/// Returns the opt-in heading-aware plain-text insertion identity.
#[must_use]
pub fn insert_text_block_plain_text_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/insert-text-block-plain-text",
    ))
}

impl Action for InsertTextBlockPlainTextAction {
    type Input = InsertPlainTextInput;

    fn state_spec() -> ActionStateSpec {
        InsertPlainTextAction::state_spec()
    }

    fn evaluate(
        &self,
        state: &EditorState,
        input: &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, input).map(ActionEvaluation::stateless)
    }
}

fn evaluate(
    state: &EditorState,
    input: &InsertPlainTextInput,
) -> Result<ActionDecision, ActionFault> {
    let range = match require_text_block_range(state)? {
        Ok(range) => range,
        Err(reason) => return Ok(ActionDecision::Disabled(reason)),
    };
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    let (first, source) = text_block_source(state, range.start().paragraph_path())?;
    let (last, tail) = text_block_source(state, range.end().paragraph_path())?;
    let (prefix, suffix, formats) =
        insertion_parts(state, &range, &source, &tail, first_middle_formats)?;
    let replacement = match replacement_fragments(input, &formats) {
        Ok(replacement) => replacement,
        Err(ReplacementError::Capacity) => return Ok(disabled("breditor/result-limit-exceeded")),
        Err(ReplacementError::Invariant) => {
            return Err(fault("breditor/insert-plain-text-input-invariant-fault"));
        }
    };
    let Some(result) = derive_result(&prefix, &replacement, &suffix)? else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let nodes = replacement
        .iter()
        .enumerate()
        .map(|(index, fragment)| {
            let template = if index == 0 {
                Some(&first)
            } else if index + 1 == replacement.len() && !suffix.is_empty() {
                Some(&last)
            } else {
                None
            };
            replacement_block(template, fragment)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let operation_range = root_range(
        range.start().paragraph_path(),
        range.start().offset(),
        range.end().paragraph_path(),
        range.end().offset(),
    )?;
    let selection = result_selection(&operation_range, &replacement, &result)?;
    let operation =
        TextBlockReplace::capture(state.context(), state.document(), operation_range, nodes)
            .and_then(|operation| {
                operation.apply(state.context(), state.document())?;
                Ok(operation)
            });
    let operation = match operation {
        Ok(operation) => operation,
        Err(TextBlockReplaceError::RootChildLimit | TextBlockReplaceError::Validation(_)) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(_) => return Err(fault("breditor/text-block-plain-text-plan-fault")),
    };
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::TextBlockReplace(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(selection)),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Record,
    )))
}

/// Tree-neutral text/format policy; callers provide a scope-specific middle scan.
pub(super) fn insertion_parts(
    state: &EditorState,
    range: &TextRangeSelection,
    source: &TextFragment,
    tail: &TextFragment,
    find_middle: fn(&EditorState, &TextRangeSelection) -> Result<Option<FormatSet>, ActionFault>,
) -> Result<(TextFragment, TextFragment, FormatSet), ActionFault> {
    if range.is_same_paragraph() {
        let (prefix, selected, suffix) =
            fragment_range_parts(source, range.start().offset(), range.end().offset())?;
        let formats = if range.is_collapsed() {
            effective_typing_formats(
                state,
                source,
                range.start().offset(),
                source_range(state)?.focus().affinity(),
            )?
        } else {
            selected
                .iter()
                .next()
                .map(|run| run.formats().clone())
                .or_else(|| prefix.iter().next_back().map(|run| run.formats().clone()))
                .or_else(|| suffix.iter().next().map(|run| run.formats().clone()))
                .unwrap_or_default()
        };
        return Ok((prefix, suffix, formats));
    }
    let (prefix, selected_first) = source
        .split_at(range.start().offset())
        .map_err(|_| fault("breditor/text-block-plain-text-range-fault"))?;
    let (selected_last, suffix) = tail
        .split_at(range.end().offset())
        .map_err(|_| fault("breditor/text-block-plain-text-range-fault"))?;
    let first_formats = match selected_first.iter().next() {
        Some(run) => Some(run.formats().clone()),
        None => find_middle(state, range)?,
    };
    let formats = first_formats
        .or_else(|| selected_last.iter().next().map(|run| run.formats().clone()))
        .or_else(|| prefix.iter().next_back().map(|run| run.formats().clone()))
        .or_else(|| suffix.iter().next().map(|run| run.formats().clone()))
        .unwrap_or_default();
    Ok((prefix, suffix, formats))
}

pub(super) fn replacement_block(
    template: Option<&NodeRef>,
    fragment: &TextFragment,
) -> Result<NodeRef, ActionFault> {
    let children =
        fragment.iter().cloned().map(|run| NodeRef::text(run.into_text_node())).collect();
    let element = match template {
        Some(template) => template
            .as_element()
            .ok_or_else(|| fault("breditor/text-block-source-fault"))?
            .try_with_children(children),
        None => ElementNode::try_new(
            QualifiedName::from_known_static("breditor/paragraph"),
            None,
            PropertyMap::default(),
            children,
        ),
    }
    .map_err(|_| fault("breditor/text-block-plain-text-node-fault"))?;
    Ok(NodeRef::element(element))
}
