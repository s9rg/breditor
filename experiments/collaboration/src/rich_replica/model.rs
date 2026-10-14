//! Shared primitive names and schema-bound, atomically paired metadata contributions.
use crate::{
    Error,
    register::{Stamp, read_contribution},
};
use loro::{ContainerID, ContainerType, LoroDoc, LoroMap, LoroText, LoroTree, ToJson};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fmt::Write};

pub(super) const VIRTUAL_PREFIX: &str = "breditor-virtual:";

pub(super) fn tree(doc: &LoroDoc) -> LoroTree {
    let tree = doc.get_tree("nodes");
    tree.enable_fractional_index(0);
    tree
}

pub(super) fn existing_text(doc: &LoroDoc, block: &str) -> Option<LoroText> {
    let root = ContainerID::new_root("texts", ContainerType::Map);
    doc.try_get_text(ContainerID::new_mergeable(&root, block, ContainerType::Text))
}

pub(super) fn text(doc: &LoroDoc, block: &str) -> Result<LoroText, Error> {
    crate::actions::validate_id(block)?;
    Ok(doc.get_map("texts").ensure_mergeable_text(block)?)
}

pub(super) fn virtual_id(domain: &str, parts: &[&str]) -> String {
    let mut digest = Sha256::new();
    digest.update(domain.as_bytes());
    for part in parts {
        digest.update(part.len().to_string().as_bytes());
        digest.update(b":");
        digest.update(part.as_bytes());
    }
    let mut identity = format!("{VIRTUAL_PREFIX}{domain}:");
    for byte in digest.finalize() {
        let _ = write!(identity, "{byte:02x}");
    }
    identity
}

/// One semantic field may set/remove several correlated AST properties atomically.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Patch {
    pub sets: BTreeMap<String, Value>,
    pub removes: Vec<String>,
}

impl Patch {
    pub(super) fn set(name: &str, value: Value) -> Self {
        Self { sets: BTreeMap::from([(name.into(), value)]), removes: vec![] }
    }
}

pub(super) fn write_patch(
    doc: &LoroDoc,
    block: &str,
    field: &str,
    patch: &Patch,
    stamp: Stamp,
) -> Result<(), Error> {
    let owner = metadata(doc, block)?.ensure_mergeable_map("effects")?;
    crate::register::write(&owner, field, stamp, serde_json::to_string(patch)?.into())
}

pub(super) fn patches(doc: &LoroDoc, effects: &Value) -> Result<Vec<Patch>, Error> {
    let fields = effects.as_object().ok_or(Error::Contract("shared field map"))?;
    if fields.len() > 128 {
        return Err(Error::Limit("shared metadata fields"));
    }
    let mut output = vec![];
    for contributions in fields.values() {
        let contributions =
            contributions.as_object().ok_or(Error::Contract("shared field contributions"))?;
        if contributions.len() > 1000 {
            return Err(Error::Limit("shared field contributions"));
        }
        let mut selected: Option<(Stamp, Patch)> = None;
        for (key, contribution) in contributions {
            let (stamp, value) = read_contribution(doc, key, contribution)?;
            let value = value.as_str().ok_or(Error::Contract("shared property patch"))?;
            if value.len() > 64 * 1024 {
                return Err(Error::Limit("shared property patch"));
            }
            let patch: Patch = serde_json::from_str(value)?;
            if selected.as_ref().is_none_or(|(previous, _)| stamp > *previous) {
                selected = Some((stamp, patch));
            }
        }
        if let Some((_, patch)) = selected {
            output.push(patch);
        }
    }
    Ok(output)
}

pub(super) fn object_string(map: &LoroMap, key: &str) -> Result<Value, Error> {
    let raw = map.get(key).ok_or(Error::Contract("shared node metadata"))?;
    let raw = raw.as_value().ok_or(Error::Contract("shared scalar metadata"))?.to_json_value();
    let raw = raw.as_str().ok_or(Error::Contract("shared encoded metadata"))?;
    if raw.len() > 64 * 1024 {
        return Err(Error::Limit("shared node metadata"));
    }
    Ok(serde_json::from_str(raw)?)
}

pub(super) fn string(map: &LoroMap, key: &str) -> Result<String, Error> {
    map.get(key)
        .and_then(|value| {
            value
                .as_value()
                .and_then(loro::LoroValue::as_string)
                .map(|value| value.as_str().to_owned())
        })
        .ok_or(Error::Contract("shared string"))
}

pub(super) fn placeholder(block: &str, text: &[Value]) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,
        "properties":{"breditor/block-id":block},"children":text})
}

pub(super) fn metadata(doc: &LoroDoc, block: &str) -> Result<LoroMap, Error> {
    let root = ContainerID::new_root("metadata", ContainerType::Map);
    doc.try_get_map(ContainerID::new_mergeable(&root, block, ContainerType::Map))
        .ok_or(Error::Contract("missing stable shared metadata"))
}

pub(super) fn any_deleted(doc: &LoroDoc, values: Option<&Value>) -> Result<bool, Error> {
    let Some(values) = values else {
        return Ok(false);
    };
    let values = values.as_object().ok_or(Error::Contract("shared deletion contributions"))?;
    if values.len() > 1000 {
        return Err(Error::Limit("shared deletion contributions"));
    }
    let mut deleted = false;
    for (key, value) in values {
        let (_, value) = read_contribution(doc, key, value)?;
        deleted |= value.as_bool().ok_or(Error::Contract("shared deletion effect"))?;
    }
    Ok(deleted)
}

pub(super) fn deleted(doc: &LoroDoc, block: &str) -> Result<bool, Error> {
    let raw = metadata(doc, block)?.get_deep_value().to_json_value();
    any_deleted(doc, raw.get("deletions"))
}

/// Seed/derived nodes exist independently of history; authored definitions need a live birth.
pub(super) fn born(doc: &LoroDoc, raw: &Value) -> Result<bool, Error> {
    match raw.get("birth-mode").and_then(Value::as_str) {
        None | Some("derived") => Ok(true),
        Some("authored") => any_deleted(doc, raw.get("births")),
        Some(_) => Err(Error::Contract("shared birth mode")),
    }
}

pub(super) fn optional_metadata(doc: &LoroDoc, block: &str) -> Option<LoroMap> {
    doc.try_get_map(ContainerID::new_mergeable(
        &ContainerID::new_root("metadata", ContainerType::Map),
        block,
        ContainerType::Map,
    ))
}
