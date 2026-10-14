//! Column moves own immutable ordered occurrences instead of undoing a shared index mutation.
use crate::{
    Error,
    register::{Stamp, read_contribution},
};
use loro::{ContainerID, ContainerType, LoroDoc, LoroMovableList, LoroValue, ToJson};
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Occurrence {
    column: String,
    site: String,
}
pub(super) fn order(doc: &LoroDoc, block: &str) -> Result<LoroMovableList, Error> {
    let root = ContainerID::new_root("columns", ContainerType::Map);
    let owner = ContainerID::new_mergeable(&root, block, ContainerType::Map);
    doc.try_get_movable_list(ContainerID::new_mergeable(
        &owner,
        "order",
        ContainerType::MovableList,
    ))
    .ok_or(Error::Contract("shared column order"))
}
fn decode(value: &LoroValue) -> Result<Occurrence, Error> {
    let text = value.as_string().ok_or(Error::Contract("shared column occurrence"))?;
    Ok(serde_json::from_str(text.as_str())?)
}
fn active(doc: &LoroDoc, block: &str, column: &str) -> Result<String, Error> {
    let owner = doc
        .try_get_map(ContainerID::new_mergeable(
            &ContainerID::new_root("columns", ContainerType::Map),
            block,
            ContainerType::Map,
        ))
        .ok_or(Error::Contract("shared column owner"))?;
    let raw = owner.get_deep_value().to_json_value();
    let mut chosen = None;
    if let Some(values) = raw.get("placements").and_then(|value| value.get(column)) {
        for (key, value) in
            values.as_object().ok_or(Error::Contract("shared column placement contributions"))?
        {
            let (stamp, value) = read_contribution(doc, key, value)?;
            if chosen.as_ref().is_none_or(|(prior, _)| stamp > *prior) {
                chosen = Some((stamp, value));
            }
        }
    }
    if let Some((_, value)) = chosen {
        Ok(value.as_str().ok_or(Error::Contract("shared column placement identity"))?.into())
    } else {
        Ok(format!("seed:{column}"))
    }
}
pub(super) fn seed_value(column: &str) -> Result<String, Error> {
    Ok(serde_json::to_string(&Occurrence {
        column: column.into(),
        site: format!("seed:{column}"),
    })?)
}
pub(super) fn selected(doc: &LoroDoc, block: &str) -> Result<Vec<(String, usize)>, Error> {
    let order = order(doc, block)?;
    if order.len() > 20_000 {
        return Err(Error::Limit("column placement occurrences"));
    }
    let mut result = vec![];
    for (index, value) in order.to_vec().into_iter().enumerate() {
        let value = decode(&value)?;
        if active(doc, block, &value.column)? == value.site {
            result.push((value.column, index));
        }
    }
    Ok(result)
}
pub(super) fn move_column(
    doc: &LoroDoc,
    block: &str,
    column: &str,
    before: Option<&str>,
    stamp: Stamp,
    ordinal: usize,
) -> Result<(), Error> {
    let selected = selected(doc, block)?;
    let from = selected
        .iter()
        .position(|(value, _)| value == column)
        .ok_or(Error::Contract("shared column move target"))?;
    let to = if let Some(before) = before {
        selected
            .iter()
            .position(|(value, _)| value == before)
            .ok_or(Error::Contract("shared column before target"))?
    } else {
        selected.len()
    };
    if to == from || to == from + 1 {
        return Ok(());
    }
    let order = order(doc, block)?;
    let index = if let Some(before) = before {
        selected
            .iter()
            .find(|(value, _)| value == before)
            .ok_or(Error::Contract("shared column before target"))?
            .1
    } else {
        order.len()
    };
    let site = format!("move:{}:{ordinal}", stamp.key());
    order.insert(
        index,
        serde_json::to_string(&Occurrence { column: column.into(), site: site.clone() })?,
    )?;
    doc.get_map("columns")
        .ensure_mergeable_map(block)?
        .ensure_mergeable_map("placements")?
        .ensure_mergeable_map(column)?
        .insert(&stamp.key(), stamp.contribution(site.into()))?;
    Ok(())
}
