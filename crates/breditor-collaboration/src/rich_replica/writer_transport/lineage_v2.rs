//! Version-two lineage hashes causal atoms, never engine change/RLE packing.
//!
//! Commit messages and wall clocks are engine bookkeeping, not operation identity.
//! Every atom retains its author/counter, container, payload, Lamport clock and
//! immediate causal frontier. Deletes normalize their single-atom direction.
use super::{ENGINE, digest};
use crate::Error;
use loro::{ID, JsonChange, JsonListOp, JsonMovableListOp, JsonOp, JsonOpContent, JsonTextOp};
use serde::Serialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::fmt::Write;

#[cfg(test)]
#[path = "lineage_v2_tests.rs"]
mod tests;

fn feed(hash: &mut Sha256, value: &impl Serialize) -> Result<(), Error> {
    // Length framing makes the ordered record stream unambiguous without retaining
    // an expanded copy of the document's causal history in memory.
    let mut value = serde_json::to_value(value)?;
    // Remain deterministic even if a downstream crate enables serde_json's
    // preserve_order feature through Cargo feature unification.
    value.sort_all_objects();
    let bytes = serde_json::to_vec(&value)?;
    let len = u64::try_from(bytes.len()).map_err(|_| Error::Limit("writer lineage record"))?;
    hash.update(len.to_be_bytes());
    hash.update(bytes);
    Ok(())
}

fn deletion(pos: i32, len: i32, start: ID, index: i32) -> Result<(i32, ID), Error> {
    let offset = if len > 0 {
        index
    } else {
        len.checked_abs()
            .and_then(|n| n.checked_sub(index + 1))
            .ok_or(Error::Contract("writer lineage deletion"))?
    };
    let position = if len > 0 {
        pos
    } else {
        pos.checked_sub(index).ok_or(Error::Contract("writer lineage deletion position"))?
    };
    let counter =
        start.counter.checked_add(offset).ok_or(Error::Contract("writer lineage target"))?;
    Ok((position, ID::new(start.peer, counter)))
}

fn insert_position(pos: u32, index: usize) -> Result<u32, Error> {
    pos.checked_add(u32::try_from(index).map_err(|_| Error::Limit("writer lineage insert"))?)
        .ok_or(Error::Contract("writer lineage insert position"))
}

fn atoms(op: &JsonOp, mut emit: impl FnMut(JsonOp) -> Result<(), Error>) -> Result<(), Error> {
    let mut counter = op.counter;
    let mut one = |content| -> Result<(), Error> {
        emit(JsonOp { counter, container: op.container.clone(), content })?;
        counter = counter.checked_add(1).ok_or(Error::Limit("writer lineage counter"))?;
        Ok(())
    };
    match &op.content {
        JsonOpContent::Text(JsonTextOp::Insert { pos, text }) => {
            for (index, ch) in text.chars().enumerate() {
                one(JsonOpContent::Text(JsonTextOp::Insert {
                    pos: insert_position(*pos, index)?,
                    text: ch.to_string(),
                }))?;
            }
        }
        JsonOpContent::List(JsonListOp::Insert { pos, value }) => {
            for (index, value) in value.iter().enumerate() {
                one(JsonOpContent::List(JsonListOp::Insert {
                    pos: insert_position(*pos, index)?,
                    value: vec![value.clone()],
                }))?;
            }
        }
        JsonOpContent::MovableList(JsonMovableListOp::Insert { pos, value }) => {
            for (index, value) in value.iter().enumerate() {
                one(JsonOpContent::MovableList(JsonMovableListOp::Insert {
                    pos: insert_position(*pos, index)?,
                    value: vec![value.clone()],
                }))?;
            }
        }
        JsonOpContent::Text(JsonTextOp::Delete { pos, len, start_id })
        | JsonOpContent::List(JsonListOp::Delete { pos, len, start_id })
        | JsonOpContent::MovableList(JsonMovableListOp::Delete { pos, len, start_id }) => {
            let length = len
                .checked_abs()
                .filter(|n| *n > 0)
                .ok_or(Error::Contract("writer lineage delete length"))?;
            for index in 0..length {
                let (pos, start_id) = deletion(*pos, *len, *start_id, index)?;
                let content = match &op.content {
                    JsonOpContent::Text(_) => {
                        JsonOpContent::Text(JsonTextOp::Delete { pos, len: 1, start_id })
                    }
                    JsonOpContent::List(_) => {
                        JsonOpContent::List(JsonListOp::Delete { pos, len: 1, start_id })
                    }
                    _ => JsonOpContent::MovableList(JsonMovableListOp::Delete {
                        pos,
                        len: 1,
                        start_id,
                    }),
                };
                one(content)?;
            }
        }
        // Map, tree, moves, sets, mark endpoints and future ops occupy one counter.
        content => one(content.clone())?,
    }
    Ok(())
}

/// Hash a contiguous single-writer interval, including a zero-length prefix.
pub(super) fn changes(
    document: &str,
    schema_fingerprint: &str,
    model: u32,
    writer: u64,
    from: i32,
    through: i32,
    changes: &[JsonChange],
) -> Result<String, Error> {
    if from < 0 || through < from {
        return Err(Error::Contract("writer lineage range"));
    }
    let mut hash = Sha256::new();
    feed(
        &mut hash,
        &json!({"format":"breditor/shared-writer-lineage","formatVersion":2,
        "document":document,"schemaFingerprint":schema_fingerprint,"modelVersion":model,
        "engine":ENGINE,"writer":writer.to_string(),"from":from.to_string(),"through":through.to_string()}),
    )?;
    let mut next = from;
    for change in changes {
        if change.id.peer != writer || change.id.counter != next || change.ops.is_empty() {
            return Err(Error::Contract("writer lineage change continuity"));
        }
        for op in &change.ops {
            if op.counter != next || op.content.op_len() == 0 {
                return Err(Error::Contract("writer lineage operation continuity"));
            }
            atoms(op, |atom| {
                if atom.counter != next || next >= through {
                    return Err(Error::Contract("writer lineage atom continuity"));
                }
                let offset = u32::try_from(atom.counter - change.id.counter)
                    .map_err(|_| Error::Contract("writer lineage clock offset"))?;
                let lamport = change
                    .lamport
                    .checked_add(offset)
                    .ok_or(Error::Limit("writer lineage Lamport clock"))?;
                let mut deps = if atom.counter == change.id.counter {
                    change.deps.clone()
                } else {
                    vec![ID::new(writer, atom.counter - 1)]
                };
                deps.sort_unstable_by_key(|id| (id.peer, id.counter));
                feed(
                    &mut hash,
                    &json!({"id":format!("{}@{writer}",atom.counter),
                    "lamport":lamport,"deps":deps.iter().map(ToString::to_string).collect::<Vec<_>>(),"op":atom}),
                )?;
                next = next.checked_add(1).ok_or(Error::Limit("writer lineage counter"))?;
                Ok(())
            })?;
        }
    }
    if next != through {
        return Err(Error::Contract("writer lineage incomplete range"));
    }
    let mut output = String::from("sha256:");
    for byte in hash.finalize() {
        let _ = write!(output, "{byte:02x}");
    }
    debug_assert!(digest::valid(&output));
    Ok(output)
}
