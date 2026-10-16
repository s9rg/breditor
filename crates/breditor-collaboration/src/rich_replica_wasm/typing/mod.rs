//! Additive typed user-input boundary; default command/journal protocols remain unchanged.
mod close_typing_group;
mod delete_typing_range;
mod enable_typing_history;
mod insert_typing_text;
mod typing_checkpoint;
use crate::Error;
use serde::{Deserialize, Deserializer};

fn clock<'de, D: Deserializer<'de>>(reader: D) -> Result<u64, D::Error> {
    let value = String::deserialize(reader)?;
    let parsed =
        value.parse::<u64>().map_err(|_| serde::de::Error::custom("typing clock decimal"))?;
    if value.len() > 20 || parsed.to_string() != value {
        return Err(serde::de::Error::custom("canonical typing clock decimal"));
    }
    Ok(parsed)
}
fn decode<T: serde::de::DeserializeOwned>(input: &str) -> Result<T, Error> {
    // A valid 64 KiB text can expand sixfold when JSON escapes control characters.
    if input.len() > 512 * 1024 {
        return Err(Error::Limit("shared typing request bytes"));
    }
    serde_json::from_str(input).map_err(|_| Error::Json)
}
