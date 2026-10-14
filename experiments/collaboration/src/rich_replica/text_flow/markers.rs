//! Fragment ownership annotations use independent causal contributions, not one LWW style.
use crate::{
    Error,
    anchor::event_offset,
    register::{Stamp, read_contribution},
};
use loro::LoroDoc;
use serde_json::Value;

const PREFIX: &str = "breditor_fragment:";

pub(super) fn selected(doc: &LoroDoc, values: &[(String, Value)]) -> Result<Option<String>, Error> {
    let mut chosen = None;
    for (key, value) in values {
        let Some(id) = key.strip_prefix(PREFIX) else { continue };
        let parts: Vec<_> = id.split('_').collect();
        if parts.len() != 3 {
            return Err(Error::Contract("text-flow marker identity"));
        }
        let ordinal =
            parts[2].parse::<usize>().map_err(|_| Error::Contract("text-flow marker ordinal"))?;
        if ordinal.to_string() != parts[2] || ordinal > 100_000 {
            return Err(Error::Contract("text-flow marker ordinal"));
        }
        if value.is_null() {
            continue;
        }
        let (stamp, value) = read_contribution(doc, &format!("{}:{}", parts[0], parts[1]), value)?;
        let fragment = value.as_str().ok_or(Error::Contract("text-flow marker value"))?.to_owned();
        if chosen.as_ref().is_none_or(|(prior, index, _)| (stamp, ordinal) > (*prior, *index)) {
            chosen = Some((stamp, ordinal, fragment));
        }
    }
    Ok(chosen.map(|(_, _, fragment)| fragment))
}

pub(super) fn formats(doc: &LoroDoc, values: &[(String, Value)]) -> Result<Vec<Value>, Error> {
    super::super::text::annotations(
        doc,
        &values.iter().filter(|(key, _)| !key.starts_with(PREFIX)).cloned().collect::<Vec<_>>(),
    )
}

pub(super) fn mark(
    doc: &LoroDoc,
    source: &str,
    offset: u32,
    length: u32,
    fragment: &str,
    stamp: Stamp,
    ordinal: usize,
) -> Result<(), Error> {
    if length == 0 {
        return Err(Error::Contract("empty text-flow assignment"));
    }
    let text = super::super::model::existing_text(doc, source)
        .ok_or(Error::Contract("text-flow source"))?;
    let end = offset.checked_add(length).ok_or(Error::Offset)?;
    event_offset(&text, offset)?;
    event_offset(&text, end)?;
    let key = format!("{PREFIX}{}_{ordinal}", stamp.key().replace(':', "_"));
    text.mark_utf16(
        usize::try_from(offset).map_err(|_| Error::Offset)?
            ..usize::try_from(end).map_err(|_| Error::Offset)?,
        &key,
        stamp.contribution(fragment.into()),
    )?;
    Ok(())
}
