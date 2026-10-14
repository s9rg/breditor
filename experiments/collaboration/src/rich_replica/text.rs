//! Generic typed format contributions projected as canonical Breditor text runs.
use crate::{
    Error,
    anchor::event_offset,
    register::{Stamp, read_contribution},
};
use loro::{LoroDoc, LoroText, TextDelta, ToJson};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Annotation {
    pub format: Value,
    pub enabled: bool,
}

pub(super) fn mark(
    doc: &LoroDoc,
    block: &str,
    offset: u32,
    length: u32,
    annotation: &Annotation,
    stamp: Stamp,
    ordinal: usize,
) -> Result<(), Error> {
    if length == 0 {
        return Err(Error::Contract("empty shared format range"));
    }
    let text = super::model::text(doc, block)?;
    let end = offset.checked_add(length).ok_or(Error::Offset)?;
    event_offset(&text, offset)?;
    event_offset(&text, end)?;
    let key = format!("breditor_format_{}_{ordinal}", stamp.key().replace(':', "_"));
    text.mark_utf16(
        usize::try_from(offset).map_err(|_| Error::Offset)?
            ..usize::try_from(end).map_err(|_| Error::Offset)?,
        &key,
        stamp.contribution(serde_json::to_string(annotation)?.into()),
    )?;
    Ok(())
}

pub(super) fn runs(doc: &LoroDoc, text: &LoroText) -> Result<Vec<Value>, Error> {
    let delta = text.to_delta();
    if delta.len() > 10_000 {
        return Err(Error::Limit("shared text runs"));
    }
    let mut output: Vec<(String, Vec<Value>)> = vec![];
    let mut total = 0;
    for run in delta {
        let TextDelta::Insert { insert, attributes } = run else {
            return Err(Error::Contract("shared text delta"));
        };
        let mut formats: BTreeMap<String, (Stamp, usize, Annotation)> = BTreeMap::new();
        for (key, value) in attributes.unwrap_or_default() {
            total += 1;
            if total > 50_000 {
                return Err(Error::Limit("shared annotations"));
            }
            let id = key
                .strip_prefix("breditor_format_")
                .ok_or(Error::Contract("shared annotation namespace"))?;
            let parts: Vec<_> = id.split('_').collect();
            if parts.len() != 3 {
                return Err(Error::Contract("shared annotation identity"));
            }
            let ordinal = parts[2]
                .parse::<usize>()
                .map_err(|_| Error::Contract("shared annotation ordinal"))?;
            if ordinal.to_string() != parts[2] || ordinal > 100_000 {
                return Err(Error::Contract("shared annotation ordinal"));
            }
            if value.is_null() {
                continue;
            }
            let (stamp, value) = read_contribution(
                doc,
                &format!("{}:{}", parts[0], parts[1]),
                &value.to_json_value(),
            )?;
            let encoded = value.as_str().ok_or(Error::Contract("shared annotation value"))?;
            if encoded.len() > 64 * 1024 {
                return Err(Error::Limit("shared annotation bytes"));
            }
            let annotation: Annotation = serde_json::from_str(encoded)?;
            let kind = annotation
                .format
                .get("type")
                .and_then(Value::as_str)
                .ok_or(Error::Contract("shared format kind"))?
                .to_owned();
            if formats
                .get(&kind)
                .is_none_or(|(previous, index, _)| (stamp, ordinal) > (*previous, *index))
            {
                formats.insert(kind, (stamp, ordinal, annotation));
            }
        }
        let formats: Vec<_> = formats
            .into_values()
            .filter_map(|(_, _, annotation)| annotation.enabled.then_some(annotation.format))
            .collect();
        if let Some((prior, marks)) = output.last_mut()
            && *marks == formats
        {
            prior.push_str(&insert);
        } else {
            output.push((insert, formats));
        }
    }
    Ok(output
        .into_iter()
        .filter(|(text, _)| !text.is_empty())
        .map(|(text, formats)| json!({"kind":"text","text":text,"formats":formats}))
        .collect())
}

pub(super) fn block_runs(doc: &LoroDoc, block: &str) -> Result<Vec<Value>, Error> {
    super::model::existing_text(doc, block)
        .map(|text| runs(doc, &text))
        .transpose()
        .map(Option::unwrap_or_default)
}
