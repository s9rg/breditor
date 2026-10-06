//! Selection-driven paragraph/heading conversion without changing list layout.
use super::{
    flat_list_format_source::FormatSource,
    flat_list_support::{evaluation, state_spec},
    support::{disabled, fault, require_operation_budget, strict_relocation},
};
use crate::{
    action::{
        Action, ActionActivation, ActionDecision, ActionEvaluation, ActionFault, ActionPlan,
        ActionStateSpec, text_position::normalize_flat_list_range_selection,
    },
    block::TextBlockKind,
    document::{ElementNode, NodeRef, PropertyInteger, PropertyMap, PropertyValue},
    identity::QualifiedName,
    operation::{
        FlatListTextRange, FlatListTextReplace, FlatListTextReplaceError, Operation, block_kind,
    },
    position::TextOffset,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

/// Sets paragraph/heading kind on touched bare/list blocks without altering list
/// containers, ordinal starts, text or inline properties. A later block's logical
/// start is excluded; an empty collapsed block is included. The target is fixed
/// at registration, with tracked active/mixed/inactive toolbar state. Selection
/// encoding and pending formats survive exactly; no-ops are disabled. One atomic
/// history event, explicit experimental registration and no existing wire widening.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SetFlatListBlockKindAction {
    target: TextBlockKind,
}
impl SetFlatListBlockKindAction {
    /// Creates a no-input action with one checked target kind.
    #[must_use]
    pub const fn new(target: TextBlockKind) -> Self {
        Self { target }
    }
    /// Returns the configured target kind.
    #[must_use]
    pub const fn target(&self) -> TextBlockKind {
        self.target
    }
}
impl Action for SetFlatListBlockKindAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, self.target)
    }
}
fn evaluate(state: &EditorState, target: TextBlockKind) -> Result<ActionEvaluation, ActionFault> {
    if !state.context().schema().supports_flat_list_operations() {
        return Ok(evaluation(disabled("breditor/unsupported-schema"), ActionActivation::Inactive));
    }
    if state.selection().is_none() {
        return Ok(evaluation(disabled("breditor/no-selection"), ActionActivation::Inactive));
    }
    let range = normalize_flat_list_range_selection(state)
        .map_err(|_| fault("breditor/list-text-position-fault"))?;
    let source = FormatSource::capture(state, &range)?;
    let exclude_end = !range.is_same_paragraph() && range.end().offset() == TextOffset::ZERO;
    let mut replacement = Vec::new();
    let mut first = None;
    let mut last = None;
    let mut matched = 0;
    for block in &source.blocks {
        let touched = block.path >= *range.start().paragraph_path()
            && (block.path < *range.end().paragraph_path()
                || (!exclude_end && block.path == *range.end().paragraph_path()));
        if touched {
            first.get_or_insert(block);
            last = Some(block);
            matched += usize::from(
                block_kind(&block.node)
                    .map_err(|_| fault("breditor/list-block-kind-source-fault"))?
                    == target,
            );
            replacement.push(retype(&block.node, target)?);
        }
    }
    let activation = if matched == 0 {
        ActionActivation::Inactive
    } else if matched == replacement.len() {
        ActionActivation::Active
    } else {
        ActionActivation::Mixed
    };
    if activation == ActionActivation::Active {
        return Ok(evaluation(disabled("breditor/block-kind-unchanged"), activation));
    }
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(evaluation(decision, activation));
    }
    let first = first.ok_or_else(|| fault("breditor/list-format-source-fault"))?;
    let last = last.ok_or_else(|| fault("breditor/list-format-source-fault"))?;
    // Keep complete root guards and layout, but replace only touched blocks.
    // The operation preserves unselected prefixes/suffixes itself; including
    // them here would unnecessarily reconstruct every item in a large list.
    let range = FlatListTextRange::try_new(
        first.path.clone(),
        TextOffset::ZERO,
        last.path.clone(),
        last.text.utf16_len(),
    )
    .map_err(|_| fault("breditor/list-format-range-fault"))?;
    let op =
        FlatListTextReplace::try_new(source.start, range, source.roots, replacement, source.layout)
            .and_then(|op| {
                op.apply(state.context(), state.document())?;
                Ok(op)
            });
    let op = match op {
        Ok(op) => op,
        Err(FlatListTextReplaceError::Validation(_) | FlatListTextReplaceError::RootChildLimit) => {
            return Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation));
        }
        Err(_) => return Err(fault("breditor/list-block-kind-plan-fault")),
    };
    // Kinds alone changed: all original paths/runs/offsets still resolve exactly.
    Ok(evaluation(
        ActionDecision::Enabled(ActionPlan::new(
            vec![Operation::FlatListTextReplace(op)],
            strict_relocation(),
            SelectionUpdate::Set(state.selection().cloned()),
            PendingFormatsUpdate::Preserve,
            HistoryIntent::Record,
        )),
        activation,
    ))
}
pub(super) fn retype(node: &NodeRef, target: TextBlockKind) -> Result<NodeRef, ActionFault> {
    let (kind, properties) = match target {
        TextBlockKind::Paragraph => ("breditor/paragraph", PropertyMap::default()),
        TextBlockKind::Heading(level) => (
            "breditor/heading",
            PropertyMap::try_from_sorted(vec![(
                QualifiedName::from_known_static("breditor/level"),
                PropertyValue::from_integer(
                    PropertyInteger::try_new(i64::from(level.get()))
                        .map_err(|_| fault("breditor/list-block-kind-node-fault"))?,
                ),
            )])
            .map_err(|_| fault("breditor/list-block-kind-node-fault"))?,
        ),
    };
    let children = node
        .as_element()
        .ok_or_else(|| fault("breditor/list-block-kind-source-fault"))?
        .children()
        .iter()
        .cloned()
        .collect();
    ElementNode::try_new(QualifiedName::from_known_static(kind), None, properties, children)
        .map(NodeRef::element)
        .map_err(|_| fault("breditor/list-block-kind-node-fault"))
}
