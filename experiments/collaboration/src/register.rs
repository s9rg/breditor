//! Selective metadata uses immutable per-action contributions, not shared LWW slots.
//!
//! Native undo of one shared map field can remove a remote writer's winning
//! value. Here each logical action owns one unique slot. Undo retracts that slot;
//! materialization chooses the highest active causal stamp. Redo reactivates the
//! original contribution and priority, rather than impersonating a new edit.

use crate::Error;
use loro::{ID, LoroDoc, LoroMap, LoroValue, loro_value};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct Stamp {
    lamport: u64,
    writer: u64,
    counter: u32,
}

impl Stamp {
    pub(crate) fn next(doc: &LoroDoc) -> Result<Self, Error> {
        let writer = doc.peer_id();
        let counter = doc.oplog_vv().get(&writer).copied().unwrap_or(0);
        let counter = u32::try_from(counter).map_err(|_| Error::Contract("writer counter"))?;
        let mut lamport = 0_u64;
        for frontier in doc.oplog_frontiers().iter() {
            let change =
                doc.get_change(frontier).ok_or(Error::Contract("missing frontier change"))?;
            let offset = u64::try_from(frontier.counter - change.id.counter)
                .map_err(|_| Error::Contract("frontier counter"))?;
            lamport = lamport.max(
                u64::from(change.lamport)
                    .checked_add(offset)
                    .and_then(|value| value.checked_add(1))
                    .ok_or(Error::Limit("causal clock"))?,
            );
        }
        Ok(Self { lamport, writer, counter })
    }

    pub(crate) fn key(self) -> String {
        format!("{}:{}", self.writer, self.counter)
    }

    pub(crate) fn contribution(self, value: LoroValue) -> LoroValue {
        loro_value!({
            "lamport": self.lamport.to_string(), "writer": self.writer.to_string(),
            "counter": i64::from(self.counter), "value": value,
        })
    }
}

pub(crate) fn write(
    map: &LoroMap,
    field: &str,
    stamp: Stamp,
    value: LoroValue,
) -> Result<(), Error> {
    let effects = map.ensure_mergeable_map(field)?;
    effects.insert(&stamp.key(), stamp.contribution(value))?;
    Ok(())
}

fn decimal(value: &Value) -> Result<u64, Error> {
    let text = value.as_str().ok_or(Error::Contract("register decimal string"))?;
    let number = text.parse::<u64>().map_err(|_| Error::Contract("register decimal value"))?;
    if number.to_string() != text {
        return Err(Error::Contract("register canonical decimal"));
    }
    Ok(number)
}

pub(crate) fn read_contribution(
    doc: &LoroDoc,
    key: &str,
    value: &Value,
) -> Result<(Stamp, Value), Error> {
    let entry = value.as_object().ok_or(Error::Contract("register contribution"))?;
    if entry.len() != 4 {
        return Err(Error::Contract("register contribution fields"));
    }
    let stamp = Stamp {
        lamport: decimal(entry.get("lamport").ok_or(Error::Contract("register clock"))?)?,
        writer: decimal(entry.get("writer").ok_or(Error::Contract("register writer"))?)?,
        counter: u32::try_from(
            entry
                .get("counter")
                .and_then(Value::as_u64)
                .ok_or(Error::Contract("register counter"))?,
        )
        .map_err(|_| Error::Contract("register counter range"))?,
    };
    if stamp.writer == 0
        || stamp.writer == u64::MAX
        || stamp.counter > i32::MAX.unsigned_abs()
        || key != stamp.key()
    {
        return Err(Error::Contract("register identity"));
    }
    let counter = i32::try_from(stamp.counter).map_err(|_| Error::Contract("register counter"))?;
    let change = doc
        .get_change(ID::new(stamp.writer, counter))
        .ok_or(Error::Contract("register source action"))?;
    let offset = u64::try_from(counter - change.id.counter)
        .map_err(|_| Error::Contract("register causal offset"))?;
    if u64::from(change.lamport).checked_add(offset) != Some(stamp.lamport) {
        return Err(Error::Contract("register causal priority"));
    }
    let value = entry.get("value").ok_or(Error::Contract("register value"))?.clone();
    Ok((stamp, value))
}

fn winner(doc: &LoroDoc, root: &str, field: &str, value: &Value) -> Result<Option<Value>, Error> {
    let entries = value.as_object().ok_or(Error::Contract("register effects"))?;
    if entries.len() > 1000 {
        return Err(Error::Limit("register contributions"));
    }
    let mut selected: Option<(Stamp, Value)> = None;
    for (key, value) in entries {
        let (stamp, value) = read_contribution(doc, key, value)?;
        crate::validation::validate_register_value(root, field, &value)?;
        if selected.as_ref().is_none_or(|(previous, _)| stamp > *previous) {
            selected = Some((stamp, value));
        }
    }
    Ok(selected.map(|(_, value)| value))
}

pub(crate) fn materialize(doc: &LoroDoc, raw: &Value) -> Result<Value, Error> {
    let mut root = raw.as_object().ok_or(Error::Contract("probe root"))?.clone();
    for (root_name, allowed) in [("columns", &["width"][..]), ("images", &["alt", "asset"][..])] {
        let Some(metadata) = root.get(root_name) else {
            continue;
        };
        let metadata = metadata.as_object().ok_or(Error::Contract("register owner map"))?;
        let mut resolved = Map::new();
        for (identity, fields) in metadata {
            let fields = fields.as_object().ok_or(Error::Contract("register owner fields"))?;
            let mut output = Map::new();
            for (name, values) in fields {
                if !allowed.contains(&name.as_str()) {
                    return Err(Error::Contract("register field name"));
                }
                if let Some(value) = winner(doc, root_name, name, values)? {
                    output.insert(name.clone(), value);
                }
            }
            resolved.insert(identity.clone(), Value::Object(output));
        }
        root.insert(root_name.into(), Value::Object(resolved));
    }
    Ok(Value::Object(root))
}
