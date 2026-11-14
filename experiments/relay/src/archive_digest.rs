//! Bounded detached archive hashing without retaining a second complete encoded output.
use sha2::{Digest, Sha256};
use std::io::{self, Write};

pub(crate) struct ArchiveDigest {
    hash: Sha256,
    bytes: u64,
    limit: u64,
}
impl ArchiveDigest {
    pub(crate) fn new(limit: u64) -> Self {
        Self { hash: Sha256::new(), bytes: 0, limit }
    }
    pub(crate) fn finish(self) -> ([u8; 32], u64) {
        (self.hash.finalize().into(), self.bytes)
    }

    pub(crate) fn remaining(&self) -> u64 {
        self.limit - self.bytes
    }
}
impl Write for ArchiveDigest {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let next = self
            .bytes
            .checked_add(bytes.len() as u64)
            .ok_or_else(|| io::Error::other("archive output byte overflow"))?;
        if next > self.limit {
            return Err(io::Error::other("archive complete output budget"));
        }
        self.hash.update(bytes);
        self.bytes = next;
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
