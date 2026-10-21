//! Bound the whole detached result without allocating an unbounded encoded copy.
use super::MAX_SERVER_ASSET_AVAILABILITY_BYTES;
use crate::{Error, Result};
use serde::Serialize;
use std::io::{self, Write};
struct Counter(usize);
impl Write for Counter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > MAX_SERVER_ASSET_AVAILABILITY_BYTES.saturating_sub(self.0) {
            return Err(io::Error::other("server asset availability encoded budget"));
        }
        self.0 += bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
pub(in crate::server) fn check(value: &impl Serialize) -> Result<()> {
    serde_json::to_writer(&mut Counter(0), value)
        .map_err(|_| Error::Contract("server asset availability complete encoded budget"))
}
#[derive(Serialize)]
struct Pending<'a> {
    state: &'a super::ServerAssetRecoveryState,
    missing: &'a [super::ServerAssetAvailabilityMissing],
}
pub(super) fn pending(
    state: &super::ServerAssetRecoveryState,
    missing: &[super::ServerAssetAvailabilityMissing],
) -> Result<()> {
    check(&Pending { state, missing })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn complete_encoded_budget_rejects_the_whole_overflowing_write() {
        let mut counter = Counter(MAX_SERVER_ASSET_AVAILABILITY_BYTES - 2);
        counter.write_all(b"ok").expect("exact boundary");
        assert!(counter.write_all(b"!").is_err());
        assert_eq!(counter.0, MAX_SERVER_ASSET_AVAILABILITY_BYTES);
        assert!(check(&"small nested data").is_ok());
    }
}
