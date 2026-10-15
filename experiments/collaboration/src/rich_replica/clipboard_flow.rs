//! Whole-flow paste retains any implicit empty paragraph that the original core keeps.
use super::{creation, materialize, model, paragraphs, placement};
use crate::{Error, register::Stamp};
use breditor_core::{codec::DocumentJsonCodecV2, rich_content::RichDocument};
use loro::LoroDoc;
use serde_json::Value;

fn flow<'a>(root: &'a Value, parent: Option<&str>) -> Result<&'a [Value], Error> {
    let node = if let Some(parent) = parent {
        creation::find(root, parent).ok_or(Error::Contract("paste flow parent"))?
    } else {
        root
    };
    node["children"].as_array().map(Vec::as_slice).ok_or(Error::Contract("paste flow children"))
}
pub(super) fn prepare(doc: &LoroDoc, parent: Option<&str>) -> Result<(), Error> {
    let raw = materialize::envelope(doc)?;
    for node in flow(&raw["root"], parent)? {
        let id = creation::block(node)?;
        if id.starts_with(model::VIRTUAL_PREFIX) {
            super::list_structure::retain_text(doc, id)?;
            model::metadata(doc, id)?.ensure_mergeable_map("placements")?;
        }
    }
    Ok(())
}
pub(super) fn retain(
    doc: &LoroDoc,
    codec: &DocumentJsonCodecV2,
    before: &RichDocument,
    after: &RichDocument,
    parent: Option<&str>,
    stamp: Stamp,
) -> Result<(), Error> {
    doc.commit();
    let old: Value = serde_json::from_str(
        &codec.encode(before.document()).map_err(|_| Error::Contract("paste old flow"))?,
    )?;
    let new: Value = serde_json::from_str(
        &codec.encode(after.document()).map_err(|_| Error::Contract("paste new flow"))?,
    )?;
    for (index, node) in flow(&old["root"], parent)?.iter().enumerate().rev() {
        let id = creation::block(node)?;
        if !id.starts_with(model::VIRTUAL_PREFIX) {
            continue;
        }
        // An explicitly typed or previously relocated head already renders normally.
        let actual = materialize::envelope(doc)?;
        if creation::find(&actual["root"], id).is_some() {
            continue;
        }
        if creation::find(&new["root"], id).is_some() {
            let (parent, before) = paragraphs::layout(&new["root"], id)?;
            placement::move_block(doc, id, parent.as_deref(), before.as_deref(), stamp, index)?;
            doc.commit();
        }
    }
    Ok(())
}
