//! Canonical definitions and writer-owned ordered text-root/fragment placements.
use super::super::model;
use crate::{
    Error,
    register::{Stamp, read_contribution},
};
use loro::{ContainerID, ContainerType, LoroDoc, LoroMap, LoroMovableList, ToJson};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const MAX_NODES: usize = 20_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(super) enum Definition {
    Root { block: String },
    Fragment { source: Option<String>, parent: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Site {
    node: String,
    parent: String,
}

#[derive(Debug, Clone)]
struct Edge {
    parent: String,
    site: String,
}
type Candidate = (Option<Stamp>, String, Option<Edge>);

pub(super) fn root(block: &str) -> String {
    model::virtual_id("text-root", &[block])
}
pub(super) fn birth(source: &str) -> String {
    model::virtual_id("text-birth", &[source])
}
pub(super) fn empty(block: &str) -> String {
    model::virtual_id("text-empty", &[block])
}
pub(super) fn tail(block: &str) -> String {
    model::virtual_id("text-tail", &[block])
}

fn mergeable(root: &str, key: &str, kind: ContainerType) -> ContainerID {
    ContainerID::new_mergeable(&ContainerID::new_root(root, ContainerType::Map), key, kind)
}
fn order(doc: &LoroDoc, parent: &str) -> Result<LoroMovableList, Error> {
    Ok(doc.get_map("text-flow-orders").ensure_mergeable_movable_list(parent)?)
}
fn effects(doc: &LoroDoc, node: &str) -> Result<LoroMap, Error> {
    Ok(doc.get_map("text-flow-effects").ensure_mergeable_map(node)?)
}

fn define(doc: &LoroDoc, id: &str, definition: &Definition) -> Result<(), Error> {
    let map = doc.get_map("text-flow-definitions");
    let encoded = serde_json::to_string(definition)?;
    if let Some(previous) = map.get(id) {
        if previous
            .as_value()
            .and_then(loro::LoroValue::as_string)
            .is_none_or(|value| value.as_str() != encoded)
        {
            return Err(Error::Contract("conflicting immutable text-flow definition"));
        }
    } else {
        map.insert(id, encoded)?;
    }
    effects(doc, id)?;
    Ok(())
}

pub(super) fn prepare_root(doc: &LoroDoc, block: &str) -> Result<(), Error> {
    crate::actions::validate_id(block)?;
    let id = root(block);
    if doc.get_map("text-flow-definitions").get(&id).is_some() {
        let graph = Graph::read(doc)?;
        if !matches!(graph.definitions.get(&id), Some(Definition::Root { block: own, .. }) if own == block)
        {
            return Err(Error::Contract("text root identity"));
        }
        return Ok(());
    }
    model::text(doc, block)?;
    define(doc, &id, &Definition::Root { block: block.into() })?;
    order(doc, &id)?;
    prepare_fragment(doc, &empty(block), Some(block), &id)?;
    prepare_fragment(doc, &birth(block), Some(block), &id)?;
    Ok(())
}

pub(super) fn prepare_fragment(
    doc: &LoroDoc,
    node: &str,
    source: Option<&str>,
    parent: &str,
) -> Result<(), Error> {
    define(
        doc,
        node,
        &Definition::Fragment { source: source.map(str::to_owned), parent: parent.into() },
    )?;
    let site = model::virtual_id("text-origin", &[node, parent]);
    let record = serde_json::to_string(&Site { node: node.into(), parent: parent.into() })?;
    let sites = doc.get_map("text-flow-sites");
    if let Some(old) = sites.get(&site) {
        if old
            .as_value()
            .and_then(loro::LoroValue::as_string)
            .is_none_or(|old| old.as_str() != record)
        {
            return Err(Error::Contract("conflicting text-flow birth site"));
        }
    } else {
        sites.insert(&site, record)?;
    }
    let order = order(doc, parent)?;
    if !order
        .to_vec()
        .iter()
        .any(|value| value.as_string().is_some_and(|value| value.as_str() == site))
    {
        order.insert(order.len(), site)?;
    }
    Ok(())
}

pub(super) fn move_node(
    doc: &LoroDoc,
    node: &str,
    parent: &str,
    stamp: Stamp,
    ordinal: usize,
) -> Result<(), Error> {
    let site = format!("text-move:{}:{ordinal}", stamp.key());
    doc.get_map("text-flow-sites").insert(
        &site,
        serde_json::to_string(&Site { node: node.into(), parent: parent.into() })?,
    )?;
    let order = order(doc, parent)?;
    order.insert(order.len(), site.clone())?;
    effects(doc, node)?.insert(&stamp.key(), stamp.contribution(site.into()))?;
    Ok(())
}

/// Parent choices are computed together, never by recursive LWW root expansion.
/// Highest-priority edges enter a forest first; an edge that would close a cycle
/// is ignored and that node may use its next older edge or immutable birth.
pub(super) struct Graph {
    pub definitions: BTreeMap<String, Definition>,
    parents: BTreeMap<String, Option<Edge>>,
    children: BTreeMap<String, Vec<String>>,
}
impl Graph {
    pub fn read(doc: &LoroDoc) -> Result<Self, Error> {
        let raw = doc.get_map("text-flow-definitions").get_deep_value().to_json_value();
        let raw = raw.as_object().ok_or(Error::Contract("text-flow definitions"))?;
        if raw.len() > MAX_NODES {
            return Err(Error::Limit("text-flow nodes"));
        }
        let definitions: BTreeMap<String, Definition> = raw
            .iter()
            .map(|(id, value)| {
                let value =
                    value.as_str().ok_or(Error::Contract("encoded text-flow definition"))?;
                if value.len() > 4096 {
                    return Err(Error::Limit("text-flow definition bytes"));
                }
                Ok((id.clone(), serde_json::from_str(value)?))
            })
            .collect::<Result<_, Error>>()?;
        let sites = doc.get_map("text-flow-sites").get_deep_value().to_json_value();
        let sites = sites.as_object().ok_or(Error::Contract("text-flow sites"))?;
        if sites.len() > 50_000 {
            return Err(Error::Limit("text-flow sites"));
        }
        let site = |id: &str| -> Result<Site, Error> {
            let value = sites
                .get(id)
                .and_then(serde_json::Value::as_str)
                .ok_or(Error::Contract("text-flow site"))?;
            if value.len() > 4096 {
                return Err(Error::Limit("text-flow site bytes"));
            }
            Ok(serde_json::from_str(value)?)
        };
        let mut candidates = vec![];
        for (node, definition) in &definitions {
            match definition {
                Definition::Root { block } => {
                    crate::actions::validate_id(block)?;
                    if root(block) != *node {
                        return Err(Error::Contract("text-flow root identity"));
                    }
                    candidates.push((None, node.clone(), None));
                }
                Definition::Fragment { source, parent } => {
                    if let Some(source) = source {
                        crate::actions::validate_id(source)?;
                    }
                    let id = model::virtual_id("text-origin", &[node, parent]);
                    let record = site(&id)?;
                    if record.node != *node || record.parent != *parent {
                        return Err(Error::Contract("text-flow origin identity"));
                    }
                    candidates.push((
                        None,
                        node.clone(),
                        Some(Edge { parent: parent.clone(), site: id }),
                    ));
                }
            }
            if let Some(effects) =
                doc.try_get_map(mergeable("text-flow-effects", node, ContainerType::Map))
            {
                let raw = effects.get_deep_value().to_json_value();
                let raw = raw.as_object().ok_or(Error::Contract("text-flow contributions"))?;
                if raw.len() > 1000 {
                    return Err(Error::Limit("text-flow contributions"));
                }
                for (key, value) in raw {
                    let (stamp, value) = read_contribution(doc, key, value)?;
                    let id = value.as_str().ok_or(Error::Contract("text-flow selected site"))?;
                    let record = site(id)?;
                    if record.node != *node {
                        return Err(Error::Contract("text-flow selected node"));
                    }
                    candidates.push((
                        Some(stamp),
                        node.clone(),
                        Some(Edge { parent: record.parent, site: id.into() }),
                    ));
                }
            }
        }
        let parents = selected_parents(&definitions, candidates)?;
        let children = selected_children(doc, &definitions, &parents, &site)?;
        Ok(Self { definitions, parents, children })
    }
    pub fn children(&self, root: &str) -> Result<&[String], Error> {
        self.children.get(root).map(Vec::as_slice).ok_or(Error::Contract("text-flow root children"))
    }
    pub fn parent(&self, node: &str) -> Result<Option<&str>, Error> {
        Ok(self
            .parents
            .get(node)
            .ok_or(Error::Contract("text-flow node"))?
            .as_ref()
            .map(|edge| edge.parent.as_str()))
    }
    pub fn owner(&self, node: &str) -> Result<&str, Error> {
        let mut node = self
            .definitions
            .get_key_value(node)
            .ok_or(Error::Contract("text-flow owner"))?
            .0
            .as_str();
        for _ in 0..=self.definitions.len() {
            if let Some(parent) = self.parent(node)? {
                node = parent;
            } else {
                return match self.definitions.get(node) {
                    Some(Definition::Root { block, .. }) => Ok(block),
                    _ => Err(Error::Contract("text-flow top root")),
                };
            }
        }
        Err(Error::Contract("text-flow cycle"))
    }
    pub fn fragments(&self, root: &str) -> Result<Vec<String>, Error> {
        let mut stack = vec![root.to_owned()];
        let mut output = vec![];
        let mut seen = BTreeSet::new();
        while let Some(node) = stack.pop() {
            if !seen.insert(node.clone()) {
                return Err(Error::Contract("duplicate text-flow traversal"));
            }
            match self.definitions.get(&node).ok_or(Error::Contract("text-flow traversal"))? {
                Definition::Root { .. } => {
                    stack.extend(self.children(&node)?.iter().rev().cloned());
                }
                Definition::Fragment { .. } => output.push(node),
            }
        }
        Ok(output)
    }
}

fn selected_parents(
    definitions: &BTreeMap<String, Definition>,
    mut candidates: Vec<Candidate>,
) -> Result<BTreeMap<String, Option<Edge>>, Error> {
    candidates.sort_by(|a, b| (b.0, &b.1).cmp(&(a.0, &a.1)));
    let mut parents: BTreeMap<String, Option<Edge>> = BTreeMap::new();
    for (_, node, edge) in candidates {
        if parents.contains_key(&node) {
            continue;
        }
        if let Some(edge) = &edge {
            if !matches!(definitions.get(&edge.parent), Some(Definition::Root { .. })) {
                return Err(Error::Contract("text-flow parent kind"));
            }
            let mut ancestor = edge.parent.as_str();
            let mut cycle = ancestor == node;
            for _ in 0..definitions.len() {
                let Some(Some(parent)) = parents.get(ancestor) else { break };
                ancestor = &parent.parent;
                if ancestor == node {
                    cycle = true;
                    break;
                }
            }
            if cycle {
                continue;
            }
        }
        parents.insert(node, edge);
    }
    if parents.len() != definitions.len() {
        return Err(Error::Contract("text-flow forest completeness"));
    }
    Ok(parents)
}

fn selected_children(
    doc: &LoroDoc,
    definitions: &BTreeMap<String, Definition>,
    parents: &BTreeMap<String, Option<Edge>>,
    site: &impl Fn(&str) -> Result<Site, Error>,
) -> Result<BTreeMap<String, Vec<String>>, Error> {
    let mut children = BTreeMap::new();
    for (id, definition) in definitions {
        if !matches!(definition, Definition::Root { .. }) {
            continue;
        }
        let list = doc
            .try_get_movable_list(mergeable("text-flow-orders", id, ContainerType::MovableList))
            .ok_or(Error::Contract("text-flow child order"))?;
        if list.len() > 50_000 {
            return Err(Error::Limit("text-flow child occurrences"));
        }
        let mut selected = vec![];
        let mut seen = BTreeSet::new();
        for value in list.to_vec() {
            let value = value.as_string().ok_or(Error::Contract("text-flow occurrence"))?;
            let record = site(value.as_str())?;
            if record.parent != *id {
                return Err(Error::Contract("text-flow occurrence parent"));
            }
            if parents
                .get(&record.node)
                .and_then(Option::as_ref)
                .is_some_and(|edge| edge.site == value.as_str())
                && seen.insert(record.node.clone())
            {
                selected.push(record.node);
            }
        }
        children.insert(id.clone(), selected);
    }
    for (node, edge) in parents {
        if let Some(edge) = edge
            && !children.get(&edge.parent).is_some_and(|children| children.contains(node))
        {
            return Err(Error::Contract("missing selected text-flow occurrence"));
        }
    }
    Ok(children)
}
