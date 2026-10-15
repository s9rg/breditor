//! Clipboard drafts are semantic content, never imported history or a shared AST register.
use super::{creation, materialize, merges, paragraphs};
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{BlockId, RichBlockDraft, RichDocument},
};
use loro::LoroDoc;
use serde_json::{Value, json};

pub(super) fn admit(
    codec: &DocumentJsonCodecV2,
    mut envelope: Value,
    nodes: Vec<Value>,
) -> Result<RichDocument, Error> {
    envelope["root"]["children"] = Value::Array(nodes);
    RichDocument::try_admit(
        codec.schema(),
        codec
            .decode(&envelope.to_string())
            .map_err(|_| Error::Contract("paste schema admission"))?,
        codec.limits(),
    )
    .map_err(|_| Error::Contract("paste rich admission"))
}

pub(super) fn drafts(source: &RichDocument, nodes: &[Value]) -> Result<Vec<RichBlockDraft>, Error> {
    nodes
        .iter()
        .map(|node| {
            RichBlockDraft::capture(
                source,
                &BlockId::try_new(creation::block(node)?)
                    .map_err(|_| Error::Contract("paste block identity"))?,
            )
            .map_err(|_| Error::Contract("paste flow draft"))
        })
        .collect()
}

/// Reserve history-free definitions, and canonical merge registers even for unborn tables.
pub(super) fn prepare(
    doc: &LoroDoc,
    node: &Value,
    parent: Option<&str>,
    before: Option<&str>,
) -> Result<(), Error> {
    let mut empty_history = node.clone();
    strip_merges(&mut empty_history)?;
    creation::prepare(doc, &empty_history, parent, before)?;
    prepare_merges(doc, node)
}

fn strip_merges(node: &mut Value) -> Result<(), Error> {
    if node["type"] == "breditor/table" {
        if node["properties"]["breditor/retracted-merges"] != json!([]) {
            return Err(Error::Contract("paste cannot import merge history"));
        }
        node["properties"]["breditor/merges"] = json!([]);
    }
    for child in node["children"].as_array_mut().ok_or(Error::Contract("paste children"))? {
        if child["kind"] == "element" {
            strip_merges(child)?;
        }
    }
    Ok(())
}

fn prepare_merges(doc: &LoroDoc, node: &Value) -> Result<(), Error> {
    if node["type"] == "breditor/table" {
        let meta = super::model::metadata(doc, creation::block(node)?)?;
        let intents = meta.ensure_mergeable_map("merge-intents")?;
        let retractions = meta.ensure_mergeable_map("merge-retractions")?;
        for record in records(node)? {
            let id = record["id"].as_str().ok_or(Error::Contract("paste merge ID"))?;
            crate::actions::validate_id(id)?;
            intents.ensure_mergeable_map(id)?.ensure_mergeable_map("record")?;
            retractions.ensure_mergeable_map(id)?;
        }
    }
    for child in node["children"].as_array().ok_or(Error::Contract("paste children"))? {
        if child["kind"] == "element" {
            prepare_merges(doc, child)?;
        }
    }
    Ok(())
}

pub(super) fn records(node: &Value) -> Result<&[Value], Error> {
    node["properties"]["breditor/merges"]
        .as_array()
        .map(Vec::as_slice)
        .ok_or(Error::Contract("paste merge records"))
}

/// Placeholder clipboard clocks never survive into shared state.
pub(super) fn author_clocks(node: &mut Value, stamp: Stamp) -> Result<(), Error> {
    if node["type"] == "breditor/table" {
        let (lamport, writer, counter) = stamp.words();
        for record in node["properties"]["breditor/merges"]
            .as_array_mut()
            .ok_or(Error::Contract("paste merge records"))?
        {
            record["lamport"] = lamport.to_string().into();
            record["writer"] = writer.to_string().into();
            record["counter"] = counter.to_string().into();
        }
    }
    for child in node["children"].as_array_mut().ok_or(Error::Contract("paste children"))? {
        if child["kind"] == "element" {
            author_clocks(child, stamp)?;
        }
    }
    Ok(())
}

pub(super) fn publish(
    doc: &LoroDoc,
    node: &Value,
    stamp: Stamp,
    ordinal: usize,
) -> Result<(), Error> {
    creation::publish(doc, node, stamp, ordinal)?;
    publish_merges(doc, node, stamp)
}
fn publish_merges(doc: &LoroDoc, node: &Value, stamp: Stamp) -> Result<(), Error> {
    if node["type"] == "breditor/table" {
        for record in records(node)? {
            merges::publish_record(doc, creation::block(node)?, record, stamp)?;
        }
    }
    for child in node["children"].as_array().ok_or(Error::Contract("paste children"))? {
        if child["kind"] == "element" {
            publish_merges(doc, child, stamp)?;
        }
    }
    Ok(())
}

/// Copy is not insertion: prove the supplied tree has only active semantic geometry.
pub(super) fn semantic(codec: &DocumentJsonCodecV2, source: &RichDocument) -> Result<(), Error> {
    let context = paragraphs::context(codec);
    let root = source.document().root().as_element().ok_or(Error::Contract("paste root"))?;
    for node in root.children() {
        let key = breditor_core::identity::QualifiedName::try_new("breditor/block-id")
            .map_err(|_| Error::Contract("paste property"))?;
        let id = node
            .as_element()
            .and_then(|n| n.properties().get(&key))
            .and_then(breditor_core::document::PropertyValue::as_string)
            .ok_or(Error::Contract("paste root flow"))?;
        let selection = breditor_core::rich_content::RichSelection::try_new(
            source,
            breditor_core::rich_content::RichSelectionKind::Node(
                BlockId::try_new(id).map_err(|_| Error::Contract("paste root identity"))?,
            ),
        )
        .map_err(|_| Error::Contract("paste semantic selection"))?;
        let copied = breditor_core::rich_content::RichClipboardFragment::copy_selection(
            &context, source, &selection,
        )
        .map_err(|_| Error::Contract("paste semantic copy"))?
        .ok_or(Error::Contract("paste semantic content"))?;
        if copied.document().document().root().as_element().and_then(|root| root.children().get(0))
            != Some(node)
        {
            return Err(Error::Contract("paste cannot import inactive merge history"));
        }
    }
    Ok(())
}

pub(super) fn envelope(doc: &LoroDoc) -> Result<Value, Error> {
    materialize::header(doc)
}
