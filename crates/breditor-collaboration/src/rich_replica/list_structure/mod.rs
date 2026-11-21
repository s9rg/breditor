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
    creation::prepare(doc, &node, None, None)?;
    if kind == "breditor/bullet-list" && super::protocol::Protocol::read(doc)?.v4() {
        let effects = model::metadata(doc, block)?.ensure_mergeable_map("effects")?;
        for property in NUMBERING {
            effects.ensure_mergeable_map(&format!("property:{property}"))?;
        }
    }
    Ok(())
}

/// V4 ordered-list numbering fields a fresh list inherits from the core result (a split
/// tail keeps its source list's style and counting order, as the local V4 owner does).
const NUMBERING: [&str; 2] = ["breditor/list-style", "breditor/list-reversed"];

/// A task birth's immutable defaults include its explicit initial completion.
pub(super) fn reserve_task(doc: &LoroDoc, block: &str, checked: bool) -> Result<(), Error> {
    let node = json!({"kind":"element","type":"breditor/task-item","entityId":null,
        "properties":{"breditor/block-id":block,"breditor/checked":checked},"children":[]});
    creation::prepare(doc, &node, None, None)
}

/// V2/V3 infrastructure; do not add operations to the original V1 preparation path.
/// Existing journals retain their original operation IDs and replay effects.
pub(super) fn prepare_v2(doc: &LoroDoc) -> Result<(), Error> {
    super::protocol::Protocol::require_structural(doc)?;
    prepare(doc)?;
    let raw = doc.get_map("metadata").get_deep_value().to_json_value();
    let owners = raw.as_object().ok_or(Error::Contract("structural V2 metadata directory"))?;
    if owners.len() > 20_000 {
        return Err(Error::Limit("structural V2 metadata owners"));
    }
    for id in owners.keys() {
        let kind = model::string(&model::metadata(doc, id)?, "type")?;
        if matches!(kind.as_str(), "breditor/task-item" | "breditor/blockquote") {
            derived::reserve_default(doc, id)?;
        }
        if matches!(
            kind.as_str(),
            "breditor/task-item" | "breditor/task-list" | "breditor/blockquote"
        ) {
            placement::prepare(doc, Some(id))?;
        }
    }
    if doc.get_map("metadata").len() > 20_000 {
        return Err(Error::Limit("structural V2 prepared metadata owners"));
    }
    Ok(())
}

/// Unwrapping a quote can move a conditional normalization paragraph into real flow.
pub(super) fn retain_body(doc: &LoroDoc, container: &str) -> Result<(), Error> {
    let source = super::materialize::envelope(doc)?;
    if let Some(node) = creation::find(&source["root"], container) {
        for child in node["children"].as_array().ok_or(Error::Contract("shared structural body"))? {
            retain_text(doc, creation::block(child)?)?;
        }
    }
    Ok(())
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

/// A list loaded with a start keeps it in its own seeded `property:breditor/start` field,
/// which projects after `list-kind` (field-name order). A later kind/start choice writes
/// that field too, with the same stamp, so the newest choice wins in both fields.
fn seeded_start(doc: &LoroDoc, id: &str, node: &Value, stamp: Stamp) -> Result<(), Error> {
    const FIELD: &str = "property:breditor/start";
    if model::metadata(doc, id)?.ensure_mergeable_map("effects")?.get(FIELD).is_none() {
        return Ok(());
    }
    let patch = node["properties"].get("breditor/start").map_or_else(
        || model::Patch { sets: BTreeMap::new(), removes: vec!["breditor/start".into()] },
        |start| model::Patch::set("breditor/start", start.clone()),
    );
    model::write_patch(doc, id, FIELD, &patch, stamp)
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
            let original = matches!(
                node.value["type"].as_str(),
                Some(
                    "breditor/bullet-list"
                        | "breditor/ordered-list"
                        | "breditor/list-item"
                        | "breditor/paragraph"
                        | "breditor/heading"
                )
            );
            let structural = super::protocol::Protocol::from_codec(codec)?.structural()
                && matches!(
                    node.value["type"].as_str(),
                    Some(
                        "breditor/blockquote"
                            | "breditor/task-list"
                            | "breditor/task-item"
                            | "breditor/horizontal-rule"
                    )
                );
            // V4 sections are born by the shared section wrap (summary included).
            let structural = structural
                || (super::protocol::Protocol::from_codec(codec)?.v4()
                    && matches!(
                        node.value["type"].as_str(),
                        Some("breditor/details" | "breditor/details-summary")
                    ));
            if !original && !structural {
                return Err(Error::Contract("shared list introduced foreign kind"));
            }
            let mut empty = node.value.clone();
            empty["children"] = json!([]);
            creation::publish(doc, &empty, stamp, 0)?;
            for property in NUMBERING {
                if let Some(value) = node.value["properties"].get(property) {
                    let patch = model::Patch::set(property, value.clone());
                    model::write_patch(doc, id, &format!("property:{property}"), &patch, stamp)?;
                }
            }
        }
        if is_list(&node.value) {
            let patch = style(&node.value)?;
            if old.nodes.get(id).map(|node| style(&node.value)).transpose()?.as_ref()
                != Some(&patch)
            {
                model::write_patch(doc, id, "list-kind", &patch, stamp)?;
                seeded_start(doc, id, &node.value, stamp)?;
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
