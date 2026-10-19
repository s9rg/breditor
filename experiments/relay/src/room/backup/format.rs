//! Fixed independent binary envelope. Original log and event bytes are never rewritten.
use super::{RoomBackup, RoomBackupInfo};
use crate::{
    Error, Result,
    log::{LogSnapshot, MAX_LOG},
};
use sha2::{Digest, Sha256};
use std::fmt::Write;

const MAGIC: &[u8] = b"BREDITOR-RELAY1\n";
pub(super) const PREFIX_BYTES: usize = MAGIC.len() + 8 + 32;
/// Archive ceiling: the unchanged 256 MiB log limit plus the independent binary prefix.
pub const MAX_ROOM_BACKUP_BYTES: u64 = MAX_LOG + PREFIX_BYTES as u64;

impl RoomBackup {
    pub(super) fn from_snapshot(snapshot: LogSnapshot) -> Self {
        let digest = Sha256::digest(&snapshot.bytes).into();
        Self { snapshot, digest }
    }

    /// Decode the exact archive and original log integrity/lineage, without filesystem writes.
    /// A transport-valid log may still fail native replay at restore. No torn tail is accepted.
    /// # Errors
    /// Rejects unknown framing, trailing/missing bytes, digest, lineage and original log budgets.
    pub fn from_bytes(input: &[u8]) -> Result<Self> {
        let length =
            u64::try_from(input.len()).map_err(|_| Error::Contract("room backup byte budget"))?;
        if input.len() < PREFIX_BYTES || length > MAX_ROOM_BACKUP_BYTES {
            return Err(Error::Contract("room backup byte budget"));
        }
        if !input.starts_with(MAGIC) {
            return Err(Error::Contract("room backup framing"));
        }
        let declared = u64::from_be_bytes(
            input[MAGIC.len()..MAGIC.len() + 8]
                .try_into()
                .map_err(|_| Error::Contract("room backup framing"))?,
        );
        if declared != length - PREFIX_BYTES as u64 {
            return Err(Error::Contract("room backup exact length"));
        }
        let payload = &input[PREFIX_BYTES..];
        let digest: [u8; 32] = Sha256::digest(payload).into();
        if input[MAGIC.len() + 8..PREFIX_BYTES] != digest {
            return Err(Error::Contract("room backup checksum"));
        }
        Ok(Self { snapshot: LogSnapshot::admit(payload.to_vec())?, digest })
    }

    /// Encode exact persisted bytes into the separate archive without a source save or append.
    #[must_use]
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut result = Vec::with_capacity(PREFIX_BYTES + self.snapshot.bytes.len());
        result.extend_from_slice(MAGIC);
        result.extend_from_slice(&(self.snapshot.bytes.len() as u64).to_be_bytes());
        result.extend_from_slice(&self.digest);
        result.extend_from_slice(&self.snapshot.bytes);
        result
    }

    /// Detached metadata contains no live source, account authentication or permission grant.
    #[must_use]
    pub fn info(&self) -> RoomBackupInfo {
        let mut sha256 = String::with_capacity(64);
        for byte in self.digest {
            let _ = write!(sha256, "{byte:02x}");
        }
        RoomBackupInfo {
            format: "breditor/relay-room-backup",
            format_version: 1,
            log_bytes: self.snapshot.bytes.len() as u64,
            records: self.snapshot.records,
            sha256,
        }
    }
}
