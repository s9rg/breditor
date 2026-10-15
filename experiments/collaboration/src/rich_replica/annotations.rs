//! Action-owned annotation activation retracts inherited marks on concurrently inserted text.
//!
//! Native undo can unmark original characters while an offline insertion keeps
//! an inherited attribute. Attribute presence therefore cannot be action life.
//! One unique register claim gates every copied annotation from the complete
//! atomic group. This also avoids platform-dependent ordering of two activation
//! field deletions when native undo retracts formatting and routing together.
use crate::{
    Error,
    register::{Stamp, read_contribution},
};
use loro::{LoroDoc, ToJson};

pub(super) fn claim(doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
    doc.get_map("annotation-ownership").insert(&stamp.key(), stamp.contribution(true.into()))?;
    Ok(())
}
pub(super) fn active(doc: &LoroDoc, key: &str) -> Result<bool, Error> {
    let Some(value) = doc.get_map("annotation-ownership").get(key) else {
        return Ok(false);
    };
    let value = value
        .as_value()
        .ok_or(Error::Contract("shared annotation activation scalar"))?
        .to_json_value();
    let (_, value) = read_contribution(doc, key, &value)?;
    if value.as_bool() != Some(true) {
        return Err(Error::Contract("shared annotation activation owner"));
    }
    Ok(true)
}
