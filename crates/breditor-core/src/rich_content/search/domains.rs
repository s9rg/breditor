//! Semantic presentation order, including each merged source partition exactly once.
use super::{MAX_DOMAINS, RICH_SEARCH_MAX_VISITED_NODES, RichSearchError};
use crate::{
    document::NodeRef,
    position::NodePath,
    rich_content::{BlockId, RichDocument, TableId, ast_properties},
};

pub(in crate::rich_content) fn domains(
    document: &RichDocument,
) -> Result<Vec<BlockId>, RichSearchError> {
    let mut stack = vec![NodePath::root()];
    let mut result = Vec::new();
    let mut visited = 0usize;
    while let Some(path) = stack.pop() {
        charge(&mut visited, 1, stack.len())?;
        let node = document
            .document()
            .node_at(&path)
            .ok()
            .and_then(NodeRef::as_element)
            .ok_or(RichSearchError::Invariant)?;
        if matches!(
            node.kind().as_str(),
            "breditor/paragraph"
                | "breditor/heading"
                | "breditor/code-block"
                | "breditor/details-summary"
        ) {
            charge(&mut visited, node.children().len(), stack.len())?;
            if result.len() >= MAX_DOMAINS {
                return Err(RichSearchError::DocumentLimit);
            }
            result.push(
                BlockId::try_new(
                    ast_properties::string(node, "block-id")
                        .map_err(|_| RichSearchError::Invariant)?,
                )
                .map_err(|_| RichSearchError::Invariant)?,
            );
            continue;
        }
        if node.kind().as_str() == "breditor/table" {
            let table = TableId::try_new(
                ast_properties::string(node, "table-id").map_err(|_| RichSearchError::Invariant)?,
            )
            .map_err(|_| RichSearchError::Invariant)?;
            let view = document
                .table(&table)
                .map_err(|_| RichSearchError::Invariant)?
                .ok_or(RichSearchError::Invariant)?;
            charge(&mut visited, node.children().len(), stack.len())?;
            if view.geometry().is_hidden() {
                continue;
            }
            // A candidate V4 caption (the table's last child) follows every cell; the
            // stack is last-in-first-out, so it is pushed before the cells.
            if crate::rich_content::table_caption::caption(node).is_some() {
                queued(visited, stack.len(), 1)?;
                stack.push(
                    path.try_child(
                        u32::try_from(node.children().len() - 1)
                            .map_err(|_| RichSearchError::Invariant)?,
                    )
                    .map_err(|_| RichSearchError::Invariant)?,
                );
            }
            for cell in view.geometry().cells().iter().rev().filter(|cell| cell.is_master()) {
                for source in cell.source_cells().iter().rev() {
                    queued(visited, stack.len(), 1)?;
                    stack.push(
                        document.cell_path(source).ok_or(RichSearchError::Invariant)?.clone(),
                    );
                }
            }
            continue;
        }
        queued(visited, stack.len(), node.children().len())?;
        for index in (0..node.children().len()).rev() {
            stack.push(
                path.try_child(u32::try_from(index).map_err(|_| RichSearchError::Invariant)?)
                    .map_err(|_| RichSearchError::Invariant)?,
            );
        }
    }
    Ok(result)
}

fn queued(visited: usize, pending: usize, added: usize) -> Result<(), RichSearchError> {
    if visited
        .checked_add(pending)
        .and_then(|count| count.checked_add(added))
        .is_none_or(|count| count > RICH_SEARCH_MAX_VISITED_NODES)
    {
        return Err(RichSearchError::DocumentLimit);
    }
    Ok(())
}

fn charge(visited: &mut usize, added: usize, pending: usize) -> Result<(), RichSearchError> {
    queued(*visited, pending, added)?;
    *visited += added;
    Ok(())
}

pub(in crate::rich_content) fn text(
    document: &RichDocument,
    block: &BlockId,
    remaining_bytes: usize,
) -> Result<String, RichSearchError> {
    let node = document
        .block_path(block)
        .and_then(|path| document.document().node_at(path).ok())
        .and_then(NodeRef::as_element)
        .ok_or(RichSearchError::Invariant)?;
    let bytes = node.children().iter().try_fold(0usize, |bytes, child| {
        let text = child.as_text().ok_or(RichSearchError::Invariant)?;
        let next = bytes.checked_add(text.text().len()).ok_or(RichSearchError::DocumentLimit)?;
        if next > remaining_bytes {
            return Err(RichSearchError::DocumentLimit);
        }
        Ok(next)
    })?;
    let mut output = String::with_capacity(bytes);
    for child in node.children() {
        output.push_str(child.as_text().ok_or(RichSearchError::Invariant)?.text());
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn node_budget_refuses_wide_frontiers_before_allocating_paths() {
        assert_eq!(queued(1, 0, RICH_SEARCH_MAX_VISITED_NODES - 1), Ok(()));
        assert_eq!(
            queued(1, 0, RICH_SEARCH_MAX_VISITED_NODES),
            Err(RichSearchError::DocumentLimit)
        );
        assert_eq!(queued(usize::MAX, 1, 0), Err(RichSearchError::DocumentLimit));
    }
    #[test]
    fn failed_node_charges_leave_the_budget_unchanged() {
        let mut visited = RICH_SEARCH_MAX_VISITED_NODES - 1;
        assert_eq!(charge(&mut visited, 1, 1), Err(RichSearchError::DocumentLimit));
        assert_eq!(visited, RICH_SEARCH_MAX_VISITED_NODES - 1);
        assert_eq!(charge(&mut visited, 1, 0), Ok(()));
        assert_eq!(visited, RICH_SEARCH_MAX_VISITED_NODES);
    }
}
