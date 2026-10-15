//! Writer-owned placement chooses one occurrence in canonical replicated sibling orders.
//!
//! Undo retracts this action's occurrence/selection, never moves a later remote
//! occurrence back. The engine still provides replication and list ordering.
use super::model::{metadata, string};
use crate::{Error, register::Stamp};
use loro::{ContainerID, ContainerType, LoroDoc, LoroMovableList};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
mod selection;

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
    Projection::read(doc)?.active(block).map(str::to_owned)
}

/// One pure forest choice per complete AST materialization.
pub(super) struct Projection {
    selected: BTreeMap<String, String>,
}
impl Projection {
    pub fn read(doc: &LoroDoc) -> Result<Self, Error> {
        Ok(Self { selected: selection::selected(doc)? })
    }
    fn active(&self, block: &str) -> Result<&str, Error> {
        self.selected
            .get(block)
            .map(String::as_str)
            .ok_or(Error::Contract("shared placement identity"))
    }
    pub fn children(&self, doc: &LoroDoc, parent: Option<&str>) -> Result<Vec<String>, Error> {
        children_with(doc, parent, self)
    }
    pub fn relocated(&self, doc: &LoroDoc, block: &str) -> Result<bool, Error> {
        Ok(self.active(block)? != string(&metadata(doc, block)?, "origin-site")?)
    }
}
pub(super) fn origin_parent(doc: &LoroDoc, block: &str) -> Result<Option<String>, Error> {
    Ok(site(doc, &string(&metadata(doc, block)?, "origin-site")?)?.parent)
}
pub(super) fn seed(
    doc: &LoroDoc,
    block: &str,
    parent: Option<&str>,
    site_id: String,
) -> Result<(), Error> {
    define(doc, block, parent, None, site_id)
}

/// Immutable birth occurrence. Visibility, not native tree creation, belongs to user history.
pub(super) fn define(
    doc: &LoroDoc,
    block: &str,
    parent: Option<&str>,
    before: Option<&str>,
    site_id: String,
) -> Result<(), Error> {
    let order = prepare(doc, parent)?;
    let index = if let Some(before) = before {
        let anchor = active(doc, before)?;
        if site(doc, &anchor)?.parent.as_deref() != parent {
            return Err(Error::Contract("shared creation before-anchor parent"));
        }
        order
            .to_vec()
            .iter()
            .position(|value| value.as_string().is_some_and(|value| value.as_str() == anchor))
            .ok_or(Error::Contract("shared creation before occurrence"))?
    } else {
        order.len()
    };
    doc.get_map("sites").insert(
        &site_id,
        serde_json::to_string(&Site { block: block.into(), parent: parent.map(str::to_owned) })?,
    )?;
    metadata(doc, block)?.insert("origin-site", site_id.clone())?;
    order.insert(index, site_id)?;
    Ok(())
}
pub(super) fn children(doc: &LoroDoc, parent: Option<&str>) -> Result<Vec<String>, Error> {
    Projection::read(doc)?.children(doc, parent)
}
fn children_with(
    doc: &LoroDoc,
    parent: Option<&str>,
    projection: &Projection,
) -> Result<Vec<String>, Error> {
    let Some(order) = existing_order(doc, parent) else {
        return Ok(vec![]);
    };
    let mut children = vec![];
    let mut selected = BTreeSet::new();
    if order.len() > 20_000 {
        return Err(Error::Limit("shared placement occurrences"));
    }
    for value in order.to_vec() {
        let id = value.as_string().ok_or(Error::Contract("shared sibling occurrence"))?.as_str();
        let record = site(doc, id)?;
        if record.parent.as_deref() != parent {
            return Err(Error::Contract("shared occurrence parent"));
        }
        if projection.active(&record.block)? == id && selected.insert(id.to_owned()) {
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
