//! Per-intent shared merge records and observed writer-owned retractions retain every cell body.
use super::model;
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{BlockId, CausalStamp, CellId, ChangeId, ReplicaId, RichDocument},
};
use loro::{LoroDoc, ToJson};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn cell(document: &RichDocument, block: &str) -> Result<CellId, Error> {
    let path = document
        .block_path(&BlockId::try_new(block).map_err(|_| Error::Contract("shared cell block"))?)
        .ok_or(Error::Contract("visible shared cell block"))?;
    document
        .cell_entries()
        .find(|(_, cell_path)| *cell_path == path)
        .map(|(id, _)| id.clone())
        .ok_or(Error::Contract("shared cell target kind"))
}

pub(super) fn causal(stamp: Stamp) -> Result<CausalStamp, Error> {
    let (lamport, writer, counter) = stamp.words();
    Ok(CausalStamp::new(
        lamport,
        ChangeId::new(
            ReplicaId::try_new(writer).map_err(|_| Error::Contract("shared merge writer"))?,
            u64::from(counter),
        ),
    ))
}

pub(super) fn table_block(document: &RichDocument, cell: &CellId) -> Result<String, Error> {
    let path = document.table_path(cell.table()).ok_or(Error::Contract("shared cell table"))?;
    let node =
        document.document().node_at(path).map_err(|_| Error::Contract("shared table path"))?;
    let property = breditor_core::identity::QualifiedName::try_new("breditor/block-id")
        .map_err(|_| Error::Contract("shared block property"))?;
    Ok(node
        .as_element()
        .and_then(|node| node.properties().get(&property))
        .and_then(breditor_core::document::PropertyValue::as_string)
        .ok_or(Error::Contract("shared table block"))?
        .into())
}

pub(super) fn prepare(doc: &LoroDoc, block: &str, new: Option<&str>) -> Result<(), Error> {
    let source = super::materialize::envelope(doc)?;
    let table = super::creation::find(&source["root"], block)
        .ok_or(Error::Contract("visible shared merge table"))?;
    let properties = &table["properties"];
    let owner = model::metadata(doc, block)?.ensure_mergeable_map("merge-intents")?;
    let mut known = owner
        .get_deep_value()
        .to_json_value()
        .as_object()
        .ok_or(Error::Contract("shared merge registry"))?
        .keys()
        .cloned()
        .collect::<BTreeSet<_>>();
    for record in
        properties["breditor/merges"].as_array().ok_or(Error::Contract("shared merge records"))?
    {
        known.insert(record["id"].as_str().ok_or(Error::Contract("shared merge identity"))?.into());
    }
    for id in properties["breditor/retracted-merges"]
        .as_array()
        .ok_or(Error::Contract("shared merge retractions"))?
    {
        known.insert(id.as_str().ok_or(Error::Contract("shared merge identity"))?.into());
    }
    if let Some(id) = new
        && !known.insert(id.into())
    {
        return Err(Error::Contract("fresh historical merge identity"));
    }
    if known.len() > 256 {
        return Err(Error::Limit("shared historical merge intents"));
    }
    let retractions = model::metadata(doc, block)?.ensure_mergeable_map("merge-retractions")?;
    for id in known {
        owner.ensure_mergeable_map(&id)?.ensure_mergeable_map("record")?;
        retractions.ensure_mergeable_map(&id)?;
    }
    Ok(())
}

pub(super) fn publish_record(
    doc: &LoroDoc,
    block: &str,
    record: &Value,
    stamp: Stamp,
) -> Result<(), Error> {
    let id = record["id"].as_str().ok_or(Error::Contract("shared merge identity"))?;
    let owner = model::metadata(doc, block)?
        .ensure_mergeable_map("merge-intents")?
        .ensure_mergeable_map(id)?;
    crate::register::write(&owner, "record", stamp, record.to_string().into())
}

pub(super) fn publish_retractions(
    doc: &LoroDoc,
    block: &str,
    before: &Value,
    after: &Value,
    stamp: Stamp,
) -> Result<(), Error> {
    let prior = before["breditor/retracted-merges"]
        .as_array()
        .ok_or(Error::Contract("shared prior retractions"))?;
    for id in after["breditor/retracted-merges"]
        .as_array()
        .ok_or(Error::Contract("shared next retractions"))?
    {
        if prior.contains(id) {
            continue;
        }
        let id = id.as_str().ok_or(Error::Contract("shared retraction identity"))?;
        model::metadata(doc, block)?
            .ensure_mergeable_map("merge-retractions")?
            .ensure_mergeable_map(id)?
            .insert(&stamp.key(), stamp.contribution(true.into()))?;
    }
    Ok(())
}

pub(super) fn properties(
    codec: &DocumentJsonCodecV2,
    document: &RichDocument,
    block: &str,
) -> Result<Value, Error> {
    let value: Value = serde_json::from_str(
        &codec.encode(document.document()).map_err(|_| Error::Contract("shared merge export"))?,
    )?;
    Ok(super::creation::find(&value["root"], block)
        .ok_or(Error::Contract("shared merge table export"))?["properties"]
        .clone())
}

pub(super) fn project(
    doc: &LoroDoc,
    raw: &Value,
    properties: &mut Map<String, Value>,
) -> Result<(), Error> {
    let mut records = BTreeMap::new();
    for record in
        properties["breditor/merges"].as_array().ok_or(Error::Contract("shared baseline merges"))?
    {
        records.insert(
            record["id"].as_str().ok_or(Error::Contract("shared merge identity"))?.to_owned(),
            record.clone(),
        );
    }
    if let Some(intents) = raw.get("merge-intents").and_then(Value::as_object) {
        if intents.len() > 256 {
            return Err(Error::Limit("shared merge definitions"));
        }
        for (id, intent) in intents {
            for (key, value) in
                intent["record"].as_object().ok_or(Error::Contract("shared merge contributions"))?
            {
                let (stamp, value) = crate::register::read_contribution(doc, key, value)?;
                let record: Value = serde_json::from_str(
                    value.as_str().ok_or(Error::Contract("shared merge literal"))?,
                )?;
                let (lamport, writer, counter) = stamp.words();
                let lamport = lamport.to_string();
                let writer = writer.to_string();
                let counter = counter.to_string();
                if record["id"] != *id
                    || record["lamport"].as_str() != Some(lamport.as_str())
                    || record["writer"].as_str() != Some(writer.as_str())
                    || record["counter"].as_str() != Some(counter.as_str())
                {
                    return Err(Error::Contract("shared merge authored clock"));
                }
                if let Some(prior) = records.insert(id.clone(), record.clone())
                    && prior != record
                {
                    return Err(Error::Contract("shared merge identity collision"));
                }
            }
        }
    }
    let mut retracted = properties["breditor/retracted-merges"]
        .as_array()
        .ok_or(Error::Contract("shared baseline retractions"))?
        .iter()
        .map(|value| {
            value.as_str().ok_or(Error::Contract("shared retraction identity")).map(str::to_owned)
        })
        .collect::<Result<BTreeSet<_>, _>>()?;
    if let Some(values) = raw.get("merge-retractions").and_then(Value::as_object) {
        if values.len() > 256 {
            return Err(Error::Limit("shared merge retractions"));
        }
        for (id, values) in values {
            if model::any_deleted(doc, Some(values))? {
                retracted.insert(id.clone());
            }
        }
    }
    properties.insert("breditor/merges".into(), Value::Array(records.into_values().collect()));
    properties.insert(
        "breditor/retracted-merges".into(),
        Value::Array(retracted.into_iter().map(Value::String).collect()),
    );
    Ok(())
}
