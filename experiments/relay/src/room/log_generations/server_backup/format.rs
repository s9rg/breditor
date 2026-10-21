//! Closed two-section envelope around unchanged complete native and raster archives.
use super::{ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupInfo};
use crate::{
    Error, MAX_SERVER_LOG_GENERATION_BACKUP_BYTES, Result, assets::MAX_SERVER_ASSET_BACKUP_BYTES,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Write;
pub(super) const MAGIC: &[u8] = b"BREDITOR-SERVER-GENERATIONS1\n";
pub(super) const PREFIX: usize = MAGIC.len() + 4 + 32;
pub(super) const MAX_HEADER: usize = 128 * 1024;
/// Exact existing complete component ceilings plus an independently bounded envelope.
pub const MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES: u64 = PREFIX as u64
    + MAX_HEADER as u64
    + MAX_SERVER_LOG_GENERATION_BACKUP_BYTES
    + MAX_SERVER_ASSET_BACKUP_BYTES;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Section {
    pub offset: u64,
    pub bytes: u64,
    pub sha256: [u8; 32],
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Header {
    pub format: String,
    pub format_version: u32,
    pub native: super::super::ServerLogGenerationBackupIdentity,
    pub assets: crate::assets::AssetBackupIdentity,
    pub log: Section,
    pub rasters: Section,
}
pub(super) fn sha(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}
pub(super) fn prefix(header: &[u8]) -> Result<Vec<u8>> {
    if header.is_empty() || header.len() > MAX_HEADER {
        return Err(Error::Contract("joined generation header budget"));
    }
    let mut output = MAGIC.to_vec();
    output.extend_from_slice(
        &u32::try_from(header.len())
            .map_err(|_| Error::Contract("joined generation header"))?
            .to_be_bytes(),
    );
    output.extend_from_slice(&sha(header));
    output.extend_from_slice(header);
    Ok(output)
}
impl ServerLogGenerationRoomBackup {
    /// Exact canonical length without output allocation or source I/O.
    /// # Errors
    /// Refuses whole framing, component or arithmetic budgets.
    pub fn encoded_len(&self) -> Result<u64> {
        let encoded = serde_json::to_vec(&self.header)?;
        let rasters = self.assets.encoded_len()?;
        let length = (prefix(&encoded)?.len() as u64)
            .checked_add(self.native.info().bytes)
            .and_then(|value| value.checked_add(rasters))
            .ok_or(Error::Contract("joined generation encoded length"))?;
        if length > MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES {
            return Err(Error::Contract("joined generation complete budget"));
        }
        Ok(length)
    }
    /// Stream exact immutable components without another complete joined/native/raster buffer.
    /// # Errors
    /// Refuses budgets before output; destination errors leave only an incomplete destination.
    /// This does not change or poison either source owner.
    pub fn write_to(&self, writer: &mut impl Write) -> Result<()> {
        self.encoded_len()?;
        writer.write_all(&prefix(&serde_json::to_vec(&self.header)?)?)?;
        self.native.write_to(writer)?;
        self.assets.write_to(writer)
    }
    /// Explicitly allocate a complete encoded copy. Prefer streaming for large server archives.
    /// # Errors
    /// Refuses bounded allocation or output failure without partial archive admission.
    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut bytes = Vec::new();
        bytes
            .try_reserve_exact(
                usize::try_from(self.encoded_len()?)
                    .map_err(|_| Error::Contract("joined generation memory"))?,
            )
            .map_err(|_| Error::Contract("joined generation memory"))?;
        self.write_to(&mut bytes)?;
        Ok(bytes)
    }
    /// Detached exact source identity; never a currentness, authentication or activation receipt.
    /// # Errors
    /// Refuses internal complete encoded bounds.
    pub fn info(&self) -> Result<ServerLogGenerationRoomBackupInfo> {
        Ok(ServerLogGenerationRoomBackupInfo {
            format: "breditor/server-log-generation-room-backup",
            format_version: 1,
            identity: self.identity.clone(),
            bytes: self.encoded_len()?,
        })
    }
}
