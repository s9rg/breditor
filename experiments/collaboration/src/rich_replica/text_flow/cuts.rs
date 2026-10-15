//! Zero-width causal cuts route unobserved end carets without sentinel characters.
use crate::{
    Error,
    anchor::TextAnchor,
    register::{Stamp, read_contribution},
};
use loro::{LoroDoc, ToJson};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Cut {
    pub left: String,
    pub right: String,
    pub source: String,
    pub anchor: TextAnchor,
}
pub(super) fn prepare(doc: &LoroDoc, right: &str) -> Result<(), Error> {
    doc.get_map("text-flow-cuts").ensure_mergeable_map(right)?;
    Ok(())
}
pub(super) fn write(doc: &LoroDoc, cut: &Cut, stamp: Stamp) -> Result<(), Error> {
    doc.get_map("text-flow-cuts")
        .ensure_mergeable_map(&cut.right)?
        .insert(&stamp.key(), stamp.contribution(serde_json::to_string(cut)?.into()))?;
    Ok(())
}
pub(super) fn witness(doc: &LoroDoc) -> BTreeMap<String, String> {
    doc.state_vv()
        .iter()
        .map(|(writer, counter)| (writer.to_string(), counter.to_string()))
        .collect()
}
pub(super) fn follow(
    doc: &LoroDoc,
    block: &str,
    source: &str,
    offset: u32,
    seen: &BTreeMap<String, String>,
) -> Result<Option<String>, Error> {
    if seen.len() > 1000 {
        return Err(Error::Limit("text-flow cut witnesses"));
    }
    let mut witness = BTreeMap::new();
    for (writer, counter) in seen {
        let writer_id = writer.parse::<u64>().map_err(|_| Error::Anchor)?;
        let count = counter.parse::<u32>().map_err(|_| Error::Anchor)?;
        if writer_id.to_string() != *writer || count.to_string() != *counter {
            return Err(Error::Anchor);
        }
        witness.insert(writer_id, count);
    }
    let text = super::super::model::existing_text(doc, source).ok_or(Error::Anchor)?;
    let mut cuts = vec![];
    for (stamp, cut) in active(doc)? {
        let (_, writer, counter) = stamp.words();
        if witness.get(&writer).copied().unwrap_or(0) > counter {
            continue;
        }
        if cut.source == source && cut.anchor.resolve(doc, &text)? == offset {
            cuts.push((stamp, cut));
        }
    }
    cuts.sort_by_key(|entry| std::cmp::Reverse(entry.0));
    let mut current = block;
    let mut selected = None;
    let mut visited = std::collections::BTreeSet::new();
    while visited.insert(current.to_owned()) {
        let Some((_, cut)) = cuts.iter().find(|(_, cut)| cut.left == current) else {
            return Ok(selected);
        };
        current = &cut.right;
        selected = Some(cut.right.clone());
    }
    Err(Error::Contract("text-flow cut cycle"))
}

pub(super) fn active(doc: &LoroDoc) -> Result<Vec<(Stamp, Cut)>, Error> {
    let raw = doc.get_map("text-flow-cuts").get_deep_value().to_json_value();
    let raw = raw.as_object().ok_or(Error::Contract("text-flow cuts"))?;
    if raw.len() > 1000 {
        return Err(Error::Limit("text-flow cut owners"));
    }
    let mut cuts = vec![];
    let mut total = 0;
    for (right, entries) in raw {
        let entries = entries.as_object().ok_or(Error::Contract("text-flow cut contributions"))?;
        for (key, value) in entries {
            total += 1;
            if total > 10_000 {
                return Err(Error::Limit("text-flow cut contributions"));
            }
            let (stamp, value) = read_contribution(doc, key, value)?;
            let encoded = value.as_str().ok_or(Error::Contract("text-flow cut value"))?;
            if encoded.len() > 4096 {
                return Err(Error::Limit("text-flow cut bytes"));
            }
            let cut: Cut = serde_json::from_str(encoded)?;
            if cut.right != *right {
                return Err(Error::Contract("text-flow cut owner"));
            }
            crate::actions::validate_id(&cut.left)?;
            crate::actions::validate_id(&cut.right)?;
            crate::actions::validate_id(&cut.source)?;
            cuts.push((stamp, cut));
        }
    }
    Ok(cuts)
}
