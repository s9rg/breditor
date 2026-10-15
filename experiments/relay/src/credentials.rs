//! High-entropy opaque capabilities; only their digests enter the durable ownership ledger.
use crate::{Error, Result};
use sha2::{Digest, Sha256};
use std::fmt::Write;

pub(crate) fn issue() -> Result<String> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| Error::Entropy)?;
    let mut result = String::with_capacity(64);
    for b in bytes {
        let _ = write!(result, "{b:02x}");
    }
    Ok(result)
}
pub(crate) fn hash(value: &str) -> Result<[u8; 32]> {
    if value.len() != 64 || !value.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    {
        return Err(Error::Lease);
    }
    Ok(Sha256::digest(value.as_bytes()).into())
}
