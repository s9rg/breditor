//! Pure canonical AST projection; hidden causal nodes/text remain in the replica.
use super::model::{object_string, patches, placeholder, string, virtual_id};
use crate::Error;
use loro::{ContainerID, ContainerType, LoroDoc, ToJson};
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn header(doc: &LoroDoc) -> Result<Value, Error> {
    object_string(&doc.get_map("binding"), "header")
}

pub(super) fn envelope(doc: &LoroDoc) -> Result<Value, Error> {
    let flows = super::text_flow::Projection::read(doc)?;
    let placements = super::placement::Projection::read(doc)?;
    let mut value = header(doc)?;
    let document = value
        .pointer("/root/properties/breditor~1document-id")
        .and_then(Value::as_str)
        .ok_or(Error::Contract("shared document identity"))?
        .to_owned();
    let mut children = vec![];
    for block in placements.children(doc, None)? {
        if let Some(node) = element(doc, &flows, &placements, &block, 0)? {
            children.push(node);
        }
    }
    let block = virtual_id("root", &[&document]);
    let (fallback, explicit) = fallback(doc, &flows, &placements, &block)?;
    if children.is_empty() || explicit {
        children.insert(0, fallback);
    }
    value
        .get_mut("root")
        .and_then(Value::as_object_mut)
        .ok_or(Error::Contract("shared root header"))?
        .insert("children".into(), Value::Array(children));
    Ok(value)
}

fn element(
    doc: &LoroDoc,
    flows: &super::text_flow::Projection,
    placements: &super::placement::Projection,
    block: &str,
    depth: usize,
) -> Result<Option<Value>, Error> {
    if depth > 64 {
        return Err(Error::Limit("shared node depth"));
    }
    if super::model::deleted(doc, block)? {
        return Ok(None);
    }
    let meta = super::model::metadata(doc, block)?;
    // A retained normalization origin stays conditional on its parent's fallback rule.
    // Only a relocation renders it as ordinary structure. Undo must not leave a phantom
    // empty paragraph when an older surrounding flow becomes visible again.
    if block.starts_with(super::model::VIRTUAL_PREFIX)
        && meta.get("origin-site").is_some()
        && !placements.relocated(doc, block)?
    {
        return Ok(None);
    }
    let raw = meta.get_deep_value().to_json_value();
    if !super::model::born(doc, &raw)? {
        return Ok(None);
    }
    let mut kind = string(&meta, "type")?;
    let mut caption_choice = None;
    let identity = object_string(&meta, "identity")?;
    let mut properties =
        identity.as_object().ok_or(Error::Contract("shared identity fields"))?.clone();
    properties.insert("breditor/block-id".into(), block.into());
    if raw.get("defaults").is_some() {
        properties.extend(
            object_string(&meta, "defaults")?
                .as_object()
                .ok_or(Error::Contract("shared immutable defaults"))?
                .clone(),
        );
    }
    let empty = json!({});
    for patch in patches(doc, raw.get("effects").unwrap_or(&empty))? {
        for name in patch.removes {
            properties.remove(&name);
        }
        for (name, value) in patch.sets {
            if name == "$type" {
                kind = value.as_str().ok_or(Error::Contract("shared type intent"))?.into();
            } else if name == "$caption" {
                if kind != "breditor/image" {
                    return Err(Error::Contract("shared caption owner kind"));
                }
                caption_choice = Some(value);
            } else {
                properties.insert(name, value);
            }
        }
    }
    let mut children = vec![];
    if kind == "breditor/paragraph" || kind == "breditor/heading" {
        if flows.joined(block)? {
            return Ok(None);
        }
        children = flows.runs(doc, block)?;
    } else {
        for child in placements.children(doc, Some(block))? {
            if let Some(value) = element(doc, flows, placements, &child, depth + 1)? {
                children.push(value);
            }
        }
    }
    if kind == "breditor/image" {
        super::captions::project(&mut children, caption_choice)?;
    }
    if kind == "breditor/table" {
        super::merges::project(doc, &raw, &mut properties)?;
        let columns = columns(doc, block)?;
        for row in &mut children {
            complete_row(doc, flows, placements, &properties, row, &columns)?;
        }
        properties.insert("breditor/columns".into(), Value::Array(columns));
    }
    if (kind == "breditor/bullet-list" || kind == "breditor/ordered-list") && children.is_empty() {
        return Ok(None);
    }
    if kind == "breditor/table-cell" || kind == "breditor/list-item" {
        let leading_text = children
            .first()
            .and_then(|node| node.get("type"))
            .and_then(Value::as_str)
            .is_some_and(|kind| kind == "breditor/paragraph" || kind == "breditor/heading");
        let default = virtual_id("flow", &[block]);
        let (fallback, explicit) = fallback(doc, flows, placements, &default)?;
        if children.is_empty() || (kind == "breditor/list-item" && !leading_text) || explicit {
            children.insert(0, fallback);
        }
    }
    Ok(Some(
        json!({"kind":"element","type":kind,"entityId":object_string(&meta,"entity")?,"properties":properties,"children":children}),
    ))
}

