//! One seed authority decomposes an admitted document into shared primitives outside user history.
use super::{
    model::{Patch, VIRTUAL_PREFIX, tree},
    text::Annotation,
};
use crate::{Error, register::Stamp};
use loro::{LoroDoc, ToJson, TreeID};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

pub(super) fn seed(doc: &LoroDoc, envelope: &Value) -> Result<(), Error> {
    let stamp = Stamp::next(doc)?;
    let root = envelope.get("root").ok_or(Error::Contract("shared seed root"))?;
    let mut header = envelope.as_object().ok_or(Error::Contract("shared seed envelope"))?.clone();
    let mut root_header = root.as_object().ok_or(Error::Contract("shared seed root"))?.clone();
    root_header.remove("children");
    header.insert("root".into(), Value::Object(root_header));
    doc.get_map("binding").insert("header", Value::Object(header).to_string())?;
    let mut marks = vec![];
    for child in root
        .get("children")
        .and_then(Value::as_array)
        .ok_or(Error::Contract("shared seed children"))?
    {
        element(doc, child, None, stamp, &mut marks)?;
    }
    let sources = doc.get_map("texts").get_deep_value().to_json_value();
    for block in sources.as_object().ok_or(Error::Contract("shared text source directory"))?.keys()
    {
        super::text_flow::prepare_root(doc, block)?;
    }
    doc.commit();
    let stamp = Stamp::next(doc)?;
    for (ordinal, (block, offset, length, format)) in marks.into_iter().enumerate() {
        super::text::mark(
            doc,
            &block,
            offset,
            length,
            &Annotation { format, enabled: true },
            stamp,
            ordinal,
        )?;
    }
    doc.commit();
    Ok(())
}

fn paired(properties: &mut Map<String, Value>, names: &[&str], removes: Vec<String>) -> Patch {
    Patch {
        sets: names
            .iter()
            .filter_map(|name| properties.remove(*name).map(|value| ((*name).into(), value)))
            .collect(),
        removes,
    }
}

#[allow(clippy::type_complexity)]
fn element(
    doc: &LoroDoc,
    node: &Value,
    parent: Option<TreeID>,
    stamp: Stamp,
    marks: &mut Vec<(String, u32, u32, Value)>,
) -> Result<TreeID, Error> {
    let kind =
        node.get("type").and_then(Value::as_str).ok_or(Error::Contract("shared element kind"))?;
    let mut properties = node
        .get("properties")
        .and_then(Value::as_object)
        .ok_or(Error::Contract("shared element properties"))?
        .clone();
    let block = properties
        .remove("breditor/block-id")
        .and_then(|value| value.as_str().map(str::to_owned))
        .ok_or(Error::Contract("shared block identity"))?;
    if block.starts_with(VIRTUAL_PREFIX) {
        return Err(Error::Contract("reserved normalization identity"));
    }
    let tree = tree(doc);
    let id = tree.create(parent)?;
    tree.get_meta(id)?.insert("block", block.clone())?;
    let meta = doc.get_map("metadata").ensure_mergeable_map(&block)?;
    let parent_block =
        parent.map(|parent| super::model::string(&tree.get_meta(parent)?, "block")).transpose()?;
    super::placement::seed(doc, &block, parent_block.as_deref(), format!("birth:{id}"))?;
    meta.insert("type", kind)?;
    meta.insert(
        "entity",
        node.get("entityId").ok_or(Error::Contract("shared entity"))?.to_string(),
    )?;
    let identity = take_identity(&mut properties);
    meta.insert("identity", serde_json::to_string(&identity)?)?;
    let effects = meta.ensure_mergeable_map("effects")?;
    if kind == "breditor/image" {
        for (field, keys) in [
            ("image-alt", &["breditor/alt-text", "breditor/decorative"][..]),
            ("image-asset", &["breditor/asset-id", "breditor/asset-generation"][..]),
            ("image-size", &["breditor/width", "breditor/height"][..]),
        ] {
            let patch = paired(&mut properties, keys, vec![]);
            if !patch.sets.is_empty() {
                crate::register::write(
                    &effects,
                    field,
                    stamp,
                    serde_json::to_string(&patch)?.into(),
                )?;
            }
        }
    }
    if kind == "breditor/paragraph" || kind == "breditor/heading" {
        let mut patch = paired(&mut properties, &["breditor/level"], vec![]);
        patch.sets.insert("$type".into(), kind.into());
        crate::register::write(
            &effects,
            "text-kind",
            stamp,
            serde_json::to_string(&patch)?.into(),
        )?;
    }
    if let Some(columns) = properties.remove("breditor/columns") {
        seed_columns(doc, &block, &columns, stamp)?;
    }
    for (name, value) in properties {
        crate::register::write(
            &effects,
            &format!("property:{name}"),
            stamp,
            serde_json::to_string(&Patch::set(&name, value))?.into(),
        )?;
    }
    let children = node
        .get("children")
        .and_then(Value::as_array)
        .ok_or(Error::Contract("shared element children"))?;
    if kind == "breditor/paragraph" || kind == "breditor/heading" {
        let text = super::model::text(doc, &block)?;
        let mut offset = 0_u32;
        for run in children {
            let content = run
                .get("text")
                .and_then(Value::as_str)
                .ok_or(Error::Contract("shared seed text"))?;
            let length =
                u32::try_from(content.encode_utf16().count()).map_err(|_| Error::Offset)?;
            text.push_str(content)?;
            for format in run
                .get("formats")
                .and_then(Value::as_array)
                .ok_or(Error::Contract("shared seed formats"))?
            {
                marks.push((block.clone(), offset, length, format.clone()));
            }
            offset = offset.checked_add(length).ok_or(Error::Offset)?;
        }
    } else {
        for child in children {
            element(doc, child, Some(id), stamp, marks)?;
        }
    }
    Ok(id)
}

fn take_identity(properties: &mut Map<String, Value>) -> BTreeMap<String, Value> {
    ["breditor/table-id", "breditor/image-id", "breditor/row-id", "breditor/column-id"]
        .into_iter()
        .filter_map(|key| properties.remove(key).map(|value| (key.to_owned(), value)))
        .collect()
}

fn seed_columns(doc: &LoroDoc, block: &str, columns: &Value, stamp: Stamp) -> Result<(), Error> {
    let owner = doc.get_map("columns").ensure_mergeable_map(block)?;
    let order = owner.ensure_mergeable_movable_list("order")?;
    for column in columns.as_array().ok_or(Error::Contract("shared columns"))? {
        let id = column
            .get("id")
            .and_then(Value::as_str)
            .ok_or(Error::Contract("shared column identity"))?;
        order.push(super::column_order::seed_value(id)?)?;
        crate::register::write(
            &owner.ensure_mergeable_map("widths")?.ensure_mergeable_map(id)?,
            "width",
            stamp,
            column.get("width").ok_or(Error::Contract("shared column width"))?.to_string().into(),
        )?;
    }
    Ok(())
}
