//! Shared source capture and full-tree admission for experimental text-block actions.
use super::support::{disabled, fault};
use crate::{
    action::{ActionDecision, ActionFault},
    document::{NodeRef, TextFragment, TextRun},
    operation::{TextBlockSplice, TextBlockSpliceError, TextSpliceApplyError},
    position::NodePath,
    state::EditorState,
};

pub(super) fn text_block_source(
    state: &EditorState,
    path: &NodePath,
) -> Result<(NodeRef, TextFragment), ActionFault> {
    if !state.context().schema().supports_text_block_kind_operations() || path.len() != 1 {
        return Err(fault("breditor/text-block-source-fault"));
    }
    let guard =
        state.document().node_at(path).map_err(|_| fault("breditor/text-block-source-fault"))?;
    let element = guard.as_element().ok_or_else(|| fault("breditor/text-block-source-fault"))?;
    let runs = element
        .children()
        .iter()
        .map(|node| {
            node.as_text()
                .map(TextRun::from_text_node)
                .ok_or_else(|| fault("breditor/text-block-source-fault"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let source =
        TextFragment::try_from_runs(runs).map_err(|_| fault("breditor/text-block-source-fault"))?;
    Ok((guard.clone(), source))
}

/// Authoritative preview includes rank properties and untouched siblings.
/// Execution still rechecks source guards and publishes atomically.
pub(super) fn preview_splice(
    state: &EditorState,
    operation: &TextBlockSplice,
) -> Result<Option<ActionDecision>, ActionFault> {
    match operation.apply(state.context(), state.document()) {
        Ok(_) => Ok(None),
        Err(
            TextBlockSpliceError::Validation(_)
            | TextBlockSpliceError::Text(
                TextSpliceApplyError::FragmentRunCountLimit { .. }
                | TextSpliceApplyError::FragmentTotalTextBytesLimit { .. }
                | TextSpliceApplyError::FragmentTextBytesLimit { .. }
                | TextSpliceApplyError::FragmentFormatCountLimit { .. }
                | TextSpliceApplyError::FragmentPropertyValueCountLimit { .. }
                | TextSpliceApplyError::FragmentPropertyStringBytesLimit { .. },
            ),
        ) => Ok(Some(disabled("breditor/result-limit-exceeded"))),
        Err(_) => Err(fault("breditor/text-block-splice-preview-fault")),
    }
}
