//! Count JSON bytes before cloning/retaining repeated formatting, not after unbounded allocation.
use crate::Error;
use serde::Serialize;
use std::io::{self, Write};
struct Counter {
    bytes: usize,
    maximum: usize,
}
impl Write for Counter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > self.maximum.saturating_sub(self.bytes) {
            return Err(io::Error::other("affine JSON byte budget"));
        }
        self.bytes += bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
pub(super) fn json_size(value: &impl Serialize, maximum: usize) -> Result<usize, Error> {
    let mut counter = Counter { bytes: 0, maximum };
    serde_json::to_writer(&mut counter, value)
        .map_err(|_| Error::Limit("affine retained JSON bytes"))?;
    Ok(counter.bytes)
}
