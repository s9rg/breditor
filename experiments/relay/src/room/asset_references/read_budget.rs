//! Enforce the complete encoded bound before returning any detached inventory.
use super::MAX_SERVER_ASSET_REFERENCE_BYTES;
use crate::{Error, Result};
use serde::Serialize;
use std::io::{self, Write};
struct Counter(usize);
impl Write for Counter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > MAX_SERVER_ASSET_REFERENCE_BYTES.saturating_sub(self.0) {
            return Err(io::Error::other("server asset reference encoded budget"));
        }
        self.0 += bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
pub(super) fn check(value: &impl Serialize) -> Result<()> {
    serde_json::to_writer(&mut Counter(0), value)
        .map_err(|_| Error::Contract("server asset reference complete encoded budget"))
}
