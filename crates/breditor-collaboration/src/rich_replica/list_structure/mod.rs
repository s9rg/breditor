//! Lower admitted list structure to owned births, placements, visibility and paired style intents.
//! Text is never copied by this structural adapter; item boundaries use the source-flow lowerer.
mod derived;
mod tree;
pub(super) use derived::validate as validate_retained;
pub(super) use derived::{heads as retain_heads, retain as retain_text};

use super::{creation, model, paragraphs, placement};
use crate::{Error, register::Stamp};
use breditor_core::{codec::DocumentJsonCodecV2, rich_content::RichDocument};
use loro::{LoroDoc, ToJson};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use tree::Tree;

/// Reserve a fresh empty definition outside undo; core capture later proves its actual use.
pub(super) fn reserve(
    doc: &LoroDoc,
    block: &str,
    kind: &str,
    level: Option<u8>,
) -> Result<(), Error> {
    let mut node = json!({"kind":"element","type":kind,"entityId":null,"properties":{"breditor/block-id":block},"children":[]});
    if let Some(level) = level {
        node["properties"]["breditor/level"] = json!(level);
    }
    creation::prepare(doc, &node, None, None)
}

/// Infrastructure containers cannot belong to an action that later undoes another writer's work.
pub(super) fn prepare(doc: &LoroDoc) -> Result<(), Error> {
    let raw = doc.get_map("metadata").get_deep_value().to_json_value();
    let owners = raw.as_object().ok_or(Error::Contract("list metadata directory"))?;
    if owners.len() > 20_000 {
        return Err(Error::Limit("list metadata owners"));
    }
    for id in owners.keys() {
        let meta = model::metadata(doc, id)?;
        meta.ensure_mergeable_map("deletions")?;
        meta.ensure_mergeable_map("placements")?;
        let kind = model::string(&meta, "type")?;
        if kind == "breditor/list-item" {
            derived::reserve_default(doc, id)?;
        }
        if matches!(kind.as_str(), "breditor/bullet-list" | "breditor/ordered-list") {
            meta.ensure_mergeable_map("effects")?.ensure_mergeable_map("list-kind")?;
        }
        if matches!(
            kind.as_str(),
            "breditor/bullet-list"
                | "breditor/ordered-list"
                | "breditor/list-item"
                | "breditor/table-cell"
                | "breditor/image"
        ) {
            placement::prepare(doc, Some(id))?;
        }
    }
    if doc.get_map("metadata").len() > 20_000 {
        return Err(Error::Limit("list prepared metadata owners"));
    }
    placement::prepare(doc, None)?;
    Ok(())
}

fn is_list(node: &Value) -> bool {
    matches!(node["type"].as_str(), Some("breditor/bullet-list" | "breditor/ordered-list"))
}
fn style(node: &Value) -> Result<model::Patch, Error> {
    if !is_list(node) {
        return Err(Error::Contract("shared list style target"));
    }
    let mut sets = BTreeMap::from([("$type".into(), node["type"].clone())]);
    let removes = if let Some(start) = node["properties"].get("breditor/start") {
        sets.insert("breditor/start".into(), start.clone());
        vec![]
    } else {
        vec!["breditor/start".into()]
    };
    Ok(model::Patch { sets, removes })
}

/// Apply only the list/placement consequences of a schema-admitted core edit.
pub(super) fn apply(
    doc: &LoroDoc,
    codec: &DocumentJsonCodecV2,
    before: &RichDocument,
    after: &RichDocument,
    stamp: Stamp,
) -> Result<(), Error> {
    let old = Tree::read(codec, before)?;
    let new = Tree::read(codec, after)?;
    for (id, node) in &new.nodes {
        if !old.nodes.contains_key(id) {
            if !matches!(
                node.value["type"].as_str(),
                Some(
                    "breditor/bullet-list"
                        | "breditor/ordered-list"
                        | "breditor/list-item"
                        | "breditor/paragraph"
                        | "breditor/heading"
                )
            ) {
                return Err(Error::Contract("shared list introduced foreign kind"));
            }
            let mut empty = node.value.clone();
            empty["children"] = json!([]);
            creation::publish(doc, &empty, stamp, 0)?;
        }
        if is_list(&node.value) {
            let patch = style(&node.value)?;
            if old.nodes.get(id).map(|node| style(&node.value)).transpose()?.as_ref()
                != Some(&patch)
            {
                model::write_patch(doc, id, "list-kind", &patch, stamp)?;
            }
        }
    }
    // Placement anchors validate their authored causal source; make births/style claims
    // inspectable before resolving anchors. The enclosing history group stays atomic.
    doc.commit();
    let mut ordinal = 0;
    relocate(doc, &old, &new, &new.roots, stamp, &mut ordinal)?;
    for node in new.nodes.values() {
        relocate(doc, &old, &new, &node.children, stamp, &mut ordinal)?;
    }
    for (id, node) in &old.nodes {
        if !new.nodes.contains_key(id)
            && node.parent.as_ref().is_none_or(|parent| new.nodes.contains_key(parent))
        {
            super::Command::DeleteBlock(super::actions::DeleteBlock { block: id.clone() })
                .apply(doc, codec, before, stamp, 0)?;
        }
    }
    doc.commit();
    Ok(())
}
fn relocate(
    doc: &LoroDoc,
    old: &Tree,
    new: &Tree,
    children: &[String],
    stamp: Stamp,
    ordinal: &mut usize,
) -> Result<(), Error> {
    let mut before = None;
    for id in children.iter().rev() {
        let target = new.nodes.get(id).ok_or(Error::Contract("shared list child directory"))?;
        if old.nodes.get(id).is_none_or(|node| node.parent != target.parent) {
            placement::move_block(doc, id, target.parent.as_deref(), before, stamp, *ordinal)?;
            // The next earlier sibling can anchor to this newly authored occurrence.
            doc.commit();
            *ordinal += 1;
        }
        before = Some(id.as_str());
    }
    Ok(())
}

/// Finish a text-preserving structural command with exact core-result equality.
pub(super) fn publish(
    doc: &LoroDoc,
    codec: &DocumentJsonCodecV2,
    before: &RichDocument,
    after: &RichDocument,
    stamp: Stamp,
) -> Result<(), Error> {
    apply(doc, codec, before, after, stamp)?;
    paragraphs::verify(doc, codec, after)
}
