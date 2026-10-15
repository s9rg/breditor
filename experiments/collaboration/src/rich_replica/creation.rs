//! Immutable definitions and writer-owned births keep creation undo from erasing remote edits.
//!
//! Definitions, canonical containers and birth occurrences are infrastructure.
//! Initial characters retain causal identity outside history. Their provenance
//! gates visibility on the owned birth; only birth intent and marks enter history.
use super::{model, placement, text::Annotation};
use crate::{Error, register::Stamp};
use loro::{LoroDoc, ToJson};
use serde_json::{Map, Value, json};

pub(super) fn find<'a>(node: &'a Value, block: &str) -> Option<&'a Value> {
    if node.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(block) {
        return Some(node);
    }
    node.get("children").and_then(Value::as_array)?.iter().find_map(|node| find(node, block))
}

pub(super) fn block(node: &Value) -> Result<&str, Error> {
    node.pointer("/properties/breditor~1block-id")
        .and_then(Value::as_str)
        .ok_or(Error::Contract("shared creation block"))
}

pub(super) fn prepare(
    doc: &LoroDoc,
    node: &Value,
    parent: Option<&str>,
    before: Option<&str>,
) -> Result<(), Error> {
    let block = block(node)?;
    crate::actions::validate_id(block)?;
    if block.starts_with(model::VIRTUAL_PREFIX)
        || model::optional_metadata(doc, block).is_some()
        || model::existing_text(doc, block).is_some()
    {
        return Err(Error::Contract("fresh historical creation identity"));
    }
    fresh_entities(doc, node)?;
    definition(doc, node, "authored")?;
    let tree = model::tree(doc);
    let id = tree.create(None)?;
    tree.get_meta(id)?.insert("block", block)?;
    placement::define(doc, block, parent, before, format!("birth:{id}"))?;
    let kind = node["type"].as_str().ok_or(Error::Contract("shared creation kind"))?;
    if kind == "breditor/paragraph" || kind == "breditor/heading" {
        model::text(doc, block)?;
        super::text_flow::prepare_root(doc, block)?;
        prepare_text(doc, node)?;
    } else {
        for child in
            node["children"].as_array().ok_or(Error::Contract("shared creation children"))?
        {
            prepare(doc, child, Some(block), None)?;
        }
    }
    if let Some(columns) = node.pointer("/properties/breditor~1columns").and_then(Value::as_array) {
        for column in columns {
            prepare_column(doc, block, &column["id"], &column["width"], None)?;
        }
    }
    Ok(())
}

fn definition(doc: &LoroDoc, node: &Value, mode: &str) -> Result<(), Error> {
    let block = block(node)?;
    let kind = node["type"].as_str().ok_or(Error::Contract("shared creation kind"))?;
    let meta = doc.get_map("metadata").ensure_mergeable_map(block)?;
    meta.insert("type", kind)?;
    meta.insert("entity", node["entityId"].to_string())?;
    meta.insert("birth-mode", mode)?;
    meta.ensure_mergeable_map("births")?;
    meta.ensure_mergeable_map("effects")?;
    let mut defaults = node["properties"]
        .as_object()
        .ok_or(Error::Contract("shared creation properties"))?
        .clone();
    defaults.remove("breditor/block-id");
    defaults.remove("breditor/columns");
    let mut identities = Map::new();
    for key in ["breditor/table-id", "breditor/image-id", "breditor/row-id", "breditor/column-id"] {
        if let Some(value) = defaults.remove(key) {
            identities.insert(key.into(), value);
        }
    }
    meta.insert("identity", Value::Object(identities).to_string())?;
    meta.insert("defaults", Value::Object(defaults).to_string())?;
    Ok(())
}

/// A visible normalization paragraph can own kind intent without an authored tree occurrence.
pub(super) fn activate_text(doc: &LoroDoc, block: &str) -> Result<(), Error> {
    if model::optional_metadata(doc, block).is_some() {
        return Ok(());
    }
    let source = super::materialize::envelope(doc)?;
    let node = find(&source["root"], block).ok_or(Error::Contract("visible derived text"))?;
    if !block.starts_with(model::VIRTUAL_PREFIX)
        || !matches!(node["type"].as_str(), Some("breditor/paragraph" | "breditor/heading"))
    {
        return Err(Error::Contract("derived text activation kind"));
    }
    definition(doc, node, "derived")
}

