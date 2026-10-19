//! Closed independent framing around the unchanged complete component archives.
use super::{ServerRoomBackup, ServerRoomBackupInfo};
use crate::{
    Error, MAX_ROOM_BACKUP_BYTES, Result, RoomBackupIdentity,
    assets::{AssetBackupIdentity, MAX_SERVER_ASSET_BACKUP_BYTES},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
pub(super) const MAGIC: &[u8] = b"BREDITOR-SERVER1\n";
pub(super) const PREFIX: usize = MAGIC.len() + 4 + 32;
pub(super) const MAX_HEADER: usize = 64 * 1024;
/// Existing complete component ceilings plus independent fixed prefix and bounded header.
pub const MAX_SERVER_ROOM_BACKUP_BYTES: u64 =
    PREFIX as u64 + MAX_HEADER as u64 + MAX_ROOM_BACKUP_BYTES + MAX_SERVER_ASSET_BACKUP_BYTES;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Section {
    pub bytes: u64,
    pub offset: u64,
    pub sha256: [u8; 32],
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Header {
    pub format: String,
    pub format_version: u32,
    pub room: RoomBackupIdentity,
    pub assets: AssetBackupIdentity,
    pub log: Section,
    pub rasters: Section,
}
pub(super) fn sha(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}
pub(super) fn frame(header: &[u8], log: &[u8], rasters: &[u8]) -> Result<Vec<u8>> {
    if header.is_empty() || header.len() > MAX_HEADER {
        return Err(Error::Contract("server backup header budget"));
    }
    let length = PREFIX as u64 + header.len() as u64 + log.len() as u64 + rasters.len() as u64;
    if length > MAX_SERVER_ROOM_BACKUP_BYTES {
        return Err(Error::Contract("server backup byte budget"));
    }
    let mut result = MAGIC.to_vec();
    result.extend_from_slice(
        &u32::try_from(header.len())
            .map_err(|_| Error::Contract("server backup header budget"))?
            .to_be_bytes(),
    );
    result.extend_from_slice(&sha(header));
    result.extend_from_slice(header);
    result.extend_from_slice(log);
    result.extend_from_slice(rasters);
    Ok(result)
}
impl ServerRoomBackup {
    /// Encode the exact original component archives without source I/O or a new server event.
    /// # Errors
    /// Rejects the independent bounded framing budget; never truncates or widens component limits.
    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        frame(&serde_json::to_vec(&self.header)?, &self.room.to_bytes(), &self.assets.to_bytes()?)
    }
    /// Detached exact file selection. It carries no live writer or provider authority.
    #[must_use]
    pub fn info(&self) -> ServerRoomBackupInfo {
        ServerRoomBackupInfo {
            format: "breditor/server-room-backup",
            format_version: 1,
            identity: self.identity.clone(),
        }
    }
}
