//! Resolve owned placement intents into an acyclic forest without authoring repairs.
//!
//! A cycle suspends its lowest-priority authored edge, exposing that node's next
//! contribution or immutable origin. Undo can reveal suspended intent later.
//! Immutable origins are never discarded to satisfy a competing authored move.
use super::{Site, metadata, site};
use crate::{
    Error,
    register::{Stamp, read_contribution},
};
use loro::{LoroDoc, ToJson};
use std::collections::{BTreeMap, BTreeSet};

struct Candidate {
    stamp: Option<Stamp>,
    id: String,
    site: Site,
    escape: bool,
}
struct Node {
    candidates: Vec<Candidate>,
    selected: usize,
}
impl Node {
    fn current(&self) -> Result<&Candidate, Error> {
        self.candidates.get(self.selected).ok_or(Error::Contract("placement origin exhausted"))
    }
}

pub(super) fn selected(doc: &LoroDoc) -> Result<BTreeMap<String, String>, Error> {
    let raw = doc.get_map("metadata").get_deep_value().to_json_value();
    let directory = raw.as_object().ok_or(Error::Contract("placement metadata directory"))?;
    if directory.len() > 20_000 {
        return Err(Error::Limit("placement metadata owners"));
    }
    let grammar = super::grammar::Grammar::read(doc, directory)?;
    let (mut nodes, implicit) = read_nodes(doc, directory)?;
    loop {
        if let Some(path) = cycle(&nodes, &implicit)? {
            if !demote(&mut nodes, path)? {
                return Err(Error::Contract("cyclic immutable placement origins"));
            }
            continue;
        }
        let mut parents = super::grammar::Parents::new();
        for (block, node) in &nodes {
            parents.insert(block.clone(), node.current()?.site.parent.clone());
        }
        parents
            .extend(implicit.iter().map(|(block, parent)| (block.clone(), Some(parent.clone()))));
        match grammar.violation(&parents)? {
            None => break,
            Some(super::grammar::Violation::Parent(block)) => {
                nodes
                    .get_mut(&block)
                    .ok_or(Error::Contract("immutable implicit parent kind"))?
                    .selected += 1;
            }
            Some(super::grammar::Violation::NestedTable { table, path }) => {
                if !demote(&mut nodes, path)? {
                    let node =
                        nodes.get_mut(&table).ok_or(Error::Contract("nested table placement"))?;
                    node.selected = node
                        .candidates
                        .iter()
                        .position(|candidate| candidate.escape)
                        .ok_or(Error::Contract("nested table root escape"))?;
                }
            }
        }
    }
    nodes.into_iter().map(|(block, node)| Ok((block, node.current()?.id.clone()))).collect()
}

type Nodes = BTreeMap<String, Node>;
type Implicit = BTreeMap<String, String>;

/// Internal lowerers already prove the visible target parent through a core plan.
/// They may be between publishing an item's birth and moving it into its list;
/// unrelated half-built nodes must not trigger complete-forest validation here.
/// Choose the highest retained occurrence in the proven parent, including escape.
pub(super) fn anchor_site(
    doc: &LoroDoc,
    block: &str,
    parent: Option<&str>,
) -> Result<String, Error> {
    let raw = metadata(doc, block)?.get_deep_value().to_json_value();
    let origin =
        raw["origin-site"].as_str().ok_or(Error::Contract("placement immutable origin"))?;
    let mut candidates = vec![candidate(doc, block, origin, None, false)?];
    if let Some(escape) = raw.get("escape-site").and_then(serde_json::Value::as_str)
        && escape != origin
    {
        candidates.push(candidate(doc, block, escape, None, true)?);
    }
    if let Some(values) = raw.get("placements") {
        let values = values.as_object().ok_or(Error::Contract("shared placement contributions"))?;
        if values.len() > 1000 {
            return Err(Error::Limit("shared placement contributions"));
        }
        for (key, value) in values {
            let (stamp, value) = read_contribution(doc, key, value)?;
            candidates.push(candidate(
                doc,
                block,
                value.as_str().ok_or(Error::Contract("shared placement identity"))?,
                Some(stamp),
                false,
            )?);
        }
    }
    candidates.sort_by(|a, b| (b.stamp, !b.escape, &b.id).cmp(&(a.stamp, !a.escape, &a.id)));
    candidates
        .into_iter()
        .find(|value| value.site.parent.as_deref() == parent)
        .map(|value| value.id)
        .ok_or(Error::Contract("shared before-anchor parent"))
}

