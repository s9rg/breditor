//! Selection capture and atomic planning shared by the opt-in flat-list actions.
use super::support::{disabled, fault, require_operation_budget, strict_relocation};
use crate::{
    action::{
        ActionActivation, ActionActivationContract, ActionDecision, ActionEffects,
        ActionEvaluation, ActionFault, ActionPlan, ActionStateContract, ActionStateDomains,
        ActionStateIndicator, ActionStateSpec, ActionStateValue,
    },
    block::{ListKind, OrderedListStart},
    document::{ElementNode, NodeRef, PropertyInteger, PropertyMap, PropertyValue},
    identity::QualifiedName,
    operation::{AppliedOperation, FlatListReframe, FlatListReframeError, Operation},
    position::{NodePath, Point},
    selection::{RangeOrder, Selection},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};
use std::ops::Range;

pub(super) struct ListSection {
    pub(super) original: NodeRef,
    pub(super) kind: Option<ListKind>,
    pub(super) blocks: Vec<NodeRef>,
    pub(super) selected: Range<usize>,
}
pub(super) struct ListSource {
    pub(super) start: u32,
    pub(super) sections: Vec<ListSection>,
}

pub(super) fn state_spec() -> ActionStateSpec {
    ActionStateSpec::new(
        ActionStateContract::new(ActionActivationContract::Tracked, None),
        ActionEffects::new(
            ActionStateDomains::DOCUMENT
                | ActionStateDomains::SELECTION
                | ActionStateDomains::CONTEXT
                | ActionStateDomains::SNAPSHOT,
            ActionStateDomains::DOCUMENT
                | ActionStateDomains::SELECTION
                | ActionStateDomains::HISTORY
                | ActionStateDomains::SNAPSHOT,
        ),
    )
}
pub(super) fn evaluation(
    decision: ActionDecision,
    activation: ActionActivation,
) -> ActionEvaluation {
    ActionEvaluation::new(
        decision,
        ActionStateIndicator::new(activation, ActionStateValue::Unsupported),
    )
}

/// Resolve direction before choosing blocks. Only a later block's exact logical
/// start is excluded; a collapsed empty-block caret still selects its block.
pub(super) fn capture(
    state: &EditorState,
) -> Result<Result<ListSource, ActionDecision>, ActionFault> {
    if !state.context().schema().supports_flat_list_operations() {
        return Ok(Err(disabled("breditor/unsupported-schema")));
    }
    let Some(Selection::Range(range)) = state.selection() else {
        return Ok(Err(disabled("breditor/no-selection")));
    };
    let resolved = range
        .resolve(state.context().schema(), state.document())
        .map_err(|_| fault("breditor/list-selection-fault"))?;
    let (start, end) = if resolved.order() == RangeOrder::Backward {
        (range.focus(), range.anchor())
    } else {
        (range.anchor(), range.focus())
    };
    let start_path = block_path(start)?;
    let end_path = block_path(end)?;
    let exclude_end = start_path != end_path && at_block_start(end);
    let first = start_path.iter().next().ok_or_else(|| fault("breditor/list-selection-fault"))?;
    let last = end_path.iter().next().ok_or_else(|| fault("breditor/list-selection-fault"))?;
    let root =
        state.document().root().as_element().ok_or_else(|| fault("breditor/list-source-fault"))?;
    let first_native =
        usize::try_from(first).map_err(|_| fault("breditor/list-selection-fault"))?;
    let count = usize::try_from(
        last.checked_sub(first)
            .and_then(|n| n.checked_add(1))
            .ok_or_else(|| fault("breditor/list-selection-fault"))?,
    )
    .map_err(|_| fault("breditor/list-selection-fault"))?;
    let mut sections = Vec::new();
    for (relative, node) in root.children().iter().skip(first_native).take(count).enumerate() {
        let index = first
            .checked_add(u32::try_from(relative).map_err(|_| fault("breditor/list-source-fault"))?)
            .ok_or_else(|| fault("breditor/list-source-fault"))?;
        let kind = list_kind(node)?;
        let blocks = if kind.is_some() {
            node.as_element()
                .ok_or_else(|| fault("breditor/list-source-fault"))?
                .children()
                .iter()
                .map(|item| {
                    item.as_element()
                        .and_then(|item| item.children().iter().next())
                        .cloned()
                        .ok_or_else(|| fault("breditor/list-source-fault"))
                })
                .collect::<Result<Vec<_>, _>>()?
        } else {
            vec![node.clone()]
        };
        let mut selected = 0..0;
        for item in 0..blocks.len() {
            let path = if kind.is_some() {
                vec![
                    index,
                    u32::try_from(item).map_err(|_| fault("breditor/list-source-fault"))?,
                    0,
                ]
            } else {
                vec![index]
            };
            let path = NodePath::try_from_indices(path)
                .map_err(|_| fault("breditor/list-source-fault"))?;
            if path >= start_path && (path < end_path || (!exclude_end && path == end_path)) {
                if selected.is_empty() {
                    selected.start = item;
                }
                selected.end = item + 1;
            }
        }
        sections.push(ListSection { original: node.clone(), kind, blocks, selected });
    }
    // An excluded end at the next root's start need not be guarded or rebuilt.
    if sections.last().is_some_and(|section| section.selected.is_empty()) {
        sections.pop();
    }
    if sections.is_empty() || sections.iter().any(|section| section.selected.is_empty()) {
        return Err(fault("breditor/list-selection-fault"));
    }
    Ok(Ok(ListSource { start: first, sections }))
}

