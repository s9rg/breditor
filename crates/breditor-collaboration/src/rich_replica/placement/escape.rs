//! Permanent, initially hidden root occurrences keep incompatible retained flow addressable.
use super::{Site, metadata, prepare, site, string};
use crate::Error;
use loro::LoroDoc;

pub(super) fn flow(kind: &str) -> bool {
    matches!(
        kind,
        "breditor/paragraph"
            | "breditor/heading"
            | "breditor/bullet-list"
            | "breditor/ordered-list"
            | "breditor/table"
            | "breditor/image"
    )
}

/// Reserve outside user history, including for currently unborn authored flow.
pub(super) fn reserve(
    doc: &LoroDoc,
    block: &str,
    parent: Option<&str>,
    origin: &str,
) -> Result<(), Error> {
    let meta = metadata(doc, block)?;
    if !flow(&string(&meta, "type")?) {
        return Ok(());
    }
    let id = if parent.is_none() {
        origin.to_owned()
    } else {
        super::super::model::virtual_id("placement-escape", &[block])
    };
    if parent.is_some() {
        let sites = doc.get_map("sites");
        if sites.get(&id).is_some() {
            let previous = site(doc, &id)?;
            if previous.block != block || previous.parent.is_some() {
                return Err(Error::Contract("conflicting root escape occurrence"));
            }
        } else {
            sites
                .insert(&id, serde_json::to_string(&Site { block: block.into(), parent: None })?)?;
        }
        let order = prepare(doc, None)?;
        if !order
            .to_vec()
            .iter()
            .any(|value| value.as_string().is_some_and(|value| value.as_str() == id))
        {
            order.push(id.clone())?;
        }
    }
    if let Some(previous) = meta.get("escape-site") {
        if previous
            .as_value()
            .and_then(loro::LoroValue::as_string)
            .is_none_or(|value| value.as_str() != id)
        {
            return Err(Error::Contract("conflicting immutable root escape"));
        }
    } else {
        meta.insert("escape-site", id)?;
    }
    Ok(())
}