fn read_nodes(
    doc: &LoroDoc,
    directory: &serde_json::Map<String, serde_json::Value>,
) -> Result<(Nodes, Implicit), Error> {
    let mut nodes = BTreeMap::new();
    let mut implicit = BTreeMap::new();
    let mut count = 0_usize;
    for (block, raw) in directory {
        if let Some(parent) = raw.get("virtual-parent") {
            let parent = parent.as_str().ok_or(Error::Contract("placement virtual parent"))?;
            if raw["type"] != "breditor/table-cell"
                || !block.starts_with(super::super::model::VIRTUAL_PREFIX)
            {
                return Err(Error::Contract("placement virtual cell kind"));
            }
            if super::string(&metadata(doc, parent)?, "type")? != "breditor/table-row" {
                return Err(Error::Contract("placement virtual row kind"));
            }
            implicit.insert(block.clone(), parent.to_owned());
        }
        let Some(origin) = raw.get("origin-site") else { continue };
        let origin = origin.as_str().ok_or(Error::Contract("placement immutable origin"))?;
        let mut candidates = vec![candidate(doc, block, origin, None, false)?];
        if let Some(escape) = raw.get("escape-site") {
            let escape = escape.as_str().ok_or(Error::Contract("immutable root escape site"))?;
            if escape != origin {
                let escape = candidate(doc, block, escape, None, true)?;
                if escape.site.parent.is_some() {
                    return Err(Error::Contract("root escape parent"));
                }
                candidates.push(escape);
            }
        }
        if let Some(values) = raw.get("placements") {
            let values =
                values.as_object().ok_or(Error::Contract("shared placement contributions"))?;
            if values.len() > 1000 {
                return Err(Error::Limit("shared placement contributions"));
            }
            for (key, value) in values {
                let (stamp, value) = read_contribution(doc, key, value)?;
                let id = value.as_str().ok_or(Error::Contract("shared placement identity"))?;
                candidates.push(candidate(doc, block, id, Some(stamp), false)?);
            }
        }
        count += candidates.len();
        if count > 100_000 {
            return Err(Error::Limit("placement forest candidates"));
        }
        candidates.sort_by(|a, b| (b.stamp, !b.escape, &b.id).cmp(&(a.stamp, !a.escape, &a.id)));
        nodes.insert(block.clone(), Node { candidates, selected: 0 });
    }
    Ok((nodes, implicit))
}

fn demote(nodes: &mut Nodes, path: Vec<String>) -> Result<bool, Error> {
    let mut weakest: Option<(Stamp, String)> = None;
    for block in path {
        let Some(node) = nodes.get(&block) else { continue };
        if let Some(stamp) = node.current()?.stamp
            && weakest.as_ref().is_none_or(|prior| (stamp, &block) < (prior.0, &prior.1))
        {
            weakest = Some((stamp, block));
        }
    }
    let Some((_, block)) = weakest else { return Ok(false) };
    let node = nodes.get_mut(&block).ok_or(Error::Contract("placement cycle node"))?;
    node.selected += 1;
    Ok(true)
}

fn candidate(
    doc: &LoroDoc,
    block: &str,
    id: &str,
    stamp: Option<Stamp>,
    escape: bool,
) -> Result<Candidate, Error> {
    let record = site(doc, id)?;
    if record.block != block {
        return Err(Error::Contract("placement site owner"));
    }
    if let Some(parent) = &record.parent {
        // Derived cell parents may not have a placement occurrence of their own.
        metadata(doc, parent)?;
    }
    Ok(Candidate { stamp, id: id.into(), site: record, escape })
}

fn cycle(
    nodes: &BTreeMap<String, Node>,
    implicit: &BTreeMap<String, String>,
) -> Result<Option<Vec<String>>, Error> {
    let mut done = BTreeSet::new();
    for root in nodes.keys() {
        if done.contains(root) {
            continue;
        }
        let mut positions = BTreeMap::new();
        let mut path = vec![];
        let mut next = Some(root.as_str());
        while let Some(block) = next {
            if done.contains(block) {
                break;
            }
            if let Some(position) = positions.get(block) {
                return Ok(Some(path[*position..].to_vec()));
            }
            let parent = if let Some(node) = nodes.get(block) {
                node.current()?.site.parent.as_deref()
            } else if let Some(parent) = implicit.get(block) {
                Some(parent.as_str())
            } else {
                break;
            };
            positions.insert(block.to_owned(), path.len());
            path.push(block.to_owned());
            next = parent;
        }
        done.extend(path);
    }
    Ok(None)
}
