//! Explicit new archive budget; each original root/segment keeps the old 16 MiB ceiling.
use crate::Error;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{self, Write};

pub(super) const MAX_GENERATIONS: usize = 64;
pub(super) const MAX_ARCHIVE_BYTES: usize = 64 * 1024 * 1024;
pub(super) const CONTINUED_GENERATIONS: usize = 256;
pub(super) const CONTINUED_ARCHIVE_BYTES: usize = 256 * 1024 * 1024;
pub(super) const CONTINUED_UNDO_ITEMS: usize = 16_000;
struct BoundedOutput {
    bytes: Vec<u8>,
    limit: usize,
}
impl Write for BoundedOutput {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.write_all(bytes)?;
        Ok(bytes.len())
    }
    fn write_all(&mut self, bytes: &[u8]) -> io::Result<()> {
        if bytes.len() > self.limit - self.bytes.len() {
            return Err(io::Error::other("segmented history byte budget"));
        }
        self.bytes.extend_from_slice(bytes);
        Ok(())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
pub(super) fn encode(value: &impl Serialize, limit: usize) -> Result<String, Error> {
    let mut output = BoundedOutput { bytes: Vec::new(), limit };
    serde_json::to_writer(&mut output, value)
        .map_err(|_| Error::Limit("segmented history bytes"))?;
    String::from_utf8(output.bytes)
        .map_err(|_| Error::Contract("segmented JSON encoding is not UTF-8"))
}

/// Count exactly what serde emits when a file is embedded as a JSON string.
pub(super) fn quoted_bytes(file: &str) -> Result<usize, Error> {
    struct Counter(usize);
    impl Write for Counter {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0 = self
                .0
                .checked_add(bytes.len())
                .ok_or_else(|| io::Error::other("segmented history quoted byte count"))?;
            Ok(bytes.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    let mut counter = Counter(0);
    serde_json::to_writer(&mut counter, file)
        .map_err(|_| Error::Limit("segmented history bytes"))?;
    Ok(counter.0)
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
