//! Bounded SHA-256 integrity over one exactly selected byte length.
//!
//! Uses the existing pinned `sha2` implementation. No document, history, storage, account,
//! provider or activation authority is created. Input bytes are consumed, never retained.
use sha2::{Digest, Sha256};

/// Independent hashing ceiling, not a change to any archive or storage family's own bounds.
pub const MAX_ARCHIVE_DIGEST_BYTES: u32 = 1024 * 1024 * 1024;
/// Largest single borrowed update; Wasm callers must also bound copies before crossing the ABI.
pub const MAX_ARCHIVE_DIGEST_CHUNK_BYTES: usize = 1024 * 1024;

/// Closed integrity-stream failures. Messages contain no bytes, paths or host payloads.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum ArchiveDigestError {
    /// The selected complete length or an individual chunk exceeds this component's ceiling.
    #[error("archive digest byte budget")]
    Budget,
    /// This chunk would cross the independently selected complete length.
    #[error("archive digest selected length exceeded")]
    Overflow,
    /// Finalization requires every selected byte, including an explicitly empty source.
    #[error("archive digest selected bytes incomplete")]
    Incomplete,
    /// The digest has already completed and cannot append or complete again.
    #[error("archive digest already completed")]
    Closed,
}

/// One exact-length SHA-256 stream. No input buffer, file owner or editor is retained.
/// Rejected updates/finalizations preserve the prior state. Successful finish is terminal;
/// dropping the instance releases its bounded state. This is integrity, never authenticity.
pub struct ArchiveDigest {
    expected: u32,
    received: u32,
    state: Option<Sha256>,
}
impl ArchiveDigest {
    /// Select the exact total before any input. Zero selects the SHA-256 of empty bytes.
    /// # Errors
    /// Refuses totals above the independent hash ceiling without allocating input storage.
    pub fn new(expected: u32) -> Result<Self, ArchiveDigestError> {
        if expected > MAX_ARCHIVE_DIGEST_BYTES {
            return Err(ArchiveDigestError::Budget);
        }
        Ok(Self { expected, received: 0, state: Some(Sha256::new()) })
    }
    /// Consume one bounded borrowed chunk, without keeping its bytes or changing any producer.
    /// # Errors
    /// Closed streams, overlarge chunks and crossing the selected total refuse before mutation.
    pub fn update(&mut self, bytes: &[u8]) -> Result<(), ArchiveDigestError> {
        if self.state.is_none() {
            return Err(ArchiveDigestError::Closed);
        }
        if bytes.len() > MAX_ARCHIVE_DIGEST_CHUNK_BYTES {
            return Err(ArchiveDigestError::Budget);
        }
        let length = u32::try_from(bytes.len()).map_err(|_| ArchiveDigestError::Budget)?;
        let next = self.received.checked_add(length).ok_or(ArchiveDigestError::Overflow)?;
        if next > self.expected {
            return Err(ArchiveDigestError::Overflow);
        }
        self.state.as_mut().ok_or(ArchiveDigestError::Closed)?.update(bytes);
        self.received = next;
        Ok(())
    }
    /// Finish once, only after every selected byte. Input buffers are not returned or retained.
    /// # Errors
    /// An incomplete stream stays appendable; a successfully completed one remains closed.
    pub fn finish(&mut self) -> Result<[u8; 32], ArchiveDigestError> {
        if self.state.is_none() {
            return Err(ArchiveDigestError::Closed);
        }
        if self.received != self.expected {
            return Err(ArchiveDigestError::Incomplete);
        }
        Ok(self.state.take().ok_or(ArchiveDigestError::Closed)?.finalize().into())
    }
}

#[cfg(test)]
mod tests;