fn columns(doc: &LoroDoc, block: &str) -> Result<Vec<Value>, Error> {
    let root = ContainerID::new_root("columns", ContainerType::Map);
    let owner = ContainerID::new_mergeable(&root, block, ContainerType::Map);
    let values = super::column_order::selected(doc, block)?;
    if values.len() > 128 {
        return Err(Error::Limit("shared columns"));
    }
    let source = doc
        .try_get_map(owner.clone())
        .ok_or(Error::Contract("shared column owner"))?
        .get_deep_value()
        .to_json_value();
    let widths = doc
        .try_get_map(ContainerID::new_mergeable(&owner, "widths", ContainerType::Map))
        .ok_or(Error::Contract("shared column widths"))?
        .get_deep_value()
        .to_json_value();
    let mut seen = BTreeSet::new();
    let mut output = vec![];
    for (column, _) in values {
        if !seen.insert(column.clone()) {
            return Err(Error::Contract("duplicate shared column"));
        }
        if !super::model::born(
            doc,
            source.get("definitions").and_then(|value| value.get(&column)).unwrap_or(&json!({})),
        )? || super::model::any_deleted(
            doc,
            source.get("deletions").and_then(|value| value.get(&column)),
        )? {
            continue;
        }
        let records =
            widths.get(&column).and_then(|value| value.get("width")).and_then(Value::as_object);
        let mut chosen = None;
        for (key, value) in records.into_iter().flatten() {
            let (stamp, value) = crate::register::read_contribution(doc, key, value)?;
            if chosen.as_ref().is_none_or(|(prior, _)| stamp > *prior) {
                chosen = Some((stamp, value));
            }
        }
        let width = if let Some((_, encoded)) = chosen {
            serde_json::from_str(encoded.as_str().ok_or(Error::Contract("shared width literal"))?)?
        } else {
            source
                .get("definitions")
                .and_then(|value| value.get(&column))
                .and_then(|value| value.get("width"))
                .cloned()
                .ok_or(Error::Contract("missing shared width"))?
        };
        output.push(json!({"id":column,"width":width}));
    }
    Ok(output)
}

fn complete_row(
    doc: &LoroDoc,
    flows: &super::text_flow::Projection,
    placements: &super::placement::Projection,
    table: &Map<String, Value>,
    row: &mut Value,
    columns: &[Value],
) -> Result<(), Error> {
    let table = table
        .get("breditor/table-id")
        .and_then(Value::as_str)
        .ok_or(Error::Contract("shared table identity"))?;
    let row_id = row
        .pointer("/properties/breditor~1row-id")
        .and_then(Value::as_str)
        .ok_or(Error::Contract("shared row identity"))?
        .to_owned();
    let existing = row
        .get_mut("children")
        .and_then(Value::as_array_mut)
        .ok_or(Error::Contract("shared row cells"))?;
    let mut by_column = BTreeMap::new();
    for cell in std::mem::take(existing) {
        let column = cell
            .pointer("/properties/breditor~1column-id")
            .and_then(Value::as_str)
            .ok_or(Error::Contract("shared cell column"))?
            .to_owned();
        if by_column.insert(column, cell).is_some() {
            return Err(Error::Contract("duplicate shared base cell"));
        }
    }
    for column in columns {
        let column =
            column.get("id").and_then(Value::as_str).ok_or(Error::Contract("shared column"))?;
        let cell = if let Some(cell) = by_column.remove(column) {
            cell
        } else {
            let block = virtual_id("cell", &[table, &row_id, column]);
            if super::model::optional_metadata(doc, &block).is_some() {
                existing.push(
                    element(doc, flows, placements, &block, 0)?
                        .ok_or(Error::Contract("hidden derived cell"))?,
                );
                continue;
            }
            let text = virtual_id("flow", &[&block]);
            json!({"kind":"element","type":"breditor/table-cell","entityId":null,"properties":{"breditor/block-id":block,"breditor/column-id":column,"breditor/header":false},"children":[fallback(doc,flows,placements,&text)?.0]})
        };
        existing.push(cell);
    }
    Ok(())
}

/// Normalized text keeps its identity/kind intent without becoming an authored tree occurrence.
fn fallback(
    doc: &LoroDoc,
    flows: &super::text_flow::Projection,
    placements: &super::placement::Projection,
    block: &str,
) -> Result<(Value, bool), Error> {
    // A normalization paragraph retained as movable structure is rendered through its
    // occurrence, never a second time at its original fallback slot. Vacated parents get
    // a new deterministic empty identity; hidden causal text is not repurposed or copied.
    let mut available = block.to_owned();
    let mut ordinal = 0;
    while occupied_fallback(doc, placements, &available)? {
        if ordinal >= 1000 {
            return Err(Error::Limit("shared normalization identities"));
        }
        available = virtual_id("flow-spare", &[block, &ordinal.to_string()]);
        ordinal += 1;
    }
    let block = available.as_str();
    let runs = flows.runs(doc, block)?;
    let mut explicit = !runs.is_empty() || flows.explicit(block);
    let mut node = placeholder(block, &runs);
    if let Some(meta) = super::model::optional_metadata(doc, block) {
        let raw = meta.get_deep_value().to_json_value();
        for patch in patches(doc, raw.get("effects").unwrap_or(&json!({})))? {
            explicit = true;
            let properties = node["properties"]
                .as_object_mut()
                .ok_or(Error::Contract("shared normalized text properties"))?;
            for name in patch.removes {
                properties.remove(&name);
            }
            let mut kind = None;
            for (name, value) in patch.sets {
                if name == "$type" {
                    kind = Some(value);
                } else {
                    properties.insert(name, value);
                }
            }
            if let Some(kind) = kind {
                node["type"] = kind;
            }
        }
    }
    Ok((node, explicit))
}

fn occupied_fallback(
    doc: &LoroDoc,
    placements: &super::placement::Projection,
    block: &str,
) -> Result<bool, Error> {
    if super::model::optional_metadata(doc, block)
        .is_some_and(|meta| meta.get("origin-site").is_some())
    {
        Ok(placements.relocated(doc, block)? || super::model::deleted(doc, block)?)
    } else {
        Ok(false)
    }
}
