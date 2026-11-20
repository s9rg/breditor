//! Existing-list task conversion and backward adjacent-list joining, built only from
//! retained-identity list actions. Nothing is flattened, copied or re-created.
use super::{RichInputRuleError, RichInputRuleKind, RichInputRuleStep, plan::fresh};
use crate::{
    document::{ElementNode, NodeRef},
    position::NodePath,
    rich_content::{BlockId, RichDocument, RichListKind, ast_properties, list_numbering},
};

fn element<'a>(document: &'a RichDocument, path: &NodePath) -> Option<&'a ElementNode> {
    document.document().node_at(path).ok().and_then(NodeRef::as_element)
}
fn own_id(node: &ElementNode) -> Option<BlockId> {
    ast_properties::string(node, "block-id").ok().and_then(|id| BlockId::try_new(id).ok())
}
fn id_of(node: &NodeRef) -> Option<BlockId> {
    node.as_element().and_then(own_id)
}
fn is_prose(node: &NodeRef) -> bool {
    node.as_element().is_some_and(|node| {
        matches!(node.kind().as_str(), "breditor/paragraph" | "breditor/heading")
    })
}
/// The direct flow sibling immediately before `path`, if any.
fn previous<'a>(document: &'a RichDocument, path: &NodePath) -> Option<&'a ElementNode> {
    let index = usize::try_from(path.last_index()?).ok()?.checked_sub(1)?;
    element(document, &path.parent()?)?.children().get(index)?.as_element()
}
/// Whether a typed list marker continues `list` as its next item.
fn continues(list: &ElementNode, kind: RichListKind) -> bool {
    match (list.kind().as_str(), kind) {
        ("breditor/bullet-list", RichListKind::Bullet) => true,
        ("breditor/ordered-list", RichListKind::Ordered(start)) => {
            list_numbering::continuation_start(list, list.children().len()) == Some(start.get())
        }
        _ => false,
    }
}
/// Move a freshly wrapped one-item `container` into `target`'s last item, then promote it.
///
/// The result appends exactly one new item (with the retained source body) to `target`.
fn append_steps(
    target: &ElementNode,
    container: &BlockId,
    item: &BlockId,
    task: bool,
) -> Option<[RichInputRuleStep; 2]> {
    let last = id_of(target.children().iter().next_back()?)?;
    Some([
        RichInputRuleStep::MoveBlock { block: container.clone(), parent: Some(last), before: None },
        if task {
            RichInputRuleStep::OutdentTaskItem { container: container.clone(), item: item.clone() }
        } else {
            RichInputRuleStep::OutdentListItem {
                container: container.clone(),
                item: item.clone(),
                fresh_tail: None,
            }
        },
    ])
}

/// Join a freshly wrapped list/task paragraph with a directly preceding compatible list.
///
/// Bullets join a preceding bullet list; a numbered marker joins a preceding numbered
/// list only when it is that list's next ordinal; tasks join a preceding task list.
/// Anything else keeps the original separate-list conversion unchanged.
pub(super) fn join(
    document: &RichDocument,
    block: &BlockId,
    kind: RichInputRuleKind,
    step: RichInputRuleStep,
) -> (RichInputRuleKind, Vec<RichInputRuleStep>) {
    let target = document.block_path(block).and_then(|path| previous(document, path));
    let joined = match (&kind, &step, target) {
        (
            RichInputRuleKind::List(style),
            RichInputRuleStep::List { container, item, .. },
            Some(t),
        ) if continues(t, *style) => append_steps(t, container, item, false)
            .map(|s| (RichInputRuleKind::ListJoin(*style), s)),
        (
            RichInputRuleKind::Task(checked),
            RichInputRuleStep::Task { container, item, .. },
            Some(t),
        ) if t.kind().as_str() == "breditor/task-list" => append_steps(t, container, item, true)
            .map(|s| (RichInputRuleKind::TaskJoin(*checked), s)),
        _ => None,
    };
    match joined {
        Some((kind, extra)) => (kind, std::iter::once(step).chain(extra).collect()),
        None => (kind, vec![step]),
    }
}

/// Convert the item whose first line is `head` into one task, if the shape allows it exactly.
///
/// Only an item of a bullet list that is not itself nested in a list item qualifies,
/// and only when its body has no further paragraph/heading (each would become another
/// task). The list is split around the item; the task joins a directly preceding task
/// list when the item was first. Ordered, nested and multi-paragraph items stay literal.
/// # Errors
/// Invalid or reused derived identities fail closed.
pub(super) fn item_task(
    document: &RichDocument,
    namespace: &str,
    head: &BlockId,
    checked: bool,
) -> Result<Option<(RichInputRuleKind, Vec<RichInputRuleStep>)>, RichInputRuleError> {
    let Some(head_path) = document.block_path(head) else {
        return Ok(None);
    };
    let Some(item_path) = head_path.parent() else {
        return Ok(None);
    };
    let Some(list_path) = item_path.parent() else {
        return Ok(None);
    };
    let (Some(item), Some(list)) = (element(document, &item_path), element(document, &list_path))
    else {
        return Ok(None);
    };
    let outer = list_path.parent().and_then(|path| element(document, &path));
    if item.kind().as_str() != "breditor/list-item"
        || list.kind().as_str() != "breditor/bullet-list"
        || outer.is_none_or(|outer| outer.kind().as_str() == "breditor/list-item")
        || item.children().iter().skip(1).any(is_prose)
    {
        return Ok(None);
    }
    let (Some(item_id), Some(list_id), Some(body_end)) =
        (own_id(item), own_id(list), item.children().iter().next_back().and_then(id_of))
    else {
        return Ok(None);
    };
    let Some(index) =
        list.children().iter().position(|child| id_of(child).as_ref() == Some(&item_id))
    else {
        return Ok(None);
    };
    let fresh_tail = if index > 0 && index + 1 < list.children().len() {
        Some(fresh(document, namespace, "tail")?)
    } else {
        None
    };
    let container = fresh(document, namespace, "tasks")?;
    let task = fresh(document, namespace, "task")?;
    let mut steps = vec![
        RichInputRuleStep::OutdentListItem { container: list_id, item: item_id, fresh_tail },
        RichInputRuleStep::TaskRange {
            last: body_end,
            container: container.clone(),
            item: task.clone(),
            checked,
        },
    ];
    if index == 0
        && let Some(target) = previous(document, &list_path)
        && target.kind().as_str() == "breditor/task-list"
        && let Some(extra) = append_steps(target, &container, &task, true)
    {
        steps.extend(extra);
    }
    Ok(Some((RichInputRuleKind::ListItemTask(checked), steps)))
}
