//! Validate all V3 layout contributions, including hidden and currently losing values.
use super::{Field, is_property};
use crate::{Error, register::read_contribution};
use loro::{LoroDoc, ToJson};
use serde_json::Value;
pub(in crate::rich_replica) fn validate(doc: &LoroDoc) -> Result<(), Error> {
    if !super::enabled(doc)? {
        return Ok(());
    }
    let raw = doc.get_map("metadata").get_deep_value().to_json_value();
    let owners = raw.as_object().ok_or(Error::Contract("shared layout metadata"))?;
    if owners.len() > 20_000 {
        return Err(Error::Limit("shared layout metadata owners"));
    }
    for owner in owners.values() {
        for name in ["identity", "defaults"] {
            if let Some(defaults) = owner.get(name) {
                let defaults =
                    defaults.as_str().ok_or(Error::Contract("shared layout defaults"))?;
                if defaults.len() > 64 * 1024 {
                    return Err(Error::Limit("shared layout defaults"));
                }
                let defaults: serde_json::Map<String, Value> = serde_json::from_str(defaults)?;
                if defaults.keys().any(|name| is_property(name)) {
                    return Err(Error::Contract("shared layout must use owned fields"));
                }
            }
        }
        let Some(effects) = owner.get("effects") else { continue };
        let effects = effects.as_object().ok_or(Error::Contract("shared layout effects"))?;
        if effects.len() > 128 {
            return Err(Error::Limit("shared metadata fields"));
        }
        for (name, values) in effects {
            let field = Field::named(name);
            if field.is_some()
                && !matches!(
                    owner.get("type").and_then(Value::as_str),
                    Some("breditor/paragraph" | "breditor/heading" | "breditor/code-block")
                )
            {
                return Err(Error::Contract("shared layout field owner"));
            }
            let values = values.as_object().ok_or(Error::Contract("shared field contributions"))?;
            if values.len() > 1000 {
                return Err(Error::Limit("shared field contributions"));
            }
            for (key, contribution) in values {
                let (_, value) = read_contribution(doc, key, contribution)?;
                let value = value.as_str().ok_or(Error::Contract("shared layout patch"))?;
                if value.len() > 64 * 1024 {
                    return Err(Error::Limit("shared property patch"));
                }
                let patch: super::super::model::Patch = serde_json::from_str(value)?;
                if let Some(field) = field {
                    validate_patch(field, &patch)?;
                } else if patch.sets.keys().any(|name| is_property(name))
                    || patch.removes.iter().any(|name| is_property(name))
                {
                    return Err(Error::Contract("shared layout foreign field"));
                }
            }
        }
    }
    Ok(())
}
fn validate_patch(field: Field, patch: &super::super::model::Patch) -> Result<(), Error> {
    if patch.sets.is_empty() && patch.removes == [field.property()] {
        return Ok(());
    }
    if patch.removes.is_empty()
        && patch.sets.len() == 1
        && let Some(value) = patch.sets.get(field.property())
    {
        return field.validate_value(value);
    }
    Err(Error::Contract("shared layout field may change only its own property"))
}