fn block_path(point: &Point) -> Result<NodePath, ActionFault> {
    match point {
        Point::Text { text_path, .. } => {
            text_path.parent().ok_or_else(|| fault("breditor/list-selection-fault"))
        }
        Point::Children { parent_path, .. } => Ok(parent_path.clone()),
    }
}
fn at_block_start(point: &Point) -> bool {
    match point {
        Point::Text { text_path, utf16_offset, .. } => {
            text_path.last_index() == Some(0) && *utf16_offset == 0
        }
        Point::Children { child_index, .. } => *child_index == 0,
    }
}
pub(super) fn list_kind(node: &NodeRef) -> Result<Option<ListKind>, ActionFault> {
    let element = node.as_element().ok_or_else(|| fault("breditor/list-source-fault"))?;
    match element.kind().as_str() {
        "breditor/paragraph" | "breditor/heading" => Ok(None),
        "breditor/bullet-list" => Ok(Some(ListKind::Bullet)),
        "breditor/ordered-list" => {
            let start = element
                .properties()
                .get(&QualifiedName::from_known_static("breditor/start"))
                .and_then(PropertyValue::as_integer)
                .and_then(|n| u32::try_from(n.get()).ok())
                .and_then(|n| OrderedListStart::try_new(n).ok())
                .ok_or_else(|| fault("breditor/list-source-fault"))?;
            Ok(Some(ListKind::Ordered(start)))
        }
        _ => Err(fault("breditor/list-source-fault")),
    }
}

pub(super) fn same_marker(left: ListKind, right: ListKind) -> bool {
    matches!(
        (left, right),
        (ListKind::Bullet, ListKind::Bullet) | (ListKind::Ordered(_), ListKind::Ordered(_))
    )
}
pub(super) fn activation(
    source: &ListSource,
    predicate: impl Fn(Option<ListKind>) -> bool,
) -> ActionActivation {
    let total: usize = source.sections.iter().map(|s| s.selected.len()).sum();
    let matched: usize =
        source.sections.iter().filter(|s| predicate(s.kind)).map(|s| s.selected.len()).sum();
    if matched == 0 {
        ActionActivation::Inactive
    } else if matched == total {
        ActionActivation::Active
    } else {
        ActionActivation::Mixed
    }
}

pub(super) fn list(kind: ListKind, blocks: Vec<NodeRef>) -> Result<NodeRef, ActionFault> {
    let (name, properties) = match kind {
        ListKind::Bullet => ("breditor/bullet-list", PropertyMap::default()),
        ListKind::Ordered(start) => (
            "breditor/ordered-list",
            PropertyMap::try_from_sorted(vec![(
                QualifiedName::from_known_static("breditor/start"),
                PropertyValue::from_integer(
                    PropertyInteger::try_new(i64::from(start.get()))
                        .map_err(|_| fault("breditor/list-build-fault"))?,
                ),
            )])
            .map_err(|_| fault("breditor/list-build-fault"))?,
        ),
    };
    let items = blocks
        .into_iter()
        .map(|block| {
            ElementNode::try_new(
                QualifiedName::from_known_static("breditor/list-item"),
                None,
                PropertyMap::default(),
                vec![block],
            )
            .map(NodeRef::element)
            .map_err(|_| fault("breditor/list-build-fault"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    ElementNode::try_new(QualifiedName::from_known_static(name), None, properties, items)
        .map(NodeRef::element)
        .map_err(|_| fault("breditor/list-build-fault"))
}

/// Preserve the ordinal of the original first surviving item when splitting.
pub(super) fn retain(
    section: &ListSection,
    range: Range<usize>,
    output: &mut Vec<NodeRef>,
) -> Result<(), ActionFault> {
    if range.is_empty() {
        return Ok(());
    }
    let Some(mut kind) = section.kind else {
        return Err(fault("breditor/list-retain-fault"));
    };
    if let ListKind::Ordered(start) = kind {
        let offset = u32::try_from(range.start).map_err(|_| fault("breditor/list-retain-fault"))?;
        kind = ListKind::Ordered(
            OrderedListStart::try_new(
                start.ordinal_at(offset).ok_or_else(|| fault("breditor/list-retain-fault"))?,
            )
            .map_err(|_| fault("breditor/list-retain-fault"))?,
        );
    }
    output.push(list(kind, section.blocks[range].to_vec())?);
    Ok(())
}

pub(super) fn plan(
    state: &EditorState,
    source: &ListSource,
    replacement: Vec<NodeRef>,
) -> Result<ActionDecision, ActionFault> {
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    let count =
        u32::try_from(source.sections.len()).map_err(|_| fault("breditor/list-plan-fault"))?;
    let operation = match FlatListReframe::capture(
        state.context(),
        state.document(),
        source.start,
        count,
        replacement,
    ) {
        Ok(op) => op,
        Err(FlatListReframeError::Validation(_) | FlatListReframeError::RootChildLimit) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(_) => return Err(fault("breditor/list-capture-fault")),
    };
    match operation.apply(state.context(), state.document()) {
        Ok(AppliedOperation::Changed(_)) => Ok(ActionDecision::Enabled(ActionPlan::new(
            vec![Operation::FlatListReframe(operation)],
            strict_relocation(),
            SelectionUpdate::Relocate,
            PendingFormatsUpdate::Preserve,
            HistoryIntent::Record,
        ))),
        Ok(AppliedOperation::Unchanged) => Ok(disabled("breditor/list-unchanged")),
        Err(FlatListReframeError::Validation(_) | FlatListReframeError::RootChildLimit) => {
            Ok(disabled("breditor/result-limit-exceeded"))
        }
        Err(_) => Err(fault("breditor/list-preview-fault")),
    }
}
