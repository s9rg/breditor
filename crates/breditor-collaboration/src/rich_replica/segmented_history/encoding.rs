//! Explicit new archive budget; each original root/segment keeps the old 16 MiB ceiling.
use crate::Error;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{self, Write};

pub(super) const MAX_GENERATIONS: usize = 64;
pub(super) const MAX_ARCHIVE_BYTES: usize = 64 * 1024 * 1024;
struct Counter {
    bytes: usize,
    limit: usize,
}
impl Write for Counter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > self.limit - self.bytes {
            return Err(io::Error::other("segmented history byte budget"));
        }
        self.bytes += bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
pub(super) fn encode(value: &impl Serialize, limit: usize) -> Result<String, Error> {
    serde_json::to_writer(&mut Counter { bytes: 0, limit }, value)
        .map_err(|_| Error::Limit("segmented history bytes"))?;
    Ok(serde_json::to_string(value)?)
}
pub(super) fn digest(bytes: &str) -> String {
    let hash = Sha256::digest(bytes.as_bytes());
    let mut value = String::with_capacity(64);
    for byte in hash {
        use std::fmt::Write;
        let _ = write!(value, "{byte:02x}");
    }
    value
}
