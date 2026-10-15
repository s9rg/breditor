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
        let mut candidates = vec![candidate(doc, block, origin, None)?];
        if let Some(values) = raw.get("placements") {
            let values =
                values.as_object().ok_or(Error::Contract("shared placement contributions"))?;
            if values.len() > 1000 {
                return Err(Error::Limit("shared placement contributions"));
            }
            for (key, value) in values {
                let (stamp, value) = read_contribution(doc, key, value)?;
                let id = value.as_str().ok_or(Error::Contract("shared placement identity"))?;
                candidates.push(candidate(doc, block, id, Some(stamp))?);
            }
        }
        count += candidates.len();
        if count > 100_000 {
            return Err(Error::Limit("placement forest candidates"));
        }
        candidates.sort_by(|a, b| (b.stamp, &b.id).cmp(&(a.stamp, &a.id)));
        nodes.insert(block.clone(), Node { candidates, selected: 0 });
    }
    while let Some(cycle) = cycle(&nodes, &implicit)? {
        let mut weakest: Option<(Stamp, String)> = None;
        for block in cycle {
            let Some(node) = nodes.get(&block) else { continue };
            if let Some(stamp) = node.current()?.stamp
                && weakest.as_ref().is_none_or(|prior| (stamp, &block) < (prior.0, &prior.1))
            {
                weakest = Some((stamp, block));
            }
        }
        let (_, block) = weakest.ok_or(Error::Contract("cyclic immutable placement origins"))?;
        let node = nodes.get_mut(&block).ok_or(Error::Contract("placement cycle node"))?;
        node.selected += 1;
    }
    nodes.into_iter().map(|(block, node)| Ok((block, node.current()?.id.clone()))).collect()
}

fn candidate(
    doc: &LoroDoc,
    block: &str,
    id: &str,
    stamp: Option<Stamp>,
) -> Result<Candidate, Error> {
    let record = site(doc, id)?;
    if record.block != block {
        return Err(Error::Contract("placement site owner"));
    }
    if let Some(parent) = &record.parent {
        // Derived cell parents may not have a placement occurrence of their own.
        metadata(doc, parent)?;
    }
    Ok(Candidate { stamp, id: id.into(), site: record })
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