/// Reserve a canonical, conditional empty head before a batch first makes it visible.
/// The normalization adapter proves its parent/slot identity before calling this helper.
pub(super) fn reserve_normalized_text(doc: &LoroDoc, block: &str) -> Result<(), Error> {
    if !block.starts_with(model::VIRTUAL_PREFIX) {
        return Err(Error::Contract("reserved normalization text identity"));
    }
    if let Some(meta) = model::optional_metadata(doc, block) {
        if !matches!(
            model::string(&meta, "type")?.as_str(),
            "breditor/paragraph" | "breditor/heading"
        ) {
            return Err(Error::Contract("reserved normalization text kind"));
        }
        return Ok(());
    }
    definition(doc, &model::placeholder(block, &[]), "derived")
}

/// A synthesized cell has axis-derived existence, never a second competing authored identity.
pub(super) fn activate_cell(doc: &LoroDoc, block: &str) -> Result<(), Error> {
    if model::optional_metadata(doc, block).is_some() {
        return Ok(());
    }
    let source = super::materialize::envelope(doc)?;
    let cell = find(&source["root"], block).ok_or(Error::Contract("visible derived cell"))?;
    if !block.starts_with(model::VIRTUAL_PREFIX) || cell["type"] != "breditor/table-cell" {
        return Err(Error::Contract("derived cell activation kind"));
    }
    let (parent, _) = super::paragraphs::layout(&source["root"], block)?;
    let parent = parent.ok_or(Error::Contract("derived cell row parent"))?;
    definition(doc, cell, "derived")?;
    // Axis-derived cells have no authored occurrence, but remain descendants of
    // their real row for cycle detection. This is immutable infrastructure.
    model::metadata(doc, block)?.insert("virtual-parent", parent)?;
    placement::prepare(doc, Some(block))?;
    Ok(())
}

pub(super) fn publish(
    doc: &LoroDoc,
    node: &Value,
    stamp: Stamp,
    ordinal: usize,
) -> Result<(), Error> {
    let block = block(node)?;
    model::metadata(doc, block)?
        .ensure_mergeable_map("births")?
        .insert(&stamp.key(), stamp.contribution(true.into()))?;
    let kind = node["type"].as_str().ok_or(Error::Contract("shared creation kind"))?;
    if kind == "breditor/paragraph" || kind == "breditor/heading" {
        publish_text(doc, node, stamp, ordinal)?;
    } else {
        for child in
            node["children"].as_array().ok_or(Error::Contract("shared creation children"))?
        {
            publish(doc, child, stamp, ordinal)?;
        }
    }
    if let Some(columns) = node.pointer("/properties/breditor~1columns").and_then(Value::as_array) {
        for column in columns {
            publish_column(
                doc,
                block,
                column["id"].as_str().ok_or(Error::Contract("shared column ID"))?,
                stamp,
            )?;
        }
    }
    Ok(())
}

fn publish_text(doc: &LoroDoc, node: &Value, stamp: Stamp, ordinal: usize) -> Result<(), Error> {
    let block = block(node)?;
    let runs = node["children"].as_array().ok_or(Error::Contract("shared creation runs"))?;
    let mut index = ordinal.checked_mul(1000).ok_or(Error::Limit("creation mark ordinals"))?;
    let mut offset = 0_u32;
    for run in runs {
        let content = run["text"].as_str().ok_or(Error::Contract("shared creation text"))?;
        let length = u32::try_from(content.encode_utf16().count()).map_err(|_| Error::Offset)?;
        for format in run["formats"].as_array().ok_or(Error::Contract("shared creation formats"))? {
            if index >= (ordinal + 1) * 1000 {
                return Err(Error::Limit("creation marks per block"));
            }
            super::text::mark(
                doc,
                block,
                offset,
                length,
                &Annotation { format: format.clone(), enabled: true },
                stamp,
                index,
            )?;
            index += 1;
        }
        offset = offset.checked_add(length).ok_or(Error::Offset)?;
    }
    Ok(())
}

