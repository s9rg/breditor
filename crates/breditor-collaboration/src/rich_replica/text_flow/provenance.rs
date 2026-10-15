//! Initial authored text keeps its original characters when creation is undone.
//!
//! Each insertion explicitly owns a separate provenance annotation. Inherited
//! seed annotations cannot turn another writer's text into the creator's seed.
//! These are not routing or formatting annotations and never reach the AST.
use crate::{
    Error,
    register::{Stamp, read_contribution},
};
use loro::{LoroDoc, LoroText};
use serde_json::Value;

const PREFIX: &str = "breditor_origin:";

pub(super) fn internal(key: &str) -> bool {
    key.starts_with(PREFIX)
}

pub(in crate::rich_replica) fn mark(
    text: &LoroText,
    offset: u32,
    length: u32,
    seed: Option<&str>,
    stamp: Stamp,
) -> Result<(), Error> {
    if length == 0 {
        return Ok(());
    }
    let end = offset.checked_add(length).ok_or(Error::Offset)?;
    let value = seed.map_or_else(|| false.into(), Into::into);
    text.mark_utf16(
        usize::try_from(offset).map_err(|_| Error::Offset)?
            ..usize::try_from(end).map_err(|_| Error::Offset)?,
        &format!("{PREFIX}{}", stamp.key()),
        stamp.contribution(value),
    )?;
    Ok(())
}

pub(super) fn visible(
    doc: &LoroDoc,
    source: &str,
    attributes: &[(String, Value)],
) -> Result<bool, Error> {
    let mut selected = None;
    for (key, value) in attributes {
        let Some(key) = key.strip_prefix(PREFIX) else { continue };
        if value.is_null() {
            continue;
        }
        let (stamp, value) = read_contribution(doc, key, value)?;
        let seed = match &value {
            Value::Bool(false) => None,
            Value::String(block) if block == source => Some(block.clone()),
            _ => return Err(Error::Contract("shared text provenance source")),
        };
        if selected.as_ref().is_none_or(|(prior, _)| stamp > *prior) {
            selected = Some((stamp, seed));
        }
    }
    if let Some((_, Some(block))) = selected {
        let meta = super::super::model::metadata(doc, &block)?;
        super::super::model::born(doc, &loro::ToJson::to_json_value(&meta.get_deep_value()))
    } else {
        Ok(true)
    }
}
