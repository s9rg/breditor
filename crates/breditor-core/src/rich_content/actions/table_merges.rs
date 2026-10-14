//! Shared local merge planning: exact records and observed overlap retractions.

use super::{RichActionError, rewrite_properties::with_properties};
use crate::{
    document::{NodeRef, PropertyValue},
    rich_content::{MergeId, RichTableLimits, RichTableView, TableShape, ast_properties},
};
use std::collections::BTreeSet;

pub(super) fn shape(view: &RichTableView) -> Result<TableShape, RichActionError> {
    Ok(TableShape::try_new(
        view.id().clone(),
        view.rows().to_vec(),
        view.columns().iter().map(|column| column.id().clone()).collect(),
        RichTableLimits::default(),
    )?)
}

pub(super) fn records(node: &NodeRef) -> Result<Vec<PropertyValue>, RichActionError> {
    ast_properties::property(node.as_element().ok_or(RichActionError::Rewrite)?, "merges")
        .and_then(PropertyValue::as_array)
        .map(<[PropertyValue]>::to_vec)
        .ok_or(RichActionError::Rewrite)
}

pub(super) fn retractions(node: &NodeRef) -> Result<BTreeSet<MergeId>, RichActionError> {
    ast_properties::property(node.as_element().ok_or(RichActionError::Rewrite)?, "retracted-merges")
        .and_then(PropertyValue::as_array)
        .ok_or(RichActionError::Rewrite)?
        .iter()
        .map(|value| {
            MergeId::try_new(value.as_string().ok_or(RichActionError::Rewrite)?)
                .map_err(|_| RichActionError::Rewrite)
        })
        .collect()
}

pub(super) fn retract_overlaps(
    node: &NodeRef,
    view: &RichTableView,
    rectangle: (usize, usize, usize, usize),
    retracted: &mut BTreeSet<MergeId>,
) -> Result<(), RichActionError> {
    let shape = shape(view)?;
    let (r0, r1, c0, c1) = rectangle;
    for value in records(node)? {
        let region =
            ast_properties::merge(view.id(), &value).map_err(|_| RichActionError::Rewrite)?;
        if !retracted.contains(region.id())
            && let Some((a, b, c, d)) = shape.rectangle(&region)
            && a <= r1
            && b >= r0
            && c <= c1
            && d >= c0
        {
            retracted.insert(region.id().clone());
        }
    }
    if retracted.len() > 256 {
        return Err(RichActionError::TableLimit);
    }
    Ok(())
}

pub(super) fn rewrite(
    node: &NodeRef,
    mut records: Vec<PropertyValue>,
    retracted: BTreeSet<MergeId>,
) -> Result<NodeRef, RichActionError> {
    records.sort_by(|a, b| record_id(a).cmp(&record_id(b)));
    with_properties(
        node,
        [
            ("merges", Some(PropertyValue::array(records))),
            (
                "retracted-merges",
                Some(PropertyValue::array(
                    retracted
                        .into_iter()
                        .map(|id| PropertyValue::from_string(id.as_str()))
                        .collect(),
                )),
            ),
        ],
    )
}

fn record_id(value: &PropertyValue) -> Option<&str> {
    value.as_object().and_then(|object| object.get("id")).and_then(PropertyValue::as_string)
}
