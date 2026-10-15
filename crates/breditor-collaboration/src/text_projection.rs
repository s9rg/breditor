//! Canonical formatted runs from owned annotations, not raw browser attributes.

use crate::{
    Error,
    actions::TextTarget,
    register::{Stamp, read_contribution},
};
use loro::{LoroDoc, LoroText, TextDelta, ToJson};
use serde_json::{Value, json};

fn runs(doc: &LoroDoc, text: &LoroText) -> Result<Value, Error> {
    let delta = text.to_delta();
    if delta.len() > 10_000 {
        return Err(Error::Limit("formatted runs"));
    }
    let mut output: Vec<(String, bool)> = vec![];
    let mut attribute_count = 0_usize;
    for run in delta {
        let TextDelta::Insert { insert, attributes } = run else {
            return Err(Error::Contract("materialized text delta"));
        };
        let mut selected: Option<(Stamp, bool)> = None;
        if let Some(attributes) = attributes {
            attribute_count = attribute_count
                .checked_add(attributes.len())
                .ok_or(Error::Limit("text annotations"))?;
            if attributes.len() > 1000 || attribute_count > 50_000 {
                return Err(Error::Limit("text annotations"));
            }
            for (key, value) in attributes {
                let identity = key
                    .strip_prefix("breditor_strong_")
                    .and_then(|id| id.split_once('_'))
                    .ok_or(Error::Contract("text annotation key"))?;
                if value.is_null() {
                    continue;
                }
                let (stamp, value) = read_contribution(
                    doc,
                    &format!("{}:{}", identity.0, identity.1),
                    &value.to_json_value(),
                )?;
                let enabled = value.as_bool().ok_or(Error::Contract("strong annotation value"))?;
                if selected.is_none_or(|(previous, _)| stamp > previous) {
                    selected = Some((stamp, enabled));
                }
            }
        }
        let strong = selected.is_some_and(|(_, enabled)| enabled);
        if let Some((text, prior)) = output.last_mut()
            && *prior == strong
        {
            text.push_str(&insert);
        } else {
            output.push((insert, strong));
        }
    }
    Ok(Value::Array(
        output
            .into_iter()
            .map(|(text, strong)| json!({ "text": text, "strong": strong }))
            .collect(),
    ))
}

pub(crate) fn decorate(doc: &LoroDoc, view: &mut Value) -> Result<(), Error> {
    let root = view.as_object_mut().ok_or(Error::Contract("text projection root"))?;
    root.insert("body_runs".into(), runs(doc, &doc.get_text("body"))?);
    if let Some(cells) = root.get_mut("cells").and_then(Value::as_object_mut) {
        for (key, cell) in cells {
            let cell = cell.as_object_mut().ok_or(Error::Contract("text projection cell"))?;
            if cell.contains_key("body") {
                let text = TextTarget::existing_cell_text(doc, key)
                    .ok_or(Error::Contract("missing canonical cell text"))?;
                cell.insert("body_runs".into(), runs(doc, &text)?);
            }
        }
    }
    Ok(())
}
