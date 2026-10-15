//! Retain visible normalization text as movable structure before its first structural list use.
use super::super::{creation, materialize, model, paragraphs, placement, text_flow};
use crate::Error;
use loro::{LoroDoc, ToJson};
use serde_json::Value;

/// A retained original occurrence belongs to infrastructure, not another writer's future history.
pub(in crate::rich_replica) fn retain(doc: &LoroDoc, block: &str) -> Result<(), Error> {
    if !block.starts_with(model::VIRTUAL_PREFIX)
        || model::optional_metadata(doc, block)
            .is_some_and(|meta| meta.get("origin-site").is_some())
    {
        return Ok(());
    }
    let source = materialize::envelope(doc)?;
    let Some(node) = creation::find(&source["root"], block) else {
        return Ok(());
    };
    if !matches!(node["type"].as_str(), Some("breditor/paragraph" | "breditor/heading")) {
        return Err(Error::Contract("shared retained normalization kind"));
    }
    let (parent, before) = paragraphs::layout(&source["root"], block)?;
    if let Some(parent) = &parent
        && model::optional_metadata(doc, parent).is_none()
    {
        creation::activate_cell(doc, parent)?;
    }
    creation::activate_text(doc, block)?;
    let base = base(doc, parent.as_deref())?;
    let slot = (0..=1000_u32)
        .find(|slot| identity(&base, *slot) == block)
        .ok_or(Error::Contract("canonical retained normalization identity"))?;
    model::metadata(doc, block)?.insert("retained-slot", slot)?;
    // Independent writers retaining the same normalization identity share its canonical
    // occurrence. This is not a peer-local tree birth and cannot duplicate the logical node.
    placement::define(
        doc,
        block,
        parent.as_deref(),
        before.as_deref(),
        format!("derived:{block}"),
    )?;
    text_flow::prepare_root(doc, block)?;
    doc.commit();
    Ok(())
}

fn base(doc: &LoroDoc, parent: Option<&str>) -> Result<String, Error> {
    if let Some(parent) = parent {
        let kind = model::string(&model::metadata(doc, parent)?, "type")?;
        if !matches!(kind.as_str(), "breditor/table-cell" | "breditor/list-item") {
            return Err(Error::Contract("retained normalization parent kind"));
        }
        Ok(model::virtual_id("flow", &[parent]))
    } else {
        let header = materialize::header(doc)?;
        let document = header
            .pointer("/root/properties/breditor~1document-id")
            .and_then(Value::as_str)
            .ok_or(Error::Contract("retained normalization document"))?;
        Ok(model::virtual_id("root", &[document]))
    }
}
fn identity(base: &str, slot: u32) -> String {
    if slot == 0 {
        base.into()
    } else {
        model::virtual_id("flow-spare", &[base, &(slot - 1).to_string()])
    }
}
/// A retained definition must be bound to its original canonical normalization slot.
pub(in crate::rich_replica) fn validate(doc: &LoroDoc, block: &str) -> Result<(), Error> {
    let meta = model::metadata(doc, block)?;
    let raw = meta.get_deep_value().to_json_value();
    let slot = raw["retained-slot"]
        .as_u64()
        .and_then(|v| u32::try_from(v).ok())
        .filter(|slot| *slot <= 1000)
        .ok_or(Error::Contract("retained normalization slot"))?;
    let parent = placement::origin_parent(doc, block)?;
    if model::string(&meta, "birth-mode")? != "derived"
        || !matches!(
            model::string(&meta, "type")?.as_str(),
            "breditor/paragraph" | "breditor/heading"
        )
        || model::string(&meta, "origin-site")? != format!("derived:{block}")
        || identity(&base(doc, parent.as_deref())?, slot) != block
    {
        return Err(Error::Contract("retained normalization identity binding"));
    }
    Ok(())
}

/// A prior command can delete an ordinary head before a later unlist/join step.
/// Reserve the resulting conditional slot without rendering it or copying any text.
pub(in crate::rich_replica) fn reserve_default(doc: &LoroDoc, parent: &str) -> Result<(), Error> {
    let block = base(doc, Some(parent))?;
    if model::optional_metadata(doc, &block).is_some_and(|meta| meta.get("origin-site").is_some()) {
        return Ok(());
    }
    creation::reserve_normalized_text(doc, &block)?;
    let meta = model::metadata(doc, &block)?;
    meta.insert("retained-slot", 0_u32)?;
    meta.ensure_mergeable_map("deletions")?;
    meta.ensure_mergeable_map("placements")?;
    let before = placement::children(doc, Some(parent))?.into_iter().next();
    placement::define(doc, &block, Some(parent), before.as_deref(), format!("derived:{block}"))?;
    text_flow::prepare_root(doc, &block)?;
    doc.commit();
    Ok(())
}

/// Only directly moved heads are retained; unrelated normalized cells remain unactivated.
pub(in crate::rich_replica) fn heads(
    doc: &LoroDoc,
    container: &str,
    interval: Option<(&str, &str)>,
) -> Result<(), Error> {
    let source = materialize::envelope(doc)?;
    // Earlier creations in this same group can declare a not-yet-visible list.
    let Some(wrapper) = creation::find(&source["root"], container) else {
        return Ok(());
    };
    let items =
        wrapper["children"].as_array().ok_or(Error::Contract("shared retained list items"))?;
    let selected = if let Some((first, last)) = interval {
        let index = |id| items.iter().position(|item| creation::block(item).ok() == Some(id));
        let (Some(first), Some(last)) = (index(first), index(last)) else {
            return Ok(());
        };
        if first > last {
            return Ok(());
        }
        &items[first..=last]
    } else {
        items.as_slice()
    };
    for item in selected {
        let head = item["children"]
            .get(0)
            .and_then(|node| node.pointer("/properties/breditor~1block-id"))
            .and_then(Value::as_str)
            .ok_or(Error::Contract("shared retained list head"))?;
        retain(doc, head)?;
        text_flow::prepare_root(doc, head)?;
    }
    Ok(())
}