fn prepare_text(doc: &LoroDoc, node: &Value) -> Result<(), Error> {
    let block = block(node)?;
    let text = model::text(doc, block)?;
    let runs = node["children"].as_array().ok_or(Error::Contract("shared creation runs"))?;
    doc.commit();
    let stamp = Stamp::next(doc)?;
    let mut length = 0_u32;
    for run in runs {
        let content = run["text"].as_str().ok_or(Error::Contract("shared creation text"))?;
        text.push_str(content)?;
        length = length
            .checked_add(u32::try_from(content.encode_utf16().count()).map_err(|_| Error::Offset)?)
            .ok_or(Error::Offset)?;
    }
    super::text_flow::provenance::mark(&text, 0, length, Some(block), stamp)?;
    // Other prepare steps may materialize all sources before the outer commit.
    // Every provenance clock must already resolve to retained causal history.
    doc.commit();
    Ok(())
}

pub(super) fn prepare_column(
    doc: &LoroDoc,
    table: &str,
    id: &Value,
    width: &Value,
    before: Option<&str>,
) -> Result<(), Error> {
    let column = id.as_str().ok_or(Error::Contract("shared column identity"))?;
    crate::actions::validate_id(column)?;
    let scope = doc.get_map("columns").ensure_mergeable_map(table)?;
    let order = scope.ensure_mergeable_movable_list("order")?;
    scope
        .ensure_mergeable_map("widths")?
        .ensure_mergeable_map(column)?
        .ensure_mergeable_map("width")?;
    if super::column_order::selected(doc, table)?.iter().any(|(id, _)| id == column) {
        return Err(Error::Contract("fresh historical column identity"));
    }
    let index = if let Some(before) = before {
        super::column_order::selected(doc, table)?
            .iter()
            .find(|(id, _)| id == before)
            .ok_or(Error::Contract("shared column before target"))?
            .1
    } else {
        order.len()
    };
    let owner = scope.ensure_mergeable_map("definitions")?.ensure_mergeable_map(column)?;
    owner.insert("birth-mode", "authored")?;
    owner.insert(
        "width",
        u32::try_from(width.as_u64().ok_or(Error::Contract("shared column width"))?)
            .map_err(|_| Error::Contract("shared column width"))?,
    )?;
    owner.ensure_mergeable_map("births")?;
    order.insert(index, super::column_order::seed_value(column)?)?;
    Ok(())
}

pub(super) fn publish_column(
    doc: &LoroDoc,
    table: &str,
    column: &str,
    stamp: Stamp,
) -> Result<(), Error> {
    doc.get_map("columns")
        .ensure_mergeable_map(table)?
        .ensure_mergeable_map("definitions")?
        .ensure_mergeable_map(column)?
        .ensure_mergeable_map("births")?
        .insert(&stamp.key(), stamp.contribution(true.into()))?;
    Ok(())
}

pub(super) fn fresh_entities(doc: &LoroDoc, node: &Value) -> Result<(), Error> {
    let props = &node["properties"];
    for key in ["breditor/table-id", "breditor/image-id"] {
        if let Some(identity) = props.get(key) {
            for value in doc
                .get_map("metadata")
                .get_deep_value()
                .to_json_value()
                .as_object()
                .ok_or(Error::Contract("shared historical metadata"))?
                .values()
            {
                let encoded = value["identity"]
                    .as_str()
                    .ok_or(Error::Contract("shared historical identity"))?;
                if serde_json::from_str::<Value>(encoded)?.get(key) == Some(identity) {
                    return Err(Error::Contract("fresh historical rich entity identity"));
                }
            }
        }
    }
    for child in node["children"].as_array().ok_or(Error::Contract("shared creation children"))? {
        if child["kind"] == "element" {
            fresh_entities(doc, child)?;
        }
    }
    Ok(())
}

pub(super) fn empty_row(block: &str, row: &str) -> Value {
    json!({"kind":"element","type":"breditor/table-row","entityId":null,
        "properties":{"breditor/block-id":block,"breditor/row-id":row},"children":[]})
}
