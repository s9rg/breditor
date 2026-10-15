//! Shared cell-body replacement owns only observed old bodies and fresh births, never axes.
use super::{creation, merges, model, paragraphs, placement};
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{ResolvedRichSelection, RichDocument, RichSelection, RichSelectionKind},
};
use loro::LoroDoc;
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub(super) fn selection(
    document: &RichDocument,
    anchor: &str,
    focus: &str,
) -> Result<RichSelection, Error> {
    RichSelection::try_new(
        document,
        RichSelectionKind::Grid {
            anchor: merges::cell(document, anchor)?,
            focus: merges::cell(document, focus)?,
        },
    )
    .map_err(|_| Error::Contract("shared paste grid"))
}

pub(super) fn prepare_targets(doc: &LoroDoc, anchor: &str) -> Result<(), Error> {
    let source = super::materialize::envelope(doc)?;
    let table =
        table_containing(&source["root"], anchor).ok_or(Error::Contract("shared paste table"))?;
    for row in table["children"].as_array().ok_or(Error::Contract("shared paste rows"))? {
        for cell in row["children"].as_array().ok_or(Error::Contract("shared paste cells"))? {
            let block = creation::block(cell)?;
            creation::activate_cell(doc, block)?;
            placement::prepare(doc, Some(block))?;
            model::metadata(doc, block)?
                .ensure_mergeable_map("effects")?
                .ensure_mergeable_map("property:breditor/header")?;
            for body in cell["children"].as_array().ok_or(Error::Contract("shared paste body"))? {
                let id = creation::block(body)?;
                super::list_structure::retain_text(doc, id)?;
                model::metadata(doc, id)?.ensure_mergeable_map("deletions")?;
            }
        }
    }
    Ok(())
}
fn table_containing<'a>(node: &'a Value, block: &str) -> Option<&'a Value> {
    if node["type"] == "breditor/table" && creation::find(node, block).is_some() {
        return Some(node);
    }
    node["children"].as_array()?.iter().find_map(|child| table_containing(child, block))
}

pub(super) fn prepare_body(doc: &LoroDoc, node: &Value) -> Result<(), Error> {
    super::clipboard_plan::prepare(doc, node, None, None)?;
    model::metadata(doc, creation::block(node)?)?.ensure_mergeable_map("placements")?;
    model::metadata(doc, creation::block(node)?)?.ensure_mergeable_map("deletions")?;
    Ok(())
}

/// Explicit header choices author contributions even when their visible value is unchanged.
/// A missing choice is preservation, not an implicit write of the old value.
pub(super) fn headers(
    codec: &DocumentJsonCodecV2,
    document: &RichDocument,
    anchor: &str,
    focus: &str,
    cells: &[Vec<super::actions::PastedCell>],
) -> Result<BTreeMap<String, bool>, Error> {
    let ResolvedRichSelection::Grid(grid) = selection(document, anchor, focus)?
        .resolve(document)
        .map_err(|_| Error::Contract("paste header grid"))?
    else {
        return Err(Error::Contract("paste header grid"));
    };
    let raw: Value = serde_json::from_str(
        &codec.encode(document.document()).map_err(|_| Error::Contract("paste header export"))?,
    )?;
    let table =
        table_containing(&raw["root"], anchor).ok_or(Error::Contract("paste header table"))?;
    let (r0, r1) = grid.rows();
    let (c0, c1) = grid.columns();
    let mut choices = BTreeMap::new();
    for row in r0..=r1 {
        for column in c0..=c1 {
            let cell = cells
                .get(row - r0)
                .and_then(|row| row.get(column - c0))
                .ok_or(Error::Contract("paste header dimensions"))?;
            if let Some(value) = cell.header {
                choices.insert(
                    creation::block(&table["children"][row]["children"][column])?.into(),
                    value,
                );
            }
        }
    }
    Ok(choices)
}

/// Lower only the core-proven changed bodies/headers/merge intents. Unknown remote siblings survive.
pub(super) fn apply(
    doc: &LoroDoc,
    codec: &DocumentJsonCodecV2,
    before: &RichDocument,
    after: &RichDocument,
    anchor: &str,
    headers: &BTreeMap<String, bool>,
    stamp: Stamp,
) -> Result<(), Error> {
    let old: Value = serde_json::from_str(
        &codec.encode(before.document()).map_err(|_| Error::Contract("paste export"))?,
    )?;
    let new: Value = serde_json::from_str(
        &codec.encode(after.document()).map_err(|_| Error::Contract("paste export"))?,
    )?;
    let table =
        table_containing(&old["root"], anchor).ok_or(Error::Contract("shared paste table"))?;
    let table_id = creation::block(table)?;
    let replacement = creation::find(&new["root"], table_id)
        .ok_or(Error::Contract("shared paste table after"))?;
    let mut ordinal = 0;
    for row in table["children"].as_array().ok_or(Error::Contract("paste rows"))? {
        for cell in row["children"].as_array().ok_or(Error::Contract("paste cells"))? {
            let id = creation::block(cell)?;
            let next = creation::find(replacement, id)
                .ok_or(Error::Contract("paste retained base cell"))?;
            if cell["children"] != next["children"] {
                for body in
                    next["children"].as_array().ok_or(Error::Contract("paste fresh body"))?
                {
                    super::clipboard_plan::publish(doc, body, stamp, ordinal)?;
                    doc.commit();
                    placement::move_block(
                        doc,
                        creation::block(body)?,
                        Some(id),
                        None,
                        stamp,
                        ordinal,
                    )?;
                    ordinal += 1;
                    doc.commit();
                }
                for body in
                    cell["children"].as_array().ok_or(Error::Contract("paste observed body"))?
                {
                    super::actions::DeleteBlock { block: creation::block(body)?.into() }
                        .apply(doc, stamp)?;
                }
            }
            if let Some(header) = headers.get(id) {
                model::write_patch(
                    doc,
                    id,
                    "property:breditor/header",
                    &model::Patch::set("breditor/header", json!(header)),
                    stamp,
                )?;
            }
        }
    }
    let prior = &table["properties"];
    let next = &replacement["properties"];
    for record in super::clipboard_plan::records(replacement)? {
        if !prior["breditor/merges"]
            .as_array()
            .ok_or(Error::Contract("paste old merges"))?
            .iter()
            .any(|old| old["id"] == record["id"])
        {
            merges::publish_record(doc, table_id, record, stamp)?;
        }
    }
    merges::publish_retractions(doc, table_id, prior, next, stamp)?;
    paragraphs::verify(doc, codec, after)
}

pub(super) fn empty(id: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":id},"children":[]})
}
