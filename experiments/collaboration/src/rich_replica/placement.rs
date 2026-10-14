//! Writer-owned placement chooses one occurrence in canonical replicated sibling orders.
//!
//! Undo retracts this action's occurrence/selection, never moves a later remote
//! occurrence back. The engine still provides replication and list ordering.
use super::model::{metadata, string};
use crate::{
    Error,
    register::{Stamp, read_contribution},
};
use loro::{ContainerID, ContainerType, LoroDoc, LoroMovableList, ToJson};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Site {
    block: String,
    parent: Option<String>,
}
fn parent_key(parent: Option<&str>) -> String {
    parent.map_or_else(|| "root".into(), |block| format!("block:{}:{block}", block.len()))
}
pub(super) fn prepare(doc: &LoroDoc, parent: Option<&str>) -> Result<LoroMovableList, Error> {
    Ok(doc.get_map("orders").ensure_mergeable_movable_list(&parent_key(parent))?)
}
fn existing_order(doc: &LoroDoc, parent: Option<&str>) -> Option<LoroMovableList> {
    doc.try_get_movable_list(ContainerID::new_mergeable(
        &ContainerID::new_root("orders", ContainerType::Map),
        &parent_key(parent),
        ContainerType::MovableList,
    ))
}
fn site(doc: &LoroDoc, site: &str) -> Result<Site, Error> {
    let value = doc.get_map("sites").get(site).ok_or(Error::Contract("shared placement site"))?;
    let value = value
        .as_value()
        .and_then(loro::LoroValue::as_string)
        .ok_or(Error::Contract("shared placement record"))?;
    Ok(serde_json::from_str(value.as_str())?)
}
fn active(doc: &LoroDoc, block: &str) -> Result<String, Error> {
    let owner = metadata(doc, block)?;
    let raw = owner.get_deep_value().to_json_value();
    let mut chosen = None;
    if let Some(values) = raw.get("placements") {
        let values = values.as_object().ok_or(Error::Contract("shared placement contributions"))?;
        if values.len() > 1000 {
            return Err(Error::Limit("shared placement contributions"));
        }
        for (key, value) in values {
            let (stamp, value) = read_contribution(doc, key, value)?;
            if chosen.as_ref().is_none_or(|(prior, _)| stamp > *prior) {
                chosen = Some((stamp, value));
            }
        }
    }
    if let Some((_, value)) = chosen {
        Ok(value.as_str().ok_or(Error::Contract("shared placement identity"))?.into())
    } else {
        string(&owner, "origin-site")
    }
}
pub(super) fn seed(
    doc: &LoroDoc,
    block: &str,
    parent: Option<&str>,
    site_id: String,
) -> Result<(), Error> {
    doc.get_map("sites").insert(
        &site_id,
        serde_json::to_string(&Site { block: block.into(), parent: parent.map(str::to_owned) })?,
    )?;
    metadata(doc, block)?.insert("origin-site", site_id.clone())?;
    prepare(doc, parent)?.push(site_id)?;
    Ok(())
}
pub(super) fn children(doc: &LoroDoc, parent: Option<&str>) -> Result<Vec<String>, Error> {
    let Some(order) = existing_order(doc, parent) else {
        return Ok(vec![]);
    };
    let mut children = vec![];
    if order.len() > 20_000 {
        return Err(Error::Limit("shared placement occurrences"));
    }
    for value in order.to_vec() {
        let id = value.as_string().ok_or(Error::Contract("shared sibling occurrence"))?.as_str();
        let record = site(doc, id)?;
        if record.parent.as_deref() != parent {
            return Err(Error::Contract("shared occurrence parent"));
        }
        if active(doc, &record.block)? == id {
            children.push(record.block);
        }
    }
    Ok(children)
}
pub(super) fn move_block(
    doc: &LoroDoc,
    block: &str,
    parent: Option<&str>,
    before: Option<&str>,
    stamp: Stamp,
    ordinal: usize,
) -> Result<(), Error> {
    if before == Some(block) {
        return Ok(());
    }
    let order = prepare(doc, parent)?;
    let before = before.map(|block| active(doc, block)).transpose()?;
    let index = if let Some(before) = before {
        let record = site(doc, &before)?;
        if record.parent.as_deref() != parent {
            return Err(Error::Contract("shared move before-anchor parent"));
        }
        order
            .to_vec()
            .iter()
            .position(|value| value.as_string().is_some_and(|value| value.as_str() == before))
            .ok_or(Error::Contract("shared before occurrence"))?
    } else {
        order.len()
    };
    let id = format!("move:{}:{ordinal}", stamp.key());
    doc.get_map("sites").insert(
        &id,
        serde_json::to_string(&Site { block: block.into(), parent: parent.map(str::to_owned) })?,
    )?;
    order.insert(index, id.clone())?;
    metadata(doc, block)?
        .ensure_mergeable_map("placements")?
        .insert(&stamp.key(), stamp.contribution(id.into()))?;
    Ok(())
}
