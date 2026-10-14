//! Copy only active current geometry, recapturing context over copied axes.

use super::RichClipboardError;
use crate::{
    document::{NodeRef, PropertyValue},
    rich_content::{
        CellBounds, CellId, RichDocument, RichTableLimits, RichTableView, TableShape,
        actions::rewrite_properties::with_properties, ast_properties,
    },
};

pub(super) fn normalize(
    document: &RichDocument,
    node: &NodeRef,
) -> Result<NodeRef, RichClipboardError> {
    let Some(element) = node.as_element() else { return Ok(node.clone()) };
    let children = element
        .children()
        .iter()
        .map(|child| normalize(document, child))
        .collect::<Result<Vec<_>, _>>()?;
    let node = NodeRef::element(
        element.try_with_children(children).map_err(|_| RichClipboardError::Invariant)?,
    );
    if element.kind().as_str() != "breditor/table" {
        return Ok(node);
    }
    let id = crate::rich_content::TableId::try_new(
        ast_properties::string(element, "table-id").map_err(|_| RichClipboardError::Invariant)?,
    )
    .map_err(|_| RichClipboardError::Invariant)?;
    let view = document.table(&id)?.ok_or(RichClipboardError::Invariant)?;
    if view.geometry().is_hidden() {
        return Ok(with_properties(
            &node,
            [
                ("merges", Some(PropertyValue::array(vec![]))),
                ("retracted-merges", Some(PropertyValue::array(vec![]))),
            ],
        )?);
    }
    rectangle(&view, &node, (0, view.rows().len() - 1), (0, view.columns().len() - 1))
}

pub(super) fn rectangle(
    view: &RichTableView,
    node: &NodeRef,
    rows: (usize, usize),
    columns: (usize, usize),
) -> Result<NodeRef, RichClipboardError> {
    let source = node.as_element().ok_or(RichClipboardError::Invariant)?;
    let row_ids = view.rows()[rows.0..=rows.1].to_vec();
    let column_ids =
        view.columns()[columns.0..=columns.1].iter().map(|column| column.id().clone()).collect();
    let shape =
        TableShape::try_new(view.id().clone(), row_ids, column_ids, RichTableLimits::default())?;
    let current = TableShape::try_new(
        view.id().clone(),
        view.rows().to_vec(),
        view.columns().iter().map(|column| column.id().clone()).collect(),
        RichTableLimits::default(),
    )?;
    let mut merges = Vec::new();
    let records = ast_properties::property(source, "merges")
        .and_then(PropertyValue::as_array)
        .ok_or(RichClipboardError::Invariant)?;
    for value in records {
        let region =
            ast_properties::merge(view.id(), value).map_err(|_| RichClipboardError::Invariant)?;
        if !view.geometry().active_regions().contains(region.id()) {
            continue;
        }
        let (r0, r1, c0, c1) = current.rectangle(&region).ok_or(RichClipboardError::Invariant)?;
        if r0 > rows.1 || r1 < rows.0 || c0 > columns.1 || c1 < columns.0 {
            continue;
        }
        if r0 < rows.0 || r1 > rows.1 || c0 < columns.0 || c1 > columns.1 {
            return Err(RichClipboardError::Kind);
        }
        let cell = |r: usize, c: usize| {
            CellId::new(view.id().clone(), view.rows()[r].clone(), view.columns()[c].id().clone())
        };
        let region = shape.capture_merge(
            region.id().clone(),
            region.stamp(),
            &CellBounds::new(cell(r0, c0), cell(r1, c1)),
        )?;
        merges.push(
            ast_properties::merge_property(&region).map_err(|_| RichClipboardError::Invariant)?,
        );
    }
    let row_nodes = source
        .children()
        .iter()
        .skip(rows.0)
        .take(rows.1 - rows.0 + 1)
        .map(|row| {
            let row = row.as_element().ok_or(RichClipboardError::Invariant)?;
            Ok(NodeRef::element(
                row.try_with_children(
                    row.children()
                        .iter()
                        .skip(columns.0)
                        .take(columns.1 - columns.0 + 1)
                        .cloned()
                        .collect(),
                )
                .map_err(|_| RichClipboardError::Invariant)?,
            ))
        })
        .collect::<Result<Vec<_>, RichClipboardError>>()?;
    let node = NodeRef::element(
        source.try_with_children(row_nodes).map_err(|_| RichClipboardError::Invariant)?,
    );
    let column_records = ast_properties::property(source, "columns")
        .and_then(PropertyValue::as_array)
        .ok_or(RichClipboardError::Invariant)?;
    Ok(with_properties(
        &node,
        [
            ("columns", Some(PropertyValue::array(column_records[columns.0..=columns.1].to_vec()))),
            ("merges", Some(PropertyValue::array(merges))),
            ("retracted-merges", Some(PropertyValue::array(vec![]))),
        ],
    )?)
}
