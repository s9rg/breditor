//! Closed path spellings and canonical bounded controls; hashes are not authority.
use crate::{Error, Result};
use serde::{Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use std::fmt::Write;
pub(in crate::log) const MAX_GENERATIONS: usize = 64;
pub(in crate::log) const MAX_WAL_BYTES: u64 = 512 * 1024 * 1024;
pub(super) const MAX_CONTROL: u64 = 128 * 1024;
pub(super) const MAX_MANIFEST_BYTES: u64 = MAX_CONTROL * MAX_GENERATIONS as u64;
pub(super) fn sha(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}
pub(super) fn hex(bytes: &[u8; 32]) -> String {
    let mut result = String::with_capacity(64);
    for byte in bytes {
        let _ = write!(result, "{byte:02x}");
    }
    result
}
pub(super) fn manifest_name(hash: &[u8; 32]) -> String {
    format!("m-{}.json", hex(hash))
}
pub(crate) fn wal_name(generation: &str) -> String {
    let mut sha = Sha256::new();
    sha.update(b"breditor/relay-log-file/1\0");
    sha.update(generation.as_bytes());
    format!("g-{}.wal", hex(&sha.finalize().into()))
}
pub(super) fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>> {
    let bytes = serde_json::to_vec(value)?;
    if bytes.len() as u64 > MAX_CONTROL {
        return Err(Error::Contract("log control byte budget"));
    }
    Ok(bytes)
}
pub(super) fn decode<T: DeserializeOwned + Serialize>(bytes: &[u8]) -> Result<T> {
    if bytes.len() as u64 > MAX_CONTROL {
        return Err(Error::Contract("log control byte budget"));
    }
    let value = serde_json::from_slice(bytes)?;
    if encode(&value)? != bytes {
        return Err(Error::Contract("log control canonical bytes"));
    }
    Ok(value)
}
